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
  isYou?: boolean
}

export function ArenaPage({ report, locale }: ArenaPageProps) {
  const demoRows: LeaderboardRow[] = [
    { rank: 1, handle: 'ThetaRaccoon', division: 'retailLeague', returnValue: 0.674, pnl: 42780, badge: 'Θ' },
    { rank: 2, handle: 'BoringGreen', division: 'sixFigureLeague', returnValue: 0.418, pnl: 98210, badge: 'G' },
    { rank: 3, handle: 'CashFlowPigeon', division: 'rookieLeague', returnValue: 0.337, pnl: 7120, badge: '$' },
    {
      rank: 17,
      handle: 'You',
      division: getDivision(report.netLiquidationValue),
      returnValue: report.seasonReturn ?? 0,
      pnl: report.seasonPnl,
      badge: 'F0',
      isYou: true,
    },
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
          <span className="eyebrow">LIVE · PROVISIONAL</span>
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

      <section className="panel leaderboard-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SEASON RETURN</span>
            <h2>{t(locale, 'demoLeaderboard')}</h2>
          </div>
          <div className="live-chip"><span /> PROVISIONAL</div>
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
            <article className={row.isYou ? 'leaderboard-row you' : 'leaderboard-row'} key={`${row.rank}-${row.handle}`} role="row">
              <span className="rank-number" role="cell">#{row.rank}</span>
              <div className="trader-cell" role="cell"><span aria-hidden="true" className="avatar-token">{row.badge}</span><strong>{row.handle}</strong></div>
              <span className="division-label" role="cell">{t(locale, row.division)}</span>
              <strong className={pnlClass(row.returnValue)} role="cell">{formatPercent(row.returnValue, locale)}</strong>
              <strong className={pnlClass(row.pnl)} role="cell">{formatCurrency(row.pnl, report.baseCurrency, locale)}</strong>
              <span className={row.isYou ? 'status-chip self' : 'status-chip demo'} role="cell">{row.isYou ? t(locale, 'selfReported') : t(locale, 'demoStatus')}</span>
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
            <article className={division.key === getDivision(report.netLiquidationValue) ? 'division-card current' : 'division-card'} key={division.key}>
              <span className="division-number">0{index + 1}</span>
              <strong>{t(locale, division.key)}</strong>
              <p>{division.range}</p>
              {division.key === getDivision(report.netLiquidationValue) && <span className="you-are-here">YOU</span>}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
