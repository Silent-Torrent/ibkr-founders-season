import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

export function ShareCardPreview({ report, locale }: ShareCardPreviewProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const [cardStatus, setCardStatus] = useState<CardDeliveryStatus>('idle')
  const [pngPreview, setPngPreview] = useState<PngPreviewState | null>(null)
  const copyResetTimerRef = useRef<number | null>(null)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)
  const pngPreviewPanelRef = useRef<HTMLDivElement>(null)
  const pngPreviewUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const activeRequestRef = useRef({ locale, report })
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

  useLayoutEffect(
    () => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        downloadRequestRef.current?.abort()
        copyRequestRef.current?.abort()
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
    closePngPreview()
    setCardStatus('idle')
    setCopyStatus('idle')
  }, [locale, report])

  useEffect(() => {
    if (visiblePngPreview) pngPreviewPanelRef.current?.focus()
  }, [visiblePngPreview])

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
      const result = await downloadSeasonCard(report, locale, { signal: controller.signal })

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
      await navigator.clipboard.writeText(buildSeasonSummary(report, locale))
      nextStatus = 'copied'
    } catch {
      nextStatus = 'failed'
    }

    if (!isCurrent()) return
    setCopyStatus(nextStatus)
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
            {copyStatus === 'copying'
              ? t(locale, 'copying')
              : copyStatus === 'copied'
                ? t(locale, 'copied')
                : copyStatus === 'failed'
                  ? t(locale, 'copyFailed')
                  : t(locale, 'copySummary')}
          </button>
          <button
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
        <span aria-live="polite" className="sr-only" role="status">
          {copyStatus === 'copying'
            ? t(locale, 'copying')
            : copyStatus === 'copied'
              ? t(locale, 'copied')
              : copyStatus === 'failed'
                ? t(locale, 'copyFailed')
                : ''}
        </span>
      </div>

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

      <div className="share-card-preview">
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
        <p>{t(locale, 'seasonPnl')}</p>
        <div className={`share-pnl ${pnlClass(report.seasonPnl)}`}>
          {formatCurrency(report.seasonPnl, report.baseCurrency, locale)}
        </div>
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
        <div className="share-card-bottom">
          <span>{t(locale, 'dataThrough')} {formatDate(report.endDate, locale)}</span>
          <span>{t(locale, 'shareNoHoldings')}</span>
        </div>
      </div>
    </section>
  )
}
