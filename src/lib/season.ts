import type { PortfolioReport, TrophyDefinition } from '../types'

export type DivisionKey =
  | 'rookieLeague'
  | 'retailLeague'
  | 'sixFigureLeague'
  | 'capitalLeague'
  | 'whaleLeague'

export function getDivision(netLiquidationValue: number | undefined): DivisionKey {
  if (netLiquidationValue == null || netLiquidationValue < 25_000) return 'rookieLeague'
  if (netLiquidationValue < 100_000) return 'retailLeague'
  if (netLiquidationValue < 500_000) return 'sixFigureLeague'
  if (netLiquidationValue < 1_000_000) return 'capitalLeague'
  return 'whaleLeague'
}

export function getTrophies(report: PortfolioReport): TrophyDefinition[] {
  const worstUnrealized = Math.min(
    0,
    ...report.symbols.map((symbol) => symbol.totalCurrentUnrealized),
  )
  const positiveSymbols = report.symbols.filter((symbol) => symbol.totalYtdMtm > 0)
  const topContribution = Math.max(
    0,
    ...report.symbols.map((symbol) =>
      report.seasonPnl === 0 ? 0 : Math.abs(symbol.totalYtdMtm / report.seasonPnl),
    ),
  )
  const assignmentCount = report.symbols.reduce(
    (sum, symbol) => sum + symbol.assignmentCount,
    0,
  )
  const cashRatio =
    report.cashValue != null && report.netLiquidationValue
      ? report.cashValue / report.netLiquidationValue
      : 0

  return [
    {
      id: 'founders',
      icon: 'F0',
      tone: 'rare',
      unlocked: report.seasonYear === 2026,
    },
    {
      id: 'theta',
      icon: 'Θ',
      tone: 'positive',
      unlocked: report.optionPnl >= 2_000,
      progress: Math.min(1, Math.max(0, report.optionPnl / 2_000)),
    },
    {
      id: 'assigned',
      icon: 'A',
      tone: 'warning',
      unlocked: assignmentCount > 0,
      progress: Math.min(1, assignmentCount),
    },
    {
      id: 'green',
      icon: 'G',
      tone: 'positive',
      unlocked:
        report.seasonPnl > 0 && positiveSymbols.length >= 2 && topContribution < 0.8,
    },
    {
      id: 'bagholder',
      icon: 'B',
      tone: 'warning',
      unlocked: worstUnrealized <= -5_000,
      progress: Math.min(1, Math.abs(worstUnrealized) / 5_000),
    },
    {
      id: 'cash',
      icon: '$',
      tone: 'neutral',
      unlocked: cashRatio >= 0.15,
      progress: Math.min(1, cashRatio / 0.15),
    },
    {
      id: 'reverse',
      icon: '↯',
      tone: 'neutral',
      unlocked: false,
    },
    {
      id: 'iv',
      icon: 'IV',
      tone: 'neutral',
      unlocked: false,
    },
  ]
}
