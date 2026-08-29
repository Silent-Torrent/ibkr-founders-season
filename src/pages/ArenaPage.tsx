import type { Locale, PortfolioReport } from '../types'
import { t } from '../i18n'
import { formatCurrency, formatPercent, pnlClass } from '../lib/format'
import { getDivision, type DivisionKey } from '../lib/season'

interface ArenaPageProps {
  report: PortfolioReport
  locale: Locale
}

interface LeaderboardRow {
  rank: number
  handle: string
  division: DivisionKey
  returnValue: number
  pnl: number
  badge: string
}

export function ArenaPage({ report, locale }: ArenaPageProps) {
  const localDivision = report.source === 'local'
    ? getDivision(report.netLiquidationValue, report.baseCurrency)
    : undefined
  const demoRows: LeaderboardRow[] = [
    { rank: 1, handle: 'ThetaRaccoon', division: 'retailLeague', returnValue: 0.674, pnl: 42780, badge: 'Θ' },
    { rank: 2, handle: 'BoringGreen', division: 'sixFigureLeague', returnValue: 0.418, pnl: 98210, badge: 'G' },
    { rank: 3, handle: 'CashFlowPigeon', division: 'rookieLeague', returnValue: 0.337, pnl: 7120, badge: '$' },
    { rank: 42, handle: 'ExitLiquidity', division: 'capitalLeague', returnValue: -0.083, pnl: -52740, badge: 'B' },
  ]

  const divisions: Array<{ key: DivisionKey; range: string }> = [
    { key: 'rookieLeague', range: '< $25K' },
    { key: 'retailLeague', range: '$25K–$100K' },
    { key: 'sixFigureLeague', range: '$100K–$500K' },
    { key: 'capitalLeague', range: '$500K–$1M' },
    { key: 'whaleLeague', range: '> $1M' },
  ]

  return (
    <>
      <section className="arena-hero">
        <div>
          <span className="eyebrow">{t(locale, 'arenaDemoEyebrow')}</span>
          <h1>{t(locale, 'arenaTitle')}</h1>
          <p>{t(locale, 'arenaSubtitle')}</p>
        </div>
        <div className="season-orbit" aria-hidden="true">
          <span>2026</span>
          <i />
          <i />
          <i />
        </div>
      </section>

      <div className="notice-banner">
        <span>β</span>
        <div>
          <strong>{t(locale, 'demoLeaderboard')}</strong>
          <p>{t(locale, 'leaderboardNotice')}</p>
        </div>
      </div>

      {report.source === 'local' && (
        <section aria-labelledby="local-snapshot-title" className="panel local-snapshot-panel">
          <div>
            <span className="eyebrow">{t(locale, 'localOnly')} · {t(locale, 'notRanked')}</span>
            <h2 id="local-snapshot-title">{t(locale, 'localSnapshotTitle')}</h2>
            <p>{t(locale, 'localSnapshotNotice')}</p>
          </div>
          <dl className="local-snapshot-grid">
            <div><dt>{t(locale, 'status')}</dt><dd>{t(locale, 'notRanked')}</dd></div>
            <div>
              <dt>{t(locale, 'division')}</dt>
              <dd>{localDivision ? t(locale, localDivision) : t(locale, 'divisionUnavailable')}</dd>
            </div>
            <div><dt>{t(locale, 'return')}</dt><dd>{formatPercent(report.seasonReturn, locale)}</dd></div>
            <div><dt>{t(locale, 'pnl')}</dt><dd>{formatCurrency(report.seasonPnl, report.baseCurrency, locale)}</dd></div>
            <div><dt>{t(locale, 'sourceType')}</dt><dd>{t(locale, 'selfReported')}</dd></div>
          </dl>
        </section>
      )}

      <section className="panel leaderboard-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SEASON RETURN</span>
            <h2>{t(locale, 'demoLeaderboard')}</h2>
          </div>
          <div className="demo-chip">{t(locale, 'demoOnly')}</div>
        </div>

        <div aria-label={t(locale, 'demoLeaderboard')} className="leaderboard-list" role="table" tabIndex={0}>
          <div className="leaderboard-head" role="row">
            <span role="columnheader">{t(locale, 'rank')}</span>
            <span role="columnheader">{t(locale, 'trader')}</span>
            <span role="columnheader">{t(locale, 'division')}</span>
            <span role="columnheader">{t(locale, 'return')}</span>
            <span role="columnheader">{t(locale, 'pnl')}</span>
            <span role="columnheader">{t(locale, 'status')}</span>
          </div>
          {demoRows.map((row) => (
            <article className="leaderboard-row" key={`${row.rank}-${row.handle}`} role="row">
              <span className="rank-number" role="cell">#{row.rank}</span>
              <div className="trader-cell" role="cell"><span aria-hidden="true" className="avatar-token">{row.badge}</span><strong>{row.handle}</strong></div>
              <span className="division-label" role="cell">{t(locale, row.division)}</span>
              <strong className={pnlClass(row.returnValue)} role="cell">{formatPercent(row.returnValue, locale)}</strong>
              <strong className={pnlClass(row.pnl)} role="cell">{formatCurrency(row.pnl, 'USD', locale)}</strong>
              <span className="status-chip demo" role="cell">{t(locale, 'demoStatus')}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="divisions-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FAIR MATCHING</span>
            <h2>{t(locale, 'capitalDivisions')}</h2>
            <p>{t(locale, 'divisionNote')}</p>
          </div>
        </div>
        <div className="division-grid">
          {divisions.map((division, index) => (
            <article className={division.key === localDivision ? 'division-card current' : 'division-card'} key={division.key}>
              <span className="division-number">0{index + 1}</span>
              <strong>{t(locale, division.key)}</strong>
              <p>{division.range}</p>
              {division.key === localDivision && <span className="you-are-here">{t(locale, 'localOnly')}</span>}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
