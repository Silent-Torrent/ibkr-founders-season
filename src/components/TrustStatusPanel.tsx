import type { Locale, PortfolioReport } from '../types'
import { t, type MessageKey } from '../i18n'
import { reportTrustLabelKey } from '../lib/reportSource'

interface TrustStatusPanelProps {
  locale: Locale
  report: PortfolioReport
}

function sourceDetailKey(report: PortfolioReport): MessageKey {
  if (report.source === 'demo') return 'trustSourceDemoDetail'
  if (report.source === 'synthetic') return 'trustSourceSyntheticDetail'
  return 'trustSourceLocalDetail'
}

function qualityLabelKey(report: PortfolioReport): MessageKey {
  if (report.dataQuality === 'good') return 'qualityGood'
  if (report.dataQuality === 'warning') return 'qualityWarning'
  return 'qualityError'
}

function qualityDetailKey(report: PortfolioReport): MessageKey {
  if (report.dataQuality === 'good') return 'trustCheckGoodDetail'
  if (report.dataQuality === 'warning') return 'trustCheckWarningDetail'
  return 'trustCheckErrorDetail'
}

export function TrustStatusPanel({ locale, report }: TrustStatusPanelProps) {
  const sourceLabelKey = report.source === 'local'
    ? 'selfReportedUnverified'
    : reportTrustLabelKey(report.source)

  return (
    <section aria-labelledby="trust-status-title" className="panel trust-status-panel">
      <div className="trust-status-intro">
        <span className="eyebrow">{t(locale, 'trustPanelEyebrow')}</span>
        <h2 id="trust-status-title">{t(locale, 'trustPanelTitle')}</h2>
        <p>{t(locale, 'trustPanelBoundary')}</p>
      </div>
      <dl className="trust-status-grid">
        <div>
          <dt>{t(locale, 'trustDataSource')}</dt>
          <dd className={`trust-badge ${report.source}`}>{t(locale, sourceLabelKey)}</dd>
          <small>{t(locale, sourceDetailKey(report))}</small>
        </div>
        <div>
          <dt>{t(locale, 'trustCalculationCheck')}</dt>
          <dd className={`quality-badge ${report.dataQuality}`}>
            <span aria-hidden="true" />
            {t(locale, qualityLabelKey(report))}
          </dd>
          <small>{t(locale, qualityDetailKey(report))}</small>
        </div>
      </dl>
    </section>
  )
}
