import type { PortfolioReport, TrophyDefinition } from '../types'

export type DivisionKey =
  | 'rookieLeague'
  | 'retailLeague'
  | 'sixFigureLeague'
  | 'capitalLeague'
  | 'whaleLeague'

export function getDivision(
  netLiquidationValue: number | undefined,
  baseCurrency: string,
): DivisionKey | undefined {
  if (netLiquidationValue == null || !Number.isFinite(netLiquidationValue)) return undefined
  if (baseCurrency.toUpperCase() !== 'USD') return undefined
  if (netLiquidationValue < 25_000) return 'rookieLeague'
  if (netLiquidationValue < 100_000) return 'retailLeague'
  if (netLiquidationValue < 500_000) return 'sixFigureLeague'
  if (netLiquidationValue < 1_000_000) return 'capitalLeague'
  return 'whaleLeague'
}

export function getCashBufferRatio(report: PortfolioReport): number | undefined {
  const { cashValue, netLiquidationValue } = report
  if (
    cashValue == null ||
    !Number.isFinite(cashValue) ||
    netLiquidationValue == null ||
    !Number.isFinite(netLiquidationValue) ||
    netLiquidationValue <= 0
  ) return undefined
  return cashValue / netLiquidationValue
}

export function getTrophies(report: PortfolioReport): TrophyDefinition[] {
  const isEligibleLocalReport = report.source === 'local'
  const hasUsdAmountThresholds =
    isEligibleLocalReport && report.baseCurrency.toUpperCase() === 'USD'
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
  const cashRatio = getCashBufferRatio(report)

  return [
    {
      id: 'founders',
      icon: 'F0',
      tone: 'rare',
      unlocked: isEligibleLocalReport && report.seasonYear === 2026,
    },
    {
      id: 'theta',
      icon: 'Θ',
      tone: 'positive',
      unlocked: hasUsdAmountThresholds && report.optionPnl >= 2_000,
      progress: hasUsdAmountThresholds
        ? Math.min(1, Math.max(0, report.optionPnl / 2_000))
        : undefined,
    },
    {
      id: 'assigned',
      icon: 'A',
      tone: 'warning',
      unlocked: isEligibleLocalReport && assignmentCount > 0,
      progress: isEligibleLocalReport ? Math.min(1, assignmentCount) : undefined,
    },
    {
      id: 'green',
      icon: 'G',
      tone: 'positive',
      unlocked:
        isEligibleLocalReport &&
        report.seasonPnl > 0 &&
        positiveSymbols.length >= 2 &&
        topContribution < 0.8,
    },
    {
      id: 'bagholder',
      icon: 'B',
      tone: 'warning',
      unlocked: hasUsdAmountThresholds && worstUnrealized <= -5_000,
      progress: hasUsdAmountThresholds
        ? Math.min(1, Math.abs(worstUnrealized) / 5_000)
        : undefined,
    },
    {
      id: 'cash',
      icon: '$',
      tone: 'neutral',
      unlocked: isEligibleLocalReport && cashRatio != null && cashRatio >= 0.15,
      progress: isEligibleLocalReport && cashRatio != null
        ? Math.min(1, Math.max(0, cashRatio / 0.15))
        : undefined,
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
