import type {
  OptionEvent,
  ParseResult,
  ParserDiagnostic,
  ParserDiagnosticCode,
  PortfolioReport,
  ReconciliationCheck,
  SourceRef,
  SymbolPnl,
} from '../types'
import {
  isParserDiagnostic,
  PARSER_DIAGNOSTIC_CODES,
} from './parserDiagnostics'

export const MAX_IBKR_WORKER_STATEMENT_BYTES = 5 * 1024 * 1024
export const MAX_WORKER_REPORT_SYMBOLS = 500
export const MAX_WORKER_REPORT_EVENTS = 1_000
export const MAX_WORKER_REPORT_SOURCE_REFS = 20_000
// The all-assets reconciliation contains one broker-total reference in addition
// to the detail reference for every symbol at the supported UI limit.
export const MAX_WORKER_SOURCE_REFS_PER_COLLECTION =
  MAX_WORKER_REPORT_SYMBOLS + 1
export const MAX_WORKER_REPORT_SECTIONS = 256
export const MAX_WORKER_DIAGNOSTICS = 32
export const MAX_WORKER_TOTAL_ITEMS = 25_000
export const MAX_WORKER_TOTAL_STRING_CHARACTERS = 1_000_000

const MAX_DIAGNOSTIC_CODE_CHARACTERS = Math.max(
  ...PARSER_DIAGNOSTIC_CODES.map((code) => code.length),
)
const MAX_SYMBOL_CHARACTERS = 128
const MAX_DESCRIPTION_CHARACTERS = 512
const MAX_CONTRACT_CHARACTERS = 512
const MAX_SECTION_CHARACTERS = 256
const MAX_FIELD_CHARACTERS = 256
const MAX_RECORD_TYPE_CHARACTERS = 32
const MAX_REPORT_SECTION_CHARACTERS = 256
const MAX_ACCOUNT_MASK_CHARACTERS = 32
const WORKER_RECONCILIATION_TOLERANCE = 0.000001

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const FINGERPRINT_PATTERN = /^[0-9a-f]{8}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/

const REPORT_KEYS = [
  'source',
  'fingerprint',
  'accountComparisonKey',
  'accountIdMasked',
  'baseCurrency',
  'seasonYear',
  'startDate',
  'endDate',
  'importedAt',
  'isYtd',
  'netLiquidationValue',
  'cashValue',
  'seasonReturn',
  'seasonPnl',
  'reportedAllAssetsYtdMtm',
  'parsedAllAssetsYtdMtm',
  'mtmReconciliationDifference',
  'statementPeriodTotalPnl',
  'beginningNav',
  'endingNav',
  'calculatedEndingNav',
  'stockPnl',
  'optionPnl',
  'otherPnl',
  'symbols',
  'events',
  'metricSourceRefs',
  'parserFacts',
  'reconciliations',
  'sections',
  'warnings',
  'dataQuality',
] as const

const REQUIRED_REPORT_KEYS = [
  'source',
  'fingerprint',
  'accountComparisonKey',
  'accountIdMasked',
  'baseCurrency',
  'seasonYear',
  'startDate',
  'endDate',
  'importedAt',
  'isYtd',
  'seasonPnl',
  'parsedAllAssetsYtdMtm',
  'stockPnl',
  'optionPnl',
  'otherPnl',
  'symbols',
  'events',
  'metricSourceRefs',
  'parserFacts',
  'reconciliations',
  'sections',
  'warnings',
  'dataQuality',
] as const

const PORTFOLIO_METRIC_KEYS = new Set([
  'seasonPnl',
  'seasonReturn',
  'netLiquidationValue',
  'cashValue',
  'stockPnl',
  'optionPnl',
  'otherPnl',
  'reportedAllAssetsYtdMtm',
  'parsedAllAssetsYtdMtm',
  'statementPeriodTotalPnl',
  'beginningNav',
  'endingNav',
])

const SYMBOL_METRIC_KEYS = new Set([
  'stockYtdMtm',
  'optionYtdMtm',
  'otherYtdMtm',
  'totalYtdMtm',
  'totalRealizedYtd',
  'totalCurrentUnrealized',
])

const RECONCILIATION_IDS = new Set([
  'mtm_all_assets',
  'statement_period_pnl',
  'nav_bridge',
])

const RECONCILIATION_STATUSES = new Set([
  'PASS_EXACT',
  'PASS_ROUNDED',
  'WARNING',
  'BLOCKED',
  'NOT_AVAILABLE',
])

const RECONCILIATION_REASONS = new Set([
  'within_tolerance',
  'source_missing',
  'difference_exceeds_tolerance',
  'unsupported_component',
  'ambiguous_schema',
])

const SOURCE_RECORD_TYPES = new Set(['DATA', 'SUBTOTAL', 'TOTAL', 'EMPTY'])
const EVENT_TYPES = new Set(['assignment', 'exercise', 'expiration'])
const DATA_QUALITIES = new Set(['good', 'warning', 'error'])
const REPORT_WARNING_CODES = new Set<ParserDiagnosticCode>([
  'realized_section_missing',
  'mtm_difference',
  'other_pnl_included',
  'no_option_events',
  'nav_missing',
  'twr_conflict',
  'statement_pnl_mismatch',
  'nav_bridge_review',
])
const INFORMATIONAL_WARNING_CODES = new Set<ParserDiagnosticCode>([
  'other_pnl_included',
  'no_option_events',
])
const ERROR_DIAGNOSTIC_CODES = new Set<ParserDiagnosticCode>(
  PARSER_DIAGNOSTIC_CODES.filter((code) => !REPORT_WARNING_CODES.has(code)),
)

interface ValidationBudget {
  items: number
  sourceRefs: number
  stringCharacters: number
}

type PlainRecord = Record<string, unknown>

function createBudget(): ValidationBudget {
  return { items: 0, sourceRefs: 0, stringCharacters: 0 }
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys,
): value is PlainRecord {
  if (!isPlainRecord(value)) return false

  const allowed = new Set(allowedKeys)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false
  }

  return requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function consumeItems(budget: ValidationBudget, count: number): boolean {
  budget.items += count
  return budget.items <= MAX_WORKER_TOTAL_ITEMS
}

function consumeString(
  value: unknown,
  budget: ValidationBudget,
  maximum: number,
  minimum = 1,
): value is string {
  if (
    typeof value !== 'string' ||
    value.length < minimum ||
    value.length > maximum ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return false
  }
  budget.stringCharacters += value.length
  return budget.stringCharacters <= MAX_WORKER_TOTAL_STRING_CHARACTERS
}

function isDenseArray(
  value: unknown,
  maximum: number,
  budget: ValidationBudget,
): value is unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    !consumeItems(budget, value.length)
  ) {
    return false
  }

  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== value.length + 1 || !ownKeys.includes('length')) return false

  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false
  }
  return true
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function localIsoDate(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidWorkerReferenceTime(value: unknown): value is number {
  if (!Number.isSafeInteger(value)) return false
  const date = new Date(value as number)
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() >= 2000 &&
    date.getFullYear() <= 2100
  )
}

function validateDiagnostic(value: unknown, budget: ValidationBudget): value is ParserDiagnostic {
  if (!isParserDiagnostic(value)) return false
  if (!consumeString(value.code, budget, MAX_DIAGNOSTIC_CODE_CHARACTERS)) return false
  if (value.code === 'mtm_difference') {
    return consumeString(value.params.currency, budget, 4, 3)
  }
  return true
}

function validateDiagnostics(
  value: unknown,
  budget: ValidationBudget,
  allowedCodes: ReadonlySet<ParserDiagnosticCode>,
): value is ParserDiagnostic[] {
  if (!isDenseArray(value, MAX_WORKER_DIAGNOSTICS, budget)) return false
  for (let index = 0; index < value.length; index += 1) {
    const diagnostic = value[index]
    if (!validateDiagnostic(diagnostic, budget)) return false
    if (!allowedCodes.has(diagnostic.code)) return false
  }
  return true
}

function sameDiagnostics(left: ParserDiagnostic[], right: ParserDiagnostic[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const leftDiagnostic = left[index]
    const rightDiagnostic = right[index]
    if (leftDiagnostic.code !== rightDiagnostic.code) return false
    if (leftDiagnostic.code === 'wrong_season') {
      if (
        rightDiagnostic.code !== 'wrong_season' ||
        leftDiagnostic.params.currentYear !== rightDiagnostic.params.currentYear
      ) return false
    } else if (leftDiagnostic.code === 'mtm_difference') {
      if (
        rightDiagnostic.code !== 'mtm_difference' ||
        leftDiagnostic.params.currency !== rightDiagnostic.params.currency ||
        leftDiagnostic.params.difference !== rightDiagnostic.params.difference
      ) return false
    }
  }
  return true
}

function validateSourceRef(value: unknown, budget: ValidationBudget): boolean {
  if (
    !hasExactKeys(
      value,
      [
        'source',
        'section',
        'recordType',
        'rowNumber',
        'pageNumber',
        'headerSignature',
        'field',
      ],
      ['source', 'section', 'field'],
    )
  ) {
    return false
  }

  if (
    value.source !== 'csv' ||
    !consumeString(value.section, budget, MAX_SECTION_CHARACTERS) ||
    !consumeString(value.field, budget, MAX_FIELD_CHARACTERS)
  ) {
    return false
  }

  return (
    consumeString(value.recordType, budget, MAX_RECORD_TYPE_CHARACTERS) &&
    SOURCE_RECORD_TYPES.has(value.recordType as string) &&
    isPositiveSafeInteger(value.rowNumber) &&
    value.pageNumber === undefined &&
    consumeString(value.headerSignature, budget, 8, 8) &&
    FINGERPRINT_PATTERN.test(value.headerSignature as string)
  )
}

function validateSourceRefs(
  value: unknown,
  budget: ValidationBudget,
): value is SourceRef[] {
  if (!isDenseArray(value, MAX_WORKER_SOURCE_REFS_PER_COLLECTION, budget)) return false
  budget.sourceRefs += value.length
  if (budget.sourceRefs > MAX_WORKER_REPORT_SOURCE_REFS) return false
  for (let index = 0; index < value.length; index += 1) {
    if (!validateSourceRef(value[index], budget)) return false
  }
  return true
}

function validateSourceRefMap(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  budget: ValidationBudget,
): boolean {
  if (!hasExactKeys(value, [...allowedKeys], [])) return false
  for (const refs of Object.values(value)) {
    if (!validateSourceRefs(refs, budget)) return false
  }
  return true
}

function validateSymbol(value: unknown, budget: ValidationBudget): value is SymbolPnl {
  const keys = [
    'symbol',
    'description',
    'stockYtdMtm',
    'optionYtdMtm',
    'otherYtdMtm',
    'totalYtdMtm',
    'stockRealizedYtd',
    'optionRealizedYtd',
    'totalRealizedYtd',
    'stockCurrentUnrealized',
    'optionCurrentUnrealized',
    'totalCurrentUnrealized',
    'assignmentCount',
    'exerciseCount',
    'expirationCount',
    'sourceRefs',
  ] as const
  const required = keys.filter((key) => key !== 'description')
  if (!hasExactKeys(value, keys, required)) return false

  if (
    !consumeString(value.symbol, budget, MAX_SYMBOL_CHARACTERS) ||
    (value.description !== undefined &&
      !consumeString(value.description, budget, MAX_DESCRIPTION_CHARACTERS, 0))
  ) {
    return false
  }

  for (const key of [
    'stockYtdMtm',
    'optionYtdMtm',
    'otherYtdMtm',
    'totalYtdMtm',
    'stockRealizedYtd',
    'optionRealizedYtd',
    'totalRealizedYtd',
    'stockCurrentUnrealized',
    'optionCurrentUnrealized',
    'totalCurrentUnrealized',
  ]) {
    if (!isFiniteNumber(value[key])) return false
  }

  for (const key of ['assignmentCount', 'exerciseCount', 'expirationCount']) {
    if (
      !isNonNegativeSafeInteger(value[key]) ||
      (value[key] as number) > MAX_WORKER_REPORT_EVENTS
    ) {
      return false
    }
  }

  const symbol = value as unknown as SymbolPnl
  if (
    symbol.totalYtdMtm !==
      symbol.stockYtdMtm + symbol.optionYtdMtm + symbol.otherYtdMtm ||
    symbol.totalRealizedYtd !==
      symbol.stockRealizedYtd + symbol.optionRealizedYtd ||
    symbol.totalCurrentUnrealized !==
      symbol.stockCurrentUnrealized + symbol.optionCurrentUnrealized
  ) {
    return false
  }

  return validateSourceRefMap(value.sourceRefs, SYMBOL_METRIC_KEYS, budget)
}

function validateEvent(value: unknown, budget: ValidationBudget): value is OptionEvent {
  if (
    !hasExactKeys(
      value,
      ['symbol', 'contract', 'date', 'type', 'sourceRefs'],
      ['symbol', 'type', 'sourceRefs'],
    )
  ) {
    return false
  }
  if (
    !consumeString(value.symbol, budget, MAX_SYMBOL_CHARACTERS) ||
    (value.contract !== undefined &&
      !consumeString(value.contract, budget, MAX_CONTRACT_CHARACTERS, 0)) ||
    (value.date !== undefined &&
      (!consumeString(value.date, budget, 10, 10) || !isIsoDate(value.date))) ||
    !EVENT_TYPES.has(value.type as string)
  ) {
    return false
  }
  return validateSourceRefs(value.sourceRefs, budget)
}

function validateParserFacts(value: unknown): boolean {
  return (
    hasExactKeys(value, ['realizedSectionMissing', 'seasonReturnConflict']) &&
    typeof value.realizedSectionMissing === 'boolean' &&
    typeof value.seasonReturnConflict === 'boolean'
  )
}

function validateReconciliation(
  value: unknown,
  budget: ValidationBudget,
): value is ReconciliationCheck {
  if (
    !hasExactKeys(
      value,
      [
        'id',
        'status',
        'reportedValue',
        'calculatedValue',
        'difference',
        'tolerance',
        'reasonCode',
        'sourceRefs',
      ],
      ['id', 'status', 'reasonCode', 'sourceRefs'],
    )
  ) {
    return false
  }
  if (
    !RECONCILIATION_IDS.has(value.id as string) ||
    !RECONCILIATION_STATUSES.has(value.status as string) ||
    !RECONCILIATION_REASONS.has(value.reasonCode as string) ||
    !isOptionalFiniteNumber(value.reportedValue) ||
    !isOptionalFiniteNumber(value.calculatedValue) ||
    !isOptionalFiniteNumber(value.difference) ||
    !isOptionalFiniteNumber(value.tolerance) ||
    (value.tolerance !== undefined &&
      value.tolerance !== WORKER_RECONCILIATION_TOLERANCE)
  ) {
    return false
  }
  if (!validateSourceRefs(value.sourceRefs, budget)) return false

  const status = value.status as ReconciliationCheck['status']
  const reasonCode = value.reasonCode as ReconciliationCheck['reasonCode']
  const reportedValue = value.reportedValue
  const calculatedValue = value.calculatedValue
  const difference = value.difference
  const tolerance = value.tolerance
  const hasCompleteNumericEvidence =
    isFiniteNumber(reportedValue) &&
    isFiniteNumber(calculatedValue) &&
    isFiniteNumber(difference) &&
    isFiniteNumber(tolerance)
  if (
    hasCompleteNumericEvidence &&
    Math.abs(reportedValue - calculatedValue - difference) > tolerance
  ) {
    return false
  }
  if (status === 'PASS_EXACT' || status === 'PASS_ROUNDED') {
    if (
      reasonCode !== 'within_tolerance' ||
      !isFiniteNumber(value.reportedValue) ||
      !isFiniteNumber(value.calculatedValue) ||
      !isFiniteNumber(value.difference) ||
      !isFiniteNumber(value.tolerance) ||
      value.sourceRefs.length === 0 ||
      Math.abs(value.difference) > value.tolerance ||
      Math.abs(
        value.reportedValue - value.calculatedValue - value.difference,
      ) > value.tolerance ||
      (status === 'PASS_EXACT' && value.difference !== 0) ||
      (status === 'PASS_ROUNDED' && value.difference === 0)
    ) {
      return false
    }
  } else if (status === 'WARNING') {
    if (
      reasonCode === 'within_tolerance' ||
      reasonCode === 'source_missing' ||
      (reasonCode === 'difference_exceeds_tolerance' &&
        (!isFiniteNumber(value.reportedValue) ||
          !isFiniteNumber(value.calculatedValue) ||
          !isFiniteNumber(value.difference) ||
          !isFiniteNumber(value.tolerance) ||
          Math.abs(
            value.reportedValue - value.calculatedValue - value.difference,
          ) > value.tolerance ||
          (value.id !== 'nav_bridge' &&
            Math.abs(value.difference) <= value.tolerance)))
    ) {
      return false
    }
  } else if (reasonCode !== 'source_missing') {
    return false
  }

  return true
}

function validateReport(
  value: unknown,
  budget: ValidationBudget,
  referenceTimeMs: number,
): value is PortfolioReport {
  if (!hasExactKeys(value, REPORT_KEYS, REQUIRED_REPORT_KEYS)) return false

  if (
    (value.source !== 'local' && value.source !== 'synthetic') ||
    !consumeString(value.fingerprint, budget, 8, 8) ||
    !FINGERPRINT_PATTERN.test(value.fingerprint as string) ||
    !consumeString(value.accountComparisonKey, budget, 64, 64) ||
    !SHA256_PATTERN.test(value.accountComparisonKey as string) ||
    !consumeString(value.accountIdMasked, budget, MAX_ACCOUNT_MASK_CHARACTERS) ||
    (value.accountIdMasked !== 'Local account' &&
      !/^\u2022{4}[^\u0000-\u001f\u007f]{4}$/.test(value.accountIdMasked as string)) ||
    !consumeString(value.baseCurrency, budget, 3, 3) ||
    !CURRENCY_PATTERN.test(value.baseCurrency as string) ||
    !Number.isSafeInteger(value.seasonYear) ||
    (value.seasonYear as number) < 2000 ||
    (value.seasonYear as number) > 2100 ||
    !consumeString(value.startDate, budget, 10, 10) ||
    !isIsoDate(value.startDate) ||
    !consumeString(value.endDate, budget, 10, 10) ||
    !isIsoDate(value.endDate) ||
    !consumeString(value.importedAt, budget, 24, 24) ||
    !ISO_TIMESTAMP_PATTERN.test(value.importedAt as string) ||
    Number.isNaN(Date.parse(value.importedAt as string)) ||
    value.importedAt !== new Date(referenceTimeMs).toISOString() ||
    value.isYtd !== true ||
    !validateParserFacts(value.parserFacts) ||
    !DATA_QUALITIES.has(value.dataQuality as string)
  ) {
    return false
  }

  const referenceYear = new Date(referenceTimeMs).getFullYear()
  if (
    value.seasonYear !== referenceYear ||
    value.startDate !== `${value.seasonYear}-01-01` ||
    !(value.endDate as string).startsWith(`${value.seasonYear}-`) ||
    (value.endDate as string) > localIsoDate(referenceTimeMs)
  ) {
    return false
  }

  for (const key of [
    'netLiquidationValue',
    'cashValue',
    'seasonReturn',
    'reportedAllAssetsYtdMtm',
    'mtmReconciliationDifference',
    'statementPeriodTotalPnl',
    'beginningNav',
    'endingNav',
    'calculatedEndingNav',
  ]) {
    if (!isOptionalFiniteNumber(value[key])) return false
  }
  for (const key of [
    'seasonPnl',
    'parsedAllAssetsYtdMtm',
    'stockPnl',
    'optionPnl',
    'otherPnl',
  ]) {
    if (!isFiniteNumber(value[key])) return false
  }

  if (!isDenseArray(value.symbols, MAX_WORKER_REPORT_SYMBOLS, budget)) return false
  const symbols = new Set<string>()
  const symbolsByName = new Map<string, SymbolPnl>()
  let summedStockPnl = 0
  let summedOptionPnl = 0
  let summedOtherPnl = 0
  for (let index = 0; index < value.symbols.length; index += 1) {
    const symbol = value.symbols[index]
    if (!validateSymbol(symbol, budget) || symbols.has(symbol.symbol)) return false
    symbols.add(symbol.symbol)
    symbolsByName.set(symbol.symbol, symbol)
    summedStockPnl += symbol.stockYtdMtm
    summedOptionPnl += symbol.optionYtdMtm
    summedOtherPnl += symbol.otherYtdMtm
  }
  if (
    value.stockPnl !== summedStockPnl ||
    value.optionPnl !== summedOptionPnl ||
    value.otherPnl !== summedOtherPnl ||
    value.parsedAllAssetsYtdMtm !==
      summedStockPnl + summedOptionPnl + summedOtherPnl
  ) {
    return false
  }

  if (!isDenseArray(value.events, MAX_WORKER_REPORT_EVENTS, budget)) return false
  const eventCountsBySymbol = new Map<
    string,
    { assignment: number; exercise: number; expiration: number }
  >()
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index]
    if (
      !validateEvent(event, budget) ||
      (event.date !== undefined &&
        (event.date < value.startDate || event.date > value.endDate))
    ) {
      return false
    }
    if (!symbols.has(event.symbol)) return false
    const counts = eventCountsBySymbol.get(event.symbol) ?? {
      assignment: 0,
      exercise: 0,
      expiration: 0,
    }
    counts[event.type] += 1
    eventCountsBySymbol.set(event.symbol, counts)
  }
  for (const [symbolName, symbol] of symbolsByName) {
    const counts = eventCountsBySymbol.get(symbolName)
    if (
      symbol.assignmentCount !== (counts?.assignment ?? 0) ||
      symbol.exerciseCount !== (counts?.exercise ?? 0) ||
      symbol.expirationCount !== (counts?.expiration ?? 0)
    ) {
      return false
    }
  }

  if (!validateSourceRefMap(value.metricSourceRefs, PORTFOLIO_METRIC_KEYS, budget)) {
    return false
  }
  const parserFacts = value.parserFacts as PortfolioReport['parserFacts']
  const metricSourceRefs = value.metricSourceRefs as PortfolioReport['metricSourceRefs']
  const inferredSeasonReturnConflict =
    value.seasonReturn === undefined &&
    (metricSourceRefs.seasonReturn?.length ?? 0) > 0
  if (parserFacts.seasonReturnConflict !== inferredSeasonReturnConflict) {
    return false
  }

  if (!isDenseArray(value.reconciliations, 3, budget) || value.reconciliations.length !== 3) {
    return false
  }
  const reconciliationIds = new Set<string>()
  const reconciliationsById = new Map<string, ReconciliationCheck>()
  let hasIncompleteReconciliation = false
  for (let index = 0; index < value.reconciliations.length; index += 1) {
    const reconciliation = value.reconciliations[index]
    if (
      !validateReconciliation(reconciliation, budget) ||
      reconciliationIds.has(reconciliation.id)
    ) {
      return false
    }
    reconciliationIds.add(reconciliation.id)
    reconciliationsById.set(reconciliation.id, reconciliation)
    if (
      reconciliation.status !== 'PASS_EXACT' &&
      reconciliation.status !== 'PASS_ROUNDED'
    ) {
      hasIncompleteReconciliation = true
    }
  }
  if (reconciliationIds.size !== RECONCILIATION_IDS.size) return false

  const mtmReconciliation = reconciliationsById.get('mtm_all_assets')!
  const statementPnlReconciliation = reconciliationsById.get(
    'statement_period_pnl',
  )!
  const navReconciliation = reconciliationsById.get('nav_bridge')!
  if (
    !isFiniteNumber(value.reportedAllAssetsYtdMtm) ||
    !isFiniteNumber(value.mtmReconciliationDifference) ||
    value.seasonPnl !== value.reportedAllAssetsYtdMtm ||
    mtmReconciliation.reportedValue !== value.reportedAllAssetsYtdMtm ||
    mtmReconciliation.calculatedValue !== value.parsedAllAssetsYtdMtm ||
    mtmReconciliation.difference !== value.mtmReconciliationDifference ||
    mtmReconciliation.tolerance !== WORKER_RECONCILIATION_TOLERANCE ||
    (value.mtmReconciliationDifference === 0 &&
      mtmReconciliation.status !== 'PASS_EXACT') ||
    (value.mtmReconciliationDifference !== 0 &&
      Math.abs(value.mtmReconciliationDifference) <=
        WORKER_RECONCILIATION_TOLERANCE &&
      mtmReconciliation.status !== 'PASS_ROUNDED') ||
    (Math.abs(value.mtmReconciliationDifference) >
      WORKER_RECONCILIATION_TOLERANCE &&
      (mtmReconciliation.status !== 'WARNING' ||
        mtmReconciliation.reasonCode !== 'difference_exceeds_tolerance')) ||
    statementPnlReconciliation.reportedValue !==
      value.statementPeriodTotalPnl ||
    navReconciliation.calculatedValue !== value.calculatedEndingNav ||
    (navReconciliation.reportedValue !== undefined &&
      navReconciliation.reportedValue !== value.endingNav)
  ) {
    return false
  }
  if (hasIncompleteReconciliation && value.dataQuality === 'good') return false

  if (!isDenseArray(value.sections, MAX_WORKER_REPORT_SECTIONS, budget)) return false
  const sections = new Set<string>()
  for (let index = 0; index < value.sections.length; index += 1) {
    const section = value.sections[index]
    if (
      !consumeString(section, budget, MAX_REPORT_SECTION_CHARACTERS) ||
      sections.has(section)
    ) {
      return false
    }
    sections.add(section)
  }

  if (!validateDiagnostics(value.warnings, budget, REPORT_WARNING_CODES)) return false

  const warningCodes = new Set<ParserDiagnosticCode>()
  let hasSubstantiveWarning = false
  for (const warning of value.warnings) {
    if (warningCodes.has(warning.code)) return false
    warningCodes.add(warning.code)
    if (!INFORMATIONAL_WARNING_CODES.has(warning.code)) {
      hasSubstantiveWarning = true
    }

    if (
      warning.code === 'mtm_difference' &&
      (warning.params.currency !== value.baseCurrency ||
        warning.params.difference !== value.mtmReconciliationDifference ||
        warning.params.difference === 0)
    ) {
      return false
    }
    if (warning.code === 'other_pnl_included' && value.otherPnl === 0) return false
    if (warning.code === 'no_option_events' && value.events.length !== 0) return false
    if (warning.code === 'nav_missing' && value.netLiquidationValue !== undefined) {
      return false
    }
    if (warning.code === 'twr_conflict' && value.seasonReturn !== undefined) return false
    if (
      warning.code === 'statement_pnl_mismatch' &&
      reconciliationsById.get('statement_period_pnl')?.status !== 'WARNING'
    ) {
      return false
    }
    if (
      warning.code === 'nav_bridge_review' &&
      reconciliationsById.get('nav_bridge')?.status !== 'WARNING'
    ) {
      return false
    }
  }

  if (
    warningCodes.has('mtm_difference') !==
      (mtmReconciliation.status === 'WARNING') ||
    warningCodes.has('other_pnl_included') !== (value.otherPnl !== 0) ||
    warningCodes.has('no_option_events') !== (value.events.length === 0) ||
    warningCodes.has('nav_missing') !==
      (value.netLiquidationValue === undefined) ||
    warningCodes.has('twr_conflict') !== parserFacts.seasonReturnConflict ||
    warningCodes.has('realized_section_missing') !==
      parserFacts.realizedSectionMissing ||
    warningCodes.has('statement_pnl_mismatch') !==
      (statementPnlReconciliation.status === 'WARNING') ||
    warningCodes.has('nav_bridge_review') !==
      (navReconciliation.status === 'WARNING')
  ) {
    return false
  }

  const expectedDataQuality =
    hasIncompleteReconciliation || hasSubstantiveWarning ? 'warning' : 'good'
  return value.dataQuality === expectedDataQuality
}

export function isWorkerReportWithinLimits(
  report: unknown,
  referenceTimeMs = Date.now(),
): report is PortfolioReport {
  try {
    return (
      isValidWorkerReferenceTime(referenceTimeMs) &&
      validateReport(report, createBudget(), referenceTimeMs)
    )
  } catch {
    return false
  }
}

export function isWorkerParseResultWithinLimits(
  result: unknown,
  referenceTimeMs = Date.now(),
): result is ParseResult {
  try {
    if (
      !isValidWorkerReferenceTime(referenceTimeMs) ||
      !hasExactKeys(result, ['report', 'errors', 'warnings'], ['errors', 'warnings'])
    ) {
      return false
    }

    const budget = createBudget()
    if (!validateDiagnostics(result.errors, budget, ERROR_DIAGNOSTIC_CODES)) return false
    if (!validateDiagnostics(result.warnings, budget, REPORT_WARNING_CODES)) return false
    const referenceYear = new Date(referenceTimeMs).getFullYear()
    if (
      result.errors.some(
        (diagnostic) =>
          diagnostic.code === 'wrong_season' &&
          diagnostic.params.currentYear !== referenceYear,
      )
    ) {
      return false
    }

    if (result.report === undefined) return result.errors.length > 0
    return (
      result.errors.length === 0 &&
      validateReport(result.report, budget, referenceTimeMs) &&
      sameDiagnostics(result.warnings, result.report.warnings)
    )
  } catch {
    return false
  }
}
