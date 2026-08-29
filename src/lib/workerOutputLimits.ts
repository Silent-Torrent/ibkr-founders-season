import type { PortfolioReport, SourceRef } from '../types'

export const MAX_WORKER_REPORT_SYMBOLS = 5_000
export const MAX_WORKER_REPORT_EVENTS = 25_000
export const MAX_WORKER_REPORT_SOURCE_REFS = 100_000

function countRefs(
  refs: SourceRef[] | undefined,
  runningTotal: number,
): number {
  return runningTotal + (refs?.length ?? 0)
}

export function isWorkerReportWithinLimits(report: PortfolioReport): boolean {
  if (report.symbols.length > MAX_WORKER_REPORT_SYMBOLS) return false
  if (report.events.length > MAX_WORKER_REPORT_EVENTS) return false

  let sourceRefCount = 0
  for (const refs of Object.values(report.metricSourceRefs)) {
    sourceRefCount = countRefs(refs, sourceRefCount)
    if (sourceRefCount > MAX_WORKER_REPORT_SOURCE_REFS) return false
  }

  for (const check of report.reconciliations) {
    sourceRefCount = countRefs(check.sourceRefs, sourceRefCount)
    if (sourceRefCount > MAX_WORKER_REPORT_SOURCE_REFS) return false
  }

  for (const symbol of report.symbols) {
    for (const refs of Object.values(symbol.sourceRefs)) {
      sourceRefCount = countRefs(refs, sourceRefCount)
      if (sourceRefCount > MAX_WORKER_REPORT_SOURCE_REFS) return false
    }
  }

  for (const event of report.events) {
    sourceRefCount = countRefs(event.sourceRefs, sourceRefCount)
    if (sourceRefCount > MAX_WORKER_REPORT_SOURCE_REFS) return false
  }

  return true
}
