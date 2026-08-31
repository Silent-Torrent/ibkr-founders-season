import type { ParseResult, ParserDiagnostic, SourceRef } from '../types'

export const MAX_REPORT_UNDERLYINGS = 500
export const MAX_REPORT_EVENTS = 1_000
export const MAX_REPORT_SECTIONS = 256
export const MAX_REPORT_SOURCE_REF_OCCURRENCES = 20_000
export const MAX_REPORT_TOTAL_ITEMS = 25_000
export const MAX_REPORT_TOTAL_STRING_CHARACTERS = 1_000_000
export const MAX_SYMBOL_CHARACTERS = 128
export const MAX_DESCRIPTION_CHARACTERS = 512
export const MAX_CONTRACT_CHARACTERS = 512
export const MAX_SECTION_CHARACTERS = 256
export const MAX_FIELD_CHARACTERS = 256
export const MAX_RECORD_TYPE_CHARACTERS = 32
export const MAX_REPORT_SECTION_CHARACTERS = 256
export const MAX_ACCOUNT_MASK_CHARACTERS = 32
export const REPORT_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

// One all-assets reconciliation may contain every underlying detail reference
// plus the broker's reported total reference.
export const MAX_SOURCE_REFS_PER_COLLECTION = MAX_REPORT_UNDERLYINGS + 1

interface ReportResourceBudget {
  items: number
  sourceRefs: number
  stringCharacters: number
}

function consumeItems(budget: ReportResourceBudget, count: number): boolean {
  budget.items += count
  return budget.items <= MAX_REPORT_TOTAL_ITEMS
}

function consumeString(
  budget: ReportResourceBudget,
  value: string | undefined,
  maximum = Number.MAX_SAFE_INTEGER,
  minimum = 0,
): boolean {
  if (value === undefined) return true
  if (
    value.length < minimum ||
    value.length > maximum ||
    REPORT_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return false
  }
  budget.stringCharacters += value.length
  return budget.stringCharacters <= MAX_REPORT_TOTAL_STRING_CHARACTERS
}

function consumeDiagnostic(
  budget: ReportResourceBudget,
  diagnostic: ParserDiagnostic,
): boolean {
  return (
    consumeString(budget, diagnostic.code) &&
    (diagnostic.code !== 'mtm_difference' ||
      consumeString(budget, diagnostic.params.currency, 4, 3))
  )
}

function consumeSourceRefs(
  budget: ReportResourceBudget,
  refs: readonly SourceRef[] | undefined,
): boolean {
  if (!refs) return true
  if (
    refs.length > MAX_SOURCE_REFS_PER_COLLECTION ||
    !consumeItems(budget, refs.length)
  ) {
    return false
  }
  budget.sourceRefs += refs.length
  if (budget.sourceRefs > MAX_REPORT_SOURCE_REF_OCCURRENCES) return false

  for (const ref of refs) {
    if (
      !consumeString(budget, ref.section, MAX_SECTION_CHARACTERS, 1) ||
      !consumeString(
        budget,
        ref.recordType,
        MAX_RECORD_TYPE_CHARACTERS,
        1,
      ) ||
      !consumeString(budget, ref.headerSignature, 8, 8) ||
      !consumeString(budget, ref.field, MAX_FIELD_CHARACTERS, 1)
    ) {
      return false
    }
  }
  return true
}

/**
 * Mirrors the aggregate array-item, source-reference, and string-character
 * budgets consumed by the strict Worker validator for a trusted parser result.
 * Shape and accounting semantics remain the Worker's independent concern.
 */
export function parseResultFitsReportResourceBudget(
  result: ParseResult,
): boolean {
  const budget: ReportResourceBudget = {
    items: 0,
    sourceRefs: 0,
    stringCharacters: 0,
  }
  if (
    !consumeItems(budget, result.errors.length) ||
    !result.errors.every((diagnostic) => consumeDiagnostic(budget, diagnostic)) ||
    !consumeItems(budget, result.warnings.length) ||
    !result.warnings.every((diagnostic) => consumeDiagnostic(budget, diagnostic))
  ) {
    return false
  }

  const report = result.report
  if (!report) return true
  if (
    !consumeString(budget, report.fingerprint, 8, 8) ||
    !consumeString(budget, report.accountComparisonKey, 64, 64) ||
    !consumeString(
      budget,
      report.accountIdMasked,
      MAX_ACCOUNT_MASK_CHARACTERS,
      1,
    ) ||
    !consumeString(budget, report.baseCurrency, 3, 3) ||
    !consumeString(budget, report.startDate, 10, 10) ||
    !consumeString(budget, report.endDate, 10, 10) ||
    !consumeString(budget, report.importedAt, 24, 24) ||
    report.symbols.length > MAX_REPORT_UNDERLYINGS ||
    !consumeItems(budget, report.symbols.length)
  ) {
    return false
  }

  for (const symbol of report.symbols) {
    if (
      !consumeString(budget, symbol.symbol, MAX_SYMBOL_CHARACTERS, 1) ||
      !consumeString(
        budget,
        symbol.description,
        MAX_DESCRIPTION_CHARACTERS,
      )
    ) {
      return false
    }
    for (const refs of Object.values(symbol.sourceRefs)) {
      if (!consumeSourceRefs(budget, refs)) return false
    }
  }

  if (
    report.events.length > MAX_REPORT_EVENTS ||
    !consumeItems(budget, report.events.length)
  ) {
    return false
  }
  for (const event of report.events) {
    if (
      !consumeString(budget, event.symbol, MAX_SYMBOL_CHARACTERS, 1) ||
      !consumeString(budget, event.contract, MAX_CONTRACT_CHARACTERS) ||
      !consumeString(budget, event.date, 10, 10) ||
      !consumeSourceRefs(budget, event.sourceRefs)
    ) {
      return false
    }
  }

  for (const refs of Object.values(report.metricSourceRefs)) {
    if (!consumeSourceRefs(budget, refs)) return false
  }

  if (!consumeItems(budget, report.reconciliations.length)) return false
  for (const reconciliation of report.reconciliations) {
    if (!consumeSourceRefs(budget, reconciliation.sourceRefs)) return false
  }

  if (
    report.sections.length > MAX_REPORT_SECTIONS ||
    !consumeItems(budget, report.sections.length)
  ) {
    return false
  }
  for (const section of report.sections) {
    if (!consumeString(budget, section, MAX_REPORT_SECTION_CHARACTERS, 1)) {
      return false
    }
  }

  return (
    consumeItems(budget, report.warnings.length) &&
    report.warnings.every((diagnostic) =>
      consumeDiagnostic(budget, diagnostic),
    )
  )
}
