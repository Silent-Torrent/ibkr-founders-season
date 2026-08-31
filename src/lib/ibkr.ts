import type {
  AssetClass,
  OptionEvent,
  ParseResult,
  ParserDiagnostic,
  PortfolioReport,
  ReconciliationCheck,
  SourceRef,
  SymbolMetricKey,
  SymbolPnl,
} from '../types'
import {
  CsvParseFailure,
  fingerprintText,
  normalizeKey,
  parseCsvRows,
  parseDateFlexible,
  parseDateRange,
  parseNumber,
  parsePercent,
  sumExactNumbers,
  toIsoDate,
} from './csv'
import { sha256Hex } from './sha256'

interface SectionRecord {
  section: string
  fields: Record<string, string>
  recordType: string
  rowNumber: number
  headerSignature: string
}

interface SymbolAccumulator extends SymbolPnl {
  hasYtdRealized: boolean
}

interface HeaderState {
  headers: string[]
  signature: string
  section: string
}

interface FieldMatch {
  field: string
  value: string
}

interface NumericMatch {
  value: number
  sourceRef: SourceRef
}

interface InstrumentUnderlying {
  underlying: string
  sourceRefs: SourceRef[]
}

interface InstrumentUnderlyingMapResult {
  contractAliases: Set<string>
  conflictingAliases: Set<string>
  hasConflicts: boolean
  mapping: Map<string, InstrumentUnderlying>
}

interface UnderlyingResolution {
  sourceRefs: SourceRef[]
  underlying: string
}

interface UnderlyingFieldResolution {
  conflict: boolean
  sourceRefs: SourceRef[]
  underlying?: string
}

type InstrumentUnderlyingCandidates = Map<string, Map<string, SourceRef[]>>

const MAX_CSV_CHARACTERS = 10_000_000
const MAX_CSV_ROWS = 100_000
const CSV_RECONCILIATION_EPSILON = 0.000001
const MTM_PERFORMANCE_SECTION_ALIASES = [
  'Mark-to-Market Performance Summary',
  'Mark-to-Market Performance Summary in Base',
]
const MONTH_YTD_PERFORMANCE_SECTION_ALIASES = [
  'Month & Year to Date Performance Summary',
  'Month & Year to Date Performance Summary in Base',
  'Month and Year to Date Performance Summary',
  'Month and Year to Date Performance Summary in Base',
  'Profit and Loss by Underlying Instruments',
]
const YTD_PERFORMANCE_SECTION_ALIASES = [
  ...MTM_PERFORMANCE_SECTION_ALIASES,
  ...MONTH_YTD_PERFORMANCE_SECTION_ALIASES,
]
const REALIZED_PERFORMANCE_SECTION_ALIASES = [
  'Realized & Unrealized Performance Summary',
  'Realized & Unrealized Performance Summary in Base',
  'Realized and Unrealized Performance Summary',
  'Realized and Unrealized Performance Summary in Base',
]
const NAV_SECTION_ALIASES = [
  'Net Asset Value',
  'NAV Summary',
  'Net Asset Value (NAV) in Base Currency',
  'Net Asset Value (NAV) Summary in Base',
]
const NAV_LABEL_FIELD_ALIASES = [
  'Asset Class',
  'Asset Category',
  'Description',
  'Field Name',
]
const NAV_CURRENT_TOTAL_FIELD_ALIASES = [
  'Current Total',
  'Ending Value',
  'Current Value',
  'Field Value',
  'Total',
]
const NAV_PRIOR_TOTAL_FIELD_ALIASES = [
  'Prior Total',
  'Starting Value',
  'Prior Value',
]
const NAV_CURRENT_LONG_FIELD_ALIASES = ['Current Long']
const NAV_CURRENT_SHORT_FIELD_ALIASES = ['Current Short']
const NAV_CHANGE_FIELD_ALIASES = ['Change']
const NAV_WIDE_COMPONENT_FIELD_ALIASES = [
  ['Cash'],
  ['SLB Cash Collateral'],
  ['Stock'],
  ['SLB Direct Securities Borrowed'],
  ['SLB Direct Securities Lent'],
  ['Options'],
  ['Commodities'],
  ['Bonds'],
  ['Notes'],
  ['Interest Accruals'],
  ['Soft Dollars'],
  ['Dividend Accruals'],
]
const NAV_WIDE_METADATA_FIELD_ALIASES = [
  ['Account ID'],
  ['Account Alias'],
  ['Model'],
  ['Report Date'],
]
const MONTH_YTD_MTM_FIELD_ALIASES = [
  'YTD Mark-to-Market',
  'Mark-to-Market YTD',
  'YTD MTM P/L',
  'YTD MTM PNL',
  'YTD MTM',
]
const MTM_TOTAL_FIELD_ALIASES = [
  'Mark-to-Market P/L Total',
  'Mark-to-Market PNL Total',
  'Total',
]
const MTM_POSITION_FIELD_ALIASES = [
  'Mark-to-Market P/L Position',
  'Mark-to-Market PNL Position',
  'Prior Open MTM Profit and Loss',
]
const MTM_TRANSACTION_FIELD_ALIASES = [
  'Mark-to-Market P/L Transaction',
  'Mark-to-Market PNL Transaction',
  'Transaction MTM Profit and Loss',
]
const MTM_COMMISSION_FIELD_ALIASES = [
  'Mark-to-Market P/L Commissions',
  'Mark-to-Market PNL Commissions',
  'Commissions',
]
const MTM_OTHER_FIELD_ALIASES = [
  'Mark-to-Market P/L Other',
  'Mark-to-Market PNL Other',
  'Other',
]
const YTD_REALIZED_SHORT_FIELD_ALIASES = [
  'YTD Realized S/T',
  'Realized S/T YTD',
  'Realized Short Term YTD',
  'Reazlied S/T YTD',
]
const YTD_REALIZED_LONG_FIELD_ALIASES = [
  'YTD Realized L/T',
  'Realized L/T YTD',
  'Realized Long Term YTD',
]
const REALIZED_TOTAL_FIELD_ALIASES = [
  'Total Realized PNL',
  'Realized Total',
  'Total Realized P/L',
]
const UNREALIZED_TOTAL_FIELD_ALIASES = [
  'Total Unrealized PNL',
  'Unrealized Total',
  'Total Unrealized P/L',
]
const REALIZED_SHORT_PROFIT_FIELD_ALIASES = [
  'Realized S/T Profit',
  'Realized Short Term Profit',
]
const REALIZED_SHORT_LOSS_FIELD_ALIASES = [
  'Realized S/T Loss',
  'Realized Short Term Loss',
]
const REALIZED_LONG_PROFIT_FIELD_ALIASES = [
  'Realized L/T Profit',
  'Realized Long Term Profit',
]
const REALIZED_LONG_LOSS_FIELD_ALIASES = [
  'Realized L/T Loss',
  'Realized Long Term Loss',
]
const UNREALIZED_SHORT_PROFIT_FIELD_ALIASES = [
  'Unrealized S/T Profit',
  'Unrealized Short Term Profit',
]
const UNREALIZED_SHORT_LOSS_FIELD_ALIASES = [
  'Unrealized S/T Loss',
  'Unrealized Short Term Loss',
]
const UNREALIZED_LONG_PROFIT_FIELD_ALIASES = [
  'Unrealized L/T Profit',
  'Unrealized Long Term Profit',
]
const UNREALIZED_LONG_LOSS_FIELD_ALIASES = [
  'Unrealized L/T Loss',
  'Unrealized Long Term Loss',
]
const UNREALIZED_PROFIT_FIELD_ALIASES = ['Unrealized Profit']
const UNREALIZED_LOSS_FIELD_ALIASES = ['Unrealized Loss']
const REALIZED_AND_UNREALIZED_TOTAL_FIELD_ALIASES = [
  'Total',
  'Total FIFO PNL',
  'Total FIFO P/L',
]
const ASSET_IDENTITY_FIELD_ALIASES = ['Asset Class', 'Asset Category']
const SYMBOL_IDENTITY_FIELD_ALIASES = ['Symbol']
const UNDERLYING_IDENTITY_FIELD_ALIASES = ['Underlying', 'Underlying Symbol']
const RETURN_FIELD_ALIASES = [
  'Time Weighted Rate of Return',
  'TWR',
  'Year to Date Return',
  'YTD Return',
]
const OPTION_LIFECYCLE_SECTION_ALIASES = [
  'Options Exercises, Assignments and Expirations',
  'Option Exercises, Assignments and Expirations',
]
const KNOWN_SYNTHETIC_STATEMENTS = new Set([
  'a81d783777ab4bd84bf8066764425489be96d60f67270cbbc2ffebac495a0d7f',
  '80831483527003e501aa63f1691a2f155a37b8279f68e2e3e31cb244a219d7ff',
])

function knownSyntheticIdentity(text: string): string {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  return sha256Hex(normalized)
}

export interface ParseIbkrActivityStatementOptions {
  accountComparisonSalt?: string
  currentDate?: Date
}

const SECTION_CODES: Record<string, string> = {
  ACCT: 'Account Information',
  EQUT: 'Net Asset Value',
  EQUS: 'Net Asset Value',
  FIFO: 'Realized & Unrealized Performance Summary',
  MTMP: 'Mark-to-Market Performance Summary',
  PLUI: 'Profit and Loss by Underlying Instruments',
  POST: 'Open Positions',
  POSS: 'Open Positions',
  TRNT: 'Trades',
  TRNS: 'Trades',
  CRTT: 'Cash Report',
  CRTS: 'Cash Report',
  CORP: 'Corporate Actions',
  CTRN: 'Cash Transactions',
}

function canonicalSectionName(value: string): string {
  const trimmed = value.trim()
  return SECTION_CODES[trimmed.toUpperCase()] ?? trimmed
}

function sourceSectionIdentity(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || /[^\x20-\x7E]/.test(trimmed)) return undefined
  return trimmed.toUpperCase()
}

function normalizeSchemaKey(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || /[^\x20-\x7E]/.test(trimmed)) return undefined
  return normalizeKey(trimmed)
}

function schemaAliasMap(aliases: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const alias of aliases) {
    const key = normalizeSchemaKey(alias)
    if (key && !result.has(key)) result.set(key, alias)
  }
  return result
}

function matchesSchemaAlias(value: string, aliases: string[]): boolean {
  const key = normalizeSchemaKey(value)
  return key != null && schemaAliasMap(aliases).has(key)
}

function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}__${count}`
  })
}

function buildSectionStore(rows: string[][]): Map<string, SectionRecord[]> {
  const store = new Map<string, SectionRecord[]>()
  const headersBySection = new Map<string, HeaderState>()

  rows.forEach((row, rowIndex) => {
    if (row.length < 2) return

    const rawSection = row[0].trim()
    const descriptor = row[1].trim().toUpperCase()

    if (descriptor === 'BOS' && row[2]) {
      return
    }

    const sourceIdentity = sourceSectionIdentity(rawSection)
    const section = canonicalSectionName(rawSection)
    const sectionKey = normalizeSchemaKey(section)
    if (!sourceIdentity || !sectionKey) return

    if (descriptor === 'HEADER') {
      const headers = uniqueHeaders(row.slice(2))
      headersBySection.set(sourceIdentity, {
        headers,
        signature: fingerprintText(headers.join('\u001f')),
        section,
      })
      return
    }

    const isSupportedRecordType = ['DATA', 'SUBTOTAL', 'TOTAL'].includes(descriptor)
    const isKnownEmptyTotalPnl =
      descriptor === '' && sectionKey === normalizeKey('Total P/L for Statement Period')
    if (!isSupportedRecordType && !isKnownEmptyTotalPnl) return

    let headerState = headersBySection.get(sourceIdentity)
    if (isKnownEmptyTotalPnl && !headerState) {
      for (const candidate of headersBySection.values()) {
        if (matchesSchemaAlias(candidate.section, MTM_PERFORMANCE_SECTION_ALIASES)) {
          headerState = candidate
          break
        }
      }
    }

    if (
      isKnownEmptyTotalPnl &&
      (!headerState || row.length !== headerState.headers.length + 2)
    ) {
      return
    }

    const headers = headerState?.headers
    const values = row.slice(2)
    const fields: Record<string, string> = {}

    if (headers) {
      headers.forEach((header, index) => {
        fields[header] = values[index] ?? ''
      })
    } else {
      values.forEach((value, index) => {
        fields[`Column ${index + 1}`] = value
      })
    }

    const records = store.get(sourceIdentity) ?? []
    records.push({
      section,
      fields,
      recordType: descriptor || 'EMPTY',
      rowNumber: rowIndex + 1,
      headerSignature:
        headerState?.signature ?? fingerprintText(Object.keys(fields).join('\u001f')),
    })
    store.set(sourceIdentity, records)
  })

  return store
}

function listSectionNames(rows: string[][]): string[] {
  const controlRecords = new Set(['BOF', 'EOF', 'BOS', 'EOS'])
  const names = new Set<string>()

  for (const row of rows) {
    const rawSection = row[0]?.trim()
    if (!rawSection || controlRecords.has(rawSection.toUpperCase())) continue
    const canonical = canonicalSectionName(rawSection)
    if (normalizeSchemaKey(canonical)) names.add(canonical)
  }

  return [...names].sort()
}

function recordsFor(
  store: Map<string, SectionRecord[]>,
  aliases: string[],
): SectionRecord[] {
  const normalizedAliases = schemaAliasMap(aliases)
  const matches: SectionRecord[] = []

  for (const records of store.values()) {
    const sectionKey = normalizeSchemaKey(records[0]?.section ?? '')
    const canonicalSection = sectionKey
      ? normalizedAliases.get(sectionKey)
      : undefined
    if (canonicalSection) {
      matches.push(
        ...records.map((record) => ({ ...record, section: canonicalSection })),
      )
    }
  }

  return matches
}

function recordsForExclusive(
  store: Map<string, SectionRecord[]>,
  aliases: string[],
): { records: SectionRecord[]; alternatives: SectionRecord[][]; conflict: boolean } {
  const normalizedAliases = schemaAliasMap(aliases)
  const priority = new Map<string, number>()
  aliases.forEach((alias, index) => {
    const key = normalizeSchemaKey(alias)
    if (key && !priority.has(key)) priority.set(key, index)
  })
  const matches: Array<{ priority: number; order: number; records: SectionRecord[] }> = []

  let order = 0
  for (const records of store.values()) {
    const sectionKey = normalizeSchemaKey(records[0]?.section ?? '')
    const canonicalSection = sectionKey
      ? normalizedAliases.get(sectionKey)
      : undefined
    if (canonicalSection && sectionKey) {
      matches.push({
        priority: priority.get(sectionKey) ?? Number.MAX_SAFE_INTEGER,
        order,
        records: records.map((record) => ({
          ...record,
          section: canonicalSection,
        })),
      })
    }
    order += 1
  }

  matches.sort((left, right) => left.priority - right.priority || left.order - right.order)
  const alternatives = matches.map((match) => match.records)

  return {
    records: alternatives[0] ?? [],
    alternatives,
    conflict: alternatives.length > 1,
  }
}

function hasEmptyHeaderBlock(rows: string[][], aliases: string[]): boolean {
  const normalizedAliases = schemaAliasMap(aliases)
  const states = new Map<string, { hasData: boolean; seenHeader: boolean }>()

  for (const row of rows) {
    const rawSection = row[0]?.trim() ?? ''
    const sourceIdentity = sourceSectionIdentity(rawSection)
    const sectionKey = normalizeSchemaKey(canonicalSectionName(rawSection))
    if (
      !sourceIdentity ||
      !sectionKey ||
      !normalizedAliases.has(sectionKey)
    ) {
      continue
    }

    const descriptor = row[1]?.trim().toUpperCase() ?? ''
    const state = states.get(sourceIdentity) ?? {
      hasData: false,
      seenHeader: false,
    }
    if (descriptor === 'HEADER') {
      if (state.seenHeader && !state.hasData) return true
      states.set(sourceIdentity, { hasData: false, seenHeader: true })
      continue
    }
    if (
      state.seenHeader &&
      ['DATA', 'SUBTOTAL', 'TOTAL'].includes(descriptor)
    ) {
      state.hasData = true
      states.set(sourceIdentity, state)
    }
  }

  return [...states.values()].some(
    (state) => state.seenHeader && !state.hasData,
  )
}

function fieldMatchesFor(record: SectionRecord, aliases: string[]): FieldMatch[] {
  const normalizedAliases = schemaAliasMap(aliases)
  const matches: FieldMatch[] = []

  for (const [key, value] of Object.entries(record.fields)) {
    const duplicate = key.match(/^(.*)__(\d+)$/)
    const rawKey = duplicate?.[1] ?? key
    const duplicateSuffix = duplicate?.[2]
    const schemaKey = normalizeSchemaKey(rawKey)
    if (!schemaKey) continue
    const canonicalField = normalizedAliases.get(schemaKey)
    if (canonicalField) {
      matches.push({
        field: duplicateSuffix ? `${canonicalField}__${duplicateSuffix}` : canonicalField,
        value,
      })
    }
  }

  return matches
}

function fieldFor(record: SectionRecord, aliases: string[]): FieldMatch | undefined {
  return fieldMatchesFor(record, aliases)[0]
}

function valueFor(record: SectionRecord, aliases: string[]): string | undefined {
  return fieldFor(record, aliases)?.value
}

function sourceRefFor(record: SectionRecord, field: string): SourceRef {
  return {
    source: 'csv',
    section: record.section,
    recordType: record.recordType,
    rowNumber: record.rowNumber,
    headerSignature: record.headerSignature,
    field,
  }
}

function isMissingNumericText(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === '' || trimmed === '-' || trimmed === '--'
}

function collectInvalidNumericField(
  record: SectionRecord,
  match: FieldMatch,
  invalidNumericFields: SourceRef[] | undefined,
): void {
  if (!invalidNumericFields || isMissingNumericText(match.value)) return
  invalidNumericFields.push(sourceRefFor(record, match.field))
}

function numericMatchFor(
  record: SectionRecord,
  aliases: string[],
  invalidNumericFields?: SourceRef[],
  missingIsInvalid = false,
): NumericMatch | undefined {
  const matches = fieldMatchesFor(record, aliases)
  if (matches.length === 0) return undefined
  if (matches.length > 1) {
    for (const match of matches) {
      if (invalidNumericFields) {
        invalidNumericFields.push(sourceRefFor(record, match.field))
      }
    }
    return undefined
  }
  const match = matches[0]
  const value = parseNumber(match.value)
  if (value == null) {
    if (missingIsInvalid && invalidNumericFields) {
      invalidNumericFields.push(sourceRefFor(record, match.field))
    } else {
      collectInvalidNumericField(record, match, invalidNumericFields)
    }
    return undefined
  }
  return { value, sourceRef: sourceRefFor(record, match.field) }
}

function numberFor(record: SectionRecord, aliases: string[]): number | undefined {
  return numericMatchFor(record, aliases)?.value
}

function sumAccountingValues(
  values: number[],
  sourceRefs: SourceRef[],
  invalidNumericFields: SourceRef[],
): number | undefined {
  const result = sumExactNumbers(values)
  if (result == null) invalidNumericFields.push(...sourceRefs)
  return result
}

function addAccountingMatch(
  current: number,
  match: NumericMatch | undefined,
  invalidNumericFields: SourceRef[],
): number {
  if (!match) return current
  return (
    sumAccountingValues(
      [current, match.value],
      [match.sourceRef],
      invalidNumericFields,
    ) ?? current
  )
}

function isOverallTotalRow(
  record: SectionRecord,
  asset: string,
  symbol: string,
): boolean {
  if (record.recordType === 'SUBTOTAL') return false

  const overallLabels = new Set([
    'totalallassets',
    'totalallassetclasses',
  ])
  const neutralCompanionLabels = new Set([
    '',
    'all',
    'allassets',
    'allassetclasses',
    'total',
    ...overallLabels,
  ])
  const assetIsOverall = overallLabels.has(asset)
  const symbolIsOverall = overallLabels.has(symbol)
  return (
    (assetIsOverall && neutralCompanionLabels.has(symbol)) ||
    (symbolIsOverall && neutralCompanionLabels.has(asset))
  )
}

function isReturnOnlyRecord(record: SectionRecord): boolean {
  const fieldCount = Object.keys(record.fields).length
  if (
    fieldCount === 1 &&
    fieldMatchesFor(record, RETURN_FIELD_ALIASES).length === 1
  ) {
    return true
  }

  const fieldNames = fieldMatchesFor(record, ['Field Name', 'Name', 'Item'])
  const fieldValues = fieldMatchesFor(record, ['Field Value', 'Value', 'Amount'])
  return Boolean(
    fieldCount === 2 &&
      fieldNames.length === 1 &&
      fieldValues.length === 1 &&
      fieldValues[0]?.value.trim() &&
      matchesSchemaAlias(fieldNames[0]?.value ?? '', RETURN_FIELD_ALIASES),
  )
}

function hasNamedReturnAlias(record: SectionRecord): boolean {
  const fieldNames = fieldMatchesFor(record, ['Field Name', 'Name', 'Item'])
  return fieldNames.some((fieldName) =>
    matchesSchemaAlias(fieldName.value, RETURN_FIELD_ALIASES),
  )
}

function rowIdentitySchemaIsValid(record: SectionRecord): boolean {
  const assetFields = fieldMatchesFor(record, ASSET_IDENTITY_FIELD_ALIASES)
  const symbolFields = fieldMatchesFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)
  const underlyingFields = fieldMatchesFor(
    record,
    UNDERLYING_IDENTITY_FIELD_ALIASES,
  )

  return (
    assetFields.length === 1 &&
    symbolFields.length <= 1 &&
    underlyingFields.length <= 1 &&
    (symbolFields.length === 1 || underlyingFields.length === 1)
  )
}

function identityValueFor(record: SectionRecord): string {
  return (
    valueFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)?.trim() ||
    valueFor(record, UNDERLYING_IDENTITY_FIELD_ALIASES)?.trim() ||
    ''
  )
}

function isAccountingTotalRow(
  record: SectionRecord,
  normalizedAsset: string,
  normalizedSymbol: string,
): boolean {
  return (
    record.recordType === 'TOTAL' ||
    record.recordType === 'SUBTOTAL' ||
    normalizedAsset.startsWith('total') ||
    normalizedAsset.startsWith('subtotal') ||
    normalizedSymbol.startsWith('total') ||
    normalizedSymbol.startsWith('subtotal')
  )
}

function numericEquationMatches(
  components: NumericMatch[],
  total: NumericMatch | undefined,
  invalidNumericFields: SourceRef[],
): boolean {
  if (!total || components.length === 0) return false
  const calculated = sumAccountingValues(
    components.map((component) => component.value),
    components.map((component) => component.sourceRef),
    invalidNumericFields,
  )
  if (calculated == null) return false
  return normalizedDifference(total.value, calculated) === 0
}

function requiredNumericMatches(
  record: SectionRecord,
  aliasGroups: string[][],
  invalidNumericFields: SourceRef[],
): { matches: NumericMatch[]; schemaValid: boolean } {
  const matches: NumericMatch[] = []
  let schemaValid = true

  for (const aliases of aliasGroups) {
    if (fieldMatchesFor(record, aliases).length !== 1) schemaValid = false
    const match = numericMatchFor(record, aliases, invalidNumericFields, true)
    if (match) matches.push(match)
  }

  return { matches, schemaValid }
}

function subtotalAssetKey(
  rawAsset: string | undefined,
  rawSymbol: string | undefined,
): string | undefined {
  const normalizedAsset = normalizeSchemaKey(rawAsset ?? '') ?? ''
  const normalizedSymbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
  const stripTotalPrefix = (value: string): string =>
    value.replace(/^(?:subtotal|total)/, '')

  const explicitCategory =
    normalizedAsset && !/^(?:subtotal|total)/.test(normalizedAsset)
      ? normalizedAsset
      : stripTotalPrefix(normalizedAsset) || stripTotalPrefix(normalizedSymbol)
  if (!explicitCategory || explicitCategory === 'allassets') return undefined
  return crossSourceAssetKey(explicitCategory, '')
}

function validateYtdAssetSubtotalClosure(
  records: SectionRecord[],
  family: 'MTM' | 'MONTH_YTD',
  invalidNumericFields: SourceRef[],
  exposesMtmOther: boolean,
  exposesYtdRealized: boolean,
): boolean {
  const metricAliasGroups =
    family === 'MTM'
      ? [
          MTM_POSITION_FIELD_ALIASES,
          MTM_TRANSACTION_FIELD_ALIASES,
          MTM_COMMISSION_FIELD_ALIASES,
          ...(exposesMtmOther ? [MTM_OTHER_FIELD_ALIASES] : []),
          MTM_TOTAL_FIELD_ALIASES,
        ]
      : [
          MONTH_YTD_MTM_FIELD_ALIASES,
          ...(exposesYtdRealized
            ? [
                YTD_REALIZED_SHORT_FIELD_ALIASES,
                YTD_REALIZED_LONG_FIELD_ALIASES,
              ]
            : []),
        ]
  const detailsByAsset = new Map<
    string,
    Array<{ values: number[]; sourceRefs: SourceRef[] }>
  >()
  const closedAssets = new Set<string>()
  let lastDetailAsset: string | undefined
  let valid = true

  const emptyMetricTotals = (): Array<{
    values: number[]
    sourceRefs: SourceRef[]
  }> => metricAliasGroups.map(() => ({ values: [], sourceRefs: [] }))

  for (const record of records) {
    if (isReturnOnlyRecord(record)) continue

    const rawAsset = valueFor(record, ASSET_IDENTITY_FIELD_ALIASES)
    const rawSymbol = valueFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)
    const normalizedAsset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const normalizedSymbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
    if (isOverallTotalRow(record, normalizedAsset, normalizedSymbol)) {
      lastDetailAsset = undefined
      continue
    }

    const totalRow = isAccountingTotalRow(
      record,
      normalizedAsset,
      normalizedSymbol,
    )
    const supplementalRow =
      family === 'MTM' &&
      (normalizedAsset === 'brokerinterestpaidandreceived' ||
        normalizedAsset === 'otherfees') &&
      !identityValueFor(record)
    if (supplementalRow) continue

    if (!totalRow) {
      const detailAsset = crossSourceAssetKey(
        rawAsset,
        rawSymbol ?? identityValueFor(record),
      )
      if (closedAssets.has(detailAsset)) {
        valid = false
        continue
      }
      const metricTotals = detailsByAsset.get(detailAsset) ?? emptyMetricTotals()
      metricAliasGroups.forEach((aliases, index) => {
        const match = numericMatchFor(
          record,
          aliases,
          invalidNumericFields,
          true,
        )
        if (!match) {
          valid = false
          return
        }
        metricTotals[index].values.push(match.value)
        metricTotals[index].sourceRefs.push(match.sourceRef)
      })
      detailsByAsset.set(detailAsset, metricTotals)
      lastDetailAsset = detailAsset
      continue
    }

    const explicitSubtotalAsset = subtotalAssetKey(rawAsset, rawSymbol)
    const subtotalKey = explicitSubtotalAsset ?? lastDetailAsset
    const metricTotals = subtotalKey
      ? detailsByAsset.get(subtotalKey)
      : undefined
    if (
      !subtotalKey ||
      !metricTotals ||
      closedAssets.has(subtotalKey) ||
      (explicitSubtotalAsset != null &&
        lastDetailAsset != null &&
        explicitSubtotalAsset !== lastDetailAsset)
    ) {
      valid = false
      lastDetailAsset = undefined
      continue
    }

    metricAliasGroups.forEach((aliases, index) => {
      const reported = numericMatchFor(
        record,
        aliases,
        invalidNumericFields,
        true,
      )
      const calculated = sumAccountingValues(
        metricTotals[index].values,
        metricTotals[index].sourceRefs,
        invalidNumericFields,
      )
      if (
        !reported ||
        calculated == null ||
        !exactAccountingValuesMatch(reported.value, calculated)
      ) {
        valid = false
      }
    })
    closedAssets.add(subtotalKey)
    lastDetailAsset = undefined
  }

  return valid
}

function validateYtdAccountingSection(
  records: SectionRecord[],
  invalidNumericFields: SourceRef[],
  family: 'MTM' | 'MONTH_YTD',
): boolean {
  const ytdMtmAliases =
    family === 'MTM' ? MTM_TOTAL_FIELD_ALIASES : MONTH_YTD_MTM_FIELD_ALIASES
  const requiredMtmComponentAliases = [
    MTM_POSITION_FIELD_ALIASES,
    MTM_TRANSACTION_FIELD_ALIASES,
    MTM_COMMISSION_FIELD_ALIASES,
  ]
  const requiresMtmComponents = family === 'MTM'
  // IBKR no longer lets newly created or edited Flex queries select the
  // historical Other component. Treat it as section-wide optional: if any
  // repeated header exposes it, every accounting row must expose it so a
  // partial header drift cannot silently weaken the component equation.
  const exposesMtmOther = records.some(
    (record) => fieldMatchesFor(record, MTM_OTHER_FIELD_ALIASES).length > 0,
  )
  const exposesYtdRealized = records.some(
    (record) =>
      fieldMatchesFor(record, YTD_REALIZED_SHORT_FIELD_ALIASES).length > 0 ||
      fieldMatchesFor(record, YTD_REALIZED_LONG_FIELD_ALIASES).length > 0,
  )
  // Realized YTD belongs to IBKR's Month/YTD family, not MTM. A recognized
  // realized field inside MTM is schema drift and must not become a fallback
  // merely because the dedicated Realized/FIFO section is absent.
  const requiresYtdRealized = family === 'MONTH_YTD' && exposesYtdRealized
  const exposesReturnField = records.some(
    (record) =>
      fieldMatchesFor(record, RETURN_FIELD_ALIASES).length > 0 ||
      hasNamedReturnAlias(record),
  )
  let valid = records.length > 0

  if (family === 'MTM' && exposesYtdRealized) valid = false
  if (family === 'MONTH_YTD' && exposesReturnField) valid = false

  for (const record of records) {
    if (isReturnOnlyRecord(record)) {
      if (family === 'MTM') continue
      valid = false
      continue
    }

    if (!rowIdentitySchemaIsValid(record)) valid = false

    const rawAsset = valueFor(record, ASSET_IDENTITY_FIELD_ALIASES)
    const rawSymbol = valueFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)
    const normalizedAsset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const normalizedSymbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
    const totalRow = isAccountingTotalRow(
      record,
      normalizedAsset,
      normalizedSymbol,
    )
    const supplementalRow =
      (normalizedAsset === 'brokerinterestpaidandreceived' ||
        normalizedAsset === 'otherfees') &&
      !identityValueFor(record)
    if (
      !totalRow &&
      !supplementalRow &&
      (!rawAsset?.trim() ||
        !normalizeSchemaKey(rawAsset) ||
        !identityValueFor(record))
    ) {
      valid = false
    }

    if (fieldMatchesFor(record, ytdMtmAliases).length !== 1) valid = false
    const ytdTotal = numericMatchFor(
      record,
      ytdMtmAliases,
      invalidNumericFields,
      true,
    )

    if (requiresYtdRealized) {
      const realizedMatches = requiredNumericMatches(
        record,
        [YTD_REALIZED_SHORT_FIELD_ALIASES, YTD_REALIZED_LONG_FIELD_ALIASES],
        invalidNumericFields,
      )
      if (!realizedMatches.schemaValid || realizedMatches.matches.length !== 2) {
        valid = false
      }
    }

    if (requiresMtmComponents && !supplementalRow) {
      const requiredComponents = requiredNumericMatches(
        record,
        requiredMtmComponentAliases,
        invalidNumericFields,
      )
      if (
        !requiredComponents.schemaValid ||
        requiredComponents.matches.length !== requiredMtmComponentAliases.length
      ) {
        valid = false
      }

      if (exposesMtmOther) {
        const other = requiredNumericMatches(
          record,
          [MTM_OTHER_FIELD_ALIASES],
          invalidNumericFields,
        )
        const components = [
          ...requiredComponents.matches,
          ...other.matches,
        ]
        if (
          !other.schemaValid ||
          other.matches.length !== 1 ||
          !numericEquationMatches(components, ytdTotal, invalidNumericFields)
        ) {
          valid = false
        }
      }
    }
  }

  return (
    valid &&
    validateYtdAssetSubtotalClosure(
      records,
      family,
      invalidNumericFields,
      exposesMtmOther,
      exposesYtdRealized,
    )
  )
}

interface YtdSectionSnapshot {
  mtmByAssetAndUnderlying: Map<string, number>
  totalMtm?: number
  mtmMatchesDetails: boolean
  conflict: boolean
}

function ytdSectionSnapshot(
  records: SectionRecord[],
  family: 'MTM' | 'MONTH_YTD',
  instrumentIndex: InstrumentUnderlyingMapResult,
  invalidNumericFields: SourceRef[],
): YtdSectionSnapshot {
  const mtmAliases =
    family === 'MTM' ? MTM_TOTAL_FIELD_ALIASES : MONTH_YTD_MTM_FIELD_ALIASES
  const metricAliases: Array<[string, string[]]> = [['mtm', mtmAliases]]

  const detailsByMetric = new Map<
    string,
    Map<string, { value: number; sourceRefs: SourceRef[] }>
  >()
  const totalsByMetric = new Map<string, NumericMatch>()
  const rawDetailKeys = new Set<string>()
  let overallTotalRows = 0
  let conflict = records.length === 0
  let mtmMatchesDetails = false

  for (const record of records) {
    if (isReturnOnlyRecord(record)) {
      if (family === 'MTM') continue
      conflict = true
      continue
    }

    const rawAsset = valueFor(record, ASSET_IDENTITY_FIELD_ALIASES)
    const rawSymbol = valueFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)
    const asset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const symbolSchema = normalizeSchemaKey(rawSymbol ?? '') ?? ''
    const overallTotal = isOverallTotalRow(record, asset, symbolSchema)
    if (overallTotal) {
      overallTotalRows += 1
      for (const [metric, aliases] of metricAliases) {
        const match = numericMatchFor(
          record,
          aliases,
          invalidNumericFields,
          true,
        )
        if (!match || totalsByMetric.has(metric)) conflict = true
        else totalsByMetric.set(metric, match)
      }
      continue
    }

    const totalRow = isAccountingTotalRow(record, asset, symbolSchema)
    const rawIdentity = identityValueFor(record)
    // Per-asset subtotal rows and MTM-only statement-period supplements are
    // not underlying details and must not enter the cross-source key map.
    if (totalRow || !rawIdentity) continue

    const rawDetailKey = `${asset}|${normalizeInstrumentKey(rawIdentity)}`
    if (rawDetailKeys.has(rawDetailKey)) conflict = true
    rawDetailKeys.add(rawDetailKey)

    const assetClass = classifyAsset(rawAsset, rawSymbol ?? rawIdentity)
    if (
      assetClass !== 'OPTION' &&
      (instrumentIndex.contractAliases.has(
        normalizeInstrumentKey(rawIdentity),
      ) || inferOptionUnderlyingFromContract(rawIdentity) != null)
    ) {
      conflict = true
      continue
    }
    const resolution = resolveUnderlying(
      record,
      rawSymbol,
      assetClass,
      instrumentIndex,
    )
    if (
      family === 'MTM' &&
      assetClass === 'OPTION' &&
      optionUnderlyingResolutionIsOpaque(rawSymbol, resolution)
    ) {
      conflict = true
      continue
    }
    const underlying = normalizeInstrumentKey(resolution.underlying)
    if (!underlying || isTotalRow(underlying)) {
      conflict = true
      continue
    }
    if (
      family === 'MONTH_YTD' &&
      assetClass === 'OPTION' &&
      normalizeInstrumentKey(rawIdentity) !== underlying
    ) {
      // Month/YTD and PLUI are underlying-level families. A row-level option
      // identity that points at a different explicit Underlying is not a
      // harmless alias: equal P&L values could otherwise hide an A/B swap.
      conflict = true
      continue
    }
    const canonicalKey = `${crossSourceAssetKey(
      rawAsset,
      rawSymbol ?? rawIdentity,
    )}|${underlying}`

    for (const [metric, aliases] of metricAliases) {
      const match = numericMatchFor(
        record,
        aliases,
        invalidNumericFields,
        true,
      )
      if (!match) {
        conflict = true
        continue
      }
      const metricDetails = detailsByMetric.get(metric) ?? new Map()
      const previous = metricDetails.get(canonicalKey)
      const sourceRefs = dedupeSourceRefs([
        ...(previous?.sourceRefs ?? []),
        match.sourceRef,
        ...resolution.sourceRefs,
      ])
      const value = previous
        ? sumAccountingValues(
            [previous.value, match.value],
            sourceRefs,
            invalidNumericFields,
          )
        : match.value
      if (value == null) conflict = true
      else metricDetails.set(canonicalKey, { value, sourceRefs })
      detailsByMetric.set(metric, metricDetails)
    }
  }

  if (overallTotalRows !== 1) conflict = true
  for (const [metric] of metricAliases) {
    const details = detailsByMetric.get(metric)
    const total = totalsByMetric.get(metric)
    if (!details || details.size === 0 || !total) {
      conflict = true
      continue
    }
    const calculated = sumAccountingValues(
      [...details.values()].map((detail) => detail.value),
      [...details.values()].flatMap((detail) => detail.sourceRefs),
      invalidNumericFields,
    )
    if (calculated == null) conflict = true
    else if (metric === 'mtm') {
      mtmMatchesDetails = exactAccountingValuesMatch(total.value, calculated)
    }
  }

  return {
    mtmByAssetAndUnderlying: new Map(
      [...(detailsByMetric.get('mtm') ?? new Map()).entries()].map(
        ([key, detail]) => [key, detail.value],
      ),
    ),
    totalMtm: totalsByMetric.get('mtm')?.value,
    mtmMatchesDetails,
    conflict,
  }
}

function validateFullAccountSectionScope(
  records: SectionRecord[],
  expectedAccountId: string | undefined,
): boolean {
  const accountingRecords = records.filter((record) => !isReturnOnlyRecord(record))
  const exposesAccountId = accountingRecords.some(
    (record) => fieldMatchesFor(record, ['Account ID', 'AccountID']).length > 0,
  )
  const exposesModel = accountingRecords.some(
    (record) => fieldMatchesFor(record, ['Model']).length > 0,
  )

  for (const record of accountingRecords) {
    if (exposesAccountId) {
      const matches = fieldMatchesFor(record, ['Account ID', 'AccountID'])
      if (
        matches.length !== 1 ||
        !matches[0].value.trim() ||
        (expectedAccountId != null && matches[0].value.trim() !== expectedAccountId)
      ) {
        return false
      }
    }
    if (exposesModel) {
      const matches = fieldMatchesFor(record, ['Model'])
      // Rankings are full-account only. A non-empty model is a partial slice,
      // while a missing Model column on only some repeated headers is drift.
      if (matches.length !== 1 || matches[0].value.trim()) return false
    }
  }
  return true
}

function exposesYtdRealizedFields(records: SectionRecord[]): boolean {
  return records.some(
    (record) =>
      fieldMatchesFor(record, YTD_REALIZED_SHORT_FIELD_ALIASES).length > 0 ||
      fieldMatchesFor(record, YTD_REALIZED_LONG_FIELD_ALIASES).length > 0,
  )
}

function validateYtdRealizedFallbackTotals(
  records: SectionRecord[],
  invalidNumericFields: SourceRef[],
): boolean {
  const shortDetails: NumericMatch[] = []
  const longDetails: NumericMatch[] = []
  let reportedShort: NumericMatch | undefined
  let reportedLong: NumericMatch | undefined
  let overallRows = 0
  let valid = records.length > 0

  for (const record of records) {
    if (isReturnOnlyRecord(record)) continue

    const rawAsset = valueFor(record, ASSET_IDENTITY_FIELD_ALIASES)
    const rawSymbol = valueFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)
    const asset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const symbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
    const realizedShort = numericMatchFor(
      record,
      YTD_REALIZED_SHORT_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )
    const realizedLong = numericMatchFor(
      record,
      YTD_REALIZED_LONG_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )

    if (isOverallTotalRow(record, asset, symbol)) {
      overallRows += 1
      if (!realizedShort || reportedShort || !realizedLong || reportedLong) {
        valid = false
      } else {
        reportedShort = realizedShort
        reportedLong = realizedLong
      }
      continue
    }
    if (isAccountingTotalRow(record, asset, symbol)) continue
    if (!realizedShort || !realizedLong) {
      valid = false
      continue
    }
    shortDetails.push(realizedShort)
    longDetails.push(realizedLong)
  }

  const detailsMatch = (
    details: NumericMatch[],
    reported: NumericMatch | undefined,
  ): boolean => {
    if (details.length === 0 || !reported) return false
    const calculated = sumAccountingValues(
      details.map((detail) => detail.value),
      details.map((detail) => detail.sourceRef),
      invalidNumericFields,
    )
    return (
      calculated != null &&
      exactAccountingValuesMatch(calculated, reported.value)
    )
  }

  return (
    valid &&
    overallRows === 1 &&
    detailsMatch(shortDetails, reportedShort) &&
    detailsMatch(longDetails, reportedLong)
  )
}

function validateInstrumentReferenceIdentities(
  records: SectionRecord[],
): boolean {
  return records.every((record) => {
    const assets = fieldMatchesFor(record, ASSET_IDENTITY_FIELD_ALIASES)
    const symbols = fieldMatchesFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)
    return (
      assets.length === 1 &&
      Boolean(assets[0].value.trim()) &&
      Boolean(normalizeSchemaKey(assets[0].value)) &&
      symbols.length === 1 &&
      Boolean(symbols[0].value.trim())
    )
  })
}

function ytdSnapshotsMatch(
  left: YtdSectionSnapshot,
  right: YtdSectionSnapshot,
): boolean {
  if (
    left.conflict ||
    right.conflict ||
    !left.mtmMatchesDetails ||
    !right.mtmMatchesDetails ||
    left.totalMtm == null ||
    right.totalMtm == null ||
    !exactAccountingValuesMatch(left.totalMtm, right.totalMtm) ||
    left.mtmByAssetAndUnderlying.size !== right.mtmByAssetAndUnderlying.size
  ) {
    return false
  }

  for (const [key, leftValue] of left.mtmByAssetAndUnderlying) {
    const rightValue = right.mtmByAssetAndUnderlying.get(key)
    if (rightValue == null || !exactAccountingValuesMatch(leftValue, rightValue)) {
      return false
    }
  }
  return true
}

function hasDuplicateAccountingDetails(
  records: SectionRecord[],
  metricAliases: string[][],
  invalidNumericFields: SourceRef[],
): boolean {
  const seen = new Set<string>()
  for (const record of records) {
    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    const rawSymbol = valueFor(record, ['Symbol'])

    let hasAccountingValue = false
    for (const aliases of metricAliases) {
      if (numericMatchFor(record, aliases, invalidNumericFields) != null) {
        hasAccountingValue = true
      }
    }
    if (isTotalRow(rawAsset ?? '') || isTotalRow(rawSymbol ?? '')) continue
    if (!hasAccountingValue) continue

    const asset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const symbol = normalizeInstrumentKey(rawSymbol ?? '')
    const key = `${asset}|${symbol}`
    if (key === '|') continue
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

function validateRealizedSection(
  records: SectionRecord[],
  invalidNumericFields: SourceRef[],
): boolean {
  const realizedComponentAliases = [
    REALIZED_SHORT_PROFIT_FIELD_ALIASES,
    REALIZED_SHORT_LOSS_FIELD_ALIASES,
    REALIZED_LONG_PROFIT_FIELD_ALIASES,
    REALIZED_LONG_LOSS_FIELD_ALIASES,
  ]
  const unrealizedTermComponentAliases = [
    UNREALIZED_SHORT_PROFIT_FIELD_ALIASES,
    UNREALIZED_SHORT_LOSS_FIELD_ALIASES,
    UNREALIZED_LONG_PROFIT_FIELD_ALIASES,
    UNREALIZED_LONG_LOSS_FIELD_ALIASES,
  ]
  const unrealizedGenericComponentAliases = [
    UNREALIZED_PROFIT_FIELD_ALIASES,
    UNREALIZED_LOSS_FIELD_ALIASES,
  ]
  const requiresRealizedComponents = records.some((record) =>
    realizedComponentAliases.some(
      (aliases) => fieldMatchesFor(record, aliases).length > 0,
    ),
  )
  const requiresUnrealizedTermComponents = records.some((record) =>
    unrealizedTermComponentAliases.some(
      (aliases) => fieldMatchesFor(record, aliases).length > 0,
    ),
  )
  const requiresUnrealizedGenericComponents =
    !requiresUnrealizedTermComponents &&
    records.some((record) =>
      unrealizedGenericComponentAliases.some(
        (aliases) => fieldMatchesFor(record, aliases).length > 0,
      ),
    )
  const requiresCombinedTotal = records.some(
    (record) =>
      fieldMatchesFor(record, REALIZED_AND_UNREALIZED_TOTAL_FIELD_ALIASES)
        .length > 0,
  )
  let calculatedRealized = 0
  let calculatedUnrealized = 0
  const reportedRealized: number[] = []
  const reportedUnrealized: number[] = []
  let valid = records.length > 0

  for (const record of records) {
    if (!rowIdentitySchemaIsValid(record)) valid = false

    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    const rawSymbol = valueFor(record, ['Symbol'])
    const asset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const symbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
    const overallTotal = isOverallTotalRow(record, asset, symbol)
    const genericTotal = isAccountingTotalRow(record, asset, symbol)
    if (
      !genericTotal &&
      (!rawAsset?.trim() ||
        !normalizeSchemaKey(rawAsset) ||
        !identityValueFor(record))
    ) {
      valid = false
    }

    if (fieldMatchesFor(record, REALIZED_TOTAL_FIELD_ALIASES).length !== 1) {
      valid = false
    }
    if (fieldMatchesFor(record, UNREALIZED_TOTAL_FIELD_ALIASES).length !== 1) {
      valid = false
    }
    const realized = numericMatchFor(
      record,
      REALIZED_TOTAL_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )
    const unrealized = numericMatchFor(
      record,
      UNREALIZED_TOTAL_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )

    if (requiresRealizedComponents) {
      const components = requiredNumericMatches(
        record,
        realizedComponentAliases,
        invalidNumericFields,
      )
      if (
        !components.schemaValid ||
        components.matches.length !== realizedComponentAliases.length ||
        !numericEquationMatches(components.matches, realized, invalidNumericFields)
      ) {
        valid = false
      }
    }

    const requiredUnrealizedComponents = requiresUnrealizedTermComponents
      ? unrealizedTermComponentAliases
      : requiresUnrealizedGenericComponents
        ? unrealizedGenericComponentAliases
        : undefined
    if (requiredUnrealizedComponents) {
      const components = requiredNumericMatches(
        record,
        requiredUnrealizedComponents,
        invalidNumericFields,
      )
      if (
        !components.schemaValid ||
        components.matches.length !== requiredUnrealizedComponents.length ||
        !numericEquationMatches(components.matches, unrealized, invalidNumericFields)
      ) {
        valid = false
      }
    }

    if (requiresCombinedTotal) {
      if (
        fieldMatchesFor(record, REALIZED_AND_UNREALIZED_TOTAL_FIELD_ALIASES)
          .length !== 1
      ) {
        valid = false
      }
      const combined = numericMatchFor(
        record,
        REALIZED_AND_UNREALIZED_TOTAL_FIELD_ALIASES,
        invalidNumericFields,
        true,
      )
      if (
        !realized ||
        !unrealized ||
        !numericEquationMatches([realized, unrealized], combined, invalidNumericFields)
      ) {
        valid = false
      }
    }

    if (overallTotal) {
      if (realized) reportedRealized.push(realized.value)
      if (unrealized) reportedUnrealized.push(unrealized.value)
    } else if (!genericTotal) {
      calculatedRealized = addAccountingMatch(
        calculatedRealized,
        realized,
        invalidNumericFields,
      )
      calculatedUnrealized = addAccountingMatch(
        calculatedUnrealized,
        unrealized,
        invalidNumericFields,
      )
    }
  }

  if (reportedRealized.length > 1 || reportedUnrealized.length > 1) valid = false
  if (
    reportedRealized[0] != null &&
    normalizedDifference(reportedRealized[0], calculatedRealized) !== 0
  ) {
    valid = false
  }
  if (
    reportedUnrealized[0] != null &&
    normalizedDifference(reportedUnrealized[0], calculatedUnrealized) !== 0
  ) {
    valid = false
  }
  return valid
}

function hasAmbiguousSchemaFields(
  records: SectionRecord[],
  aliasGroups: string[][],
): boolean {
  return records.some((record) =>
    aliasGroups.some((aliases) => fieldMatchesFor(record, aliases).length > 1),
  )
}

function dedupeSourceRefs(refs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = [
      ref.source,
      ref.section,
      ref.recordType ?? '',
      ref.rowNumber ?? '',
      ref.pageNumber ?? '',
      ref.headerSignature ?? '',
      ref.field,
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizedDifference(
  reported: number,
  calculated: number,
): number | undefined {
  const difference = sumExactNumbers([reported, -calculated])
  if (difference == null) return undefined
  return Math.abs(difference) <= CSV_RECONCILIATION_EPSILON ? 0 : difference
}

function exactAccountingValuesMatch(left: number, right: number): boolean {
  return sumExactNumbers([left, -right]) === 0
}

function findNamedMatch(
  records: SectionRecord[],
  names: string[],
): { value: string; sourceRef: SourceRef } | undefined {
  for (const record of records) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (
      fieldName?.value &&
      fieldValue &&
      matchesSchemaAlias(fieldName.value, names)
    ) {
      return {
        value: fieldValue.value,
        sourceRef: sourceRefFor(record, fieldValue.field),
      }
    }

    const directMatch = fieldMatchesFor(record, names)[0]
    if (directMatch) {
      return {
        value: directMatch.value,
        sourceRef: sourceRefFor(record, directMatch.field),
      }
    }
  }

  return undefined
}

function findNamedValue(records: SectionRecord[], names: string[]): string | undefined {
  return findNamedMatch(records, names)?.value
}

function hasConflictingNamedText(
  records: SectionRecord[],
  names: string[],
): boolean {
  const values = new Set<string>()
  for (const record of records) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (
      fieldName?.value &&
      fieldValue?.value.trim() &&
      matchesSchemaAlias(fieldName.value, names)
    ) {
      values.add(fieldValue.value.trim())
    }
    for (const match of fieldMatchesFor(record, names)) {
      if (match.value.trim()) values.add(match.value.trim())
    }
  }
  return values.size > 1
}

function maskAccount(value: string | undefined): string {
  if (!value) return 'Local account'
  const clean = value.trim()
  if (clean.length <= 4) return 'Local account'
  return `••••${clean.slice(-4)}`
}

function normalizeCurrencyCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase()
  if (!normalized || !/^[A-Z]{3}$/.test(normalized)) return undefined

  try {
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized,
    }).format(0)
    return normalized
  } catch {
    return undefined
  }
}

function classifyAsset(value: string | undefined, symbol: string): AssetClass {
  const rawAsset = value?.trim() ?? ''
  const normalized = rawAsset ? normalizeSchemaKey(rawAsset) ?? 'unsupportedassetclass' : ''
  if (normalized.includes('cfd')) return 'OTHER'
  if (
    [
      'opt',
      'option',
      'options',
      'equityoption',
      'equityoptions',
      'indexoption',
      'indexoptions',
      'equityandindexoption',
      'equityandindexoptions',
    ].includes(normalized)
  ) {
    return 'OPTION'
  }
  if (
    ['stk', 'stock', 'stocks', 'equity', 'equities'].includes(normalized)
  ) {
    return 'STOCK'
  }

  if (!normalized) {
    const compact = symbol.replace(/\s/g, '').toUpperCase()
    if (/^[A-Z.\-]{1,8}\d{6}[CP]\d{8}$/.test(compact)) return 'OPTION'
    if (/\s\d{1,2}[A-Z]{3}\d{2,4}\s\d+(?:\.\d+)?\s[CP]$/i.test(symbol)) return 'OPTION'
  }

  // A missing category is common on some stock summary rows. An explicit but
  // unrecognized category (for example Forex, Futures, or Options on Futures)
  // must not enter the supported stock/equity-index-option ranking buckets.
  return normalized ? 'OTHER' : 'STOCK'
}

function crossSourceAssetKey(
  value: string | undefined,
  symbol: string,
): string {
  const assetClass = classifyAsset(value, symbol)
  if (assetClass !== 'OTHER') return assetClass

  // The public ledger intentionally groups all unsupported asset categories
  // under Other, but source reconciliation must retain the broker's actual
  // normalized category. Otherwise Forex in one official family could match
  // Futures or Bonds in the other merely because all publish as Other.
  return `OTHER:${normalizeSchemaKey(value?.trim() ?? '') ?? 'missing'}`
}

function normalizeInstrumentKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

function inferOptionUnderlyingFromContract(value: string): string | undefined {
  const symbol = normalizeInstrumentKey(value)
  const spaced = symbol.match(
    /^(.+?)\s+\d{1,2}[A-Z]{3}\d{2,4}\s+\d+(?:\.\d+)?\s+[CP]$/,
  )
  if (spaced) return spaced[1].trim()

  const compact = symbol.replace(/\s/g, '')
  const occ = compact.match(/^([A-Z.\-]{1,8})(?=\d{6}[CP]\d{8}$)/)
  return occ?.[1]
}

function addInstrumentUnderlyingCandidate(
  candidates: InstrumentUnderlyingCandidates,
  aliasValue: string,
  underlyingValue: string,
  sourceRefs: SourceRef[],
  retainAllSourceRefs: boolean,
): void {
  const alias = normalizeInstrumentKey(aliasValue)
  const underlying = normalizeInstrumentKey(underlyingValue)
  if (!alias || !underlying) return

  const underlyingCandidates = candidates.get(alias) ?? new Map<string, SourceRef[]>()
  const existingRefs = underlyingCandidates.get(underlying) ?? []
  const nextRefs = retainAllSourceRefs
    ? dedupeSourceRefs([...existingRefs, ...sourceRefs])
    : existingRefs.length > 0
      ? existingRefs
      : dedupeSourceRefs(sourceRefs)
  underlyingCandidates.set(underlying, nextRefs)
  candidates.set(alias, underlyingCandidates)
}

function underlyingFieldsFor(record: SectionRecord): UnderlyingFieldResolution {
  const candidates = new Map<string, SourceRef[]>()

  for (const match of fieldMatchesFor(record, ['Underlying', 'Underlying Symbol'])) {
    if (!match.value.trim()) continue

    const underlying = normalizeInstrumentKey(match.value)
    const refs = candidates.get(underlying) ?? []
    candidates.set(
      underlying,
      dedupeSourceRefs([...refs, sourceRefFor(record, match.field)]),
    )
  }

  if (candidates.size === 0) {
    return { conflict: false, sourceRefs: [] }
  }
  if (candidates.size > 1) {
    return { conflict: true, sourceRefs: [] }
  }

  const [[underlying, sourceRefs]] = candidates
  return { conflict: false, sourceRefs, underlying }
}

function markInstrumentAliasConflict(
  instrumentIndex: InstrumentUnderlyingMapResult,
  aliasKey: string,
): void {
  if (aliasKey) instrumentIndex.conflictingAliases.add(aliasKey)
  instrumentIndex.hasConflicts = true
}

function resolveUnderlying(
  record: SectionRecord,
  symbolValue: string | undefined,
  assetClass: AssetClass,
  instrumentIndex: InstrumentUnderlyingMapResult,
): UnderlyingResolution {
  const symbol = (symbolValue ?? '').trim().toUpperCase()
  const aliasKey = normalizeInstrumentKey(symbol)
  const explicit = underlyingFieldsFor(record)

  if (assetClass !== 'OPTION') {
    if (explicit.conflict) {
      markInstrumentAliasConflict(instrumentIndex, aliasKey)
      return { sourceRefs: [], underlying: '' }
    }
    return explicit.underlying
      ? { sourceRefs: explicit.sourceRefs, underlying: explicit.underlying }
      : { sourceRefs: [], underlying: symbol }
  }

  if (explicit.conflict || instrumentIndex.conflictingAliases.has(aliasKey)) {
    markInstrumentAliasConflict(instrumentIndex, aliasKey)
    return { sourceRefs: [], underlying: '' }
  }

  const mapped = instrumentIndex.mapping.get(aliasKey)
  if (explicit.underlying) {
    if (mapped && mapped.underlying !== explicit.underlying) {
      markInstrumentAliasConflict(instrumentIndex, aliasKey)
      return { sourceRefs: [], underlying: '' }
    }
    return {
      sourceRefs: dedupeSourceRefs([
        ...explicit.sourceRefs,
        ...(mapped?.sourceRefs ?? []),
      ]),
      underlying: explicit.underlying,
    }
  }

  if (mapped) return { sourceRefs: mapped.sourceRefs, underlying: mapped.underlying }

  const inferred = inferOptionUnderlyingFromContract(symbol)
  if (inferred) return { sourceRefs: [], underlying: inferred }

  return { sourceRefs: [], underlying: symbol }
}

function optionUnderlyingResolutionIsOpaque(
  symbolValue: string | undefined,
  resolution: UnderlyingResolution,
): boolean {
  const symbol = normalizeInstrumentKey(symbolValue ?? '')
  const underlying = normalizeInstrumentKey(resolution.underlying)
  return (
    !underlying ||
    (underlying === symbol && resolution.sourceRefs.length === 0)
  )
}

function buildInstrumentUnderlyingMap(
  store: Map<string, SectionRecord[]>,
  contractIndexSectionAliases: string[],
): InstrumentUnderlyingMapResult {
  const authoritativeCandidates: InstrumentUnderlyingCandidates = new Map()
  const inferredCandidates: InstrumentUnderlyingCandidates = new Map()
  const contractAliases = new Set<string>()
  const conflictingAliases = new Set<string>()
  const mapping = new Map<string, InstrumentUnderlying>()
  let hasConflicts = false

  for (const record of recordsFor(store, ['Financial Instrument Information'])) {
    const symbol = valueFor(record, ['Symbol'])
    const description = valueFor(record, ['Description'])
    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    if (
      isAccountingTotalRow(
        record,
        normalizeSchemaKey(rawAsset ?? '') ?? '',
        normalizeSchemaKey(symbol ?? '') ?? '',
      )
    ) {
      continue
    }
    const assetClass = classifyAsset(
      rawAsset,
      symbol ?? description ?? '',
    )
    const explicit = underlyingFieldsFor(record)
    const underlying = explicit.underlying

    if (assetClass !== 'OPTION') continue
    if (explicit.conflict) {
      hasConflicts = true
      for (const alias of [symbol, description]) {
        if (alias?.trim()) conflictingAliases.add(normalizeInstrumentKey(alias))
      }
      continue
    }
    if (!underlying) continue
    for (const alias of [symbol, description]) {
      if (alias?.trim()) {
        if (normalizeInstrumentKey(alias) !== underlying) {
          contractAliases.add(normalizeInstrumentKey(alias))
        }
        addInstrumentUnderlyingCandidate(
          authoritativeCandidates,
          alias,
          underlying,
          explicit.sourceRefs,
          true,
        )
      }
    }
  }

  for (const record of recordsFor(store, contractIndexSectionAliases)) {
    const contractMatch = fieldFor(record, ['Symbol', 'Contract'])
    const contract = contractMatch?.value.trim()
    if (!contract) continue

    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    if (
      isAccountingTotalRow(
        record,
        normalizeSchemaKey(rawAsset ?? '') ?? '',
        normalizeSchemaKey(contract) ?? '',
      )
    ) {
      continue
    }

    const assetClass = classifyAsset(
      rawAsset,
      contract,
    )
    if (assetClass !== 'OPTION') continue

    const inferred = inferOptionUnderlyingFromContract(contract)
    if (isTotalRow(inferred ?? contract)) continue

    const aliasKey = normalizeInstrumentKey(contract)
    const explicit = underlyingFieldsFor(record)
    if (explicit.conflict) {
      conflictingAliases.add(aliasKey)
      hasConflicts = true
      continue
    }

    if (explicit.underlying) {
      if (aliasKey !== explicit.underlying) contractAliases.add(aliasKey)
      addInstrumentUnderlyingCandidate(
        authoritativeCandidates,
        contract,
        explicit.underlying,
        explicit.sourceRefs,
        false,
      )
    }
    if (inferred) {
      contractAliases.add(aliasKey)
      addInstrumentUnderlyingCandidate(
        inferredCandidates,
        contract,
        inferred,
        [],
        false,
      )
    }
  }

  const aliases = new Set([
    ...authoritativeCandidates.keys(),
    ...inferredCandidates.keys(),
  ])
  for (const alias of aliases) {
    const underlyingCandidates =
      authoritativeCandidates.get(alias) ?? inferredCandidates.get(alias)
    if (!underlyingCandidates) continue

    if (conflictingAliases.has(alias) || underlyingCandidates.size !== 1) {
      conflictingAliases.add(alias)
      hasConflicts = true
      continue
    }
    const [[underlying, sourceRefs]] = underlyingCandidates
    mapping.set(alias, { underlying, sourceRefs })
  }

  return {
    contractAliases,
    conflictingAliases,
    hasConflicts,
    mapping,
  }
}

export function ytdInstrumentMappingSectionAliases(
  family: 'MTM' | 'MONTH_YTD',
  sharedSectionAliases: readonly string[],
): string[] {
  const familyAliases =
    family === 'MTM'
      ? MTM_PERFORMANCE_SECTION_ALIASES
      : MONTH_YTD_PERFORMANCE_SECTION_ALIASES
  // Keep this guard inside the production selector. Even if a future caller
  // accidentally passes a YTD alias as a "shared" source, the opposite YTD
  // family cannot leak into this family's instrument map.
  const nonYtdSharedAliases = sharedSectionAliases.filter(
    (alias) => !matchesSchemaAlias(alias, YTD_PERFORMANCE_SECTION_ALIASES),
  )
  return [...familyAliases, ...nonYtdSharedAliases]
}

function isTotalRow(symbol: string): boolean {
  const normalized = normalizeSchemaKey(symbol)
  return (
    !symbol.trim() ||
    normalized === 'total' ||
    normalized === 'subtotal' ||
    normalized === 'allassetclasses' ||
    normalized === 'all'
  )
}

function createAccumulator(symbol: string, description?: string): SymbolAccumulator {
  return {
    symbol,
    description,
    stockYtdMtm: 0,
    optionYtdMtm: 0,
    otherYtdMtm: 0,
    totalYtdMtm: 0,
    stockRealizedYtd: 0,
    optionRealizedYtd: 0,
    otherRealizedYtd: 0,
    totalRealizedYtd: 0,
    stockCurrentUnrealized: 0,
    optionCurrentUnrealized: 0,
    otherCurrentUnrealized: 0,
    totalCurrentUnrealized: 0,
    assignmentCount: 0,
    exerciseCount: 0,
    expirationCount: 0,
    sourceRefs: {},
    hasYtdRealized: false,
  }
}

function addSymbolSourceRefs(
  accumulator: SymbolAccumulator,
  metric: SymbolMetricKey,
  refs: SourceRef[],
): void {
  accumulator.sourceRefs[metric] = dedupeSourceRefs([
    ...(accumulator.sourceRefs[metric] ?? []),
    ...refs,
  ])
}

function getAccumulator(
  map: Map<string, SymbolAccumulator>,
  symbol: string,
  description?: string,
): SymbolAccumulator {
  const existing = map.get(symbol)
  if (existing) {
    if (!existing.description && description) existing.description = description
    return existing
  }
  const created = createAccumulator(symbol, description)
  map.set(symbol, created)
  return created
}

function parseReturnValue(value: string | undefined): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  const hasPercentSuffix = trimmed.endsWith('%')
  if (trimmed.includes('%') && !hasPercentSuffix) return undefined
  const parsed = hasPercentSuffix ? parsePercent(trimmed) : parseNumber(trimmed)
  if (parsed == null) return undefined
  if (hasPercentSuffix) return parsed
  if (Math.abs(parsed) > 2) return parsed / 100
  return parsed
}

function findStatementPeriod(
  rows: string[][],
  store: Map<string, SectionRecord[]>,
): { start?: Date; end?: Date } {
  const infoRecords = [
    ...recordsFor(store, ['Statement']),
    ...recordsFor(store, ['Account Information']),
  ]
  const period = findNamedValue(infoRecords, ['Period', 'Statement Period', 'Report Period'])
  const parsedRange = parseDateRange(period)
  if (parsedRange.start && parsedRange.end) return parsedRange

  const fromDate = findNamedValue(infoRecords, ['From Date', 'FromDate', 'Start Date'])
  const toDate = findNamedValue(infoRecords, ['To Date', 'ToDate', 'End Date'])
  if (fromDate && toDate) {
    return { start: parseDateFlexible(fromDate), end: parseDateFlexible(toDate) }
  }

  for (const row of rows) {
    if (row[0]?.trim().toUpperCase() === 'BOF' && row.length >= 5) {
      return {
        start: parseDateFlexible(row[3]),
        end: parseDateFlexible(row[4]),
      }
    }
  }

  return {}
}

function inferEventType(value: string | undefined): OptionEvent['type'] | undefined {
  if (!value) return undefined

  const normalized = normalizeSchemaKey(value)
  if (!normalized) return undefined
  if (normalized.includes('assign')) return 'assignment'
  if (normalized.includes('exercise')) return 'exercise'
  if (normalized.includes('expir')) return 'expiration'

  // Activity Statements can combine terse codes, such as "A;P". Match
  // complete code tokens so the letter A inside another word is not treated
  // as an assignment.
  const tokens = value
    .split(/[;,|\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)

  if (tokens.includes('a')) return 'assignment'
  if (tokens.includes('ex')) return 'exercise'
  if (tokens.includes('ep')) return 'expiration'
  return undefined
}

function parseOptionEvents(
  eventRecords: SectionRecord[],
  symbols: Map<string, SymbolAccumulator>,
  instrumentIndex: InstrumentUnderlyingMapResult,
): OptionEvent[] {
  const events: OptionEvent[] = []
  const seen = new Set<string>()

  for (const record of eventRecords) {
    if (record.recordType !== 'DATA') continue
    const codeMatch = fieldFor(record, ['Transaction Type', 'Type', 'Code'])
    const type = inferEventType(codeMatch?.value)
    if (!type) continue

    const contractMatch = fieldFor(record, ['Symbol', 'Contract'])
    const contract = contractMatch?.value
    const asset = classifyAsset(valueFor(record, ['Asset Class', 'Asset Category']), contract ?? '')
    if (
      asset !== 'OPTION' &&
      (instrumentIndex.contractAliases.has(
        normalizeInstrumentKey(contract ?? ''),
      ) || inferOptionUnderlyingFromContract(contract ?? '') != null)
    ) {
      markInstrumentAliasConflict(
        instrumentIndex,
        normalizeInstrumentKey(contract ?? ''),
      )
      continue
    }
    if (asset !== 'OPTION' && !contract?.match(/[CP]\d{8}$/)) continue

    const resolution = resolveUnderlying(record, contract, 'OPTION', instrumentIndex)
    if (optionUnderlyingResolutionIsOpaque(contract, resolution)) {
      markInstrumentAliasConflict(
        instrumentIndex,
        normalizeInstrumentKey(contract ?? ''),
      )
      continue
    }
    const underlying = resolution.underlying
    if (isTotalRow(underlying)) continue

    const dateMatch = fieldFor(record, ['Date', 'Date/Time', 'Trade Date', 'Report Date'])
    const parsedDate = toIsoDate(parseDateFlexible(dateMatch?.value.split(/[;,]/)[0]))
    const key = `${underlying}|${contract ?? ''}|${parsedDate ?? ''}|${type}`
    if (seen.has(key)) continue
    seen.add(key)

    const event: OptionEvent = {
      symbol: underlying,
      contract,
      date: parsedDate,
      type,
      sourceRefs: dedupeSourceRefs([
        ...(codeMatch ? [sourceRefFor(record, codeMatch.field)] : []),
        ...(contractMatch ? [sourceRefFor(record, contractMatch.field)] : []),
        ...(dateMatch ? [sourceRefFor(record, dateMatch.field)] : []),
        ...resolution.sourceRefs,
      ]),
    }
    events.push(event)

    const accumulator = getAccumulator(symbols, underlying)
    if (type === 'assignment') accumulator.assignmentCount += 1
    if (type === 'exercise') accumulator.exerciseCount += 1
    if (type === 'expiration') accumulator.expirationCount += 1
  }

  return events.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

function isOptionEventRecordCandidate(record: SectionRecord): boolean {
  if (record.recordType !== 'DATA') return false
  const type = inferEventType(
    valueFor(record, ['Transaction Type', 'Type', 'Code']),
  )
  const contract = valueFor(record, ['Symbol', 'Contract'])?.trim()
  if (!type || !contract) return false
  return (
    classifyAsset(
      valueFor(record, ['Asset Class', 'Asset Category']),
      contract,
    ) === 'OPTION' || /[CP]\d{8}$/.test(contract)
  )
}

function dedicatedOptionEventRecordSchemaIsValid(
  record: SectionRecord,
): boolean {
  if (record.recordType !== 'DATA') return false
  const typeFields = fieldMatchesFor(record, [
    'Transaction Type',
    'Type',
    'Code',
  ])
  const contractFields = fieldMatchesFor(record, ['Symbol', 'Contract'])
  const assetFields = fieldMatchesFor(record, [
    'Asset Class',
    'Asset Category',
  ])
  if (
    typeFields.length !== 1 ||
    contractFields.length !== 1 ||
    assetFields.length > 1 ||
    !inferEventType(typeFields[0]?.value) ||
    !contractFields[0]?.value.trim()
  ) {
    return false
  }

  const rawAsset = assetFields[0]?.value
  if (
    rawAsset?.trim() &&
    classifyAsset(rawAsset, contractFields[0].value) !== 'OPTION'
  ) {
    return false
  }
  if (!rawAsset?.trim()) {
    const contract = contractFields[0].value
    return (
      inferOptionUnderlyingFromContract(contract) != null ||
      /[CP]\d{8}$/.test(contract)
    )
  }
  return true
}

interface CashReportBaseEndingCandidate {
  recognized: boolean
  schemaValid: boolean
  match?: NumericMatch
}

function isWideNavRecord(record: SectionRecord): boolean {
  return (
    fieldMatchesFor(record, NAV_LABEL_FIELD_ALIASES).length === 0 &&
    fieldMatchesFor(record, ['Cash']).length > 0 &&
    fieldMatchesFor(record, ['Total']).length > 0
  )
}

function validateWideNavRecord(
  record: SectionRecord,
  invalidNumericFields: SourceRef[],
): boolean {
  if (fieldMatchesFor(record, ['Cash']).length !== 1) return false
  if (fieldMatchesFor(record, ['Total']).length !== 1) return false
  const models = fieldMatchesFor(record, ['Model'])
  if (models.length > 1 || models.some((model) => model.value.trim() !== '')) {
    return false
  }

  const allowedFields = schemaAliasMap([
    'Total',
    ...NAV_WIDE_COMPONENT_FIELD_ALIASES.flat(),
    ...NAV_WIDE_METADATA_FIELD_ALIASES.flat(),
  ])
  for (const key of Object.keys(record.fields)) {
    const rawKey = key.replace(/__\d+$/, '')
    const normalized = normalizeSchemaKey(rawKey)
    if (!normalized || !allowedFields.has(normalized)) return false
  }

  const components: NumericMatch[] = []
  let valid = true
  for (const aliases of NAV_WIDE_COMPONENT_FIELD_ALIASES) {
    const fields = fieldMatchesFor(record, aliases)
    if (fields.length !== 1) {
      valid = false
      continue
    }
    const match = numericMatchFor(
      record,
      aliases,
      invalidNumericFields,
      true,
    )
    if (match) components.push(match)
    else valid = false
  }

  const total = numericMatchFor(
    record,
    ['Total'],
    invalidNumericFields,
    true,
  )
  return (
    valid &&
    components.length === NAV_WIDE_COMPONENT_FIELD_ALIASES.length &&
    numericEquationMatches(components, total, invalidNumericFields)
  )
}

function isBaseCurrencySummaryLabel(value: string | undefined): boolean {
  const normalized = normalizeSchemaKey(value ?? '')
  return (
    normalized === 'basecurrency' ||
    normalized === 'basecurrencysummary'
  )
}

function cashReportBaseEndingCandidate(
  record: SectionRecord,
  invalidNumericFields: SourceRef[],
): CashReportBaseEndingCandidate {
  const summaryFields = fieldMatchesFor(record, ['Currency Summary'])
  const currencyFields = fieldMatchesFor(record, ['Currency'])
  const directEndingFields = fieldMatchesFor(record, [
    'Ending Cash',
    'EndingCash',
  ])
  const totalFields = fieldMatchesFor(record, ['Total'])
  const summaryValue = summaryFields[0]?.value
  const currencyValue = currencyFields[0]?.value
  const normalizedSummary = normalizeSchemaKey(summaryValue ?? '') ?? ''
  const baseLabelCount = [summaryValue, currencyValue].filter((value) =>
    isBaseCurrencySummaryLabel(value),
  ).length
  const horizontalBaseRow =
    totalFields.length === 0 && baseLabelCount > 0
  const verticalBaseEndingRow =
    directEndingFields.length === 0 &&
    normalizedSummary === 'endingcash' &&
    (isBaseCurrencySummaryLabel(currencyValue) || currencyFields.length === 0)

  if (!horizontalBaseRow && !verticalBaseEndingRow) {
    return { recognized: false, schemaValid: true }
  }

  const amountAliases = verticalBaseEndingRow
    ? ['Total']
    : ['Ending Cash', 'EndingCash']
  const amountFields = verticalBaseEndingRow
    ? totalFields
    : directEndingFields
  const schemaValid = verticalBaseEndingRow
    ? summaryFields.length === 1 &&
      currencyFields.length === 1 &&
      normalizedSummary === 'endingcash' &&
      isBaseCurrencySummaryLabel(currencyValue) &&
      amountFields.length === 1
    : summaryFields.length <= 1 &&
      currencyFields.length <= 1 &&
      summaryFields.length + currencyFields.length >= 1 &&
      baseLabelCount === 1 &&
      amountFields.length === 1
  const match = numericMatchFor(
    record,
    amountAliases,
    invalidNumericFields,
    true,
  )

  return {
    recognized: true,
    schemaValid: schemaValid && match != null,
    match,
  }
}

function findNetAssetValues(
  cashRecords: SectionRecord[],
  navRecords: SectionRecord[],
  invalidNumericFields: SourceRef[],
): {
  netLiquidationValue?: number
  cashValue?: number
  beginningNav?: number
  endingNav?: number
  netLiquidationSourceRefs: SourceRef[]
  cashSourceRefs: SourceRef[]
  beginningNavSourceRefs: SourceRef[]
  endingNavSourceRefs: SourceRef[]
} {
  let netLiquidationValue: number | undefined
  let cashValue: number | undefined
  let beginningNav: number | undefined
  let endingNav: number | undefined
  let netLiquidationSourceRefs: SourceRef[] = []
  let cashSourceRefs: SourceRef[] = []
  let beginningNavSourceRefs: SourceRef[] = []
  let endingNavSourceRefs: SourceRef[] = []

  for (const record of navRecords) {
    if (isWideNavRecord(record)) {
      const total = numericMatchFor(
        record,
        ['Total'],
        invalidNumericFields,
        true,
      )
      const cash = numericMatchFor(
        record,
        ['Cash'],
        invalidNumericFields,
        true,
      )
      if (total) {
        netLiquidationValue = total.value
        endingNav = total.value
        netLiquidationSourceRefs = [total.sourceRef]
        endingNavSourceRefs = [total.sourceRef]
      }
      if (cash) {
        cashValue = cash.value
        cashSourceRefs = [cash.sourceRef]
      }
      continue
    }

    const label = valueFor(record, NAV_LABEL_FIELD_ALIASES)
    const normalized = normalizeSchemaKey(label ?? '') ?? ''
    const current = numericMatchFor(
      record,
      NAV_CURRENT_TOTAL_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )

    if (normalized === 'total' || normalized.includes('netliquidation')) {
      const prior = numericMatchFor(
        record,
        NAV_PRIOR_TOTAL_FIELD_ALIASES,
        invalidNumericFields,
        true,
      )
      if (current) {
        netLiquidationValue = current.value
        endingNav = current.value
        netLiquidationSourceRefs = [current.sourceRef]
        endingNavSourceRefs = [current.sourceRef]
      }
      if (prior) {
        beginningNav = prior.value
        beginningNavSourceRefs = [prior.sourceRef]
      }
    }
    if (normalized === 'cash') {
      if (current) {
        cashValue = current.value
        cashSourceRefs = [current.sourceRef]
      }
    }
  }

  if (cashValue == null) {
    for (const record of cashRecords) {
      const candidate = cashReportBaseEndingCandidate(
        record,
        invalidNumericFields,
      )
      if (candidate.match) {
        cashValue = candidate.match.value
        cashSourceRefs = [candidate.match.sourceRef]
      }
    }
  }

  return {
    netLiquidationValue,
    cashValue,
    beginningNav,
    endingNav,
    netLiquidationSourceRefs,
    cashSourceRefs,
    beginningNavSourceRefs,
    endingNavSourceRefs,
  }
}

function validateCashReport(
  records: SectionRecord[],
  invalidNumericFields: SourceRef[],
  sectionPresent: boolean,
): boolean {
  if (!sectionPresent) return true
  if (records.length === 0) return false

  if (new Set(records.map((record) => record.headerSignature)).size !== 1) {
    return false
  }

  const exposesCurrencySummary = records.some(
    (record) => fieldMatchesFor(record, ['Currency Summary']).length > 0,
  )
  const exposesCurrency = records.some(
    (record) => fieldMatchesFor(record, ['Currency']).length > 0,
  )
  const exposesVerticalSchema = records.some(
    (record) =>
      fieldMatchesFor(record, ['Total']).length > 0 &&
      fieldMatchesFor(record, ['Currency Summary']).length > 0 &&
      fieldMatchesFor(record, ['Currency']).length > 0,
  )
  let baseCashCandidates = 0
  let valid = true
  for (const record of records) {
    const directEndingFields = fieldMatchesFor(record, [
      'Ending Cash',
      'EndingCash',
    ])
    if (
      directEndingFields.length > 0 &&
      exposesCurrencySummary &&
      fieldMatchesFor(record, ['Currency Summary']).length !== 1
    ) {
      valid = false
    }
    if (
      directEndingFields.length > 0 &&
      exposesCurrency &&
      fieldMatchesFor(record, ['Currency']).length !== 1
    ) {
      valid = false
    }
    if (
      exposesVerticalSchema &&
      fieldMatchesFor(record, ['Total']).length > 0 &&
      (fieldMatchesFor(record, ['Currency Summary']).length !== 1 ||
        fieldMatchesFor(record, ['Currency']).length !== 1)
    ) {
      valid = false
    }

    const candidate = cashReportBaseEndingCandidate(
      record,
      invalidNumericFields,
    )
    if (!candidate.recognized) continue
    baseCashCandidates += 1
    if (!candidate.schemaValid) valid = false
  }
  // Once a Cash Report is present, a single base-currency ending balance is
  // required. Allowing zero candidates would make a renamed/missing header
  // silently bypass both the fallback value and the NAV cross-check.
  return valid && baseCashCandidates === 1
}

function validateCashSourceConsistency(
  cashRecords: SectionRecord[],
  navRecords: SectionRecord[],
  invalidNumericFields: SourceRef[],
): boolean {
  const navCash: NumericMatch[] = []
  const reportCash: NumericMatch[] = []

  for (const record of navRecords) {
    if (isWideNavRecord(record)) {
      const match = numericMatchFor(
        record,
        ['Cash'],
        invalidNumericFields,
        true,
      )
      if (match) navCash.push(match)
      continue
    }

    const label = valueFor(record, NAV_LABEL_FIELD_ALIASES)
    const normalized = normalizeSchemaKey(label ?? '') ?? ''
    if (normalized !== 'cash') continue
    const match = numericMatchFor(
      record,
      NAV_CURRENT_TOTAL_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )
    if (match) navCash.push(match)
  }

  for (const record of cashRecords) {
    const candidate = cashReportBaseEndingCandidate(
      record,
      invalidNumericFields,
    )
    if (candidate.match) reportCash.push(candidate.match)
  }

  if (navCash.length > 1 || reportCash.length > 1) return false
  if (navCash.length === 0 || reportCash.length === 0) return true
  return normalizedDifference(navCash[0].value, reportCash[0].value) === 0
}

function validateNavSection(
  records: SectionRecord[],
  invalidNumericFields: SourceRef[],
  sectionPresent: boolean,
): boolean {
  if (!sectionPresent) return true
  if (records.length === 0) return false

  const accountingRecords = records.filter(
    (record) => !isReturnOnlyRecord(record),
  )
  const wideRecords = accountingRecords.filter(isWideNavRecord)
  if (wideRecords.length > 0) {
    return (
      accountingRecords.length === 1 &&
      wideRecords.length === 1 &&
      validateWideNavRecord(wideRecords[0], invalidNumericFields)
    )
  }
  const requiresPrior = accountingRecords.some(
    (record) =>
      fieldMatchesFor(record, NAV_PRIOR_TOTAL_FIELD_ALIASES).length > 0,
  )
  const requiresComponents = accountingRecords.some(
    (record) =>
      fieldMatchesFor(record, NAV_CURRENT_LONG_FIELD_ALIASES).length > 0 ||
      fieldMatchesFor(record, NAV_CURRENT_SHORT_FIELD_ALIASES).length > 0,
  )
  const requiresChange = accountingRecords.some(
    (record) => fieldMatchesFor(record, NAV_CHANGE_FIELD_ALIASES).length > 0,
  )
  const detailCurrent: NumericMatch[] = []
  const detailPrior: NumericMatch[] = []
  const detailChange: NumericMatch[] = []
  let reportedCurrent: NumericMatch | undefined
  let reportedPrior: NumericMatch | undefined
  let reportedChange: NumericMatch | undefined
  let overallRows = 0
  let valid = accountingRecords.length > 0

  for (const record of accountingRecords) {
    const labelFields = fieldMatchesFor(record, NAV_LABEL_FIELD_ALIASES)
    if (labelFields.length !== 1 || !labelFields[0]?.value.trim()) valid = false
    const normalizedLabel = normalizeSchemaKey(labelFields[0]?.value ?? '') ?? ''
    const totalRow =
      record.recordType === 'TOTAL' ||
      normalizedLabel === 'total' ||
      normalizedLabel.includes('netliquidation')

    if (
      fieldMatchesFor(record, NAV_CURRENT_TOTAL_FIELD_ALIASES).length !== 1
    ) {
      valid = false
    }
    const current = numericMatchFor(
      record,
      NAV_CURRENT_TOTAL_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )
    if (!current) valid = false

    let prior: NumericMatch | undefined
    if (requiresPrior) {
      if (
        fieldMatchesFor(record, NAV_PRIOR_TOTAL_FIELD_ALIASES).length !== 1
      ) {
        valid = false
      }
      prior = numericMatchFor(
        record,
        NAV_PRIOR_TOTAL_FIELD_ALIASES,
        invalidNumericFields,
        true,
      )
      if (!prior) valid = false
    }

    let change: NumericMatch | undefined
    if (requiresChange) {
      if (fieldMatchesFor(record, NAV_CHANGE_FIELD_ALIASES).length !== 1) {
        valid = false
      }
      change = numericMatchFor(
        record,
        NAV_CHANGE_FIELD_ALIASES,
        invalidNumericFields,
        true,
      )
      if (!change) valid = false
      if (
        prior &&
        current &&
        change &&
        !numericEquationMatches([prior, change], current, invalidNumericFields)
      ) {
        valid = false
      }
    }

    if (requiresComponents) {
      const components = requiredNumericMatches(
        record,
        [
          NAV_CURRENT_LONG_FIELD_ALIASES,
          NAV_CURRENT_SHORT_FIELD_ALIASES,
        ],
        invalidNumericFields,
      )
      if (
        !components.schemaValid ||
        components.matches.length !== 2 ||
        !numericEquationMatches(components.matches, current, invalidNumericFields)
      ) {
        valid = false
      }
    }

    if (totalRow) {
      overallRows += 1
      if (current) reportedCurrent = current
      if (prior) reportedPrior = prior
      if (change) reportedChange = change
    } else {
      if (current) detailCurrent.push(current)
      if (prior) detailPrior.push(prior)
      if (change) detailChange.push(change)
    }
  }

  const detailsMatchReported = (
    details: NumericMatch[],
    reported: NumericMatch | undefined,
  ): boolean => {
    if (!reported || details.length === 0) return false
    const calculated = sumAccountingValues(
      details.map((match) => match.value),
      details.map((match) => match.sourceRef),
      invalidNumericFields,
    )
    return (
      calculated != null &&
      normalizedDifference(reported.value, calculated) === 0
    )
  }

  if (overallRows !== 1) valid = false
  if (!detailsMatchReported(detailCurrent, reportedCurrent)) valid = false
  if (requiresPrior && !detailsMatchReported(detailPrior, reportedPrior)) {
    valid = false
  }
  if (requiresChange && !detailsMatchReported(detailChange, reportedChange)) {
    valid = false
  }
  return valid
}

function findSeasonReturn(
  store: Map<string, SectionRecord[]>,
  ytdRecords: SectionRecord[],
  navRecords: SectionRecord[],
  invalidNumericFields: SourceRef[],
): {
  value?: number
  sourceRefs: SourceRef[]
  conflict: boolean
} {
  const allRecords = [
    ...ytdRecords,
    ...navRecords,
    ...recordsFor(store, ['Change in NAV']),
  ]
  const aliases = [
    'Time Weighted Rate of Return',
    'TWR',
    'Year to Date Return',
    'YTD Return',
  ]
  const candidates: Array<{ value: number; sourceRef: SourceRef }> = []

  for (const record of allRecords) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (
      fieldName?.value &&
      fieldValue &&
      matchesSchemaAlias(fieldName.value, aliases)
    ) {
      const value = parseReturnValue(fieldValue.value)
      if (value != null) {
        candidates.push({ value, sourceRef: sourceRefFor(record, fieldValue.field) })
      } else {
        invalidNumericFields.push(sourceRefFor(record, fieldValue.field))
      }
    }

    for (const match of fieldMatchesFor(record, aliases)) {
      const value = parseReturnValue(match.value)
      if (value != null) {
        candidates.push({ value, sourceRef: sourceRefFor(record, match.field) })
      } else {
        invalidNumericFields.push(sourceRefFor(record, match.field))
      }
    }
  }

  if (candidates.length === 0) return { sourceRefs: [], conflict: false }
  const first = candidates[0].value
  const conflict = candidates.some((candidate) => Math.abs(candidate.value - first) > 1e-12)
  return {
    value: conflict ? undefined : first,
    sourceRefs: dedupeSourceRefs(candidates.map((candidate) => candidate.sourceRef)),
    conflict,
  }
}

function findNamedNumeric(
  records: SectionRecord[],
  names: string[],
  invalidNumericFields: SourceRef[],
): { value?: number; sourceRefs: SourceRef[]; conflict: boolean } {
  const candidates: NumericMatch[] = []

  for (const record of records) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (
      fieldName?.value &&
      fieldValue &&
      matchesSchemaAlias(fieldName.value, names)
    ) {
      const value = parseNumber(fieldValue.value)
      if (value != null) {
        candidates.push({ value, sourceRef: sourceRefFor(record, fieldValue.field) })
      } else {
        invalidNumericFields.push(sourceRefFor(record, fieldValue.field))
      }
    }

    for (const match of fieldMatchesFor(record, names)) {
      const value = parseNumber(match.value)
      if (value != null) {
        candidates.push({ value, sourceRef: sourceRefFor(record, match.field) })
      } else {
        invalidNumericFields.push(sourceRefFor(record, match.field))
      }
    }
  }

  if (candidates.length === 0) return { sourceRefs: [], conflict: false }
  const first = candidates[0].value
  const conflict = candidates.some(
    (candidate) => Math.abs(candidate.value - first) > CSV_RECONCILIATION_EPSILON,
  )
  return {
    value: conflict ? undefined : first,
    sourceRefs: dedupeSourceRefs(candidates.map((candidate) => candidate.sourceRef)),
    conflict,
  }
}

function statementPnlDiagnostic(
  store: Map<string, SectionRecord[]>,
  ytdRecords: SectionRecord[],
  ytdMtmFieldAliases: string[],
  reportedAllAssetsYtdMtm: number | undefined,
  reportedAllAssetsSourceRefs: SourceRef[],
  invalidNumericFields: SourceRef[],
): {
  statementPeriodTotalPnl?: number
  sourceRefs: SourceRef[]
  check: ReconciliationCheck
} {
  const totalPnlRecords = recordsFor(store, ['Total P/L for Statement Period'])
  const reportedCandidates = totalPnlRecords
    .map((record) =>
      numericMatchFor(
        record,
        [
          'Mark-to-Market P/L Total',
          'Mark-to-Market PNL Total',
          'Total',
          'Field Value',
          'Value',
          'Amount',
        ],
        invalidNumericFields,
        true,
      ),
    )
    .filter((candidate): candidate is NumericMatch => candidate != null)
  const sourceRefs = dedupeSourceRefs(
    reportedCandidates.map((candidate) => candidate.sourceRef),
  )
  const reportedValues = [...new Set(reportedCandidates.map((candidate) => candidate.value))]

  if (reportedValues.length > 1) {
    return {
      sourceRefs,
      check: {
        id: 'statement_period_pnl',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        tolerance: CSV_RECONCILIATION_EPSILON,
        sourceRefs,
      },
    }
  }

  const statementPeriodTotalPnl = reportedValues[0]
  if (statementPeriodTotalPnl == null || reportedAllAssetsYtdMtm == null) {
    return {
      statementPeriodTotalPnl,
      sourceRefs,
      check: {
        id: 'statement_period_pnl',
        status: 'NOT_AVAILABLE',
        reasonCode: 'source_missing',
        sourceRefs: dedupeSourceRefs([...reportedAllAssetsSourceRefs, ...sourceRefs]),
      },
    }
  }

  const allAssetsRowNumber = Math.max(
    0,
    ...reportedAllAssetsSourceRefs.map((sourceRef) => sourceRef.rowNumber ?? 0),
  )
  const allAssetsSection = reportedAllAssetsSourceRefs[0]?.section
  const recognizedComponents = new Set([
    'brokerinterestpaidandreceived',
    'otherfees',
  ])
  const components: NumericMatch[] = []
  const unsupported: SourceRef[] = []

  for (const record of ytdRecords) {
    if (allAssetsSection && record.section !== allAssetsSection) continue
    if (record.rowNumber <= allAssetsRowNumber) continue
    const label = valueFor(record, ['Asset Class', 'Asset Category'])
    const normalizedLabel = normalizeSchemaKey(label ?? '') ?? ''
    const symbol = valueFor(record, ['Symbol'])
    const amount = numericMatchFor(
      record,
      ytdMtmFieldAliases,
      invalidNumericFields,
      true,
    )
    if (!amount || symbol?.trim()) continue
    if (recognizedComponents.has(normalizedLabel)) {
      components.push(amount)
    } else if (normalizedLabel && !normalizedLabel.startsWith('total')) {
      unsupported.push(amount.sourceRef)
    }
  }

  const checkSourceRefs = dedupeSourceRefs([
    ...reportedAllAssetsSourceRefs,
    ...components.map((component) => component.sourceRef),
    ...sourceRefs,
    ...unsupported,
  ])
  const calculatedValue = sumAccountingValues(
    [reportedAllAssetsYtdMtm, ...components.map((component) => component.value)],
    checkSourceRefs,
    invalidNumericFields,
  )
  if (calculatedValue == null) {
    return {
      statementPeriodTotalPnl,
      sourceRefs,
      check: {
        id: 'statement_period_pnl',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        tolerance: CSV_RECONCILIATION_EPSILON,
        sourceRefs: checkSourceRefs,
      },
    }
  }
  const difference = normalizedDifference(statementPeriodTotalPnl, calculatedValue)
  if (difference == null) {
    invalidNumericFields.push(...checkSourceRefs)
    return {
      statementPeriodTotalPnl,
      sourceRefs,
      check: {
        id: 'statement_period_pnl',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        tolerance: CSV_RECONCILIATION_EPSILON,
        sourceRefs: checkSourceRefs,
      },
    }
  }
  const status = unsupported.length > 0 || difference !== 0 ? 'WARNING' : 'PASS_EXACT'

  return {
    statementPeriodTotalPnl,
    sourceRefs,
    check: {
      id: 'statement_period_pnl',
      status,
      reportedValue: statementPeriodTotalPnl,
      calculatedValue,
      difference,
      tolerance: CSV_RECONCILIATION_EPSILON,
      reasonCode:
        unsupported.length > 0
          ? 'unsupported_component'
          : difference === 0
            ? 'within_tolerance'
            : 'difference_exceeds_tolerance',
      sourceRefs: checkSourceRefs,
    },
  }
}

function navDiagnostic(
  store: Map<string, SectionRecord[]>,
  statementPeriodTotalPnl: number | undefined,
  statementPnlSourceRefs: SourceRef[],
  navBeginning: number | undefined,
  navEnding: number | undefined,
  navBeginningSourceRefs: SourceRef[],
  navEndingSourceRefs: SourceRef[],
  invalidNumericFields: SourceRef[],
): {
  beginningNav?: number
  endingNav?: number
  calculatedEndingNav?: number
  beginningSourceRefs: SourceRef[]
  endingSourceRefs: SourceRef[]
  check: ReconciliationCheck
} {
  const changeRecords = recordsFor(store, ['Change in NAV'])
  const starting = findNamedNumeric(
    changeRecords,
    ['Starting Value', 'Beginning Value'],
    invalidNumericFields,
  )
  const ending = findNamedNumeric(changeRecords, ['Ending Value'], invalidNumericFields)
  const deposits = findNamedNumeric(
    changeRecords,
    ['Deposits & Withdrawals'],
    invalidNumericFields,
  )
  const markToMarket = findNamedNumeric(
    changeRecords,
    ['Mark-to-Market'],
    invalidNumericFields,
  )
  const dividends = findNamedNumeric(changeRecords, ['Dividends'], invalidNumericFields)
  const withholdingTax = findNamedNumeric(
    changeRecords,
    ['Withholding Tax'],
    invalidNumericFields,
  )
  const interest = findNamedNumeric(changeRecords, [
    'Interest',
    'Broker Interest Paid and Received',
  ], invalidNumericFields)
  const otherFees = findNamedNumeric(changeRecords, ['Other Fees'], invalidNumericFields)
  const commissions = findNamedNumeric(changeRecords, ['Commissions'], invalidNumericFields)
  const interestAccrualChange = findNamedNumeric(changeRecords, [
    'Change in Interest Accruals',
  ], invalidNumericFields)
  const otherFxTranslations = findNamedNumeric(
    changeRecords,
    ['Other FX Translations'],
    invalidNumericFields,
  )
  const supportedFieldNames = new Set(
    [
      'Starting Value',
      'Beginning Value',
      'Ending Value',
      'Deposits & Withdrawals',
      'Mark-to-Market',
      'Dividends',
      'Withholding Tax',
      'Interest',
      'Broker Interest Paid and Received',
      'Other Fees',
      'Commissions',
      'Change in Interest Accruals',
      'Other FX Translations',
      'Time Weighted Rate of Return',
      'TWR',
    ].map(normalizeKey),
  )
  const unsupportedSourceRefs: SourceRef[] = []
  for (const record of changeRecords) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const normalizedFieldName = fieldName?.value
      ? normalizeSchemaKey(fieldName.value)
      : undefined
    if (!fieldName?.value || (normalizedFieldName && supportedFieldNames.has(normalizedFieldName))) {
      continue
    }
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (fieldValue) unsupportedSourceRefs.push(sourceRefFor(record, fieldValue.field))
  }

  const beginningNav = starting.value ?? navBeginning
  const endingNav = ending.value ?? navEnding
  const beginningSourceRefs = dedupeSourceRefs([
    ...starting.sourceRefs,
    ...navBeginningSourceRefs,
  ])
  const endingSourceRefs = dedupeSourceRefs([
    ...ending.sourceRefs,
    ...navEndingSourceRefs,
  ])
  const allSourceRefs = dedupeSourceRefs([
    ...beginningSourceRefs,
    ...endingSourceRefs,
    ...deposits.sourceRefs,
    ...markToMarket.sourceRefs,
    ...dividends.sourceRefs,
    ...withholdingTax.sourceRefs,
    ...interest.sourceRefs,
    ...otherFees.sourceRefs,
    ...commissions.sourceRefs,
    ...statementPnlSourceRefs,
    ...interestAccrualChange.sourceRefs,
    ...otherFxTranslations.sourceRefs,
    ...unsupportedSourceRefs,
  ])

  const startingNavDifference =
    starting.value != null && navBeginning != null
      ? normalizedDifference(starting.value, navBeginning)
      : 0
  const endingNavDifference =
    ending.value != null && navEnding != null
      ? normalizedDifference(ending.value, navEnding)
      : 0
  if (startingNavDifference == null || endingNavDifference == null) {
    invalidNumericFields.push(...allSourceRefs)
  }

  const conflicts =
    starting.conflict ||
    ending.conflict ||
    deposits.conflict ||
    markToMarket.conflict ||
    dividends.conflict ||
    withholdingTax.conflict ||
    interest.conflict ||
    otherFees.conflict ||
    commissions.conflict ||
    interestAccrualChange.conflict ||
    otherFxTranslations.conflict ||
    startingNavDifference == null ||
    startingNavDifference !== 0 ||
    endingNavDifference == null ||
    endingNavDifference !== 0

  const depositValue = deposits.value
  const markToMarketValue = markToMarket.value
  const dividendsValue = dividends.value
  const withholdingTaxValue = withholdingTax.value
  const interestValue = interest.value
  const otherFeesValue = otherFees.value
  const commissionsValue = commissions.value
  const interestAccrualChangeValue = interestAccrualChange.value
  const otherFxTranslationsValue = otherFxTranslations.value

  if (
    beginningNav == null ||
    endingNav == null ||
    depositValue == null ||
    markToMarketValue == null ||
    dividendsValue == null ||
    withholdingTaxValue == null ||
    interestValue == null ||
    otherFeesValue == null ||
    commissionsValue == null ||
    statementPeriodTotalPnl == null ||
    interestAccrualChangeValue == null ||
    otherFxTranslationsValue == null
  ) {
    return {
      beginningNav,
      endingNav,
      beginningSourceRefs,
      endingSourceRefs,
      check: {
        id: 'nav_bridge',
        status: conflicts || unsupportedSourceRefs.length > 0 ? 'WARNING' : 'NOT_AVAILABLE',
        reasonCode: conflicts
          ? 'ambiguous_schema'
          : unsupportedSourceRefs.length > 0
            ? 'unsupported_component'
            : 'source_missing',
        sourceRefs: allSourceRefs,
      },
    }
  }

  const calculatedEndingNav = sumAccountingValues(
    [
      beginningNav,
      depositValue,
      statementPeriodTotalPnl,
      interestAccrualChangeValue,
      otherFxTranslationsValue,
    ],
    allSourceRefs,
    invalidNumericFields,
  )
  const calculatedEndingFromChangeComponents = sumAccountingValues(
    [
      beginningNav,
      depositValue,
      markToMarketValue,
      dividendsValue,
      withholdingTaxValue,
      interestValue,
      otherFeesValue,
      commissionsValue,
      interestAccrualChangeValue,
      otherFxTranslationsValue,
    ],
    allSourceRefs,
    invalidNumericFields,
  )
  if (calculatedEndingNav == null || calculatedEndingFromChangeComponents == null) {
    return {
      beginningNav,
      endingNav,
      beginningSourceRefs,
      endingSourceRefs,
      check: {
        id: 'nav_bridge',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        sourceRefs: allSourceRefs,
      },
    }
  }
  const difference = normalizedDifference(endingNav, calculatedEndingNav)
  const componentDifference = normalizedDifference(
    endingNav,
    calculatedEndingFromChangeComponents,
  )
  if (difference == null || componentDifference == null) {
    invalidNumericFields.push(...allSourceRefs)
    return {
      beginningNav,
      endingNav,
      calculatedEndingNav,
      beginningSourceRefs,
      endingSourceRefs,
      check: {
        id: 'nav_bridge',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        sourceRefs: allSourceRefs,
      },
    }
  }
  const status =
    conflicts ||
    unsupportedSourceRefs.length > 0 ||
    difference !== 0 ||
    componentDifference !== 0
      ? 'WARNING'
      : 'PASS_EXACT'

  return {
    beginningNav,
    endingNav,
    calculatedEndingNav,
    beginningSourceRefs,
    endingSourceRefs,
    check: {
      id: 'nav_bridge',
      status,
      reportedValue: endingNav,
      calculatedValue: calculatedEndingNav,
      difference,
      tolerance: CSV_RECONCILIATION_EPSILON,
      reasonCode: conflicts
        ? 'ambiguous_schema'
        : unsupportedSourceRefs.length > 0
          ? 'unsupported_component'
          : difference === 0 && componentDifference === 0
          ? 'within_tolerance'
          : 'difference_exceeds_tolerance',
      sourceRefs: allSourceRefs,
    },
  }
}

export function parseIbkrActivityStatement(
  text: string,
  options: ParseIbkrActivityStatementOptions = {},
): ParseResult {
  if (text.length > MAX_CSV_CHARACTERS) {
    return {
      errors: [{ code: 'csv_too_large' }],
      warnings: [],
    }
  }

  const errors: ParserDiagnostic[] = []
  const warnings: ParserDiagnostic[] = []
  let rows: string[][]
  try {
    rows = parseCsvRows(text, MAX_CSV_ROWS)
  } catch (error) {
    return {
      errors: [
        {
          code: error instanceof CsvParseFailure ? error.code : 'csv_malformed',
        },
      ],
      warnings,
    }
  }

  if (rows.length < 3) {
    return { errors: [{ code: 'csv_not_enough_rows' }], warnings }
  }
  if (rows.length > MAX_CSV_ROWS) {
    return {
      errors: [{ code: 'csv_too_many_rows' }],
      warnings,
    }
  }

  const store = buildSectionStore(rows)
  const sectionNames = listSectionNames(rows)
  const statementRecords = recordsFor(store, ['Statement'])
  const accountRecords = recordsFor(store, ['Account Information'])
  const statementMetadataRecords = [...statementRecords, ...accountRecords]
  let statementSchemaConflict =
    hasAmbiguousSchemaFields(statementMetadataRecords, [
      ['Field Name', 'Name', 'Item'],
      ['Field Value', 'Value', 'Amount'],
    ]) ||
    hasConflictingNamedText(statementRecords, ['Title', 'Report']) ||
    hasConflictingNamedText(statementMetadataRecords, [
      'Period',
      'Statement Period',
      'Report Period',
    ]) ||
    hasConflictingNamedText(statementMetadataRecords, [
      'From Date',
      'FromDate',
      'Start Date',
    ]) ||
    hasConflictingNamedText(statementMetadataRecords, [
      'To Date',
      'ToDate',
      'End Date',
    ])
  const { start, end } = findStatementPeriod(rows, store)
  const statementTitle = findNamedValue(statementRecords, ['Title', 'Report'])
  const normalizedStatementTitle = statementTitle
    ? normalizeSchemaKey(statementTitle)
    : undefined
  if (
    statementTitle &&
    (!normalizedStatementTitle || !normalizedStatementTitle.includes('activitystatement'))
  ) {
    errors.push({ code: 'not_activity_statement' })
  }

  if (!start || !end) {
    errors.push({ code: 'statement_period_missing' })
  }

  const currentDate =
    options.currentDate && !Number.isNaN(options.currentDate.getTime())
      ? options.currentDate
      : new Date()
  const currentDateIso = toIsoDate(currentDate)!
  const currentYear = currentDate.getFullYear()
  const startIso = toIsoDate(start)
  const endIso = toIsoDate(end)
  const navMetadataRecords = recordsFor(store, NAV_SECTION_ALIASES)
  for (const record of navMetadataRecords) {
    const reportDates = fieldMatchesFor(record, ['Report Date'])
    if (reportDates.length > 1) statementSchemaConflict = true
    for (const reportDate of reportDates) {
      const parsedReportDate = toIsoDate(parseDateFlexible(reportDate.value))
      if (!parsedReportDate || !endIso || parsedReportDate !== endIso) {
        statementSchemaConflict = true
      }
    }
  }
  for (const row of rows) {
    if (row[0]?.trim().toUpperCase() !== 'BOF' || row.length < 5) continue
    const bofStart = toIsoDate(parseDateFlexible(row[3]))
    const bofEnd = toIsoDate(parseDateFlexible(row[4]))
    if (
      !bofStart ||
      !bofEnd ||
      (startIso != null && bofStart !== startIso) ||
      (endIso != null && bofEnd !== endIso)
    ) {
      statementSchemaConflict = true
    }
  }
  const seasonYear = end?.getFullYear() ?? currentYear
  const isYtd = Boolean(
    start &&
      end &&
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === 0 &&
      start.getDate() === 1,
  )

  if (start && end && !isYtd) {
    errors.push({ code: 'not_ytd' })
  }
  if (startIso && endIso && startIso > endIso) {
    errors.push({ code: 'period_reversed' })
  }
  if (endIso && endIso > currentDateIso) {
    errors.push({ code: 'future_end_date' })
  }
  if (end && seasonYear !== currentYear) {
    errors.push({ code: 'wrong_season', params: { currentYear } })
  }

  const accountAliases = ['Account', 'Account ID', 'AccountID']
  const accountIds = new Set<string>()

  for (const record of accountRecords) {
    const fieldName = valueFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = valueFor(record, ['Field Value', 'Value'])
    if (fieldName && matchesSchemaAlias(fieldName, accountAliases) && fieldValue?.trim()) {
      accountIds.add(fieldValue.trim())
    }

    for (const match of fieldMatchesFor(record, accountAliases)) {
      if (match.value.trim()) accountIds.add(match.value.trim())
    }
  }

  for (const record of navMetadataRecords) {
    const matches = fieldMatchesFor(record, accountAliases)
    if (matches.length > 1) statementSchemaConflict = true
    for (const match of matches) {
      if (match.value.trim()) accountIds.add(match.value.trim())
      else statementSchemaConflict = true
    }
  }

  // Flex files with head/trailer records can carry one BOF record per account.
  for (const row of rows) {
    if (row[0]?.trim().toUpperCase() === 'BOF' && row[1]?.trim()) {
      accountIds.add(row[1].trim())
    }
  }

  if (accountIds.size === 0) {
    errors.push({ code: 'account_missing' })
  } else if (accountIds.size > 1) {
    errors.push({ code: 'multi_account' })
  }

  const accountId = [...accountIds][0]
  const baseCurrencyAliases = ['Base Currency', 'BaseCurrency']
  const baseCurrencyCandidates = new Set<string>()

  for (const record of accountRecords) {
    const fieldName = valueFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = valueFor(record, ['Field Value', 'Value'])
    if (
      fieldName &&
      matchesSchemaAlias(fieldName, baseCurrencyAliases) &&
      fieldValue?.trim()
    ) {
      baseCurrencyCandidates.add(fieldValue.trim().toUpperCase())
    }

    for (const match of fieldMatchesFor(record, baseCurrencyAliases)) {
      if (match.value.trim()) {
        baseCurrencyCandidates.add(match.value.trim().toUpperCase())
      }
    }
  }

  if (baseCurrencyCandidates.size === 0) {
    errors.push({ code: 'currency_missing' })
  } else if (baseCurrencyCandidates.size > 1) {
    errors.push({ code: 'currency_conflict' })
  }

  const baseCurrency = normalizeCurrencyCode([...baseCurrencyCandidates][0])
  if (baseCurrencyCandidates.size === 1 && !baseCurrency) {
    errors.push({ code: 'currency_invalid' })
  }

  const symbols = new Map<string, SymbolAccumulator>()
  const financialInstrumentSection = recordsForExclusive(store, [
    'Financial Instrument Information',
  ])
  const lifecycleEventSection = recordsForExclusive(
    store,
    OPTION_LIFECYCLE_SECTION_ALIASES,
  )
  const tradeEventSection = recordsForExclusive(store, ['Trades'])
  // A dedicated lifecycle section becomes authoritative when it contains any
  // Data row. Keep every such row until schema validation so malformed or
  // duplicate fields cannot disappear before the Trades fallback decision.
  const lifecycleEventRecords = lifecycleEventSection.records.filter(
    (record) => record.recordType === 'DATA',
  )
  const tradeEventRecords = tradeEventSection.records.filter(
    isOptionEventRecordCandidate,
  )
  const selectedEventMappingSectionAliases =
    lifecycleEventRecords.length > 0
      ? OPTION_LIFECYCLE_SECTION_ALIASES
      : ['Trades']
  const commonOptionContractIndexSectionAliases = [
    ...REALIZED_PERFORMANCE_SECTION_ALIASES,
    ...selectedEventMappingSectionAliases,
  ]
  // Mixed-family equivalence must resolve each source independently. Letting
  // one YTD family contribute aliases to the other would allow a wrong
  // Underlying value to make both snapshots repeat the same error.
  const mtmInstrumentMappingResult = buildInstrumentUnderlyingMap(
    store,
    ytdInstrumentMappingSectionAliases(
      'MTM',
      commonOptionContractIndexSectionAliases,
    ),
  )
  const monthYtdInstrumentMappingResult = buildInstrumentUnderlyingMap(
    store,
    ytdInstrumentMappingSectionAliases(
      'MONTH_YTD',
      commonOptionContractIndexSectionAliases,
    ),
  )
  const invalidAccountingFields: SourceRef[] = []
  const mtmSection = recordsForExclusive(store, MTM_PERFORMANCE_SECTION_ALIASES)
  const monthYtdSection = recordsForExclusive(
    store,
    MONTH_YTD_PERFORMANCE_SECTION_ALIASES,
  )
  const mtmRecords = mtmSection.records
  const monthYtdRecords = monthYtdSection.records
  const realizedSection = recordsForExclusive(
    store,
    REALIZED_PERFORMANCE_SECTION_ALIASES,
  )
  const realizedRecords = realizedSection.records
  const useYtdRealizedFallback = realizedRecords.length === 0
  // MTM is the richer accounting source and stays authoritative when both
  // official families coexist. Month/YTD is then a cross-check, never a
  // second input to Season P&L.
  const ytdRecords = mtmRecords.length > 0 ? mtmRecords : monthYtdRecords
  const ytdMtmFieldAliases =
    mtmRecords.length > 0
      ? MTM_TOTAL_FIELD_ALIASES
      : MONTH_YTD_MTM_FIELD_ALIASES
  const primaryYtdInstrumentMappingResult =
    mtmRecords.length > 0
      ? mtmInstrumentMappingResult
      : monthYtdInstrumentMappingResult
  // Realized YTD is an explanation metric, not the ranking metric. The
  // official Month/YTD family is its preferred fallback when the dedicated
  // Realized/FIFO section is absent, even when MTM remains authoritative for
  // Season P&L. Keep the fallback's own mapping isolated from the other YTD
  // family for the same reason as the source snapshots above.
  const ytdRealizedFallbackRecords = exposesYtdRealizedFields(monthYtdRecords)
    ? monthYtdRecords
    : []
  const ytdRealizedFallbackInstrumentMappingResult =
    monthYtdInstrumentMappingResult
  const mtmSnapshot = mtmRecords.length > 0
    ? ytdSectionSnapshot(
        mtmRecords,
        'MTM',
        mtmInstrumentMappingResult,
        invalidAccountingFields,
      )
    : undefined
  const monthYtdSnapshot = monthYtdRecords.length > 0
    ? ytdSectionSnapshot(
        monthYtdRecords,
        'MONTH_YTD',
        monthYtdInstrumentMappingResult,
        invalidAccountingFields,
      )
    : undefined
  const hasIncompleteCriticalHeaderBlock = [
    ['Statement'],
    ['Account Information'],
    YTD_PERFORMANCE_SECTION_ALIASES,
    REALIZED_PERFORMANCE_SECTION_ALIASES,
    NAV_SECTION_ALIASES,
    ['Cash Report'],
    ['Change in NAV'],
  ].some((aliases) => hasEmptyHeaderBlock(rows, aliases))
  let accountingSectionConflict =
    statementSchemaConflict ||
    hasIncompleteCriticalHeaderBlock ||
    financialInstrumentSection.conflict ||
    mtmSection.conflict ||
    monthYtdSection.conflict ||
    mtmInstrumentMappingResult.hasConflicts ||
    monthYtdInstrumentMappingResult.hasConflicts ||
    mtmSnapshot?.conflict === true ||
    monthYtdSnapshot?.conflict === true
  accountingSectionConflict ||=
    mtmRecords.length > 0 &&
    !validateYtdAccountingSection(
      mtmRecords,
      invalidAccountingFields,
      'MTM',
    )
  accountingSectionConflict ||=
    monthYtdRecords.length > 0 &&
    !validateYtdAccountingSection(
      monthYtdRecords,
      invalidAccountingFields,
      'MONTH_YTD',
    )
  accountingSectionConflict ||=
    !validateFullAccountSectionScope(mtmRecords, accountId) ||
    !validateFullAccountSectionScope(monthYtdRecords, accountId)
  accountingSectionConflict ||=
    useYtdRealizedFallback &&
    ytdRealizedFallbackRecords.length > 0 &&
    !validateYtdRealizedFallbackTotals(
      ytdRealizedFallbackRecords,
      invalidAccountingFields,
    )
  accountingSectionConflict ||=
    !validateFullAccountSectionScope(
      financialInstrumentSection.records,
      accountId,
    ) ||
    !validateInstrumentReferenceIdentities(
      financialInstrumentSection.records,
    ) ||
    hasAmbiguousSchemaFields(financialInstrumentSection.records, [
      ['Asset Class', 'Asset Category'],
      ['Symbol'],
      ['Description'],
    ])
  accountingSectionConflict ||=
    mtmSnapshot != null &&
    monthYtdSnapshot != null &&
    !ytdSnapshotsMatch(mtmSnapshot, monthYtdSnapshot)
  accountingSectionConflict ||= hasAmbiguousSchemaFields(
    [...mtmSection.alternatives.flat(), ...monthYtdSection.alternatives.flat()],
    [
      ['Asset Class', 'Asset Category'],
      ['Symbol'],
    ],
  )

  let ytdValueCount = 0
  let reportedAllAssetsYtdMtm: number | undefined
  let reportedAllAssetsSourceRefs: SourceRef[] = []
  const stockNumericSourceRefs: SourceRef[] = []
  const optionNumericSourceRefs: SourceRef[] = []
  const otherNumericSourceRefs: SourceRef[] = []
  for (const record of ytdRecords) {
    const rawSymbol = valueFor(record, ['Symbol'])
    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    const normalizedAsset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const normalizedSymbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
    const ytdMtmMatch = numericMatchFor(
      record,
      ytdMtmFieldAliases,
      invalidAccountingFields,
    )
    const ytdMtm = ytdMtmMatch?.value

    const isOverallTotal = isOverallTotalRow(
      record,
      normalizedAsset,
      normalizedSymbol,
    )

    if (isOverallTotal) {
      if (ytdMtmMatch) {
        if (
          reportedAllAssetsYtdMtm != null &&
          normalizedDifference(reportedAllAssetsYtdMtm, ytdMtmMatch.value) !== 0
        ) {
          errors.push({ code: 'mtm_total_conflict' })
        } else {
          reportedAllAssetsYtdMtm = ytdMtmMatch.value
          reportedAllAssetsSourceRefs = dedupeSourceRefs([
            ...reportedAllAssetsSourceRefs,
            ytdMtmMatch.sourceRef,
          ])
        }
      }
      continue
    }
    if (
      isAccountingTotalRow(record, normalizedAsset, normalizedSymbol)
    ) {
      continue
    }

    const assetClass = classifyAsset(rawAsset, rawSymbol ?? '')
    const resolution = resolveUnderlying(
      record,
      rawSymbol,
      assetClass,
      primaryYtdInstrumentMappingResult,
    )
    if (
      assetClass === 'OPTION' &&
      optionUnderlyingResolutionIsOpaque(rawSymbol, resolution) &&
      !(
        mtmRecords.length === 0 &&
        monthYtdSnapshot?.mtmByAssetAndUnderlying.has(
          `OPTION|${normalizeInstrumentKey(rawSymbol ?? '')}`,
        )
      )
    ) {
      accountingSectionConflict = true
      continue
    }
    const underlying = resolution.underlying
    if (isTotalRow(underlying)) continue

    if (ytdMtm == null) continue
    if (ytdMtm != null) ytdValueCount += 1

    const accumulator = getAccumulator(
      symbols,
      underlying,
      valueFor(record, ['Description']),
    )
    const mappingRefs = resolution.sourceRefs
    const metricRefs = ytdMtmMatch
      ? dedupeSourceRefs([ytdMtmMatch.sourceRef, ...mappingRefs])
      : mappingRefs
    if (assetClass === 'OPTION') {
      accumulator.optionYtdMtm = addAccountingMatch(
        accumulator.optionYtdMtm,
        ytdMtmMatch,
        invalidAccountingFields,
      )
      if (ytdMtmMatch) {
        optionNumericSourceRefs.push(ytdMtmMatch.sourceRef)
        addSymbolSourceRefs(accumulator, 'optionYtdMtm', metricRefs)
      }
    } else if (assetClass === 'STOCK') {
      accumulator.stockYtdMtm = addAccountingMatch(
        accumulator.stockYtdMtm,
        ytdMtmMatch,
        invalidAccountingFields,
      )
      if (ytdMtmMatch) {
        stockNumericSourceRefs.push(ytdMtmMatch.sourceRef)
        addSymbolSourceRefs(accumulator, 'stockYtdMtm', metricRefs)
      }
    } else {
      accumulator.otherYtdMtm = addAccountingMatch(
        accumulator.otherYtdMtm,
        ytdMtmMatch,
        invalidAccountingFields,
      )
      if (ytdMtmMatch) {
        otherNumericSourceRefs.push(ytdMtmMatch.sourceRef)
        addSymbolSourceRefs(accumulator, 'otherYtdMtm', metricRefs)
      }
    }

  }

  if (useYtdRealizedFallback) {
    for (const record of ytdRealizedFallbackRecords) {
      if (isReturnOnlyRecord(record)) continue

      const rawSymbol = valueFor(record, SYMBOL_IDENTITY_FIELD_ALIASES)
      const rawAsset = valueFor(record, ASSET_IDENTITY_FIELD_ALIASES)
      const normalizedAsset = normalizeSchemaKey(rawAsset ?? '') ?? ''
      const normalizedSymbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
      if (
        isAccountingTotalRow(record, normalizedAsset, normalizedSymbol)
      ) {
        continue
      }
      const assetClass = classifyAsset(rawAsset, rawSymbol ?? '')
      const resolution = resolveUnderlying(
        record,
        rawSymbol,
        assetClass,
        ytdRealizedFallbackInstrumentMappingResult,
      )
      const underlying = resolution.underlying
      if (isTotalRow(underlying)) continue

      const realizedShortMatch = numericMatchFor(
        record,
        YTD_REALIZED_SHORT_FIELD_ALIASES,
        invalidAccountingFields,
      )
      const realizedLongMatch = numericMatchFor(
        record,
        YTD_REALIZED_LONG_FIELD_ALIASES,
        invalidAccountingFields,
      )
      if (!realizedShortMatch && !realizedLongMatch) continue

      const realizedRefs = dedupeSourceRefs([
        ...(realizedShortMatch ? [realizedShortMatch.sourceRef] : []),
        ...(realizedLongMatch ? [realizedLongMatch.sourceRef] : []),
        ...resolution.sourceRefs,
      ])
      const realized =
        sumAccountingValues(
          [realizedShortMatch?.value ?? 0, realizedLongMatch?.value ?? 0],
          realizedRefs,
          invalidAccountingFields,
        ) ?? 0
      const accumulator = getAccumulator(
        symbols,
        underlying,
        valueFor(record, ['Description']),
      )

      if (assetClass === 'OPTION') {
        accumulator.optionRealizedYtd =
          sumAccountingValues(
            [accumulator.optionRealizedYtd, realized],
            realizedRefs,
            invalidAccountingFields,
          ) ?? accumulator.optionRealizedYtd
      } else if (assetClass === 'STOCK') {
        accumulator.stockRealizedYtd =
          sumAccountingValues(
            [accumulator.stockRealizedYtd, realized],
            realizedRefs,
            invalidAccountingFields,
          ) ?? accumulator.stockRealizedYtd
      } else {
        accumulator.otherRealizedYtd =
          sumAccountingValues(
            [accumulator.otherRealizedYtd, realized],
            realizedRefs,
            invalidAccountingFields,
          ) ?? accumulator.otherRealizedYtd
      }
      accumulator.hasYtdRealized = true
      addSymbolSourceRefs(accumulator, 'totalRealizedYtd', realizedRefs)
      if (assetClass === 'OTHER') {
        addSymbolSourceRefs(accumulator, 'otherRealizedYtd', realizedRefs)
      }
    }
  }

  if (
    ytdRecords.length === 0 ||
    (ytdValueCount === 0 && invalidAccountingFields.length === 0)
  ) {
    errors.push({ code: 'mtm_section_missing' })
  }

  accountingSectionConflict ||= realizedSection.conflict
  accountingSectionConflict ||= hasAmbiguousSchemaFields(
    realizedSection.alternatives.flat(),
    [
      ['Asset Class', 'Asset Category'],
      ['Symbol'],
    ],
  )
  accountingSectionConflict ||= hasDuplicateAccountingDetails(
    realizedRecords,
    [REALIZED_TOTAL_FIELD_ALIASES, UNREALIZED_TOTAL_FIELD_ALIASES],
    invalidAccountingFields,
  )
  accountingSectionConflict ||=
    realizedRecords.length > 0 &&
    !validateRealizedSection(realizedRecords, invalidAccountingFields)
  accountingSectionConflict ||=
    !validateFullAccountSectionScope(realizedRecords, accountId)

  const realizedSectionMissing = realizedRecords.length === 0
  if (realizedSectionMissing) {
    warnings.push({ code: 'realized_section_missing' })
  }

  for (const record of realizedRecords) {
    const rawSymbol = valueFor(record, ['Symbol'])
    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    const normalizedAsset = normalizeSchemaKey(rawAsset ?? '') ?? ''
    const normalizedSymbol = normalizeSchemaKey(rawSymbol ?? '') ?? ''
    if (
      isAccountingTotalRow(record, normalizedAsset, normalizedSymbol)
    ) {
      continue
    }
    const assetClass = classifyAsset(
      rawAsset,
      rawSymbol ?? '',
    )
    if (
      assetClass !== 'OPTION' &&
      (primaryYtdInstrumentMappingResult.contractAliases.has(
        normalizeInstrumentKey(rawSymbol ?? ''),
      ) || inferOptionUnderlyingFromContract(rawSymbol ?? '') != null)
    ) {
      accountingSectionConflict = true
      continue
    }
    const resolution = resolveUnderlying(
      record,
      rawSymbol,
      assetClass,
      primaryYtdInstrumentMappingResult,
    )
    if (
      assetClass === 'OPTION' &&
      optionUnderlyingResolutionIsOpaque(rawSymbol, resolution) &&
      !(
        mtmRecords.length === 0 &&
        monthYtdSnapshot?.mtmByAssetAndUnderlying.has(
          `OPTION|${normalizeInstrumentKey(rawSymbol ?? '')}`,
        )
      )
    ) {
      accountingSectionConflict = true
      continue
    }
    const underlying = resolution.underlying
    if (isTotalRow(underlying)) continue

    const realizedMatch = numericMatchFor(
      record,
      REALIZED_TOTAL_FIELD_ALIASES,
      invalidAccountingFields,
    )
    const unrealizedMatch = numericMatchFor(
      record,
      UNREALIZED_TOTAL_FIELD_ALIASES,
      invalidAccountingFields,
    )
    const realized = realizedMatch?.value
    const unrealized = unrealizedMatch?.value
    if (realized == null && unrealized == null) continue

    const accumulator = getAccumulator(
      symbols,
      underlying,
      valueFor(record, ['Description']),
    )
    const mappingRefs = resolution.sourceRefs

    if (!accumulator.hasYtdRealized && realized != null) {
      if (assetClass === 'OPTION') {
        accumulator.optionRealizedYtd = addAccountingMatch(
          accumulator.optionRealizedYtd,
          realizedMatch,
          invalidAccountingFields,
        )
      }
      if (assetClass === 'STOCK') {
        accumulator.stockRealizedYtd = addAccountingMatch(
          accumulator.stockRealizedYtd,
          realizedMatch,
          invalidAccountingFields,
        )
      }
      if (assetClass === 'OTHER') {
        accumulator.otherRealizedYtd = addAccountingMatch(
          accumulator.otherRealizedYtd,
          realizedMatch,
          invalidAccountingFields,
        )
      }
    }
    if (realizedMatch && !accumulator.hasYtdRealized) {
      const realizedRefs = [
        realizedMatch.sourceRef,
        ...mappingRefs,
      ]
      addSymbolSourceRefs(accumulator, 'totalRealizedYtd', realizedRefs)
      if (assetClass === 'OTHER') {
        addSymbolSourceRefs(accumulator, 'otherRealizedYtd', realizedRefs)
      }
    }

    if (unrealized != null) {
      if (assetClass === 'OPTION') {
        accumulator.optionCurrentUnrealized = addAccountingMatch(
          accumulator.optionCurrentUnrealized,
          unrealizedMatch,
          invalidAccountingFields,
        )
      }
      if (assetClass === 'STOCK') {
        accumulator.stockCurrentUnrealized = addAccountingMatch(
          accumulator.stockCurrentUnrealized,
          unrealizedMatch,
          invalidAccountingFields,
        )
      }
      if (assetClass === 'OTHER') {
        accumulator.otherCurrentUnrealized = addAccountingMatch(
          accumulator.otherCurrentUnrealized,
          unrealizedMatch,
          invalidAccountingFields,
        )
      }
    }
    if (unrealizedMatch) {
      const unrealizedRefs = [
        unrealizedMatch.sourceRef,
        ...mappingRefs,
      ]
      addSymbolSourceRefs(accumulator, 'totalCurrentUnrealized', unrealizedRefs)
      if (assetClass === 'OTHER') {
        addSymbolSourceRefs(accumulator, 'otherCurrentUnrealized', unrealizedRefs)
      }
    }
  }

  // Dedicated lifecycle rows are authoritative when present. Trades are a
  // fallback only; combining both can count the same broker event twice with
  // different trade/settlement dates.
  const eventRecords =
    lifecycleEventRecords.length > 0
      ? lifecycleEventRecords
      : tradeEventRecords
  const optionMappingEventRecords = [
    ...lifecycleEventSection.records,
    ...tradeEventSection.records,
  ]
  accountingSectionConflict ||=
    lifecycleEventSection.conflict || tradeEventSection.conflict
  accountingSectionConflict ||=
    lifecycleEventRecords.some(
      (record) => !dedicatedOptionEventRecordSchemaIsValid(record),
    )
  accountingSectionConflict ||=
    !validateFullAccountSectionScope(
      lifecycleEventSection.records,
      accountId,
    ) ||
    !validateFullAccountSectionScope(tradeEventSection.records, accountId) ||
    hasAmbiguousSchemaFields(optionMappingEventRecords, [
      ['Asset Class', 'Asset Category'],
      ['Symbol', 'Contract'],
    ])
  accountingSectionConflict ||= hasAmbiguousSchemaFields(eventRecords, [
    ['Transaction Type', 'Type', 'Code'],
    ['Symbol', 'Contract'],
    ['Asset Class', 'Asset Category'],
    ['Date', 'Date/Time', 'Trade Date', 'Report Date'],
  ])
  const events = parseOptionEvents(
    eventRecords,
    symbols,
    primaryYtdInstrumentMappingResult,
  )
  if (primaryYtdInstrumentMappingResult.hasConflicts) {
    errors.push({ code: 'instrument_alias_conflict' })
  }

  const normalizedSymbols: SymbolPnl[] = [...symbols.values()]
    .map((item) => {
      item.totalYtdMtm =
        sumAccountingValues(
          [item.stockYtdMtm, item.optionYtdMtm, item.otherYtdMtm],
          [
            ...(item.sourceRefs.stockYtdMtm ?? []),
            ...(item.sourceRefs.optionYtdMtm ?? []),
            ...(item.sourceRefs.otherYtdMtm ?? []),
          ],
          invalidAccountingFields,
        ) ?? 0
      item.totalRealizedYtd =
        sumAccountingValues(
          [
            item.stockRealizedYtd,
            item.optionRealizedYtd,
            item.otherRealizedYtd,
          ],
          item.sourceRefs.totalRealizedYtd ?? [],
          invalidAccountingFields,
        ) ?? 0
      item.totalCurrentUnrealized =
        sumAccountingValues(
          [
            item.stockCurrentUnrealized,
            item.optionCurrentUnrealized,
            item.otherCurrentUnrealized,
          ],
          item.sourceRefs.totalCurrentUnrealized ?? [],
          invalidAccountingFields,
        ) ?? 0
      item.sourceRefs.totalYtdMtm = dedupeSourceRefs([
        ...(item.sourceRefs.stockYtdMtm ?? []),
        ...(item.sourceRefs.optionYtdMtm ?? []),
        ...(item.sourceRefs.otherYtdMtm ?? []),
      ])
      return {
        symbol: item.symbol,
        description: item.description,
        stockYtdMtm: item.stockYtdMtm,
        optionYtdMtm: item.optionYtdMtm,
        otherYtdMtm: item.otherYtdMtm,
        totalYtdMtm: item.totalYtdMtm,
        stockRealizedYtd: item.stockRealizedYtd,
        optionRealizedYtd: item.optionRealizedYtd,
        otherRealizedYtd: item.otherRealizedYtd,
        totalRealizedYtd: item.totalRealizedYtd,
        stockCurrentUnrealized: item.stockCurrentUnrealized,
        optionCurrentUnrealized: item.optionCurrentUnrealized,
        otherCurrentUnrealized: item.otherCurrentUnrealized,
        totalCurrentUnrealized: item.totalCurrentUnrealized,
        assignmentCount: item.assignmentCount,
        exerciseCount: item.exerciseCount,
        expirationCount: item.expirationCount,
        sourceRefs: item.sourceRefs,
      }
    })
    .filter(
      (item) =>
        item.totalYtdMtm !== 0 ||
        item.totalRealizedYtd !== 0 ||
        item.totalCurrentUnrealized !== 0 ||
        item.assignmentCount > 0 ||
        item.exerciseCount > 0 ||
        item.expirationCount > 0,
    )
    .sort((a, b) => b.totalYtdMtm - a.totalYtdMtm)

  if (normalizedSymbols.length === 0) {
    errors.push({ code: 'underlyings_missing' })
  }

  const stockPnl =
    sumAccountingValues(
      normalizedSymbols.map((item) => item.stockYtdMtm),
      stockNumericSourceRefs,
      invalidAccountingFields,
    ) ?? 0
  const optionPnl =
    sumAccountingValues(
      normalizedSymbols.map((item) => item.optionYtdMtm),
      optionNumericSourceRefs,
      invalidAccountingFields,
    ) ?? 0
  const otherPnl =
    sumAccountingValues(
      normalizedSymbols.map((item) => item.otherYtdMtm),
      otherNumericSourceRefs,
      invalidAccountingFields,
    ) ?? 0
  const parsedAllAssetsSourceRefs = dedupeSourceRefs([
    ...stockNumericSourceRefs,
    ...optionNumericSourceRefs,
    ...otherNumericSourceRefs,
  ])
  const parsedAllAssetsYtdMtm =
    sumAccountingValues(
      [stockPnl, optionPnl, otherPnl],
      parsedAllAssetsSourceRefs,
      invalidAccountingFields,
    ) ?? 0
  if (reportedAllAssetsYtdMtm == null) {
    errors.push({ code: 'mtm_total_missing' })
  }
  const seasonPnl = reportedAllAssetsYtdMtm ?? parsedAllAssetsYtdMtm
  const mtmReconciliationDifference =
    reportedAllAssetsYtdMtm == null
      ? undefined
      : normalizedDifference(reportedAllAssetsYtdMtm, parsedAllAssetsYtdMtm)
  if (
    reportedAllAssetsYtdMtm != null &&
    mtmReconciliationDifference == null
  ) {
    invalidAccountingFields.push(
      ...reportedAllAssetsSourceRefs,
      ...parsedAllAssetsSourceRefs,
    )
  }
  const mtmCheck: ReconciliationCheck = {
    id: 'mtm_all_assets',
    status:
      reportedAllAssetsYtdMtm == null
        ? 'BLOCKED'
        : mtmReconciliationDifference === 0
          ? 'PASS_EXACT'
          : 'WARNING',
    reportedValue: reportedAllAssetsYtdMtm,
    calculatedValue: parsedAllAssetsYtdMtm,
    difference: mtmReconciliationDifference,
    tolerance: CSV_RECONCILIATION_EPSILON,
    reasonCode:
      reportedAllAssetsYtdMtm == null
        ? 'source_missing'
        : mtmReconciliationDifference === 0
          ? 'within_tolerance'
          : 'difference_exceeds_tolerance',
    sourceRefs: dedupeSourceRefs([
      ...reportedAllAssetsSourceRefs,
      ...parsedAllAssetsSourceRefs,
    ]),
  }

  if (mtmReconciliationDifference != null && mtmReconciliationDifference !== 0) {
    warnings.push({
      code: 'mtm_difference',
      params: {
        currency: baseCurrency ?? 'BASE',
        difference: mtmReconciliationDifference,
      },
    })
  }

  if (otherPnl !== 0) {
    warnings.push({ code: 'other_pnl_included' })
  }
  if (events.length === 0) {
    warnings.push({ code: 'no_option_events' })
  }

  const navSection = recordsForExclusive(store, NAV_SECTION_ALIASES)
  const navSectionPresent = sectionNames.some((section) =>
    matchesSchemaAlias(section, NAV_SECTION_ALIASES),
  )
  accountingSectionConflict ||= navSection.conflict
  accountingSectionConflict ||= hasAmbiguousSchemaFields(
    navSection.alternatives.flat(),
    [
      NAV_LABEL_FIELD_ALIASES,
      NAV_CURRENT_TOTAL_FIELD_ALIASES,
      NAV_PRIOR_TOTAL_FIELD_ALIASES,
      NAV_CURRENT_LONG_FIELD_ALIASES,
      NAV_CURRENT_SHORT_FIELD_ALIASES,
      NAV_CHANGE_FIELD_ALIASES,
      ...NAV_WIDE_COMPONENT_FIELD_ALIASES,
      ...NAV_WIDE_METADATA_FIELD_ALIASES,
    ],
  )
  accountingSectionConflict ||= hasDuplicateAccountingDetails(
    navSection.records,
    [
      NAV_CURRENT_TOTAL_FIELD_ALIASES,
      NAV_PRIOR_TOTAL_FIELD_ALIASES,
    ],
    invalidAccountingFields,
  )
  accountingSectionConflict ||= !validateNavSection(
    navSection.records,
    invalidAccountingFields,
    navSectionPresent,
  )
  const cashSection = recordsForExclusive(store, ['Cash Report'])
  const cashSectionPresent = sectionNames.some((section) =>
    matchesSchemaAlias(section, ['Cash Report']),
  )
  accountingSectionConflict ||= cashSection.conflict
  accountingSectionConflict ||= hasAmbiguousSchemaFields(cashSection.records, [
    ['Currency Summary'],
    ['Currency'],
    ['Ending Cash', 'EndingCash'],
    ['Total'],
  ])
  accountingSectionConflict ||=
    !validateCashReport(
      cashSection.records,
      invalidAccountingFields,
      cashSectionPresent,
    )
  accountingSectionConflict ||=
    !validateCashSourceConsistency(
      cashSection.records,
      navSection.records,
      invalidAccountingFields,
    )
  accountingSectionConflict ||= hasAmbiguousSchemaFields(
    recordsFor(store, ['Change in NAV']),
    [
      ['Field Name', 'Name', 'Item'],
      ['Field Value', 'Value', 'Amount'],
    ],
  )
  const netAssetValues = findNetAssetValues(
    cashSection.records,
    navSection.records,
    invalidAccountingFields,
  )
  const { netLiquidationValue, cashValue } = netAssetValues
  if (netLiquidationValue == null) {
    warnings.push({ code: 'nav_missing' })
  }

  const seasonReturnDiagnostic = findSeasonReturn(
    store,
    mtmRecords,
    navSection.records,
    invalidAccountingFields,
  )
  if (seasonReturnDiagnostic.conflict) {
    warnings.push({ code: 'twr_conflict' })
  }

  const statementDiagnostic = statementPnlDiagnostic(
    store,
    ytdRecords,
    ytdMtmFieldAliases,
    reportedAllAssetsYtdMtm,
    reportedAllAssetsSourceRefs,
    invalidAccountingFields,
  )
  if (statementDiagnostic.check.status === 'WARNING') {
    warnings.push({ code: 'statement_pnl_mismatch' })
  }

  const nav = navDiagnostic(
    store,
    statementDiagnostic.statementPeriodTotalPnl,
    statementDiagnostic.sourceRefs,
    netAssetValues.beginningNav,
    netAssetValues.endingNav,
    netAssetValues.beginningNavSourceRefs,
    netAssetValues.endingNavSourceRefs,
    invalidAccountingFields,
  )
  if (nav.check.status === 'WARNING') {
    warnings.push({ code: 'nav_bridge_review' })
  }

  if (invalidAccountingFields.length > 0) {
    errors.push({ code: 'accounting_value_invalid' })
  }
  if (accountingSectionConflict) {
    errors.push({ code: 'accounting_section_conflict' })
  }

  if (
    errors.length > 0 ||
    !startIso ||
    !endIso ||
    accountId === undefined ||
    baseCurrency === undefined
  ) {
    return { errors, warnings }
  }

  const informationalWarnings = new Set([
    'other_pnl_included',
    'no_option_events',
  ])
  const reconciliations = [mtmCheck, statementDiagnostic.check, nav.check]
  const hasIncompleteReconciliation = reconciliations.some(
    (check) => check.status !== 'PASS_EXACT' && check.status !== 'PASS_ROUNDED',
  )
  const hasQualityWarning =
    hasIncompleteReconciliation ||
    warnings.some((warning) => !informationalWarnings.has(warning.code))

  const fingerprint = fingerprintText(text)
  const isKnownSyntheticStatement =
    accountId !== undefined &&
    accountId.startsWith('SYNTHETIC_') &&
    KNOWN_SYNTHETIC_STATEMENTS.has(knownSyntheticIdentity(text))

  const report: PortfolioReport = {
    source: isKnownSyntheticStatement ? 'synthetic' : 'local',
    fingerprint,
    accountComparisonKey: sha256Hex(
      `${options.accountComparisonSalt ?? 'standalone-parser-v1'}\u0000${accountId}`,
    ),
    accountIdMasked: maskAccount(accountId),
    baseCurrency,
    seasonYear,
    startDate: startIso,
    endDate: endIso,
    importedAt: currentDate.toISOString(),
    isYtd,
    netLiquidationValue,
    cashValue,
    seasonReturn: seasonReturnDiagnostic.value,
    seasonPnl,
    reportedAllAssetsYtdMtm,
    parsedAllAssetsYtdMtm,
    mtmReconciliationDifference,
    statementPeriodTotalPnl: statementDiagnostic.statementPeriodTotalPnl,
    beginningNav: nav.beginningNav,
    endingNav: nav.endingNav,
    calculatedEndingNav: nav.calculatedEndingNav,
    stockPnl,
    optionPnl,
    otherPnl,
    symbols: normalizedSymbols,
    events,
    metricSourceRefs: {
      seasonPnl: reportedAllAssetsSourceRefs,
      reportedAllAssetsYtdMtm: reportedAllAssetsSourceRefs,
      parsedAllAssetsYtdMtm: parsedAllAssetsSourceRefs,
      stockPnl: dedupeSourceRefs(stockNumericSourceRefs),
      optionPnl: dedupeSourceRefs(optionNumericSourceRefs),
      otherPnl: dedupeSourceRefs(otherNumericSourceRefs),
      seasonReturn: seasonReturnDiagnostic.sourceRefs,
      netLiquidationValue: netAssetValues.netLiquidationSourceRefs,
      cashValue: netAssetValues.cashSourceRefs,
      statementPeriodTotalPnl: statementDiagnostic.sourceRefs,
      beginningNav: nav.beginningSourceRefs,
      endingNav: nav.endingSourceRefs,
    },
    parserFacts: {
      realizedSectionMissing,
      seasonReturnConflict: seasonReturnDiagnostic.conflict,
    },
    reconciliations,
    sections: sectionNames.sort(),
    warnings,
    dataQuality: hasQualityWarning ? 'warning' : 'good',
  }

  return { report, errors, warnings }
}
