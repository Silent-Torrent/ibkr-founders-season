import type {
  AssetClass,
  OptionEvent,
  ParseResult,
  PortfolioReport,
  ReconciliationCheck,
  SourceRef,
  SymbolMetricKey,
  SymbolPnl,
} from '../types'
import {
  fingerprintText,
  normalizeKey,
  parseCsvRows,
  parseDateFlexible,
  parseDateRange,
  parseNumber,
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
  sourceRef: SourceRef
}

const MAX_CSV_CHARACTERS = 10_000_000
const MAX_CSV_ROWS = 100_000
const CSV_RECONCILIATION_EPSILON = 0.000001
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
  PLUI: 'Month & Year to Date Performance Summary',
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
  const dynamicSectionNames = new Map<string, string>()

  rows.forEach((row, rowIndex) => {
    if (row.length < 2) return

    const rawSection = row[0].trim()
    const descriptor = row[1].trim().toUpperCase()

    if (descriptor === 'BOS' && row[2]) {
      dynamicSectionNames.set(rawSection.toUpperCase(), row[2].trim())
      return
    }

    const section =
      dynamicSectionNames.get(rawSection.toUpperCase()) ?? canonicalSectionName(rawSection)
    const sectionKey = normalizeKey(section)

    if (descriptor === 'HEADER') {
      const headers = uniqueHeaders(row.slice(2))
      headersBySection.set(sectionKey, {
        headers,
        signature: fingerprintText(headers.join('\u001f')),
      })
      return
    }

    const isSupportedRecordType = ['DATA', 'SUBTOTAL', 'TOTAL'].includes(descriptor)
    const isKnownEmptyTotalPnl =
      descriptor === '' && sectionKey === normalizeKey('Total P/L for Statement Period')
    if (!isSupportedRecordType && !isKnownEmptyTotalPnl) return

    let headerState = headersBySection.get(sectionKey)
    if (isKnownEmptyTotalPnl && !headerState) {
      headerState = headersBySection.get(normalizeKey('Mark-to-Market Performance Summary'))
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

    const records = store.get(sectionKey) ?? []
    records.push({
      section,
      fields,
      recordType: descriptor || 'EMPTY',
      rowNumber: rowIndex + 1,
      headerSignature:
        headerState?.signature ?? fingerprintText(Object.keys(fields).join('\u001f')),
    })
    store.set(sectionKey, records)
  })

  return store
}

function listSectionNames(rows: string[][]): string[] {
  const controlRecords = new Set(['BOF', 'EOF', 'BOS', 'EOS'])
  const names = new Set<string>()

  for (const row of rows) {
    const rawSection = row[0]?.trim()
    if (!rawSection || controlRecords.has(rawSection.toUpperCase())) continue
    names.add(canonicalSectionName(rawSection))
  }

  return [...names].sort()
}

function recordsFor(
  store: Map<string, SectionRecord[]>,
  aliases: string[],
): SectionRecord[] {
  const normalizedAliases = aliases.map(normalizeKey)
  const matches: SectionRecord[] = []

  for (const [section, records] of store.entries()) {
    if (
      normalizedAliases.some(
        (alias) => section === alias || section.includes(alias) || alias.includes(section),
      )
    ) {
      matches.push(...records)
    }
  }

  return matches
}

function fieldFor(record: SectionRecord, aliases: string[]): FieldMatch | undefined {
  const normalizedAliases = aliases.map(normalizeKey)

  for (const [key, value] of Object.entries(record.fields)) {
    const normalizedKey = normalizeKey(key).replace(/\d+$/, '')
    if (normalizedAliases.includes(normalizedKey)) return { field: key, value }
  }

  return undefined
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

function numericMatchFor(
  record: SectionRecord,
  aliases: string[],
): NumericMatch | undefined {
  const match = fieldFor(record, aliases)
  const value = parseNumber(match?.value)
  if (!match || value == null) return undefined
  return { value, sourceRef: sourceRefFor(record, match.field) }
}

function numberFor(record: SectionRecord, aliases: string[]): number | undefined {
  return numericMatchFor(record, aliases)?.value
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

function normalizedDifference(reported: number, calculated: number): number {
  const difference = reported - calculated
  return Math.abs(difference) <= CSV_RECONCILIATION_EPSILON ? 0 : difference
}

function findNamedMatch(
  records: SectionRecord[],
  names: string[],
): { value: string; sourceRef: SourceRef } | undefined {
  const normalizedNames = names.map(normalizeKey)

  for (const record of records) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (
      fieldName?.value &&
      fieldValue &&
      normalizedNames.includes(normalizeKey(fieldName.value))
    ) {
      return {
        value: fieldValue.value,
        sourceRef: sourceRefFor(record, fieldValue.field),
      }
    }

    for (const [key, value] of Object.entries(record.fields)) {
      if (normalizedNames.includes(normalizeKey(key))) {
        return { value, sourceRef: sourceRefFor(record, key) }
      }
    }
  }

  return undefined
}

function findNamedValue(records: SectionRecord[], names: string[]): string | undefined {
  return findNamedMatch(records, names)?.value
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
  const normalized = normalizeKey(value ?? '')
  if (
    normalized === 'opt' ||
    normalized.includes('option') ||
    normalized.includes('equityandindexoption')
  ) {
    return 'OPTION'
  }
  if (
    normalized === 'stk' ||
    normalized.includes('stock') ||
    normalized.includes('equity')
  ) {
    return 'STOCK'
  }

  const compact = symbol.replace(/\s/g, '').toUpperCase()
  if (/^[A-Z.\-]{1,8}\d{6}[CP]\d{8}$/.test(compact)) return 'OPTION'
  if (/\s\d{1,2}[A-Z]{3}\d{2,4}\s\d+(?:\.\d+)?\s[CP]$/i.test(symbol)) return 'OPTION'

  // A missing category is common on some stock summary rows. An explicit but
  // unrecognized category (for example Forex or Futures) must not be counted
  // as stock performance.
  return normalized ? 'OTHER' : 'STOCK'
}

function deriveUnderlying(
  symbolValue: string | undefined,
  underlyingValue: string | undefined,
  assetClass: AssetClass,
  instrumentUnderlyings?: Map<string, InstrumentUnderlying>,
): string {
  const explicit = underlyingValue?.trim()
  if (explicit) return explicit.toUpperCase()

  const symbol = (symbolValue ?? '').trim().toUpperCase()
  if (assetClass !== 'OPTION') return symbol

  const mapped = instrumentUnderlyings?.get(normalizeInstrumentKey(symbol))
  if (mapped) return mapped.underlying

  const spaced = symbol.match(/^([A-Z0-9.\-]+)\s+/)
  if (spaced) return spaced[1]

  const compact = symbol.replace(/\s/g, '')
  const occ = compact.match(/^([A-Z.\-]{1,8})(?=\d{6}[CP]\d{8}$)/)
  if (occ) return occ[1]

  return symbol
}

function normalizeInstrumentKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

function buildInstrumentUnderlyingMap(
  store: Map<string, SectionRecord[]>,
): Map<string, InstrumentUnderlying> {
  const mapping = new Map<string, InstrumentUnderlying>()

  for (const record of recordsFor(store, ['Financial Instrument Information'])) {
    const symbol = valueFor(record, ['Symbol'])
    const description = valueFor(record, ['Description'])
    const assetClass = classifyAsset(
      valueFor(record, ['Asset Class', 'Asset Category']),
      symbol ?? description ?? '',
    )
    const underlyingMatch = fieldFor(record, ['Underlying', 'Underlying Symbol'])
    const underlying = underlyingMatch?.value.trim().toUpperCase()

    if (assetClass !== 'OPTION' || !underlying || !underlyingMatch) continue
    for (const alias of [symbol, description]) {
      if (alias?.trim()) {
        mapping.set(normalizeInstrumentKey(alias), {
          underlying,
          sourceRef: sourceRefFor(record, underlyingMatch.field),
        })
      }
    }
  }

  return mapping
}

function underlyingSourceRefs(
  record: SectionRecord,
  symbolValue: string | undefined,
  assetClass: AssetClass,
  instrumentUnderlyings: Map<string, InstrumentUnderlying>,
): SourceRef[] {
  if (assetClass !== 'OPTION') return []
  const explicit = fieldFor(record, ['Underlying', 'Underlying Symbol'])
  if (explicit?.value.trim()) return [sourceRefFor(record, explicit.field)]
  const mapped = instrumentUnderlyings.get(normalizeInstrumentKey(symbolValue ?? ''))
  return mapped ? [mapped.sourceRef] : []
}

function isTotalRow(symbol: string): boolean {
  const normalized = normalizeKey(symbol)
  return (
    !normalized ||
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
    totalRealizedYtd: 0,
    stockCurrentUnrealized: 0,
    optionCurrentUnrealized: 0,
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
  const parsed = parseNumber(value)
  if (parsed == null) return undefined
  if (value.includes('%') || Math.abs(parsed) > 2) return parsed / 100
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

  const normalized = normalizeKey(value)
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
  store: Map<string, SectionRecord[]>,
  symbols: Map<string, SymbolAccumulator>,
  instrumentUnderlyings: Map<string, InstrumentUnderlying>,
): OptionEvent[] {
  const eventRecords = recordsFor(store, [
    'Options Exercises, Assignments and Expirations',
    'Option Exercises, Assignments and Expirations',
    'Trades',
  ])
  const events: OptionEvent[] = []
  const seen = new Set<string>()

  for (const record of eventRecords) {
    const codeMatch = fieldFor(record, ['Transaction Type', 'Type', 'Code'])
    const type = inferEventType(codeMatch?.value)
    if (!type) continue

    const contractMatch = fieldFor(record, ['Symbol', 'Contract'])
    const contract = contractMatch?.value
    const asset = classifyAsset(valueFor(record, ['Asset Class', 'Asset Category']), contract ?? '')
    if (asset !== 'OPTION' && !contract?.match(/[CP]\d{8}$/)) continue

    const underlying = deriveUnderlying(
      contract,
      valueFor(record, ['Underlying Symbol']),
      'OPTION',
      instrumentUnderlyings,
    )
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
        ...underlyingSourceRefs(record, contract, 'OPTION', instrumentUnderlyings),
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

function findNetAssetValues(store: Map<string, SectionRecord[]>): {
  netLiquidationValue?: number
  cashValue?: number
  beginningNav?: number
  endingNav?: number
  netLiquidationSourceRefs: SourceRef[]
  cashSourceRefs: SourceRef[]
  beginningNavSourceRefs: SourceRef[]
  endingNavSourceRefs: SourceRef[]
} {
  const navRecords = recordsFor(store, ['Net Asset Value', 'NAV Summary'])
  let netLiquidationValue: number | undefined
  let cashValue: number | undefined
  let beginningNav: number | undefined
  let endingNav: number | undefined
  let netLiquidationSourceRefs: SourceRef[] = []
  let cashSourceRefs: SourceRef[] = []
  let beginningNavSourceRefs: SourceRef[] = []
  let endingNavSourceRefs: SourceRef[] = []

  for (const record of navRecords) {
    const label = valueFor(record, ['Asset Class', 'Asset Category', 'Description', 'Field Name'])
    const normalized = normalizeKey(label ?? '')
    const current =
      numericMatchFor(record, ['Current Total', 'Ending Value', 'Current Value', 'Field Value']) ??
      numericMatchFor(record, ['Total'])

    if (normalized === 'total' || normalized.includes('netliquidation')) {
      const prior = numericMatchFor(record, ['Prior Total', 'Starting Value', 'Prior Value'])
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
    if (normalized === 'cash' || normalized.includes('cash')) {
      if (current) {
        cashValue = current.value
        cashSourceRefs = [current.sourceRef]
      }
    }
  }

  if (cashValue == null) {
    const cashRecords = recordsFor(store, ['Cash Report'])
    for (const record of cashRecords) {
      const currency = valueFor(record, ['Currency Summary', 'Currency'])
      if (normalizeKey(currency ?? '') === 'basecurrency') {
        const endingCash = numericMatchFor(record, ['Ending Cash', 'EndingCash'])
        if (endingCash) {
          cashValue = endingCash.value
          cashSourceRefs = [endingCash.sourceRef]
        }
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

function findSeasonReturn(store: Map<string, SectionRecord[]>): {
  value?: number
  sourceRefs: SourceRef[]
  conflict: boolean
} {
  const allRecords = [...store.values()].flat()
  const aliases = [
    'Time Weighted Rate of Return',
    'TWR',
    'Year to Date Return',
    'YTD Return',
  ]
  const normalizedAliases = aliases.map(normalizeKey)
  const candidates: Array<{ value: number; sourceRef: SourceRef }> = []

  for (const record of allRecords) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (
      fieldName?.value &&
      fieldValue &&
      normalizedAliases.includes(normalizeKey(fieldName.value))
    ) {
      const value = parseReturnValue(fieldValue.value)
      if (value != null) {
        candidates.push({ value, sourceRef: sourceRefFor(record, fieldValue.field) })
      }
    }

    for (const [key, rawValue] of Object.entries(record.fields)) {
      if (!normalizedAliases.includes(normalizeKey(key))) continue
      const value = parseReturnValue(rawValue)
      if (value != null) candidates.push({ value, sourceRef: sourceRefFor(record, key) })
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
): { value?: number; sourceRefs: SourceRef[]; conflict: boolean } {
  const normalizedNames = names.map(normalizeKey)
  const candidates: NumericMatch[] = []

  for (const record of records) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (
      fieldName?.value &&
      fieldValue &&
      normalizedNames.includes(normalizeKey(fieldName.value))
    ) {
      const value = parseNumber(fieldValue.value)
      if (value != null) {
        candidates.push({ value, sourceRef: sourceRefFor(record, fieldValue.field) })
      }
    }

    for (const [key, rawValue] of Object.entries(record.fields)) {
      if (!normalizedNames.includes(normalizeKey(key))) continue
      const value = parseNumber(rawValue)
      if (value != null) candidates.push({ value, sourceRef: sourceRefFor(record, key) })
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
  reportedAllAssetsYtdMtm: number | undefined,
  reportedAllAssetsSourceRefs: SourceRef[],
): {
  statementPeriodTotalPnl?: number
  sourceRefs: SourceRef[]
  check: ReconciliationCheck
} {
  const totalPnlRecords = recordsFor(store, ['Total P/L for Statement Period'])
  const reportedCandidates = totalPnlRecords
    .map((record) =>
      numericMatchFor(record, [
        'Mark-to-Market P/L Total',
        'Mark-to-Market PNL Total',
        'Field Value',
        'Value',
        'Amount',
      ]),
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
    const normalizedLabel = normalizeKey(label ?? '')
    const symbol = valueFor(record, ['Symbol'])
    const amount = numericMatchFor(record, [
      'Mark-to-Market P/L Total',
      'Mark-to-Market PNL Total',
      'YTD Mark-to-Market',
      'YTD MTM',
    ])
    if (!amount || symbol?.trim()) continue
    if (recognizedComponents.has(normalizedLabel)) {
      components.push(amount)
    } else if (normalizedLabel && !normalizedLabel.startsWith('total')) {
      unsupported.push(amount.sourceRef)
    }
  }

  const calculatedValue =
    reportedAllAssetsYtdMtm + components.reduce((sum, component) => sum + component.value, 0)
  const difference = normalizedDifference(statementPeriodTotalPnl, calculatedValue)
  const checkSourceRefs = dedupeSourceRefs([
    ...reportedAllAssetsSourceRefs,
    ...components.map((component) => component.sourceRef),
    ...sourceRefs,
    ...unsupported,
  ])
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
): {
  beginningNav?: number
  endingNav?: number
  calculatedEndingNav?: number
  beginningSourceRefs: SourceRef[]
  endingSourceRefs: SourceRef[]
  check: ReconciliationCheck
} {
  const changeRecords = recordsFor(store, ['Change in NAV'])
  const starting = findNamedNumeric(changeRecords, ['Starting Value', 'Beginning Value'])
  const ending = findNamedNumeric(changeRecords, ['Ending Value'])
  const deposits = findNamedNumeric(changeRecords, ['Deposits & Withdrawals'])
  const markToMarket = findNamedNumeric(changeRecords, ['Mark-to-Market'])
  const dividends = findNamedNumeric(changeRecords, ['Dividends'])
  const withholdingTax = findNamedNumeric(changeRecords, ['Withholding Tax'])
  const interest = findNamedNumeric(changeRecords, [
    'Interest',
    'Broker Interest Paid and Received',
  ])
  const otherFees = findNamedNumeric(changeRecords, ['Other Fees'])
  const commissions = findNamedNumeric(changeRecords, ['Commissions'])
  const interestAccrualChange = findNamedNumeric(changeRecords, [
    'Change in Interest Accruals',
  ])
  const otherFxTranslations = findNamedNumeric(changeRecords, ['Other FX Translations'])
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
    if (!fieldName?.value || supportedFieldNames.has(normalizeKey(fieldName.value))) continue
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
    (starting.value != null &&
      navBeginning != null &&
      normalizedDifference(starting.value, navBeginning) !== 0) ||
    (ending.value != null &&
      navEnding != null &&
      normalizedDifference(ending.value, navEnding) !== 0)

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

  const calculatedEndingNav =
    beginningNav +
    depositValue +
    statementPeriodTotalPnl +
    interestAccrualChangeValue +
    otherFxTranslationsValue
  const difference = normalizedDifference(endingNav, calculatedEndingNav)
  const calculatedEndingFromChangeComponents =
    beginningNav +
    depositValue +
    markToMarketValue +
    dividendsValue +
    withholdingTaxValue +
    interestValue +
    otherFeesValue +
    commissionsValue +
    interestAccrualChangeValue +
    otherFxTranslationsValue
  const componentDifference = normalizedDifference(
    endingNav,
    calculatedEndingFromChangeComponents,
  )
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
      errors: ['The CSV file exceeds the parser safety limit.'],
      warnings: [],
    }
  }

  const errors: string[] = []
  const warnings: string[] = []
  let rows: string[][]
  try {
    rows = parseCsvRows(text, MAX_CSV_ROWS)
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : 'The CSV structure is malformed.'],
      warnings,
    }
  }

  if (rows.length < 3) {
    return { errors: ['The file does not contain enough CSV rows.'], warnings }
  }
  if (rows.length > MAX_CSV_ROWS) {
    return {
      errors: ['The CSV file contains too many rows for safe local processing.'],
      warnings,
    }
  }

  const store = buildSectionStore(rows)
  const sectionNames = listSectionNames(rows)
  const { start, end } = findStatementPeriod(rows, store)

  const statementRecords = recordsFor(store, ['Statement'])
  const statementTitle = findNamedValue(statementRecords, ['Title', 'Report'])
  if (statementTitle && !normalizeKey(statementTitle).includes('activitystatement')) {
    errors.push('Only an IBKR Activity Statement is accepted in this MVP.')
  }

  if (!start || !end) {
    errors.push('The statement period could not be detected. Export an English Activity Statement CSV.')
  }

  const currentDate =
    options.currentDate && !Number.isNaN(options.currentDate.getTime())
      ? options.currentDate
      : new Date()
  const currentDateIso = toIsoDate(currentDate)!
  const currentYear = currentDate.getFullYear()
  const startIso = toIsoDate(start)
  const endIso = toIsoDate(end)
  const seasonYear = end?.getFullYear() ?? currentYear
  const isYtd = Boolean(
    start &&
      end &&
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === 0 &&
      start.getDate() === 1,
  )

  if (start && end && !isYtd) {
    errors.push('Only a Year-to-Date statement beginning on January 1 is accepted in this MVP.')
  }
  if (startIso && endIso && startIso > endIso) {
    errors.push('The statement period start date is later than its end date.')
  }
  if (endIso && endIso > currentDateIso) {
    errors.push('A statement with a future end date is not accepted.')
  }
  if (end && seasonYear !== currentYear) {
    errors.push(`This MVP accepts the current ${currentYear} season only.`)
  }

  const accountRecords = recordsFor(store, ['Account Information'])
  const accountAliases = ['Account', 'Account ID', 'AccountID'].map(normalizeKey)
  const accountIds = new Set<string>()

  for (const record of accountRecords) {
    const fieldName = valueFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = valueFor(record, ['Field Value', 'Value'])
    if (fieldName && accountAliases.includes(normalizeKey(fieldName)) && fieldValue?.trim()) {
      accountIds.add(fieldValue.trim())
    }

    for (const [key, value] of Object.entries(record.fields)) {
      if (accountAliases.includes(normalizeKey(key)) && value.trim()) accountIds.add(value.trim())
    }
  }

  // Flex files with head/trailer records can carry one BOF record per account.
  for (const row of rows) {
    if (row[0]?.trim().toUpperCase() === 'BOF' && row[1]?.trim()) {
      accountIds.add(row[1].trim())
    }
  }

  if (accountIds.size === 0) {
    errors.push('The statement account identifier could not be detected.')
  } else if (accountIds.size > 1) {
    errors.push('This MVP accepts one IBKR account per statement. Consolidated or concatenated multi-account reports are not supported.')
  }

  const accountId = [...accountIds][0]
  const baseCurrencyAliases = ['Base Currency', 'BaseCurrency'].map(normalizeKey)
  const baseCurrencyCandidates = new Set<string>()

  for (const record of accountRecords) {
    const fieldName = valueFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = valueFor(record, ['Field Value', 'Value'])
    if (
      fieldName &&
      baseCurrencyAliases.includes(normalizeKey(fieldName)) &&
      fieldValue?.trim()
    ) {
      baseCurrencyCandidates.add(fieldValue.trim().toUpperCase())
    }

    for (const [key, value] of Object.entries(record.fields)) {
      if (baseCurrencyAliases.includes(normalizeKey(key)) && value.trim()) {
        baseCurrencyCandidates.add(value.trim().toUpperCase())
      }
    }
  }

  if (baseCurrencyCandidates.size === 0) {
    errors.push('The statement base currency could not be detected.')
  } else if (baseCurrencyCandidates.size > 1) {
    errors.push('Conflicting statement base currencies were found.')
  }

  const baseCurrency = normalizeCurrencyCode([...baseCurrencyCandidates][0])
  if (baseCurrencyCandidates.size === 1 && !baseCurrency) {
    errors.push('The statement base currency is not a valid three-letter currency code.')
  }

  const symbols = new Map<string, SymbolAccumulator>()
  const instrumentUnderlyings = buildInstrumentUnderlyingMap(store)
  const ytdRecords = recordsFor(store, [
    'Mark-to-Market Performance Summary',
    'Month & Year to Date Performance Summary',
    'Month and Year to Date Performance Summary',
    'Profit and Loss by Underlying Instruments',
  ])

  let ytdValueCount = 0
  let reportedAllAssetsYtdMtm: number | undefined
  let reportedAllAssetsSourceRefs: SourceRef[] = []
  const stockSourceRefs: SourceRef[] = []
  const optionSourceRefs: SourceRef[] = []
  const otherSourceRefs: SourceRef[] = []
  for (const record of ytdRecords) {
    const rawSymbol = valueFor(record, ['Symbol'])
    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    const normalizedAsset = normalizeKey(rawAsset ?? '')
    const normalizedSymbol = normalizeKey(rawSymbol ?? '')
    const ytdMtmMatch = numericMatchFor(record, [
      'YTD Mark-to-Market',
      'Mark-to-Market YTD',
      'YTD MTM P/L',
      'YTD MTM PNL',
      'YTD MTM',
      'Mark-to-Market P/L Total',
      'Mark-to-Market PNL Total',
    ])
    const ytdMtm = ytdMtmMatch?.value

    const isOverallTotal =
      normalizedAsset === 'totalallassets' ||
      normalizedAsset === 'totalallassetclasses' ||
      normalizedSymbol === 'totalallassets' ||
      normalizedSymbol === 'totalallassetclasses'

    if (isOverallTotal) {
      if (ytdMtmMatch) {
        if (
          reportedAllAssetsYtdMtm != null &&
          normalizedDifference(reportedAllAssetsYtdMtm, ytdMtmMatch.value) !== 0
        ) {
          errors.push('Conflicting all-assets YTD MTM totals were found in the performance section.')
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

    const assetClass = classifyAsset(rawAsset, rawSymbol ?? '')
    const underlying = deriveUnderlying(
      rawSymbol,
      valueFor(record, ['Underlying Symbol']),
      assetClass,
      instrumentUnderlyings,
    )
    if (isTotalRow(underlying)) continue

    const realizedShortMatch = numericMatchFor(record, [
      'YTD Realized S/T',
      'Realized S/T YTD',
      'Realized Short Term YTD',
      'Reazlied S/T YTD',
    ])
    const realizedLongMatch = numericMatchFor(record, [
      'YTD Realized L/T',
      'Realized L/T YTD',
      'Realized Long Term YTD',
    ])
    const realizedShort = realizedShortMatch?.value
    const realizedLong = realizedLongMatch?.value

    if (ytdMtm == null && realizedShort == null && realizedLong == null) continue
    if (ytdMtm != null) ytdValueCount += 1

    const accumulator = getAccumulator(
      symbols,
      underlying,
      valueFor(record, ['Description']),
    )
    const realized = (realizedShort ?? 0) + (realizedLong ?? 0)
    const mappingRefs = underlyingSourceRefs(
      record,
      rawSymbol,
      assetClass,
      instrumentUnderlyings,
    )
    const metricRefs = ytdMtmMatch
      ? dedupeSourceRefs([ytdMtmMatch.sourceRef, ...mappingRefs])
      : mappingRefs
    const realizedRefs = dedupeSourceRefs([
      ...(realizedShortMatch ? [realizedShortMatch.sourceRef] : []),
      ...(realizedLongMatch ? [realizedLongMatch.sourceRef] : []),
      ...mappingRefs,
    ])

    if (assetClass === 'OPTION') {
      accumulator.optionYtdMtm += ytdMtm ?? 0
      accumulator.optionRealizedYtd += realized
      if (ytdMtmMatch) {
        optionSourceRefs.push(...metricRefs)
        addSymbolSourceRefs(accumulator, 'optionYtdMtm', metricRefs)
      }
    } else if (assetClass === 'STOCK') {
      accumulator.stockYtdMtm += ytdMtm ?? 0
      accumulator.stockRealizedYtd += realized
      if (ytdMtmMatch) {
        stockSourceRefs.push(...metricRefs)
        addSymbolSourceRefs(accumulator, 'stockYtdMtm', metricRefs)
      }
    } else {
      accumulator.otherYtdMtm += ytdMtm ?? 0
      if (ytdMtmMatch) {
        otherSourceRefs.push(...metricRefs)
        addSymbolSourceRefs(accumulator, 'otherYtdMtm', metricRefs)
      }
    }

    if (realizedShort != null || realizedLong != null) accumulator.hasYtdRealized = true
    if (realizedRefs.length > 0) {
      addSymbolSourceRefs(accumulator, 'totalRealizedYtd', realizedRefs)
    }
  }

  if (ytdRecords.length === 0 || ytdValueCount === 0) {
    errors.push(
      'The Mark-to-Market performance section is missing or contains no YTD MTM values.',
    )
  }

  const realizedRecords = recordsFor(store, [
    'Realized & Unrealized Performance Summary',
    'Realized and Unrealized Performance Summary',
  ])

  if (realizedRecords.length === 0) {
    warnings.push('Current unrealized P&L could not be read because the realized/unrealized section is missing.')
  }

  for (const record of realizedRecords) {
    const rawSymbol = valueFor(record, ['Symbol'])
    const assetClass = classifyAsset(
      valueFor(record, ['Asset Class', 'Asset Category']),
      rawSymbol ?? '',
    )
    const underlying = deriveUnderlying(
      rawSymbol,
      valueFor(record, ['Underlying Symbol']),
      assetClass,
      instrumentUnderlyings,
    )
    if (isTotalRow(underlying)) continue

    const realizedMatch = numericMatchFor(record, [
      'Total Realized PNL',
      'Realized Total',
      'Total Realized P/L',
    ])
    const unrealizedMatch = numericMatchFor(record, [
      'Total Unrealized PNL',
      'Unrealized Total',
      'Total Unrealized P/L',
    ])
    const realized = realizedMatch?.value
    const unrealized = unrealizedMatch?.value
    if (realized == null && unrealized == null) continue

    const accumulator = getAccumulator(
      symbols,
      underlying,
      valueFor(record, ['Description']),
    )
    const mappingRefs = underlyingSourceRefs(
      record,
      rawSymbol,
      assetClass,
      instrumentUnderlyings,
    )

    if (!accumulator.hasYtdRealized && realized != null) {
      if (assetClass === 'OPTION') accumulator.optionRealizedYtd += realized
      if (assetClass === 'STOCK') accumulator.stockRealizedYtd += realized
    }
    if (realizedMatch && !accumulator.hasYtdRealized) {
      addSymbolSourceRefs(accumulator, 'totalRealizedYtd', [
        realizedMatch.sourceRef,
        ...mappingRefs,
      ])
    }

    if (unrealized != null) {
      if (assetClass === 'OPTION') accumulator.optionCurrentUnrealized += unrealized
      if (assetClass === 'STOCK') accumulator.stockCurrentUnrealized += unrealized
    }
    if (unrealizedMatch) {
      addSymbolSourceRefs(accumulator, 'totalCurrentUnrealized', [
        unrealizedMatch.sourceRef,
        ...mappingRefs,
      ])
    }
  }

  const events = parseOptionEvents(store, symbols, instrumentUnderlyings)

  const normalizedSymbols: SymbolPnl[] = [...symbols.values()]
    .map((item) => {
      item.totalYtdMtm = item.stockYtdMtm + item.optionYtdMtm + item.otherYtdMtm
      item.totalRealizedYtd = item.stockRealizedYtd + item.optionRealizedYtd
      item.totalCurrentUnrealized =
        item.stockCurrentUnrealized + item.optionCurrentUnrealized
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
        totalRealizedYtd: item.totalRealizedYtd,
        stockCurrentUnrealized: item.stockCurrentUnrealized,
        optionCurrentUnrealized: item.optionCurrentUnrealized,
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
        item.totalCurrentUnrealized !== 0 ||
        item.assignmentCount > 0 ||
        item.exerciseCount > 0 ||
        item.expirationCount > 0,
    )
    .sort((a, b) => b.totalYtdMtm - a.totalYtdMtm)

  if (normalizedSymbols.length === 0) {
    errors.push('No stock or option underlying rows could be parsed from the YTD statement.')
  }

  const stockPnl = normalizedSymbols.reduce((sum, item) => sum + item.stockYtdMtm, 0)
  const optionPnl = normalizedSymbols.reduce((sum, item) => sum + item.optionYtdMtm, 0)
  const otherPnl = normalizedSymbols.reduce((sum, item) => sum + item.otherYtdMtm, 0)
  const parsedAllAssetsYtdMtm = stockPnl + optionPnl + otherPnl
  if (reportedAllAssetsYtdMtm == null) {
    errors.push('The IBKR all-assets YTD MTM total is missing from the performance section.')
  }
  const seasonPnl = reportedAllAssetsYtdMtm ?? parsedAllAssetsYtdMtm
  const mtmReconciliationDifference =
    reportedAllAssetsYtdMtm == null
      ? undefined
      : normalizedDifference(reportedAllAssetsYtdMtm, parsedAllAssetsYtdMtm)
  const parsedAllAssetsSourceRefs = dedupeSourceRefs([
    ...stockSourceRefs,
    ...optionSourceRefs,
    ...otherSourceRefs,
  ])
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
    warnings.push(
      `IBKR reported all-assets YTD MTM minus the parsed detail sum is ${mtmReconciliationDifference.toFixed(6)} ${baseCurrency ?? 'BASE'}.`,
    )
  }

  if (otherPnl !== 0) {
    warnings.push('Non-stock and non-option performance is included in total season P&L as “Other”.')
  }
  if (events.length === 0) {
    warnings.push('No option assignment, exercise or expiration events were found.')
  }

  const netAssetValues = findNetAssetValues(store)
  const { netLiquidationValue, cashValue } = netAssetValues
  if (netLiquidationValue == null) {
    warnings.push('Net liquidation value was not found in the statement.')
  }

  const seasonReturnDiagnostic = findSeasonReturn(store)
  if (seasonReturnDiagnostic.conflict) {
    warnings.push('Conflicting IBKR TWR values were found; Season Return is unavailable.')
  }

  const statementDiagnostic = statementPnlDiagnostic(
    store,
    ytdRecords,
    reportedAllAssetsYtdMtm,
    reportedAllAssetsSourceRefs,
  )
  if (statementDiagnostic.check.status === 'WARNING') {
    warnings.push('Statement-period P&L does not reconcile to its supported named components.')
  }

  const nav = navDiagnostic(
    store,
    statementDiagnostic.statementPeriodTotalPnl,
    statementDiagnostic.sourceRefs,
    netAssetValues.beginningNav,
    netAssetValues.endingNav,
    netAssetValues.beginningNavSourceRefs,
    netAssetValues.endingNavSourceRefs,
  )
  if (nav.check.status === 'WARNING') {
    warnings.push('The NAV bridge is incomplete, conflicting, or outside the CSV precision tolerance.')
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
    'Non-stock and non-option performance is included in total season P&L as “Other”.',
    'No option assignment, exercise or expiration events were found.',
  ])
  const reconciliations = [mtmCheck, statementDiagnostic.check, nav.check]
  const hasIncompleteReconciliation = reconciliations.some(
    (check) => check.status !== 'PASS_EXACT' && check.status !== 'PASS_ROUNDED',
  )
  const hasQualityWarning =
    hasIncompleteReconciliation ||
    warnings.some((warning) => !informationalWarnings.has(warning))

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
    importedAt: new Date().toISOString(),
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
      stockPnl: dedupeSourceRefs(stockSourceRefs),
      optionPnl: dedupeSourceRefs(optionSourceRefs),
      otherPnl: dedupeSourceRefs(otherSourceRefs),
      seasonReturn: seasonReturnDiagnostic.sourceRefs,
      netLiquidationValue: netAssetValues.netLiquidationSourceRefs,
      cashValue: netAssetValues.cashSourceRefs,
      statementPeriodTotalPnl: statementDiagnostic.sourceRefs,
      beginningNav: nav.beginningSourceRefs,
      endingNav: nav.endingSourceRefs,
    },
    reconciliations,
    sections: sectionNames.sort(),
    warnings,
    dataQuality: hasQualityWarning ? 'warning' : 'good',
  }

  return { report, errors, warnings }
}
