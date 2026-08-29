import { useEffect, useRef, useState } from 'react'
import type { Locale, PortfolioReport } from '../types'
import { t } from '../i18n'
import { formatCurrency, formatDate, formatPercent, pnlClass } from '../lib/format'
import { buildSeasonSummary, downloadSeasonCard } from '../lib/shareCard'
import { getDivision } from '../lib/season'

interface ShareCardPreviewProps {
  report: PortfolioReport
  locale: Locale
}

export function ShareCardPreview({ report, locale }: ShareCardPreviewProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyResetTimerRef = useRef<number | null>(null)
  const best = [...report.symbols].sort((a, b) => b.totalYtdMtm - a.totalYtdMtm)[0]

  useEffect(() => () => {
    if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current)
  }, [])

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
          <span className="eyebrow">SHAREABLE</span>
          <h2>{t(locale, 'shareCard')}</h2>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={copySummary} type="button">
            {copyStatus === 'copied'
              ? t(locale, 'copied')
              : copyStatus === 'failed'
                ? t(locale, 'copyFailed')
                : t(locale, 'copySummary')}
          </button>
          <button className="primary-button" onClick={() => downloadSeasonCard(report, locale)} type="button">
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
            <strong>{t(locale, getDivision(report.netLiquidationValue))}</strong>
          </div>
          <div>
            <span>BEST</span>
            <strong>{best?.symbol ?? '—'}</strong>
          </div>
        </div>
        <div className="share-card-bottom">
          <span>{t(locale, 'dataThrough')} {formatDate(report.endDate, locale)}</span>
          <span>{t(locale, 'selfReported')}</span>
        </div>
      </div>
    </section>
  )
}
