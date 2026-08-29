import type { MessageKey } from '../i18n'
import type { ReportSource } from '../types'

export function isImportedSource(source: ReportSource): boolean {
  return source !== 'demo'
}

export function isSyntheticSource(source: ReportSource): boolean {
  return source === 'demo' || source === 'synthetic'
}

export function reportSourceStatusKey(source: ReportSource): MessageKey {
  if (source === 'demo') return 'demoData'
  if (source === 'synthetic') return 'syntheticTest'
  return 'localReport'
}

export function reportTrustLabelKey(source: ReportSource): MessageKey {
  if (source === 'demo') return 'syntheticDemo'
  if (source === 'synthetic') return 'syntheticTest'
  return 'selfReported'
}
