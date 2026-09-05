import type { PortfolioReport, SymbolPnl } from '../types'

export function hasRealizedExplanation(
  report: PortfolioReport,
  symbol: SymbolPnl,
): boolean {
  return (
    !report.parserFacts.realizedSectionMissing ||
    (symbol.sourceRefs.totalRealizedYtd?.length ?? 0) > 0
  )
}

export function hasCurrentUnrealizedExplanation(report: PortfolioReport): boolean {
  return !report.parserFacts.realizedSectionMissing
}
