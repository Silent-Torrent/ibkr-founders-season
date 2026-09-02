import { useEffect, useRef, useState } from 'react'
import type { Locale, PortfolioReport } from '../types'
import { t } from '../i18n'
import { formatCurrency, formatDate, formatPercent, pnlClass } from '../lib/format'
import {
  buildSeasonSummary,
  downloadSeasonCard,
  getShareQualityLabel,
  getShareSourceLabel,
  type SeasonCardDelivery,
} from '../lib/shareCard'
import { getDivision } from '../lib/season'

interface ShareCardPreviewProps {
  report: PortfolioReport
  locale: Locale
}

type PngPreviewState = Extract<SeasonCardDelivery, { kind: 'preview' }> & {
  locale: Locale
  report: PortfolioReport
}

export function ShareCardPreview({ report, locale }: ShareCardPreviewProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [pngPreview, setPngPreview] = useState<PngPreviewState | null>(null)
  const copyResetTimerRef = useRef<number | null>(null)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)
  const pngPreviewPanelRef = useRef<HTMLDivElement>(null)
  const pngPreviewUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const activeRequestRef = useRef({ locale, report })
  activeRequestRef.current = { locale, report }
  const sourceLabel = getShareSourceLabel(report, locale)
  const qualityLabel = getShareQualityLabel(report, locale)
  const division = getDivision(report.netLiquidationValue, report.baseCurrency)
  const visiblePngPreview = pngPreview?.report === report && pngPreview.locale === locale
    ? pngPreview
    : null

  useEffect(
    () => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current)
        if (pngPreviewUrlRef.current) URL.revokeObjectURL(pngPreviewUrlRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    closePngPreview()
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
    const requestedLocale = locale
    const requestedReport = report
    const result = await downloadSeasonCard(report, locale)

    if (
      !mountedRef.current ||
      activeRequestRef.current.report !== requestedReport ||
      activeRequestRef.current.locale !== requestedLocale
    ) {
      if (result?.kind === 'preview') URL.revokeObjectURL(result.previewUrl)
      return
    }

    if (!result || result.kind !== 'preview') {
      closePngPreview()
      return
    }

    if (pngPreviewUrlRef.current) URL.revokeObjectURL(pngPreviewUrlRef.current)
    pngPreviewUrlRef.current = result.previewUrl
    setPngPreview({ ...result, locale: requestedLocale, report: requestedReport })
  }

  async function copySummary() {
    let nextStatus: 'copied' | 'failed'
    try {
      await navigator.clipboard.writeText(buildSeasonSummary(report, locale))
      nextStatus = 'copied'
    } catch {
      nextStatus = 'failed'
    }

    if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current)
    setCopyStatus(nextStatus)
    copyResetTimerRef.current = window.setTimeout(
      () => setCopyStatus('idle'),
      nextStatus === 'failed' ? 3000 : 1400,
    )
  }

  return (
    <section className="share-section">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">{t(locale, 'shareableEyebrow')}</span>
          <h2>{t(locale, 'shareCard')}</h2>
        </div>
        <div className="button-row">
          <button className="secondary-button" data-action="copy-summary" onClick={copySummary} type="button">
            {copyStatus === 'copied'
              ? t(locale, 'copied')
              : copyStatus === 'failed'
                ? t(locale, 'copyFailed')
                : t(locale, 'copySummary')}
          </button>
          <button
            className="primary-button"
            data-action="download-card"
            onClick={handleDownloadCard}
            ref={downloadButtonRef}
            type="button"
          >
            {t(locale, 'downloadCard')}
          </button>
        </div>
        <span aria-live="polite" className="sr-only" role="status">
          {copyStatus === 'copied'
            ? t(locale, 'copied')
            : copyStatus === 'failed'
              ? t(locale, 'copyFailed')
              : ''}
        </span>
      </div>

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
              onClick={() => closePngPreview(true)}
              type="button"
            >
              {t(locale, 'close')}
            </button>
          </div>
          <img alt={t(locale, 'pngPreviewTitle')} src={visiblePngPreview.previewUrl} />
          <p>{t(locale, 'pngPreviewHint')}</p>
          <p className="png-filename-hint">
            {t(locale, 'pngFilenameHint')} <code>{visiblePngPreview.filename}</code>
          </p>
          <a
            className="primary-button png-open-link"
            href={visiblePngPreview.previewUrl}
            target="_blank"
          >
            {t(locale, 'openPngInSafari')}
          </a>
        </div>
      ) : null}

      <div className="share-card-preview">
        <div className="share-card-top">
          <div>
            <span>{report.seasonYear}</span>
            <strong>{t(locale, 'seasonLabel').toUpperCase()}</strong>
          </div>
          <span className="share-watermark">P&amp;L ARENA</span>
        </div>
        <p>{t(locale, 'seasonPnl')}</p>
        <div className={`share-pnl ${pnlClass(report.seasonPnl)}`}>
          {formatCurrency(report.seasonPnl, report.baseCurrency, locale)}
        </div>
        <div className="share-grid">
          <div>
            <span>{t(locale, 'seasonReturn')}</span>
            <strong className={pnlClass(report.seasonReturn)}>{formatPercent(report.seasonReturn, locale)}</strong>
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
