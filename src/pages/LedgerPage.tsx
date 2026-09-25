import { useMemo, useState } from 'react'
import type {
  Locale,
  PortfolioReport,
  ReconciliationCheckId,
  ReconciliationStatus,
  SymbolPnl,
} from '../types'
import { t } from '../i18n'
import {
  formatCurrency,
  formatDate,
  formatPercent,
  formatReconciliationDifference,
  pnlClass,
} from '../lib/format'
import { diagnosticKey, formatParserDiagnostic } from '../lib/parserDiagnostics'
import { getDivision } from '../lib/season'
import {
  hasCurrentUnrealizedExplanation,
  hasRealizedExplanation,
} from '../lib/explanationAvailability'
import { MetricCard } from '../components/MetricCard'
import { ShareCardPreview } from '../components/ShareCardPreview'
import { SymbolDrawer } from '../components/SymbolDrawer'
import { SourceRows } from '../components/SourceRows'
import { TrustStatusPanel } from '../components/TrustStatusPanel'

interface LedgerPageProps {
  report: PortfolioReport
  locale: Locale
}

type FilterMode = 'all' | 'winners' | 'losers'
type SortMode = 'pnl' | 'symbol'

const reconciliationIds: ReconciliationCheckId[] = [
  'mtm_all_assets',
  'statement_period_pnl',
  'nav_bridge',
]

function reconciliationLabel(locale: Locale, id: ReconciliationCheckId): string {
  if (id === 'mtm_all_assets') return t(locale, 'reconciliationMtm')
  if (id === 'statement_period_pnl') return t(locale, 'reconciliationStatementPnl')
  return t(locale, 'reconciliationNavBridge')
}

function reconciliationStatusLabel(
  locale: Locale,
  status: ReconciliationStatus,
  isDemo: boolean,
): string {
  if (status === 'PASS_EXACT') {
    return t(locale, isDemo ? 'reconciliationDemoMatch' : 'reconciliationPassExact')
  }
  if (status === 'PASS_ROUNDED') return t(locale, 'reconciliationPassRounded')
  if (status === 'WARNING') return t(locale, 'reconciliationWarning')
  if (status === 'BLOCKED') return t(locale, 'reconciliationBlocked')
  return t(locale, 'reconciliationNotAvailable')
}

function reconciliationStatusClass(status: ReconciliationStatus): string {
  return status.toLowerCase().replace('_', '-')
}

function reconciliationHelp(locale: Locale, id: ReconciliationCheckId): string {
  if (id === 'mtm_all_assets') return t(locale, 'reconciliationMtmHelp')
  if (id === 'statement_period_pnl') return t(locale, 'reconciliationStatementPnlHelp')
  return t(locale, 'reconciliationNavBridgeHelp')
}

export function LedgerPage({ report, locale }: LedgerPageProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [sort, setSort] = useState<SortMode>('pnl')
  const [selected, setSelected] = useState<SymbolPnl | null>(null)
  const division = getDivision(report.netLiquidationValue, report.baseCurrency)
  const divisionLabel = division ? t(locale, division) : t(locale, 'divisionUnavailable')
  const currentUnrealizedAvailable = hasCurrentUnrealizedExplanation(report)

  const symbols = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase()
    return [...report.symbols]
      .filter((item) => {
        if (filter === 'winners' && item.totalYtdMtm <= 0) return false
        if (filter === 'losers' && item.totalYtdMtm >= 0) return false
        if (!normalizedQuery) return true
        return (
          item.symbol.includes(normalizedQuery) ||
          item.description?.toUpperCase().includes(normalizedQuery)
        )
      })
      .sort((a, b) =>
        sort === 'pnl'
          ? b.totalYtdMtm - a.totalYtdMtm
          : a.symbol.localeCompare(b.symbol),
      )
  }, [filter, query, report.symbols, sort])

  return (
    <>
      <section className="hero-row">
        <div>
          <span className="eyebrow">{report.seasonYear} · {t(locale, 'seasonLabel')}</span>
          <h1>{t(locale, 'navLedger')}</h1>
          <p>
            {t(locale, 'dataThrough')} {formatDate(report.endDate, locale)} · {report.baseCurrency} ·{' '}
            {divisionLabel}
          </p>
        </div>
      </section>

      <TrustStatusPanel locale={locale} report={report} />

      <section className="metrics-grid">
        <MetricCard
          explanation={t(locale, 'seasonPnlExplanation')}
          helpLabel={t(locale, 'learnMore')}
          label={t(locale, 'seasonPnl')}
          value={formatCurrency(report.seasonPnl, report.baseCurrency, locale)}
          hint={`${t(locale, 'dataThrough')} ${formatDate(report.endDate, locale)}`}
          summary={t(locale, 'seasonPnlSummary')}
          tone={pnlClass(report.seasonPnl) as 'positive' | 'negative' | 'neutral'}
          icon="∑"
        />
        <MetricCard
          explanation={t(locale, 'seasonReturnExplanation')}
          helpLabel={t(locale, 'learnMore')}
          label={t(locale, 'seasonReturn')}
          value={formatPercent(report.seasonReturn, locale)}
          hint={report.seasonReturn == null
            ? t(locale, 'seasonReturnMissingHint')
            : t(locale, 'seasonYtdHint').replace('{year}', String(report.seasonYear))}
          summary={t(locale, 'seasonReturnSummary')}
          tone={pnlClass(report.seasonReturn) as 'positive' | 'negative' | 'neutral'}
          icon="%"
        />
        <MetricCard
          explanation={t(locale, 'netLiquidationExplanation')}
          helpLabel={t(locale, 'learnMore')}
          label={t(locale, 'netLiquidation')}
          value={formatCurrency(report.netLiquidationValue, report.baseCurrency, locale, true)}
          hint={divisionLabel}
          summary={t(locale, 'netLiquidationSummary')}
          icon="◇"
        />
        <MetricCard
          explanation={t(locale, 'optionsPnlExplanation')}
          helpLabel={t(locale, 'learnMore')}
          label={t(locale, 'optionsPnl')}
          value={formatCurrency(report.optionPnl, report.baseCurrency, locale)}
          hint={`${formatPercent(report.seasonPnl === 0 ? undefined : report.optionPnl / report.seasonPnl, locale)} ${t(locale, 'contribution')}`}
          summary={t(locale, 'optionsPnlSummary')}
          tone={pnlClass(report.optionPnl) as 'positive' | 'negative' | 'neutral'}
          icon="Θ"
        />
      </section>

      <section className="ledger-layout">
        <div className="panel table-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t(locale, 'underlyingLedgerEyebrow')}</span>
              <h2>{t(locale, 'symbolBreakdown')}</h2>
            </div>
            <span className="count-pill">{report.symbols.length}</span>
          </div>

          <div className="table-toolbar">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label={t(locale, 'searchSymbols')}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(locale, 'searchSymbols')}
                value={query}
              />
            </label>
            <div
              aria-label={t(locale, 'filterSymbols')}
              className="segmented-control"
              role="group"
            >
              {(['all', 'winners', 'losers'] as FilterMode[]).map((mode) => (
                <button
                  aria-pressed={filter === mode}
                  className={filter === mode ? 'active' : ''}
                  key={mode}
                  onClick={() => setFilter(mode)}
                  type="button"
                >
                  {mode === 'all'
                    ? t(locale, 'allSymbols')
                    : mode === 'winners'
                      ? t(locale, 'winners')
                      : t(locale, 'losers')}
                </button>
              ))}
            </div>
            <select
              aria-label={t(locale, 'sortSymbols')}
              className="sort-select"
              onChange={(event) => setSort(event.target.value as SortMode)}
              value={sort}
            >
              <option value="pnl">{t(locale, 'sortPnl')}</option>
              <option value="symbol">{t(locale, 'sortSymbol')}</option>
            </select>
          </div>

          <div
            aria-label={t(locale, 'symbolBreakdown')}
            className="data-table-wrap"
            role="region"
            tabIndex={0}
          >
            <table className="data-table">
              <caption className="sr-only">{t(locale, 'symbolBreakdown')}</caption>
              <thead>
                <tr>
                  <th>{t(locale, 'symbol')}</th>
                  <th>{t(locale, 'stocks')}</th>
                  <th>{t(locale, 'options')}</th>
                  <th>{t(locale, 'ytdPnl')}</th>
                  <th>{t(locale, 'realized')}</th>
                  <th>{t(locale, 'unrealized')}</th>
                  <th aria-label={t(locale, 'details')} />
                </tr>
              </thead>
              <tbody>
                {symbols.map((item) => (
                  <tr key={item.symbol} onClick={() => setSelected(item)}>
                    <td>
                      <strong>{item.symbol}</strong>
                      <small>{item.description}</small>
                    </td>
                    <td className={pnlClass(item.stockYtdMtm)}>
                      {formatCurrency(item.stockYtdMtm, report.baseCurrency, locale)}
                    </td>
                    <td className={pnlClass(item.optionYtdMtm)}>
                      {formatCurrency(item.optionYtdMtm, report.baseCurrency, locale)}
                    </td>
                    <td className={`emphasis ${pnlClass(item.totalYtdMtm)}`}>
                      {formatCurrency(item.totalYtdMtm, report.baseCurrency, locale)}
                    </td>
                    <td className={hasRealizedExplanation(report, item) ? pnlClass(item.totalRealizedYtd) : 'unavailable'}>
                      {hasRealizedExplanation(report, item)
                        ? formatCurrency(item.totalRealizedYtd, report.baseCurrency, locale)
                        : t(locale, 'valueUnavailable')}
                    </td>
                    <td className={currentUnrealizedAvailable ? pnlClass(item.totalCurrentUnrealized) : 'unavailable'}>
                      {currentUnrealizedAvailable
                        ? formatCurrency(item.totalCurrentUnrealized, report.baseCurrency, locale)
                        : t(locale, 'valueUnavailable')}
                    </td>
                    <td>
                      <button
                        aria-label={t(locale, 'openSymbolDetails').replace('{symbol}', item.symbol)}
                        className="row-arrow"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelected(item)
                        }}
                        type="button"
                      >
                        <span aria-hidden="true">→</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {symbols.length === 0 && <div className="empty-table">{t(locale, 'noMatches')}</div>}
          </div>
        </div>

        <aside className="ledger-side">
          <article className="panel definition-card">
            <span className="definition-icon">i</span>
            <h3>{t(locale, 'explanationTitle')}</h3>
            <p>{t(locale, 'explanationBody')}</p>
          </article>

          <article className="panel source-card">
            <div className="section-heading compact">
              <h3>{t(locale, 'details')}</h3>
            </div>
            <dl>
              <div><dt>{t(locale, 'baseCurrency')}</dt><dd>{report.baseCurrency}</dd></div>
              <div><dt>{t(locale, 'dataThrough')}</dt><dd>{formatDate(report.endDate, locale)}</dd></div>
              <div>
                <dt>{t(locale, 'reconciliationDiff')}</dt>
                <dd className={pnlClass(report.mtmReconciliationDifference)}>
                  {formatReconciliationDifference(
                    report.mtmReconciliationDifference,
                    report.baseCurrency,
                    locale,
                  )}
                </dd>
              </div>
              <div><dt>{t(locale, 'sections')}</dt><dd>{report.sections.length}</dd></div>
            </dl>

            {report.source === 'demo' && (
              <p className="demo-source-notice">{t(locale, 'demoNoLocalSource')}</p>
            )}

            <section className="provenance-group" aria-labelledby="metric-source-title">
              <h4 id="metric-source-title">{t(locale, 'metricSources')}</h4>
              {([
                ['seasonPnl', 'seasonPnl'],
                ['seasonReturn', 'seasonReturn'],
                ['netLiquidationValue', 'netLiquidation'],
              ] as const).map(([metricKey, labelKey]) => {
                const refs = report.metricSourceRefs[metricKey] ?? []
                return (
                  <details className="provenance-details metric-source" key={metricKey}>
                    <summary>
                      <span>{t(locale, labelKey)}</span>
                      <small>
                        {report.source === 'demo'
                          ? t(locale, 'synthetic')
                          : t(locale, 'sourceRowCount').replace('{count}', String(refs.length))}
                      </small>
                    </summary>
                    <SourceRows isDemo={report.source === 'demo'} locale={locale} refs={refs} />
                  </details>
                )
              })}
            </section>

            <section className="provenance-group" aria-labelledby="reconciliation-title">
              <h4 id="reconciliation-title">{t(locale, 'reconciliationChecks')}</h4>
              {report.source !== 'demo' && (
                <p className="reconciliation-tolerance-note">
                  {t(locale, 'reconciliationToleranceNote')}
                </p>
              )}
              {reconciliationIds.map((id) => {
                const check = report.reconciliations.find((item) => item.id === id)
                const status = check?.status ?? 'NOT_AVAILABLE'
                return (
                  <details className="provenance-details reconciliation-item" key={id}>
                    <summary>
                      <span>{reconciliationLabel(locale, id)}</span>
                      <small className={`reconciliation-status ${reconciliationStatusClass(status)}`}>
                        {reconciliationStatusLabel(locale, status, report.source === 'demo')}
                      </small>
                    </summary>
                    <p className="reconciliation-help">{reconciliationHelp(locale, id)}</p>
                    <SourceRows
                      isDemo={report.source === 'demo'}
                      locale={locale}
                      refs={check?.sourceRefs ?? []}
                    />
                  </details>
                )
              })}
            </section>

            {report.warnings.length > 0 && (
              <div className="warning-list">
                <strong>{t(locale, 'warnings')}</strong>
                {report.warnings.map((warning, index) => (
                  <p key={diagnosticKey(warning, index)}>
                    {formatParserDiagnostic(warning, locale)}
                  </p>
                ))}
              </div>
            )}
          </article>
        </aside>
      </section>

      <ShareCardPreview locale={locale} report={report} />
      <SymbolDrawer locale={locale} onClose={() => setSelected(null)} report={report} symbol={selected} />
    </>
  )
}
