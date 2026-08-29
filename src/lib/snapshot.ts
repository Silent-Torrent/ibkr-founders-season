import type { PortfolioReport } from '../types'
import { isImportedSource } from './reportSource'

export type SnapshotImportDecision = 'accept' | 'duplicate' | 'same_date' | 'older'

export function decideSnapshotImport(
  currentReport: PortfolioReport,
  nextReport: PortfolioReport,
): SnapshotImportDecision {
  if (
    isImportedSource(currentReport.source) &&
    currentReport.fingerprint &&
    currentReport.fingerprint === nextReport.fingerprint
  ) {
    return 'duplicate'
  }

  const isSameAccountSeason =
    isImportedSource(currentReport.source) &&
    currentReport.seasonYear === nextReport.seasonYear &&
    currentReport.accountComparisonKey === nextReport.accountComparisonKey

  if (!isSameAccountSeason) return 'accept'
  if (nextReport.endDate === currentReport.endDate) return 'same_date'
  if (nextReport.endDate < currentReport.endDate) return 'older'
  return 'accept'
}
