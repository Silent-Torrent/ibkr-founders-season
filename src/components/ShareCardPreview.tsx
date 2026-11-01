import {useContext} from 'react'
import {Settings} from './Preferences'
import {cardBadges,cardTheme,ramen,type Template,type CardSize} from '../lib/cardOptions'
import {advice,tr} from '../data/medals'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Locale, PortfolioReport } from '../types'
import { t } from '../i18n'
import { formatCurrency, formatDate, pnlClass } from '../lib/format'
import {
  buildSeasonSummary,
  downloadSeasonCard,
  formatShareSeasonReturn,
  getShareQualityLabel,
  getShareSourceLabel,
  type SeasonCardDelivery,
} from '../lib/shareCard'
import { getDivision } from '../lib/season'
import { ArenaMark } from './ArenaMark'

interface ShareCardPreviewProps {
  report: PortfolioReport
  locale: Locale
}

type ShareContext = ShareCardPreviewProps

type PngPreviewState = Extract<SeasonCardDelivery, { kind: 'preview' }> & {
  locale: Locale
  report: PortfolioReport
}

type CardDeliveryStatus =
  | 'idle'
  | 'preparing'
  | 'downloadStarted'
  | 'shared'
  | 'cancelled'
  | 'failed'
  | 'preview'

const cardDeliveryStatusKeys = {
  preparing: 'shareCardPreparing',
  downloadStarted: 'shareCardDownloadStarted',
  shared: 'shareCardShared',
  cancelled: 'shareCardCancelled',
  failed: 'shareCardFailed',
  preview: 'shareCardPreviewReady',
} as const

export function ShareCardPreview({report,locale}:ShareCardPreviewProps){
  const {prefs,update}=useContext(Settings)
  const [size,setSize]=useState<CardSize>('portrait')
  const [template,setTemplate]=useState<Template>('auto')
  const preview = useRef<HTMLDivElement>(null)
  function revealStory() {
    if (window.matchMedia('(max-width: 768px)').matches)
      preview.current?.scrollIntoView({block:'center', behavior:'instant'})
  }
  useLayoutEffect(() => { if (size === 'story') revealStory() }, [size])
  return <><div className="card-options">
    <fieldset><legend>{tr(locale,'图片尺寸','圖片尺寸','Image size')}</legend>
      {(['portrait','story','3x4'] as const).map((v,i)=><button type="button" key={v} data-card-size={v} aria-pressed={size===v} onClick={()=>{if(v==='story' && size===v) revealStory(); else setSize(v)}}>{['1200×1500','1080×1920','1080×1440'][i]}</button>)}
    </fieldset>
    <fieldset><legend>{tr(locale,'模板','範本','Template')}</legend>
      {(['auto','feast','noodles'] as const).map((v,i)=><button type="button" key={v} data-card-template={v} aria-pressed={template===v} onClick={()=>setTemplate(v)}>{[tr(locale,'自动','自動','Automatic'),tr(locale,'吃肉','吃肉','Gain Day Feast'),tr(locale,'关灯吃面','關燈吃麵','Noodles in the Dark')][i]}</button>)}
    </fieldset>
    <label className="card-switch"><input type="checkbox" role="switch" data-card-amount checked={prefs.amount} onChange={e=>update({...prefs,amount:e.target.checked})}/>{tr(locale,'显示金额','顯示金額','Show amounts')}</label>
    <label className="card-switch"><input type="checkbox" role="switch" checked={prefs.hideTickers} onChange={e=>update({...prefs,hideTickers:e.target.checked})}/>{tr(locale,'隐藏股票代码','隱藏股票代碼','Hide tickers')}</label>
  </div><CardPreview key={JSON.stringify([size,template,prefs])} previewRef={preview} report={report} locale={locale} size={size} template={template}/></>
}

function CardPreview({ report, locale,size,template,previewRef }: ShareCardPreviewProps & {size:CardSize;template:Template;previewRef:React.RefObject<HTMLDivElement|null>}) {
  const {prefs}=useContext(Settings)
  const theme=cardTheme(report,locale,prefs,template)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const [cardStatus, setCardStatus] = useState<CardDeliveryStatus>('idle')
  const [pngPreview, setPngPreview] = useState<PngPreviewState | null>(null)
  const [manualCopyContext, setManualCopyContext] = useState<ShareContext | null>(null)
  const manualCopyId = useId()
  const sharePrivacyId = useId()
  const manualButtonRef = useRef<HTMLButtonElement>(null)
  const manualPanelRef = useRef<HTMLDivElement>(null)
  const manualTextRef = useRef<HTMLTextAreaElement>(null)
  const manualFocusRequestRef = useRef<{ context: ShareContext; trigger: HTMLElement } | null>(null)
  const copyResetTimerRef = useRef<number | null>(null)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)
  const pngPreviewPanelRef = useRef<HTMLDivElement>(null)
  const pngPreviewUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const activeRequestRef = useRef<ShareContext>({ locale, report })
  // A distinct context also invalidates A -> B -> A transitions while a browser API is pending.
  if (activeRequestRef.current.locale !== locale || activeRequestRef.current.report !== report) {
    activeRequestRef.current = { locale, report }
  }
  const downloadRequestRef = useRef<AbortController | null>(null)
  const copyRequestRef = useRef<AbortController | null>(null)
  const sourceLabel = getShareSourceLabel(report, locale)
  const qualityLabel = getShareQualityLabel(report, locale)
  const division = getDivision(report.netLiquidationValue, report.baseCurrency)
  const visiblePngPreview = pngPreview?.report === report && pngPreview.locale === locale
    ? pngPreview
    : null
  const visibleManualCopy = manualCopyContext === activeRequestRef.current ? manualCopyContext : null

  useLayoutEffect(
    () => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        downloadRequestRef.current?.abort()
        copyRequestRef.current?.abort()
        manualFocusRequestRef.current = null
        if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current)
        if (pngPreviewUrlRef.current) URL.revokeObjectURL(pngPreviewUrlRef.current)
      }
    },
    [],
  )

  useLayoutEffect(() => {
    downloadRequestRef.current?.abort()
    downloadRequestRef.current = null
    copyRequestRef.current?.abort()
    copyRequestRef.current = null
    if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current)
    copyResetTimerRef.current = null
    manualFocusRequestRef.current = null
    setManualCopyContext(null)
    closePngPreview()
    setCardStatus('idle')
    setCopyStatus('idle')
  }, [locale, report])

  useEffect(() => {
    // A late image result must not interrupt an explicit text selection or its controls.
    if (visiblePngPreview && !manualPanelRef.current?.contains(document.activeElement)) {
      pngPreviewPanelRef.current?.focus()
    }
  }, [visiblePngPreview])

  useLayoutEffect(() => {
    const request = manualFocusRequestRef.current
    manualFocusRequestRef.current = null
    if (visibleManualCopy && request?.context === visibleManualCopy && document.activeElement === request.trigger) {
      selectManualSummary()
    }
  }, [visibleManualCopy])

  function selectManualSummary() {
    const field = manualTextRef.current
    if (!field) return
    // Native textarea focus may reveal only a caret, leaving most of the field under navigation.
    // This scroll is only reached by an explicit manual-selection action, never a late failure.
    field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
    field.focus({ preventScroll: true })
    field.select()
  }

  function openManualSummary() {
    if (visibleManualCopy) {
      selectManualSummary()
      return
    }
    const trigger = manualButtonRef.current
    if (trigger) {
      trigger.focus()
      manualFocusRequestRef.current = { context: activeRequestRef.current, trigger }
    }
    setManualCopyContext(activeRequestRef.current)
  }

  function closeManualSummary() {
    // We cannot undo a system clipboard write, but its late result must not reopen this panel.
    copyRequestRef.current?.abort()
    copyRequestRef.current = null
    if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current)
    copyResetTimerRef.current = null
    manualFocusRequestRef.current = null
    setCopyStatus('idle')
    setManualCopyContext(null)
    manualButtonRef.current?.focus()
  }

  function closePngPreview(restoreFocus = false) {
    if (pngPreviewUrlRef.current) URL.revokeObjectURL(pngPreviewUrlRef.current)
    pngPreviewUrlRef.current = null
    if (restoreFocus) downloadButtonRef.current?.focus()
    setPngPreview(null)
  }

  async function handleDownloadCard() {
    if (downloadRequestRef.current) return
    const controller = new AbortController()
    const requestedContext = activeRequestRef.current
    downloadRequestRef.current = controller
    const isCurrent = () => mountedRef.current && !controller.signal.aborted &&
      activeRequestRef.current === requestedContext && downloadRequestRef.current === controller
    setCardStatus('preparing')
    try {
      const result = await downloadSeasonCard(report, locale, { signal: controller.signal, prefs, size, template })

      if (!isCurrent()) {
        if (result?.kind === 'preview') URL.revokeObjectURL(result.previewUrl)
        return
      }

      if (!result || result.kind !== 'preview') {
        closePngPreview()
        setCardStatus(result?.kind ?? 'failed')
        return
      }

      if (pngPreviewUrlRef.current) URL.revokeObjectURL(pngPreviewUrlRef.current)
      pngPreviewUrlRef.current = result.previewUrl
      setPngPreview({ ...result, locale, report })
      setCardStatus('preview')
    } catch {
      if (isCurrent()) setCardStatus('failed')
    } finally {
      if (downloadRequestRef.current === controller) downloadRequestRef.current = null
    }
  }

  async function copySummary() {
    if (copyRequestRef.current) return
    const controller = new AbortController()
    const requestedContext = activeRequestRef.current
    copyRequestRef.current = controller
    const isCurrent = () => mountedRef.current && !controller.signal.aborted &&
      activeRequestRef.current === requestedContext && copyRequestRef.current === controller
    if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current)
    copyResetTimerRef.current = null
    setCopyStatus('copying')
    let nextStatus: 'copied' | 'failed'
    try {
      await navigator.clipboard.writeText(buildSeasonSummary(report, locale,prefs,template))
      nextStatus = 'copied'
    } catch {
      nextStatus = 'failed'
    }

    if (!isCurrent()) return
    setCopyStatus(nextStatus)
    // An automatic failure exposes the fallback without moving focus or selecting text.
    if (nextStatus === 'failed') setManualCopyContext(requestedContext)
    const resetTimer = window.setTimeout(
      () => {
        if (
          mountedRef.current && !controller.signal.aborted &&
          activeRequestRef.current === requestedContext && copyResetTimerRef.current === resetTimer
        ) {
          setCopyStatus('idle')
          copyResetTimerRef.current = null
        }
      },
      nextStatus === 'failed' ? 3000 : 1400,
    )
    copyResetTimerRef.current = resetTimer
    copyRequestRef.current = null
  }

  return (
    <section className="share-section">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">{t(locale, 'shareableEyebrow')}</span>
          <h2>{t(locale, 'shareCard')}</h2>
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            data-action="copy-summary"
            disabled={copyStatus === 'copying'}
            onClick={copySummary}
            type="button"
          >
            {t(locale, 'copySummary')}
          </button>
          <button
            aria-expanded={Boolean(visibleManualCopy)}
            aria-controls={`${manualCopyId}-panel`}
            className="secondary-button"
            data-action="manual-summary"
            onClick={openManualSummary}
            ref={manualButtonRef}
            type="button"
          >
            {t(locale, 'manualSummary')}
          </button>
          <button
            aria-describedby={sharePrivacyId}
            className="primary-button"
            data-action="download-card"
            disabled={cardStatus === 'preparing'}
            onClick={handleDownloadCard}
            ref={downloadButtonRef}
            type="button"
          >
            {t(locale, 'downloadCard')}
          </button>
        </div>
      </div>
      <p className="share-privacy-disclosure" id={sharePrivacyId}>
        {t(locale, 'shareDivisionPrivacyHint')}
      </p>
      <div className="share-copy-feedback">
        {/* Reserve the tallest localized outcome without adding another announcement. */}
        {(['copying', 'copied', 'copyFailed'] as const).map((key) => (
          <span aria-hidden="true" className="share-copy-feedback-size" key={key}>{t(locale, key)}</span>
        ))}
        <p aria-atomic="true" aria-live="polite" className="share-copy-status" data-copy-status={copyStatus} role="status">
          {copyStatus === 'copying'
            ? t(locale, 'copying')
            : copyStatus === 'copied'
              ? t(locale, 'copied')
              : copyStatus === 'failed'
                ? t(locale, 'copyFailed')
                : ''}
        </p>
      </div>

      {visibleManualCopy ? (
        <div
          aria-labelledby={`${manualCopyId}-title`}
          className="manual-copy-panel"
          onFocusCapture={event => {
            const control=event.target
            if (!(control instanceof HTMLButtonElement)) return
            const bottomNav=document.querySelector('.bottom-nav')
            if (!bottomNav || getComputedStyle(bottomNav).display==='none') return
            const top=(document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0)+8
            const bottom=bottomNav.getBoundingClientRect().top-8
            const rect=control.getBoundingClientRect()
            if(rect.top<top || rect.bottom>bottom)
              window.scrollBy({top:rect.top<top?rect.top-top:rect.bottom-bottom,behavior:'instant'})
          }}
          id={`${manualCopyId}-panel`}
          ref={manualPanelRef}
          role="region"
        >
          <div className="manual-copy-heading">
            <h3 id={`${manualCopyId}-title`}>{t(locale, 'manualSummaryTitle')}</h3>
            <button
              className="secondary-button"
              data-action="close-manual-summary"
              onClick={closeManualSummary}
              type="button"
            >
              {t(locale, 'close')}
            </button>
          </div>
          <p id={`${manualCopyId}-hint`}>{t(locale, 'manualSummaryHint')}</p>
          <label className="sr-only" htmlFor={`${manualCopyId}-text`}>{t(locale, 'manualSummaryTitle')}</label>
          <textarea
            aria-describedby={`${manualCopyId}-hint`}
            autoComplete="off"
            className="manual-copy-text"
            data-manual-summary
            id={`${manualCopyId}-text`}
            readOnly
            ref={manualTextRef}
            spellCheck={false}
            value={buildSeasonSummary(visibleManualCopy.report, visibleManualCopy.locale,prefs,template)}
          />
          <button
            className="secondary-button"
            data-action="select-manual-summary"
            onClick={selectManualSummary}
            type="button"
          >
            {t(locale, 'selectSummaryText')}
          </button>
          <p>{t(locale, 'manualSummaryPrivacyHint')}</p>
        </div>
      ) : null}

      {cardStatus !== 'idle' && (
        <p aria-live="polite" className={`share-delivery-status ${cardStatus}`} role="status">
          {t(locale, cardDeliveryStatusKeys[cardStatus])}
        </p>
      )}

      {visiblePngPreview ? (
        <div
          aria-label={t(locale, 'pngPreviewTitle')}
          className="png-fallback-panel"
          ref={pngPreviewPanelRef}
          role="region"
          tabIndex={-1}
        >
          <div className="png-fallback-heading">
            <div>
              <span className="eyebrow">{t(locale, 'pngLocalEyebrow')}</span>
              <strong>{t(locale, 'pngPreviewTitle')}</strong>
            </div>
            <button
              className="secondary-button"
              onClick={() => {
                closePngPreview(true)
                setCardStatus('idle')
              }}
              type="button"
            >
              {t(locale, 'close')}
            </button>
          </div>
          <img alt={t(locale, 'pngPreviewTitle')} src={visiblePngPreview.previewUrl} />
          <p>{t(locale, 'pngPreviewHint')}</p>
          <p className="png-filename-hint">
            {t(locale, 'pngFilenameHint')} <code data-png-filename="full">{visiblePngPreview.filename}</code>
          </p>
          <div className="button-row png-save-actions">
            <a
              className="secondary-button png-download-link"
              data-action="download-preview"
              download={visiblePngPreview.filename}
              href={visiblePngPreview.previewUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t(locale, 'downloadPngWithName')}
            </a>
            <a
              className="primary-button png-open-link"
              href={visiblePngPreview.previewUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t(locale, 'openPngInSafari')}
            </a>
          </div>
          <p>{t(locale, 'pngDownloadHint')}</p>
          <h3 className="png-save-title">{t(locale, 'pngSaveStepsTitle')}</h3>
          <ol className="png-save-steps">
            <li>{t(locale, 'pngSaveOpenStep')}</li>
            <li>
              {t(locale, 'pngSaveNameStep')}{' '}
              <code data-png-filename="stem">{visiblePngPreview.filename.replace(/\.png$/i, '')}</code>
              {' '}{t(locale, 'pngSaveExtensionStep')}
            </li>
            <li>{t(locale, 'pngSaveCheckStep')}</li>
          </ol>
          <p className="png-saved-copy-hint">{t(locale, 'pngSavedCopyHint')}</p>
        </div>
      ) : null}

      <div ref={previewRef} data-size={size} className={'share-card-preview '+(theme.feast?'feast':'noodles')}>
        <div className="share-card-face">
        <div className="share-card-top">
          <div>
            <span>{report.seasonYear}</span>
            <strong>{t(locale, 'seasonLabel').toUpperCase()}</strong>
          </div>
          <span className="share-watermark">
            <ArenaMark className="share-arena-mark" />
            <span>P&amp;L ARENA</span>
          </span>
        </div>
        <p className="face-title">{theme.title}</p>
        <div className={`share-pnl ${pnlClass(report.seasonPnl)}`}>
          {formatShareSeasonReturn(report.seasonReturn,locale)}
        </div>
        <p className="face-caption">{theme.line}</p>
        {size==='story' && <p className="face-extra">{theme.secondLine}</p>}
        {prefs.amount&&<strong>{formatCurrency(report.seasonPnl,report.baseCurrency,locale)}</strong>}
        <div className="share-grid">
          <div>
            <span>{t(locale, 'seasonReturn')}</span>
            <strong className={pnlClass(report.seasonReturn)}>
              {formatShareSeasonReturn(report.seasonReturn, locale)}
            </strong>
          </div>
          <div>
            <span>{t(locale, 'division')}</span>
            <strong>{division ? t(locale, division) : t(locale, 'divisionUnavailable')}</strong>
          </div>
          <div>
            <span>{t(locale, 'sourceType')}</span>
            <strong>{sourceLabel}</strong>
          </div>
          <div>
            <span>{t(locale, 'trustCalculationCheck')}</span>
            <strong>{qualityLabel}</strong>
          </div>
        </div>
        <div className="face-lower"><div className="face-medals">
          {size!=='portrait' && <strong>{t(locale,'trophiesTitle')}</strong>}
          {cardBadges(report,locale,prefs).map(label=><span key={label}>{label}</span>)}
        </div><p>{ramen(report,locale,prefs)}</p></div>
        <div className="share-card-bottom"><span>{advice(locale)}</span>
          <span>{t(locale, 'dataThrough')} {formatDate(report.endDate, locale)}</span>
          <span>{t(locale, 'shareNoHoldings')}</span>
        </div>
      </div></div>
    </section>
  )
}
