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
  CsvRowTokenizer,
  CsvParseFailure,
  TextFingerprintAccumulator,
  fingerprintText,
  normalizeKey,
  parseDateFlexible,
  parseDateRange,
  parseNumber,
  parsePercent,
  sumExactNumbers,
  toIsoDate,
  visitBlobTextChunks,
  visitCsvRows,
} from './csv'
import {
  MAX_REPORT_EVENTS,
  MAX_REPORT_SECTIONS,
  MAX_REPORT_SOURCE_REF_OCCURRENCES,
  MAX_REPORT_UNDERLYINGS,
  MAX_SOURCE_REFS_PER_COLLECTION,
  parseResultFitsReportResourceBudget,
} from './reportCapacity'
import { Sha256TextAccumulator, sha256Hex } from './sha256'

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
  sharedFinancialInstruments: SharedFinancialInstrumentIndex
}

interface SharedFinancialInstrumentIndex {
  aliasStates: Map<string, string | null>
  contractAliases: Set<string>
  conflictingAliases: Set<string>
  hasConflicts: boolean
  mapping: Map<string, InstrumentUnderlying>
}

interface FinancialInstrumentScanResult extends SharedFinancialInstrumentIndex {
  fullAccountScopeValid: boolean
  referenceIdentitiesValid: boolean
  schemaFieldsValid: boolean
  sectionConflict: boolean
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

class InvalidAccountingSourceRefs extends Array<SourceRef> {
  override push(...refs: SourceRef[]): number {
    // Invalid source references are only used as a boolean failure signal.
    // Retaining the first one avoids attacker-controlled growth without
    // changing any calculation or user-facing diagnostic.
    if (this.length === 0 && refs.length > 0) super.push(refs[0])
    return this.length
  }
}

interface InstrumentUnderlyingCandidate {
  conflict: boolean
  sourceRefs: SourceRef[]
  underlying: string
}

type InstrumentUnderlyingCandidates = Map<
  string,
  InstrumentUnderlyingCandidate
>

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
const VERIFIED_MONTH_MTD_FIELD_ALIASES = [
  'MTD Mark-to-Market',
  'Mark-to-Market MTD',
  'MTD Realized S/T',
  'Realized S/T MTD',
  'MTD Realized L/T',
  'Realized L/T MTD',
]
const MTM_TOTAL_FIELD_ALIASES = [
  'Mark-to-Market P/L Total',
  'Mark-to-Market PNL Total',
  'Total',
]
const STATEMENT_PERIOD_TOTAL_FIELD_ALIASES = [
  ...MTM_TOTAL_FIELD_ALIASES,
  'Field Value',
  'Value',
  'Amount',
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
const FINANCIAL_INSTRUMENT_SECTION_ALIASES = [
  'Financial Instrument Information',
]
const MATERIALIZED_SECTION_ALIASES = [
  'Statement',
  'Account Information',
  'Trades',
  'Cash Report',
  'Change in NAV',
  'Total P/L for Statement Period',
  ...MTM_PERFORMANCE_SECTION_ALIASES,
  ...MONTH_YTD_PERFORMANCE_SECTION_ALIASES,
  ...REALIZED_PERFORMANCE_SECTION_ALIASES,
  ...NAV_SECTION_ALIASES,
  ...OPTION_LIFECYCLE_SECTION_ALIASES,
]
const KNOWN_SYNTHETIC_STATEMENTS = new Set([
  'a81d783777ab4bd84bf8066764425489be96d60f67270cbbc2ffebac495a0d7f',
  '80831483527003e501aa63f1691a2f155a37b8279f68e2e3e31cb244a219d7ff',
])

function knownSyntheticIdentity(text: string): string {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  return sha256Hex(normalized)
}

class SyntheticIdentityAccumulator {
  private readonly hash = new Sha256TextAccumulator()
  private atStart = true
  private pendingCarriageReturn = false
  private finalized = false

  update(chunk: string): void {
    if (this.finalized) {
      throw new Error('Synthetic identity accumulator is already finalized')
    }
    if (!chunk) return

    let index = 0
    if (this.atStart) {
      this.atStart = false
      if (chunk[0] === '\uFEFF') index = 1
    }

    let normalized = ''
    if (this.pendingCarriageReturn) {
      normalized = '\n'
      this.pendingCarriageReturn = false
      if (chunk[index] === '\n') index += 1
    }

    for (; index < chunk.length; index += 1) {
      const char = chunk[index]
      if (char !== '\r') {
        normalized += char
        continue
      }
      if (index + 1 >= chunk.length) {
        this.pendingCarriageReturn = true
      } else {
        normalized += '\n'
        if (chunk[index + 1] === '\n') index += 1
      }
    }
    if (normalized) this.hash.update(normalized)
  }

  digestHex(): string {
    if (this.finalized) {
      throw new Error('Synthetic identity accumulator is already finalized')
    }
    this.finalized = true
    if (this.pendingCarriageReturn) {
      this.hash.update('\n')
      this.pendingCarriageReturn = false
    }
    return this.hash.digestHex()
  }
}

export interface ParseIbkrActivityStatementOptions {
  accountComparisonSalt?: string
  currentDate?: Date
}

function reportCapacityFailure(): ParseResult {
  return {
    errors: [{ code: 'report_capacity_exceeded' }],
    warnings: [],
  }
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

function hasNonemptyCellsBeyondHeader(row: string[], headerFieldCount: number): boolean {
  for (let index = headerFieldCount + 2; index < row.length; index += 1) {
    if (row[index].trim()) return true
  }
  return false
}

interface HeaderBlockState {
  hasData: boolean
  incomplete: boolean
  sectionKey: string
  seenHeader: boolean
}

interface StatementIndex {
  bofAccountIds: string[]
  eofAccountIds: string[]
  bofPeriodConflict: boolean
  bofPeriodInvalid: boolean
  bofPeriodKeys: Set<string>
  firstBofPeriod?: { start?: Date; end?: Date }
  hasUnsupportedAccountBoundary: boolean
  hasUnmappedNonemptyCells: boolean
  headerBlockStates: Map<string, HeaderBlockState>
  rowCount: number
  sectionNames: string[]
  sectionOverflow: boolean
  store: Map<string, SectionRecord[]>
}

const MATERIALIZED_SECTION_NAMES = new Map<string, string>()
for (const alias of MATERIALIZED_SECTION_ALIASES) {
  const key = normalizeKey(alias)
  if (!MATERIALIZED_SECTION_NAMES.has(key)) {
    MATERIALIZED_SECTION_NAMES.set(key, alias)
  }
}
const MATERIALIZED_SECTION_KEYS = new Set(MATERIALIZED_SECTION_NAMES.keys())
const CONTROL_RECORD_SECTIONS = new Set(['BOF', 'EOF', 'BOS', 'EOS'])
const ACCOUNT_BOUNDARY_RECORD_TYPES = new Set(['BOA', 'EOA'])
const FLEX_NONZERO_AMOUNT_CHECKSUM_SECTION_CODES = new Set(['TRNT', 'TRNS', 'POST', 'POSS'])
const TRADES_SECTION_KEY = normalizeKey('Trades')

interface StatementIndexBuilder {
  finish(rowCount: number): StatementIndex
  visit(row: string[], rowNumber: number): void
}

function createStatementIndexBuilder(): StatementIndexBuilder {
  const store = new Map<string, SectionRecord[]>()
  const headersBySection = new Map<string, HeaderState>()
  const sectionNames = new Set<string>()
  const headerBlockStates = new Map<string, HeaderBlockState>()
  const bofAccountIds = new Set<string>()
  const eofAccountIds = new Set<string>()
  const bofPeriodKeys = new Set<string>()
  let bofPeriodConflict = false
  let bofPeriodInvalid = false
  let firstBofPeriod: StatementIndex['firstBofPeriod']
  let hasUnsupportedAccountBoundary = false
  let hasUnmappedNonemptyCells = false
  let sectionOverflow = false
  let lastTradesDataRow: {
    row: string[]
    rowNumber: number
    sourceIdentity: string
  } | undefined

  const visit = (row: string[], rowNumber: number): void => {
    const rawSection = row[0]?.trim() ?? ''
    const rawSectionUpper = rawSection.toUpperCase()

    if (rawSectionUpper === 'BOF') {
      // Official Flex BOF has eight fields. Extra populated cells are not
      // account or period metadata and must not disappear before indexing.
      if (row.slice(8).some((cell) => cell.trim())) hasUnmappedNonemptyCells = true
      const accountId = row[1]?.trim()
      if (!accountId) hasUnmappedNonemptyCells = true
      if (accountId && bofAccountIds.size < 2) bofAccountIds.add(accountId)
      // A numeric third field denotes the documented Flex section count.
      // Retain the previously supported non-Flex BOF period interpretation,
      // but reject an incomplete Flex file header rather than invent fields.
      if (/^\d+$/.test(row[2]?.trim() ?? '') && (
        row.length < 8 || row.slice(3, 8).some((cell) => !cell.trim())
      )) {
        hasUnmappedNonemptyCells = true
      }

      if (row.length >= 5) {
        const start = parseDateFlexible(row[3])
        const end = parseDateFlexible(row[4])
        if (!start || !end) bofPeriodInvalid = true
        firstBofPeriod ??= { start, end }
        const key = `${toIsoDate(start) ?? '!'}\u001f${toIsoDate(end) ?? '!'}`
        if (!bofPeriodKeys.has(key)) {
          if (bofPeriodKeys.size < 2) bofPeriodKeys.add(key)
          else bofPeriodConflict = true
        }
      }
    }
    // Official Flex EOF has only the marker and account ID. The account is
    // reconciled with other statement identities below, not silently dropped.
    if (rawSectionUpper === 'EOF') {
      const accountId = row[1]?.trim()
      if (!accountId || row.slice(2).some((cell) => cell.trim())) {
        hasUnmappedNonemptyCells = true
      }
      if (accountId && eofAccountIds.size < 2) eofAccountIds.add(accountId)
    }
    // BOA/EOA denote account boundaries, but the available Flex guide gives
    // no payload or pairing layout. Even an empty marker cannot be assigned
    // safely to the one supported account, including in an unused section.
    if (
      ACCOUNT_BOUNDARY_RECORD_TYPES.has(rawSectionUpper) ||
      (row.length >= 2 &&
        ACCOUNT_BOUNDARY_RECORD_TYPES.has(row[1].trim().toUpperCase()))
    ) {
      hasUnsupportedAccountBoundary = true
      return
    }

    if (rawSection && !CONTROL_RECORD_SECTIONS.has(rawSectionUpper)) {
      const canonical = canonicalSectionName(rawSection)
      if (normalizeSchemaKey(canonical) && !sectionNames.has(canonical)) {
        sectionNames.add(canonical)
        if (sectionNames.size > MAX_REPORT_SECTIONS) sectionOverflow = true
      }
    }

    // Once the section cap is known to be exceeded, keep validating CSV syntax
    // and the row limit but stop retaining further attacker-controlled rows.
    if (sectionOverflow || row.length < 2) return

    const descriptor = row[1].trim().toUpperCase()
    const sourceIdentity = sourceSectionIdentity(rawSection)
    const canonicalSection = canonicalSectionName(rawSection)
    const sectionKey = normalizeSchemaKey(canonicalSection)
    if (!sourceIdentity || !sectionKey) return
    const section = MATERIALIZED_SECTION_NAMES.get(sectionKey)
    if (!section) return

    const headerBlockState = headerBlockStates.get(sourceIdentity) ?? {
      hasData: false,
      incomplete: false,
      sectionKey,
      seenHeader: false,
    }
    if (descriptor === 'HEADER') {
      if (headerBlockState.seenHeader && !headerBlockState.hasData) {
        headerBlockState.incomplete = true
      }
      headerBlockState.seenHeader = true
      headerBlockState.hasData = false
      headerBlockStates.set(sourceIdentity, headerBlockState)
    } else if (
      headerBlockState.seenHeader &&
      ['DATA', 'SUBTOTAL', 'TOTAL'].includes(descriptor)
    ) {
      headerBlockState.hasData = true
      headerBlockStates.set(sourceIdentity, headerBlockState)
    }

    // Official Flex BOS and EOS layouts have one description or two numeric
    // checksums respectively; only Transactions/Positions sections may have
    // a nonzero amount checksum. Do not let a disguised financial row vanish
    // behind one of those otherwise legitimate control descriptors.
    if (descriptor === 'BOS') {
      if (row.slice(3).some((cell) => cell.trim())) hasUnmappedNonemptyCells = true
      return
    }
    if (descriptor === 'EOS') {
      const recordChecksum = parseNumber(row[2])
      const amountChecksum = parseNumber(row[3])
      if (
        recordChecksum == null ||
        !Number.isInteger(recordChecksum) ||
        recordChecksum < 0 ||
        amountChecksum == null ||
        (!FLEX_NONZERO_AMOUNT_CHECKSUM_SECTION_CODES.has(rawSectionUpper) && amountChecksum !== 0) ||
        row.slice(4).some((cell) => cell.trim())
      ) {
        hasUnmappedNonemptyCells = true
      }
      return
    }
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
    if (!isSupportedRecordType && !isKnownEmptyTotalPnl) {
      // A populated row in a registered section must not disappear merely
      // because its record-type token changed. It may carry an unaccounted
      // amount or identity even if all recognized totals still reconcile.
      if (row.slice(2).some((cell) => cell.trim())) {
        hasUnmappedNonemptyCells = true
      }
      return
    }

    let headerState = headersBySection.get(sourceIdentity)
    if (
      headerState &&
      hasNonemptyCellsBeyondHeader(row, headerState.headers.length)
    ) {
      // A populated unlabelled cell may be a shifted amount or lifecycle
      // code. Ignoring it can make a changed statement look reconciled.
      hasUnmappedNonemptyCells = true
      return
    }
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
      headerState &&
      hasNonemptyCellsBeyondHeader(row, headerState.headers.length)
    ) {
      hasUnmappedNonemptyCells = true
      return
    }

    if (isKnownEmptyTotalPnl) {
      if (!headerState || row.length < headerState.headers.length + 2) return
      if (
        row.length > headerState.headers.length + 2 &&
        !headerState.headers.some(
          (header, index) =>
            matchesSchemaAlias(header, STATEMENT_PERIOD_TOTAL_FIELD_ALIASES) &&
            Boolean(row[index + 2]?.trim()),
        )
      ) {
        // This headerless row may retain an older MTM column layout. Do not
        // remap its amount into another field (for example, Code) merely
        // because trailing cells are empty.
        return
      }
    }

    if (sectionKey === TRADES_SECTION_KEY && descriptor === 'DATA') {
      const previous = lastTradesDataRow
      if (
        previous?.rowNumber === rowNumber - 1 &&
        previous.sourceIdentity === sourceIdentity &&
        previous.row.length === row.length &&
        previous.row.every((cell, index) => cell === row[index])
      ) {
        // The later row has the same active header and fields as the first.
        // Keep the raw row count but retain only the first source row, just as
        // option-event and contract mapping deduplication already do.
        previous.rowNumber = rowNumber
        return
      }
      lastTradesDataRow = { row, rowNumber, sourceIdentity }
    }

    const headers = headerState?.headers
    const fields: Record<string, string> = {}

    if (headers) {
      headers.forEach((header, index) => {
        fields[header] = row[index + 2] ?? ''
      })
    } else {
      for (let index = 2; index < row.length; index += 1) {
        fields[`Column ${index - 1}`] = row[index]
      }
    }

    const records = store.get(sourceIdentity) ?? []
    records.push({
      section,
      fields,
      recordType: descriptor || 'EMPTY',
      rowNumber,
      headerSignature:
        headerState?.signature ?? fingerprintText(Object.keys(fields).join('\u001f')),
    })
    store.set(sourceIdentity, records)
  }

  return {
    visit,
    finish: (rowCount) => ({
      bofAccountIds: [...bofAccountIds],
      eofAccountIds: [...eofAccountIds],
      bofPeriodConflict,
      bofPeriodInvalid,
      bofPeriodKeys,
      firstBofPeriod,
      hasUnsupportedAccountBoundary,
      hasUnmappedNonemptyCells,
      headerBlockStates,
      rowCount,
      sectionNames: [...sectionNames],
      sectionOverflow,
      store,
    }),
  }
}

function buildStatementIndex(text: string): StatementIndex {
  const builder = createStatementIndexBuilder()
  const rowCount = visitCsvRows(text, builder.visit, MAX_CSV_ROWS)
  return builder.finish(rowCount)
}

function assertMaterializedSectionAliases(aliases: readonly string[]): void {
  for (const alias of aliases) {
    if (!MATERIALIZED_SECTION_KEYS.has(normalizeKey(alias))) {
      throw new Error(`Unregistered materialized section alias: ${alias}`)
    }
  }
}

function forEachRecordFor(
  store: Map<string, SectionRecord[]>,
  aliases: string[],
  visitor: (record: SectionRecord) => void,
): void {
  assertMaterializedSectionAliases(aliases)
  const normalizedAliases = schemaAliasMap(aliases)
  for (const records of store.values()) {
    const sectionKey = normalizeSchemaKey(records[0]?.section ?? '')
    if (!sectionKey || !normalizedAliases.has(sectionKey)) continue
    for (const record of records) visitor(record)
  }
}

function recordsFor(
  store: Map<string, SectionRecord[]>,
  aliases: string[],
): SectionRecord[] {
  const matches: SectionRecord[] = []
  forEachRecordFor(store, aliases, (record) => matches.push(record))
  return matches
}

function recordsForExclusive(
  store: Map<string, SectionRecord[]>,
  aliases: string[],
): { records: SectionRecord[]; alternatives: SectionRecord[][]; conflict: boolean } {
  assertMaterializedSectionAliases(aliases)
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
        records,
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

function hasEmptyHeaderBlock(
  states: Map<string, HeaderBlockState>,
  aliases: string[],
): boolean {
  const normalizedAliases = schemaAliasMap(aliases)
  return [...states.values()].some(
    (state) =>
      normalizedAliases.has(state.sectionKey) &&
      (state.incomplete || (state.seenHeader && !state.hasData)),
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
  if (result == null) markInvalidAccounting(invalidNumericFields, sourceRefs)
  return result
}

function markInvalidAccounting(
  invalidNumericFields: SourceRef[],
  sourceRefs: readonly SourceRef[],
): void {
  // Invalid references are only a boolean failure signal. Passing a large
  // attacker-controlled collection through a spread can itself overflow the
  // call stack before the parser returns its safe diagnostic.
  const first = sourceRefs[0]
  if (first) invalidNumericFields.push(first)
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
    Array<{ values: number[]; sourceRefs: BoundedSourceRefs }>
  >()
  const closedAssets = new Set<string>()
  let lastDetailAsset: string | undefined
  let valid = true

  const emptyMetricTotals = (): Array<{
    values: number[]
    sourceRefs: BoundedSourceRefs
  }> =>
    metricAliasGroups.map(() => ({
      values: [],
      sourceRefs: createBoundedSourceRefs(),
    }))

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
        addBoundedSourceRef(metricTotals[index].sourceRefs, match.sourceRef)
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
        metricTotals[index].sourceRefs.refs,
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
      (instrumentHasContractAlias(
        instrumentIndex,
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
    const detailValues: number[] = []
    const detailSourceRefs = createBoundedSourceRefs()
    for (const detail of details.values()) {
      detailValues.push(detail.value)
      for (const sourceRef of detail.sourceRefs) {
        addBoundedSourceRef(detailSourceRefs, sourceRef)
      }
    }
    const calculated = sumAccountingValues(
      detailValues,
      detailSourceRefs.refs,
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
  const shortDetailValues: number[] = []
  const longDetailValues: number[] = []
  const shortDetailSourceRefs = createBoundedSourceRefs()
  const longDetailSourceRefs = createBoundedSourceRefs()
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
    shortDetailValues.push(realizedShort.value)
    longDetailValues.push(realizedLong.value)
    addBoundedSourceRef(shortDetailSourceRefs, realizedShort.sourceRef)
    addBoundedSourceRef(longDetailSourceRefs, realizedLong.sourceRef)
  }

  const detailsMatch = (
    values: number[],
    sourceRefs: SourceRef[],
    reported: NumericMatch | undefined,
  ): boolean => {
    if (values.length === 0 || !reported) return false
    const calculated = sumAccountingValues(
      values,
      sourceRefs,
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
    detailsMatch(shortDetailValues, shortDetailSourceRefs.refs, reportedShort) &&
    detailsMatch(longDetailValues, longDetailSourceRefs.refs, reportedLong)
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

function hasUnmappedPerformanceAmountFields(
  records: SectionRecord[],
  supportedAliases: string[][],
): boolean {
  const supported = new Set(supportedAliases.flat().map(normalizeKey))
  return records.some((record) =>
    Object.entries(record.fields).some(([field, value]) => {
      if (!value.trim()) return false
      const key = normalizeSchemaKey(field)
      // Extra descriptive/Flex metadata can be harmless, but a populated
      // unrecognized performance column can change the economic meaning of
      // an otherwise exactly reconciled amount. Keep this a narrow guard;
      // it is not proof that every possible new broker column is covered.
      return Boolean(
        key &&
        /(pnl|pandl|profit|loss|mtm|marktomarket)/.test(key) &&
        !supported.has(key),
      )
    }),
  )
}

interface BoundedSourceRefs {
  refs: SourceRef[]
  keys: Set<string>
}

function sourceRefKey(ref: SourceRef): string {
  return [
    ref.source,
    ref.section,
    ref.recordType ?? '',
    ref.rowNumber ?? '',
    ref.pageNumber ?? '',
    ref.headerSignature ?? '',
    ref.field,
  ].join('|')
}

function createBoundedSourceRefs(): BoundedSourceRefs {
  return { refs: [], keys: new Set() }
}

function addBoundedSourceRef(target: BoundedSourceRefs, ref: SourceRef): void {
  // Preserve one overflow item (the 502nd unique reference) as a sticky
  // sentinel. This lets the final capacity gate distinguish an exact-limit
  // collection from an over-limit one without retaining unbounded input.
  if (target.refs.length > MAX_SOURCE_REFS_PER_COLLECTION) return
  const key = sourceRefKey(ref)
  if (target.keys.has(key)) return
  target.keys.add(key)
  target.refs.push(ref)
}

function dedupeSourceRefs(refs: SourceRef[]): SourceRef[] {
  const target = createBoundedSourceRefs()
  for (const ref of refs) {
    addBoundedSourceRef(target, ref)
    if (target.refs.length > MAX_SOURCE_REFS_PER_COLLECTION) break
  }
  return target.refs
}

function sourceRefCollectionsFitReportCapacity(
  collections: Array<readonly SourceRef[] | undefined>,
): boolean {
  let occurrences = 0
  for (const refs of collections) {
    if (!refs) continue
    if (refs.length > MAX_SOURCE_REFS_PER_COLLECTION) return false
    occurrences += refs.length
    if (occurrences > MAX_REPORT_SOURCE_REF_OCCURRENCES) return false
  }
  return true
}

function normalizedDifference(
  reported: number,
  calculated: number,
): number | undefined {
  const difference = signedCsvDifference(reported, calculated)
  if (difference == null) return undefined
  return Math.abs(difference) <= CSV_RECONCILIATION_EPSILON ? 0 : difference
}

function signedCsvDifference(
  reported: number,
  calculated: number,
): number | undefined {
  return sumExactNumbers([reported, -calculated])
}

function isWithinCsvTolerance(difference: number): boolean {
  return Math.abs(difference) <= CSV_RECONCILIATION_EPSILON
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
    /^(.+?)\s+\d{1,2}[A-Z]{3}(?:\d{2}|\d{4})\s+\d+(?:\.\d+)?\s+[CP]$/,
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
): void {
  const alias = normalizeInstrumentKey(aliasValue)
  const underlying = normalizeInstrumentKey(underlyingValue)
  if (!alias || !underlying) return

  const existing = candidates.get(alias)
  if (!existing) {
    candidates.set(alias, {
      conflict: false,
      sourceRefs: dedupeSourceRefs(sourceRefs),
      underlying,
    })
    return
  }
  if (existing.conflict || existing.underlying === underlying) return
  candidates.set(alias, {
    conflict: true,
    sourceRefs: [],
    underlying: existing.underlying,
  })
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

function instrumentHasContractAlias(
  instrumentIndex: InstrumentUnderlyingMapResult,
  aliasKey: string,
): boolean {
  return (
    instrumentIndex.contractAliases.has(aliasKey) ||
    instrumentIndex.sharedFinancialInstruments.contractAliases.has(aliasKey)
  )
}

function instrumentHasConflictingAlias(
  instrumentIndex: InstrumentUnderlyingMapResult,
  aliasKey: string,
): boolean {
  return (
    instrumentIndex.conflictingAliases.has(aliasKey) ||
    instrumentIndex.sharedFinancialInstruments.conflictingAliases.has(aliasKey)
  )
}

function instrumentMappingFor(
  instrumentIndex: InstrumentUnderlyingMapResult,
  aliasKey: string,
): InstrumentUnderlying | undefined {
  return (
    instrumentIndex.mapping.get(aliasKey) ??
    instrumentIndex.sharedFinancialInstruments.mapping.get(aliasKey)
  )
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
    if (
      assetClass === 'STOCK' &&
      aliasKey &&
      explicit.underlying &&
      explicit.underlying !== aliasKey
    ) {
      // A stock row cannot move its P&L to a different stock merely because
      // an optional Underlying field was added to the export.
      markInstrumentAliasConflict(instrumentIndex, aliasKey)
      return { sourceRefs: [], underlying: '' }
    }
    return explicit.underlying
      ? { sourceRefs: explicit.sourceRefs, underlying: explicit.underlying }
      : { sourceRefs: [], underlying: symbol }
  }

  if (explicit.conflict || instrumentHasConflictingAlias(instrumentIndex, aliasKey)) {
    markInstrumentAliasConflict(instrumentIndex, aliasKey)
    return { sourceRefs: [], underlying: '' }
  }

  const mapped = instrumentMappingFor(instrumentIndex, aliasKey)
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

function collectInstrumentLookupAliases(
  records: readonly SectionRecord[],
  aliases: Set<string> = new Set(),
): Set<string> {
  for (const record of records) {
    for (const match of fieldMatchesFor(record, [
      'Symbol',
      'Contract',
      'Underlying',
      'Underlying Symbol',
    ])) {
      const alias = normalizeInstrumentKey(match.value)
      if (alias) aliases.add(alias)
    }
  }
  return aliases
}

interface FinancialInstrumentIndexBuilder {
  finish(): FinancialInstrumentScanResult
  visit(row: string[], rowNumber: number): void
}

function createFinancialInstrumentIndexBuilder(
  neededAliases: Set<string>,
  expectedAccountId: string | undefined,
): FinancialInstrumentIndexBuilder {
  const aliasStates = new Map<string, string | null>()
  const requestedSourceRefs = new Map<string, BoundedSourceRefs>()
  const contractAliases = new Set<string>()
  const conflictingAliases = new Set<string>()
  const mapping = new Map<string, InstrumentUnderlying>()
  const headersBySection = new Map<string, HeaderState>()
  const sourceIdentities = new Set<string>()
  const financialInstrumentSectionKeys = schemaAliasMap(
    FINANCIAL_INSTRUMENT_SECTION_ALIASES,
  )
  const canonicalSection = FINANCIAL_INSTRUMENT_SECTION_ALIASES[0]
  let accountFieldExposed = false
  let accountFieldMissing = false
  let accountFieldInvalid = false
  let modelFieldExposed = false
  let modelFieldMissing = false
  let modelFieldInvalid = false
  let referenceIdentitiesValid = true
  let schemaFieldsValid = true
  let hasConflicts = false

  const markConflict = (alias: string): void => {
    hasConflicts = true
    if (!alias) return
    aliasStates.set(alias, null)
    requestedSourceRefs.delete(alias)
    if (neededAliases.has(alias)) conflictingAliases.add(alias)
  }

  const addCandidate = (
    aliasValue: string,
    underlying: string,
    sourceRefs: SourceRef[],
  ): void => {
    const alias = normalizeInstrumentKey(aliasValue)
    if (!alias) return
    const existing = aliasStates.get(alias)
    if (existing === null) return
    if (existing !== undefined && existing !== underlying) {
      markConflict(alias)
      return
    }
    aliasStates.set(alias, underlying)
    if (!neededAliases.has(alias)) return
    if (alias !== underlying) contractAliases.add(alias)
    const collector = requestedSourceRefs.get(alias) ?? createBoundedSourceRefs()
    for (const sourceRef of sourceRefs) addBoundedSourceRef(collector, sourceRef)
    requestedSourceRefs.set(alias, collector)
  }

  const inspectRecord = (record: SectionRecord): void => {
    if (!isReturnOnlyRecord(record)) {
      const accountMatches = fieldMatchesFor(record, ['Account ID', 'AccountID'])
      if (accountMatches.length > 0) accountFieldExposed = true
      else accountFieldMissing = true
      if (
        accountMatches.length > 0 &&
        (accountMatches.length !== 1 ||
          !accountMatches[0].value.trim() ||
          (expectedAccountId != null &&
            accountMatches[0].value.trim() !== expectedAccountId))
      ) {
        accountFieldInvalid = true
      }

      const modelMatches = fieldMatchesFor(record, ['Model'])
      if (modelMatches.length > 0) modelFieldExposed = true
      else modelFieldMissing = true
      if (
        modelMatches.length > 0 &&
        (modelMatches.length !== 1 || Boolean(modelMatches[0].value.trim()))
      ) {
        modelFieldInvalid = true
      }
    }

    const assetMatches = fieldMatchesFor(
      record,
      ASSET_IDENTITY_FIELD_ALIASES,
    )
    const symbolMatches = fieldMatchesFor(
      record,
      SYMBOL_IDENTITY_FIELD_ALIASES,
    )
    if (
      assetMatches.length !== 1 ||
      !assetMatches[0]?.value.trim() ||
      !normalizeSchemaKey(assetMatches[0]?.value ?? '') ||
      symbolMatches.length !== 1 ||
      !symbolMatches[0]?.value.trim()
    ) {
      referenceIdentitiesValid = false
    }
    if (
      assetMatches.length > 1 ||
      symbolMatches.length > 1 ||
      fieldMatchesFor(record, ['Description']).length > 1
    ) {
      schemaFieldsValid = false
    }

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
      return
    }
    const assetClass = classifyAsset(
      rawAsset,
      symbol ?? description ?? '',
    )
    const explicit = underlyingFieldsFor(record)
    const underlying = explicit.underlying

    if (assetClass !== 'OPTION') return
    if (explicit.conflict) {
      hasConflicts = true
      for (const alias of [symbol, description]) {
        if (alias?.trim()) markConflict(normalizeInstrumentKey(alias))
      }
      return
    }
    if (!underlying) return
    for (const alias of [symbol, description]) {
      if (alias?.trim()) {
        addCandidate(alias, underlying, explicit.sourceRefs)
      }
    }
  }

  const visit = (row: string[], rowNumber: number): void => {
    if (row.length < 2) return

    const rawSection = row[0].trim()
    const descriptor = row[1].trim().toUpperCase()
    if (descriptor === 'BOS' && row[2]) return

    const sourceIdentity = sourceSectionIdentity(rawSection)
    const sectionKey = normalizeSchemaKey(canonicalSectionName(rawSection))
    if (
      !sourceIdentity ||
      !sectionKey ||
      !financialInstrumentSectionKeys.has(sectionKey)
    ) {
      return
    }

    if (descriptor === 'HEADER') {
      const headers = uniqueHeaders(row.slice(2))
      headersBySection.set(sourceIdentity, {
        headers,
        signature: fingerprintText(headers.join('\u001f')),
        section: canonicalSection,
      })
      return
    }
    if (!['DATA', 'SUBTOTAL', 'TOTAL'].includes(descriptor)) return

    const headerState = headersBySection.get(sourceIdentity)
    if (
      headerState &&
      hasNonemptyCellsBeyondHeader(row, headerState.headers.length)
    ) {
      schemaFieldsValid = false
      return
    }
    const fields: Record<string, string> = {}
    if (headerState) {
      headerState.headers.forEach((header, index) => {
        fields[header] = row[index + 2] ?? ''
      })
    } else {
      for (let index = 2; index < row.length; index += 1) {
        fields[`Column ${index - 1}`] = row[index]
      }
    }

    sourceIdentities.add(sourceIdentity)
    inspectRecord({
      section: canonicalSection,
      fields,
      recordType: descriptor,
      rowNumber,
      headerSignature:
        headerState?.signature ??
        fingerprintText(Object.keys(fields).join('\u001f')),
    })
  }

  return {
    visit,
    finish: () => {
      for (const alias of neededAliases) {
        const underlying = aliasStates.get(alias)
        if (!underlying) continue
        mapping.set(alias, {
          underlying,
          sourceRefs: requestedSourceRefs.get(alias)?.refs ?? [],
        })
      }

      return {
        aliasStates,
        contractAliases,
        conflictingAliases,
        fullAccountScopeValid:
          (!accountFieldExposed ||
            (!accountFieldMissing && !accountFieldInvalid)) &&
          (!modelFieldExposed || (!modelFieldMissing && !modelFieldInvalid)),
        hasConflicts,
        mapping,
        referenceIdentitiesValid,
        schemaFieldsValid,
        sectionConflict: sourceIdentities.size > 1,
      }
    },
  }
}

function scanFinancialInstrumentIndex(
  text: string,
  neededAliases: Set<string>,
  expectedAccountId: string | undefined,
): FinancialInstrumentScanResult {
  const builder = createFinancialInstrumentIndexBuilder(
    neededAliases,
    expectedAccountId,
  )
  visitCsvRows(text, builder.visit, MAX_CSV_ROWS)
  return builder.finish()
}

function buildInstrumentUnderlyingMap(
  store: Map<string, SectionRecord[]>,
  contractIndexSectionAliases: string[],
  sharedFinancialInstruments: SharedFinancialInstrumentIndex,
  demandedAliases: ReadonlySet<string>,
): InstrumentUnderlyingMapResult {
  const authoritativeCandidates: InstrumentUnderlyingCandidates = new Map()
  const inferredCandidates: InstrumentUnderlyingCandidates = new Map()
  const contractAliases = new Set<string>()
  const conflictingAliases = new Set<string>()
  const mapping = new Map<string, InstrumentUnderlying>()
  let hasConflicts = sharedFinancialInstruments.hasConflicts

  forEachRecordFor(store, contractIndexSectionAliases, (record) => {
    const contractMatch = fieldFor(record, ['Symbol', 'Contract'])
    const contract = contractMatch?.value.trim()
    if (!contract) return

    const rawAsset = valueFor(record, ['Asset Class', 'Asset Category'])
    if (
      isAccountingTotalRow(
        record,
        normalizeSchemaKey(rawAsset ?? '') ?? '',
        normalizeSchemaKey(contract) ?? '',
      )
    ) {
      return
    }

    const assetClass = classifyAsset(
      rawAsset,
      contract,
    )
    if (assetClass !== 'OPTION') return

    const inferred = inferOptionUnderlyingFromContract(contract)
    if (isTotalRow(inferred ?? contract)) return

    const aliasKey = normalizeInstrumentKey(contract)
    const explicit = underlyingFieldsFor(record)
    if (explicit.conflict) {
      if (demandedAliases.has(aliasKey)) conflictingAliases.add(aliasKey)
      hasConflicts = true
      return
    }

    if (explicit.underlying) {
      if (
        demandedAliases.has(aliasKey) &&
        aliasKey !== explicit.underlying
      ) {
        contractAliases.add(aliasKey)
      }
      addInstrumentUnderlyingCandidate(
        authoritativeCandidates,
        contract,
        explicit.underlying,
        demandedAliases.has(aliasKey) ? explicit.sourceRefs : [],
      )
    }
    if (inferred && demandedAliases.has(aliasKey)) {
      contractAliases.add(aliasKey)
      addInstrumentUnderlyingCandidate(
        inferredCandidates,
        contract,
        inferred,
        [],
      )
    }
  })

  for (const [alias, authoritative] of authoritativeCandidates) {
    const sharedState = sharedFinancialInstruments.aliasStates.get(alias)
    if (sharedState === null) {
      if (demandedAliases.has(alias)) conflictingAliases.add(alias)
      hasConflicts = true
      continue
    }

    if (conflictingAliases.has(alias) || authoritative.conflict) {
      if (demandedAliases.has(alias)) conflictingAliases.add(alias)
      hasConflicts = true
      continue
    }
    if (
      sharedState !== undefined &&
      sharedState !== authoritative.underlying
    ) {
      if (demandedAliases.has(alias)) conflictingAliases.add(alias)
      hasConflicts = true
    } else if (sharedState === undefined && demandedAliases.has(alias)) {
      mapping.set(alias, {
        underlying: authoritative.underlying,
        sourceRefs: authoritative.sourceRefs,
      })
    }
  }

  for (const [alias, inferred] of inferredCandidates) {
    if (authoritativeCandidates.has(alias)) continue
    const sharedState = sharedFinancialInstruments.aliasStates.get(alias)
    if (sharedState === null) {
      if (demandedAliases.has(alias)) conflictingAliases.add(alias)
      hasConflicts = true
      continue
    }
    if (sharedState !== undefined) continue
    if (conflictingAliases.has(alias) || inferred.conflict) {
      if (demandedAliases.has(alias)) conflictingAliases.add(alias)
      hasConflicts = true
      continue
    }
    if (demandedAliases.has(alias)) {
      mapping.set(alias, {
        underlying: inferred.underlying,
        sourceRefs: inferred.sourceRefs,
      })
    }
  }

  return {
    contractAliases,
    conflictingAliases,
    hasConflicts,
    mapping,
    sharedFinancialInstruments,
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
  if (value !== trimmed) return undefined
  const hasPercentSuffix = trimmed.endsWith('%')
  if (trimmed.includes('%') && !hasPercentSuffix) return undefined
  const parsed = hasPercentSuffix ? parsePercent(trimmed) : parseNumber(trimmed)
  if (parsed == null) return undefined
  if (hasPercentSuffix) return parsed
  if (Math.abs(parsed) > 2) return parsed / 100
  return parsed
}

function findStatementPeriod(
  store: Map<string, SectionRecord[]>,
  firstBofPeriod: StatementIndex['firstBofPeriod'],
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

  return firstBofPeriod ?? {}
}

function inferEventType(value: string | undefined): OptionEvent['type'] | 'conflict' | undefined {
  if (!value) return undefined

  // Match complete event words and code tokens. Substring matching would
  // mistake "Cancelled Assignment" or "Exercise Reversal" for completed
  // positive events. A;P is the supported assignment-plus-P form.
  const tokens = value
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean)
  const normalized = tokens.join('')
  const containsLifecycleSignal = tokens.some((token) =>
    ['a', 'ex', 'ep', 'exdate', 'aex', 'mex', 'gea'].includes(token) ||
    /assign|exercis|expir/.test(token),
  ) || /^(?:a|ex|ep){2,}$/.test(normalized)
  if (!containsLifecycleSignal) return undefined
  if (/[^\x20-\x7E]/.test(value) || value.trim() !== value) return 'conflict'

  const types = new Set<OptionEvent['type']>()
  for (const token of tokens) {
    if (['assignment', 'assigned', 'a'].includes(token)) {
      types.add('assignment')
    } else if (['exercise', 'exercised', 'ex'].includes(token)) {
      types.add('exercise')
    } else if (['expiration', 'expired', 'ep'].includes(token)) {
      types.add('expiration')
    } else if (token !== 'p') {
      return 'conflict'
    }
  }
  if (types.size !== 1) return 'conflict'
  return types.values().next().value
}

function parseOptionEventDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const directDate = parseDateFlexible(value)
  if (directDate) return toIsoDate(directDate)

  // Activity Statement Trades can use "YYYY-MM-DD, HH:mm:ss". Keep the
  // complete English month-first date ("June 20, 2026") before stripping
  // only a recognizable, valid time suffix.
  const withTime = value.trim().match(/^(.*?)(?:[,;]\s*|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!withTime) return undefined
  const hour = Number(withTime[2])
  const minute = Number(withTime[3])
  const second = withTime[4] === undefined ? 0 : Number(withTime[4])
  if (hour > 23 || minute > 59 || second > 59) return undefined
  return toIsoDate(parseDateFlexible(withTime[1]))
}

const OPTION_EXPIRY_MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]

function optionEventContractIdentity(contract: string, underlying: string): string {
  const normalized = normalizeInstrumentKey(contract)
  const rawIdentity = JSON.stringify(['raw', normalized])
  const normalizedUnderlying = normalizeInstrumentKey(underlying)

  const spaced = normalized.match(
    /^([A-Z.\-]{1,8})\s+(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2}|\d{4})\s+(\d{1,5})(?:\.(\d{1,3}))?\s+([CP])$/,
  )
  const occ = normalized.match(
    /^([A-Z.\-]{1,8})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/,
  )
  if (!spaced && !occ) return rawIdentity

  const root = (spaced ?? occ)?.[1]
  if (!root || root !== normalizedUnderlying) return rawIdentity
  const yearText = spaced ? spaced[4] : occ?.[2]
  const year = yearText?.length === 4 ? Number(yearText) : 2000 + Number(yearText)
  const month = spaced
    ? OPTION_EXPIRY_MONTHS.indexOf(spaced[3]) + 1
    : Number(occ?.[3])
  const day = Number(spaced ? spaced[2] : occ?.[4])
  const expiry = new Date(Date.UTC(year, month - 1, day))
  if (
    expiry.getUTCFullYear() !== year ||
    expiry.getUTCMonth() !== month - 1 ||
    expiry.getUTCDate() !== day
  ) return rawIdentity

  const thousandths = spaced
    ? Number(spaced[5]) * 1000 + Number((spaced[6] ?? '').padEnd(3, '0'))
    : Number(occ?.[6])
  if (!Number.isInteger(thousandths) || thousandths < 1 || thousandths > 99_999_999) {
    return rawIdentity
  }
  return JSON.stringify([
    'series',
    root,
    `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    spaced ? spaced[7] : occ?.[5],
    String(thousandths).padStart(8, '0'),
  ])
}

function parseOptionEvents(
  eventRecords: SectionRecord[],
  symbols: Map<string, SymbolAccumulator>,
  instrumentIndex: InstrumentUnderlyingMapResult,
  startIso: string | undefined,
  endIso: string | undefined,
): {
  capacityExceeded: boolean
  invalidEventDate: boolean
  conflictingEventType: boolean
  invalidEventContract: boolean
  ambiguousEventIdentity: boolean
  events: OptionEvent[]
} {
  const events: OptionEvent[] = []
  const seen = new Map<string, string>()
  let invalidEventDate = false
  let conflictingEventType = false
  let invalidEventContract = false
  let ambiguousEventIdentity = false

  for (const record of eventRecords) {
    if (record.recordType !== 'DATA') continue
    const codeMatch = fieldFor(record, ['Transaction Type', 'Type', 'Code'])
    const type = inferEventType(codeMatch?.value)
    if (!type) continue
    if (type === 'conflict') {
      conflictingEventType = true
      continue
    }

    const contractMatch = fieldFor(record, ['Symbol', 'Contract'])
    const contract = contractMatch?.value
    if (!contract?.trim()) {
      invalidEventContract = true
      continue
    }
    const asset = classifyAsset(valueFor(record, ['Asset Class', 'Asset Category']), contract ?? '')
    if (
      asset !== 'OPTION' &&
      (instrumentHasContractAlias(
        instrumentIndex,
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
    const parsedDate = parseOptionEventDate(dateMatch?.value)
    if (
      !parsedDate ||
      (startIso !== undefined && parsedDate < startIso) ||
      (endIso !== undefined && parsedDate > endIso)
    ) {
      invalidEventDate = true
      continue
    }
    const key = JSON.stringify([
      normalizeInstrumentKey(underlying),
      optionEventContractIdentity(contract ?? '', underlying),
      parsedDate,
      type,
    ])
    const rowSignature = JSON.stringify([
      record.section,
      record.headerSignature,
      record.fields,
    ])
    const previousSignature = seen.get(key)
    if (previousSignature !== undefined) {
      // Repeated source rows with the same section, header and field values
      // keep the existing deduplication behavior. Different rows must
      // not silently disappear or be guessed to be independent events.
      if (previousSignature !== rowSignature) ambiguousEventIdentity = true
      continue
    }
    if (events.length >= MAX_REPORT_EVENTS) {
      return {
        capacityExceeded: true,
        invalidEventDate,
        conflictingEventType,
        invalidEventContract,
        ambiguousEventIdentity,
        events: [],
      }
    }
    seen.set(key, rowSignature)

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

  return {
    capacityExceeded: false,
    invalidEventDate,
    conflictingEventType,
    invalidEventContract,
    ambiguousEventIdentity,
    events: events.sort((a, b) => b.date.localeCompare(a.date)),
  }
}

function isOptionEventRecordCandidate(record: SectionRecord): boolean {
  if (record.recordType !== 'DATA') return false
  const type = inferEventType(
    valueFor(record, ['Transaction Type', 'Type', 'Code']),
  )
  const contract = valueFor(record, ['Symbol', 'Contract'])?.trim() ?? ''
  if (!type) return false
  return (
    classifyAsset(
      valueFor(record, ['Asset Class', 'Asset Category']),
      contract,
    ) === 'OPTION' ||
    inferOptionUnderlyingFromContract(contract) != null ||
    /[CP]\d{8}$/.test(contract)
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
  let navCashCount = 0
  let reportCashCount = 0
  let navCashValue: number | undefined
  let reportCashValue: number | undefined

  const recordNavCash = (match: NumericMatch): void => {
    navCashCount = Math.min(2, navCashCount + 1)
    navCashValue ??= match.value
  }
  const recordReportCash = (match: NumericMatch): void => {
    reportCashCount = Math.min(2, reportCashCount + 1)
    reportCashValue ??= match.value
  }

  for (const record of navRecords) {
    if (isWideNavRecord(record)) {
      const match = numericMatchFor(
        record,
        ['Cash'],
        invalidNumericFields,
        true,
      )
      if (match) recordNavCash(match)
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
    if (match) recordNavCash(match)
  }

  for (const record of cashRecords) {
    const candidate = cashReportBaseEndingCandidate(
      record,
      invalidNumericFields,
    )
    if (candidate.match) recordReportCash(candidate.match)
  }

  if (navCashCount > 1 || reportCashCount > 1) return false
  if (navCashCount === 0 || reportCashCount === 0) return true
  return normalizedDifference(navCashValue!, reportCashValue!) === 0
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
  const detailCurrentValues: number[] = []
  const detailPriorValues: number[] = []
  const detailChangeValues: number[] = []
  const detailCurrentSourceRefs = createBoundedSourceRefs()
  const detailPriorSourceRefs = createBoundedSourceRefs()
  const detailChangeSourceRefs = createBoundedSourceRefs()
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
      if (current) {
        detailCurrentValues.push(current.value)
        addBoundedSourceRef(detailCurrentSourceRefs, current.sourceRef)
      }
      if (prior) {
        detailPriorValues.push(prior.value)
        addBoundedSourceRef(detailPriorSourceRefs, prior.sourceRef)
      }
      if (change) {
        detailChangeValues.push(change.value)
        addBoundedSourceRef(detailChangeSourceRefs, change.sourceRef)
      }
    }
  }

  const detailsMatchReported = (
    values: number[],
    sourceRefs: SourceRef[],
    reported: NumericMatch | undefined,
  ): boolean => {
    if (!reported || values.length === 0) return false
    const calculated = sumAccountingValues(
      values,
      sourceRefs,
      invalidNumericFields,
    )
    return (
      calculated != null &&
      normalizedDifference(reported.value, calculated) === 0
    )
  }

  if (overallRows !== 1) valid = false
  if (
    !detailsMatchReported(
      detailCurrentValues,
      detailCurrentSourceRefs.refs,
      reportedCurrent,
    )
  ) {
    valid = false
  }
  if (
    requiresPrior &&
    !detailsMatchReported(
      detailPriorValues,
      detailPriorSourceRefs.refs,
      reportedPrior,
    )
  ) {
    valid = false
  }
  if (
    requiresChange &&
    !detailsMatchReported(
      detailChangeValues,
      detailChangeSourceRefs.refs,
      reportedChange,
    )
  ) {
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
  let candidateCount = 0
  let firstValue: number | undefined
  let conflict = false
  const sourceRefs = createBoundedSourceRefs()

  const recordCandidate = (value: number, sourceRef: SourceRef): void => {
    if (candidateCount === 0) firstValue = value
    else if (Math.abs(value - firstValue!) > 1e-12) conflict = true
    candidateCount += 1
    addBoundedSourceRef(sourceRefs, sourceRef)
  }

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
        recordCandidate(value, sourceRefFor(record, fieldValue.field))
      } else {
        invalidNumericFields.push(sourceRefFor(record, fieldValue.field))
      }
    }

    for (const match of fieldMatchesFor(record, aliases)) {
      const value = parseReturnValue(match.value)
      if (value != null) {
        recordCandidate(value, sourceRefFor(record, match.field))
      } else {
        invalidNumericFields.push(sourceRefFor(record, match.field))
      }
    }
  }

  if (candidateCount === 0) return { sourceRefs: [], conflict: false }
  return {
    value: conflict ? undefined : firstValue,
    sourceRefs: sourceRefs.refs,
    conflict,
  }
}

function findNamedNumeric(
  records: SectionRecord[],
  names: string[],
  invalidNumericFields: SourceRef[],
): { value?: number; sourceRefs: SourceRef[]; conflict: boolean } {
  let candidateCount = 0
  let firstValue: number | undefined
  let conflict = false
  const sourceRefs = createBoundedSourceRefs()

  const recordCandidate = (value: number, sourceRef: SourceRef): void => {
    if (candidateCount === 0) firstValue = value
    else if (
      Math.abs(value - firstValue!) > CSV_RECONCILIATION_EPSILON
    ) {
      conflict = true
    }
    candidateCount += 1
    addBoundedSourceRef(sourceRefs, sourceRef)
  }

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
        recordCandidate(value, sourceRefFor(record, fieldValue.field))
      } else {
        invalidNumericFields.push(sourceRefFor(record, fieldValue.field))
      }
    }

    for (const match of fieldMatchesFor(record, names)) {
      const value = parseNumber(match.value)
      if (value != null) {
        recordCandidate(value, sourceRefFor(record, match.field))
      } else {
        invalidNumericFields.push(sourceRefFor(record, match.field))
      }
    }
  }

  if (candidateCount === 0) return { sourceRefs: [], conflict: false }
  return {
    value: conflict ? undefined : firstValue,
    sourceRefs: sourceRefs.refs,
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
  let hasReportedValue = false
  let statementPeriodTotalPnl: number | undefined
  let reportedValueConflict = false
  const sourceRefCollector = createBoundedSourceRefs()
  for (const record of totalPnlRecords) {
    const candidate = numericMatchFor(
      record,
      STATEMENT_PERIOD_TOTAL_FIELD_ALIASES,
      invalidNumericFields,
      true,
    )
    if (!candidate) continue
    if (!hasReportedValue) {
      statementPeriodTotalPnl = candidate.value
      hasReportedValue = true
    } else if (candidate.value !== statementPeriodTotalPnl) {
      reportedValueConflict = true
    }
    addBoundedSourceRef(sourceRefCollector, candidate.sourceRef)
  }

  if (reportedValueConflict) {
    return {
      sourceRefs: sourceRefCollector.refs,
      check: {
        id: 'statement_period_pnl',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        tolerance: CSV_RECONCILIATION_EPSILON,
        sourceRefs: sourceRefCollector.refs,
      },
    }
  }

  if (statementPeriodTotalPnl == null || reportedAllAssetsYtdMtm == null) {
    return {
      statementPeriodTotalPnl,
      sourceRefs: sourceRefCollector.refs,
      check: {
        id: 'statement_period_pnl',
        status: 'NOT_AVAILABLE',
        reasonCode: 'source_missing',
        sourceRefs: dedupeSourceRefs([
          ...reportedAllAssetsSourceRefs,
          ...sourceRefCollector.refs,
        ]),
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
  const componentValues: number[] = []
  const componentSourceRefs = createBoundedSourceRefs()
  const unsupportedSourceRefs = createBoundedSourceRefs()
  let hasUnsupportedComponent = false

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
      componentValues.push(amount.value)
      addBoundedSourceRef(componentSourceRefs, amount.sourceRef)
    } else if (normalizedLabel && !normalizedLabel.startsWith('total')) {
      hasUnsupportedComponent = true
      addBoundedSourceRef(unsupportedSourceRefs, amount.sourceRef)
    }
  }

  const checkSourceRefs = dedupeSourceRefs([
    ...reportedAllAssetsSourceRefs,
    ...componentSourceRefs.refs,
    ...sourceRefCollector.refs,
    ...unsupportedSourceRefs.refs,
  ])
  const calculatedValue = sumAccountingValues(
    [reportedAllAssetsYtdMtm, ...componentValues],
    checkSourceRefs,
    invalidNumericFields,
  )
  if (calculatedValue == null) {
    return {
      statementPeriodTotalPnl,
      sourceRefs: sourceRefCollector.refs,
      check: {
        id: 'statement_period_pnl',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        tolerance: CSV_RECONCILIATION_EPSILON,
        sourceRefs: checkSourceRefs,
      },
    }
  }
  const difference = signedCsvDifference(statementPeriodTotalPnl, calculatedValue)
  if (difference == null) {
    markInvalidAccounting(invalidNumericFields, checkSourceRefs)
    return {
      statementPeriodTotalPnl,
      sourceRefs: sourceRefCollector.refs,
      check: {
        id: 'statement_period_pnl',
        status: 'WARNING',
        reasonCode: 'ambiguous_schema',
        tolerance: CSV_RECONCILIATION_EPSILON,
        sourceRefs: checkSourceRefs,
      },
    }
  }
  const withinTolerance = isWithinCsvTolerance(difference)
  const status = hasUnsupportedComponent || !withinTolerance ? 'WARNING' : 'PASS_EXACT'

  return {
    statementPeriodTotalPnl,
    sourceRefs: sourceRefCollector.refs,
    check: {
      id: 'statement_period_pnl',
      status,
      reportedValue: statementPeriodTotalPnl,
      calculatedValue,
      difference,
      tolerance: CSV_RECONCILIATION_EPSILON,
      reasonCode:
        hasUnsupportedComponent
          ? 'unsupported_component'
          : withinTolerance
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
  const unsupportedSourceRefs = createBoundedSourceRefs()
  let hasUnsupportedComponent = false
  for (const record of changeRecords) {
    const fieldName = fieldFor(record, ['Field Name', 'Name', 'Item'])
    const normalizedFieldName = fieldName?.value
      ? normalizeSchemaKey(fieldName.value)
      : undefined
    if (!fieldName?.value || (normalizedFieldName && supportedFieldNames.has(normalizedFieldName))) {
      continue
    }
    const fieldValue = fieldFor(record, ['Field Value', 'Value', 'Amount'])
    if (fieldValue) {
      hasUnsupportedComponent = true
      addBoundedSourceRef(
        unsupportedSourceRefs,
        sourceRefFor(record, fieldValue.field),
      )
    }
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
    ...unsupportedSourceRefs.refs,
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
    markInvalidAccounting(invalidNumericFields, allSourceRefs)
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
        status: conflicts || hasUnsupportedComponent ? 'WARNING' : 'NOT_AVAILABLE',
        reasonCode: conflicts
          ? 'ambiguous_schema'
          : hasUnsupportedComponent
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
  const difference = signedCsvDifference(endingNav, calculatedEndingNav)
  const componentDifference = normalizedDifference(
    endingNav,
    calculatedEndingFromChangeComponents,
  )
  if (difference == null || componentDifference == null) {
    markInvalidAccounting(invalidNumericFields, allSourceRefs)
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
    hasUnsupportedComponent ||
    !isWithinCsvTolerance(difference) ||
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
        : hasUnsupportedComponent
          ? 'unsupported_component'
          : isWithinCsvTolerance(difference) && componentDifference === 0
          ? 'within_tolerance'
          : 'difference_exceeds_tolerance',
      sourceRefs: allSourceRefs,
    },
  }
}

interface FinancialInstrumentScanRequirements {
  expectedAccountId?: string
  neededAliases: Set<string>
}

function financialInstrumentScanRequirements(
  statementIndex: StatementIndex,
): FinancialInstrumentScanRequirements {
  const { store } = statementIndex
  const accountAliases = ['Account', 'Account ID', 'AccountID']
  const accountRecords = recordsFor(store, ['Account Information'])
  const navMetadataRecords = recordsFor(store, NAV_SECTION_ALIASES)
  const accountIds = new Set<string>()

  for (const record of accountRecords) {
    const fieldName = valueFor(record, ['Field Name', 'Name', 'Item'])
    const fieldValue = valueFor(record, ['Field Value', 'Value'])
    if (
      fieldName &&
      matchesSchemaAlias(fieldName, accountAliases) &&
      fieldValue?.trim()
    ) {
      accountIds.add(fieldValue.trim())
    }
    for (const match of fieldMatchesFor(record, accountAliases)) {
      if (match.value.trim()) accountIds.add(match.value.trim())
    }
  }
  for (const record of navMetadataRecords) {
    for (const match of fieldMatchesFor(record, accountAliases)) {
      if (match.value.trim()) accountIds.add(match.value.trim())
    }
  }
  for (const bofAccountId of statementIndex.bofAccountIds) {
    accountIds.add(bofAccountId)
  }
  for (const eofAccountId of statementIndex.eofAccountIds) {
    accountIds.add(eofAccountId)
  }

  const lifecycleEventRecords = recordsForExclusive(
    store,
    OPTION_LIFECYCLE_SECTION_ALIASES,
  ).records.filter((record) => record.recordType === 'DATA')
  const tradeEventRecords = recordsForExclusive(store, ['Trades']).records.filter(
    isOptionEventRecordCandidate,
  )
  const selectedEventRecords =
    lifecycleEventRecords.length > 0
      ? lifecycleEventRecords
      : tradeEventRecords
  const neededAliases = collectInstrumentLookupAliases(
    recordsForExclusive(store, MTM_PERFORMANCE_SECTION_ALIASES).records,
  )
  collectInstrumentLookupAliases(
    recordsForExclusive(store, MONTH_YTD_PERFORMANCE_SECTION_ALIASES).records,
    neededAliases,
  )
  collectInstrumentLookupAliases(
    recordsForExclusive(store, REALIZED_PERFORMANCE_SECTION_ALIASES).records,
    neededAliases,
  )
  collectInstrumentLookupAliases(selectedEventRecords, neededAliases)

  return {
    expectedAccountId: [...accountIds][0],
    neededAliases,
  }
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

interface IndexedStatementSource {
  fingerprint(): string
  knownSyntheticIdentity(): string
  scanFinancialInstruments(
    neededAliases: Set<string>,
    expectedAccountId: string | undefined,
  ): FinancialInstrumentScanResult
}

function csvFailureResult(error: unknown): ParseResult {
  return {
    errors: [
      {
        code: error instanceof CsvParseFailure ? error.code : 'csv_malformed',
      },
    ],
    warnings: [],
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

  let statementIndex: StatementIndex
  try {
    statementIndex = buildStatementIndex(text)
  } catch (error) {
    return csvFailureResult(error)
  }

  return parseIndexedStatement(statementIndex, options, {
    // Blob.text() consumes a leading UTF-8 BOM. Keep the direct string entry
    // equivalent so the same statement does not acquire two fingerprints.
    fingerprint: () => fingerprintText(text.replace(/^\uFEFF/, '')),
    knownSyntheticIdentity: () => knownSyntheticIdentity(text),
    scanFinancialInstruments: (neededAliases, expectedAccountId) =>
      scanFinancialInstrumentIndex(text, neededAliases, expectedAccountId),
  })
}

export async function parseIbkrActivityStatementBlob(
  blob: Blob,
  options: ParseIbkrActivityStatementOptions = {},
): Promise<ParseResult> {
  const statementBuilder = createStatementIndexBuilder()
  const statementTokenizer = new CsvRowTokenizer(
    statementBuilder.visit,
    MAX_CSV_ROWS,
  )
  const fingerprint = new TextFingerprintAccumulator()
  const syntheticIdentity = new SyntheticIdentityAccumulator()
  let decodedCharacters = 0
  let statementIndex: StatementIndex

  try {
    await visitBlobTextChunks(blob, (chunk) => {
      decodedCharacters += chunk.length
      if (decodedCharacters > MAX_CSV_CHARACTERS) {
        throw new CsvParseFailure('csv_too_large')
      }
      fingerprint.update(chunk)
      syntheticIdentity.update(chunk)
      statementTokenizer.write(chunk)
    })
    statementIndex = statementBuilder.finish(statementTokenizer.finish())
  } catch (error) {
    if (error instanceof CsvParseFailure) return csvFailureResult(error)
    throw error
  }

  if (statementIndex.rowCount < 3) {
    return { errors: [{ code: 'csv_not_enough_rows' }], warnings: [] }
  }
  if (statementIndex.sectionOverflow) return reportCapacityFailure()

  const requirements = financialInstrumentScanRequirements(statementIndex)
  const financialInstrumentBuilder = createFinancialInstrumentIndexBuilder(
    requirements.neededAliases,
    requirements.expectedAccountId,
  )
  const financialInstrumentTokenizer = new CsvRowTokenizer(
    financialInstrumentBuilder.visit,
    MAX_CSV_ROWS,
  )
  let financialInstrumentIndex: FinancialInstrumentScanResult
  try {
    await visitBlobTextChunks(blob, (chunk) => {
      financialInstrumentTokenizer.write(chunk)
    })
    financialInstrumentTokenizer.finish()
    financialInstrumentIndex = financialInstrumentBuilder.finish()
  } catch (error) {
    if (error instanceof CsvParseFailure) return csvFailureResult(error)
    throw error
  }

  let syntheticIdentityHex: string | undefined
  return parseIndexedStatement(statementIndex, options, {
    fingerprint: () => fingerprint.digestHex(),
    knownSyntheticIdentity: () => {
      syntheticIdentityHex ??= syntheticIdentity.digestHex()
      return syntheticIdentityHex
    },
    scanFinancialInstruments: (neededAliases, expectedAccountId) => {
      if (
        expectedAccountId !== requirements.expectedAccountId ||
        !setsEqual(neededAliases, requirements.neededAliases)
      ) {
        throw new Error('Financial instrument scan requirements changed')
      }
      return financialInstrumentIndex
    },
  })
}

function parseIndexedStatement(
  statementIndex: StatementIndex,
  options: ParseIbkrActivityStatementOptions,
  source: IndexedStatementSource,
): ParseResult {
  const errors: ParserDiagnostic[] = []
  const warnings: ParserDiagnostic[] = []

  if (statementIndex.rowCount < 3) {
    return { errors: [{ code: 'csv_not_enough_rows' }], warnings }
  }
  if (statementIndex.sectionOverflow) return reportCapacityFailure()
  if (statementIndex.hasUnsupportedAccountBoundary) {
    return { errors: [{ code: 'account_boundary_unsupported' }], warnings }
  }
  if (statementIndex.hasUnmappedNonemptyCells) {
    return { errors: [{ code: 'accounting_section_conflict' }], warnings }
  }

  const { sectionNames, store } = statementIndex
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
  const { start, end } = findStatementPeriod(
    store,
    statementIndex.firstBofPeriod,
  )
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
  const expectedBofPeriodKey = `${startIso ?? '!'}\u001f${endIso ?? '!'}`
  if (
    statementIndex.bofPeriodConflict ||
    statementIndex.bofPeriodInvalid ||
    [...statementIndex.bofPeriodKeys].some(
      (periodKey) => periodKey !== expectedBofPeriodKey,
    )
  ) {
    statementSchemaConflict = true
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
  for (const bofAccountId of statementIndex.bofAccountIds) {
    accountIds.add(bofAccountId)
  }
  for (const eofAccountId of statementIndex.eofAccountIds) {
    accountIds.add(eofAccountId)
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
  const selectedEventRecords =
    lifecycleEventRecords.length > 0
      ? lifecycleEventRecords
      : tradeEventRecords
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
  const selectedEventMappingSectionAliases =
    lifecycleEventRecords.length > 0
      ? OPTION_LIFECYCLE_SECTION_ALIASES
      : ['Trades']
  const commonOptionContractIndexSectionAliases = [
    ...REALIZED_PERFORMANCE_SECTION_ALIASES,
    ...selectedEventMappingSectionAliases,
  ]
  const mtmInstrumentMappingSectionAliases =
    ytdInstrumentMappingSectionAliases(
      'MTM',
      commonOptionContractIndexSectionAliases,
    )
  const monthYtdInstrumentMappingSectionAliases =
    ytdInstrumentMappingSectionAliases(
      'MONTH_YTD',
      commonOptionContractIndexSectionAliases,
    )
  const demandedInstrumentAliases = collectInstrumentLookupAliases(mtmRecords)
  collectInstrumentLookupAliases(
    monthYtdRecords,
    demandedInstrumentAliases,
  )
  collectInstrumentLookupAliases(
    realizedRecords,
    demandedInstrumentAliases,
  )
  collectInstrumentLookupAliases(
    selectedEventRecords,
    demandedInstrumentAliases,
  )
  let sharedFinancialInstruments: FinancialInstrumentScanResult
  try {
    sharedFinancialInstruments = source.scanFinancialInstruments(
      demandedInstrumentAliases,
      accountId,
    )
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
  // Mixed-family equivalence must resolve each source independently. Letting
  // one YTD family contribute aliases to the other would allow a wrong
  // Underlying value to make both snapshots repeat the same error.
  const mtmInstrumentMappingResult = buildInstrumentUnderlyingMap(
    store,
    mtmInstrumentMappingSectionAliases,
    sharedFinancialInstruments,
    demandedInstrumentAliases,
  )
  const monthYtdInstrumentMappingResult = buildInstrumentUnderlyingMap(
    store,
    monthYtdInstrumentMappingSectionAliases,
    sharedFinancialInstruments,
    demandedInstrumentAliases,
  )
  // Global FII aliases are needed only while both isolated family maps are
  // checked. Release attacker-controlled unused keys before report assembly.
  sharedFinancialInstruments.aliasStates.clear()
  const invalidAccountingFields: SourceRef[] = new InvalidAccountingSourceRefs()
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
  ].some((aliases) =>
    hasEmptyHeaderBlock(statementIndex.headerBlockStates, aliases),
  )
  let accountingSectionConflict =
    statementSchemaConflict ||
    hasIncompleteCriticalHeaderBlock ||
    sharedFinancialInstruments.sectionConflict ||
    mtmSection.conflict ||
    monthYtdSection.conflict ||
    mtmInstrumentMappingResult.hasConflicts ||
    monthYtdInstrumentMappingResult.hasConflicts ||
    mtmSnapshot?.conflict === true ||
    monthYtdSnapshot?.conflict === true
  accountingSectionConflict ||= hasUnmappedPerformanceAmountFields(mtmRecords, [
    MTM_POSITION_FIELD_ALIASES,
    MTM_TRANSACTION_FIELD_ALIASES,
    MTM_COMMISSION_FIELD_ALIASES,
    MTM_OTHER_FIELD_ALIASES,
    MTM_TOTAL_FIELD_ALIASES,
  ])
  accountingSectionConflict ||= hasUnmappedPerformanceAmountFields(monthYtdRecords, [
    MONTH_YTD_MTM_FIELD_ALIASES,
    VERIFIED_MONTH_MTD_FIELD_ALIASES,
    YTD_REALIZED_SHORT_FIELD_ALIASES,
    YTD_REALIZED_LONG_FIELD_ALIASES,
  ])
  accountingSectionConflict ||= hasUnmappedPerformanceAmountFields(realizedRecords, [
    REALIZED_SHORT_PROFIT_FIELD_ALIASES,
    REALIZED_SHORT_LOSS_FIELD_ALIASES,
    REALIZED_LONG_PROFIT_FIELD_ALIASES,
    REALIZED_LONG_LOSS_FIELD_ALIASES,
    UNREALIZED_SHORT_PROFIT_FIELD_ALIASES,
    UNREALIZED_SHORT_LOSS_FIELD_ALIASES,
    UNREALIZED_LONG_PROFIT_FIELD_ALIASES,
    UNREALIZED_LONG_LOSS_FIELD_ALIASES,
    UNREALIZED_PROFIT_FIELD_ALIASES,
    UNREALIZED_LOSS_FIELD_ALIASES,
    REALIZED_TOTAL_FIELD_ALIASES,
    UNREALIZED_TOTAL_FIELD_ALIASES,
    REALIZED_AND_UNREALIZED_TOTAL_FIELD_ALIASES,
  ])
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
    !sharedFinancialInstruments.fullAccountScopeValid ||
    !sharedFinancialInstruments.referenceIdentitiesValid ||
    !sharedFinancialInstruments.schemaFieldsValid
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
  const stockNumericSourceRefs = createBoundedSourceRefs()
  const optionNumericSourceRefs = createBoundedSourceRefs()
  const otherNumericSourceRefs = createBoundedSourceRefs()
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
        addBoundedSourceRef(optionNumericSourceRefs, ytdMtmMatch.sourceRef)
        addSymbolSourceRefs(accumulator, 'optionYtdMtm', metricRefs)
      }
    } else if (assetClass === 'STOCK') {
      accumulator.stockYtdMtm = addAccountingMatch(
        accumulator.stockYtdMtm,
        ytdMtmMatch,
        invalidAccountingFields,
      )
      if (ytdMtmMatch) {
        addBoundedSourceRef(stockNumericSourceRefs, ytdMtmMatch.sourceRef)
        addSymbolSourceRefs(accumulator, 'stockYtdMtm', metricRefs)
      }
    } else {
      accumulator.otherYtdMtm = addAccountingMatch(
        accumulator.otherYtdMtm,
        ytdMtmMatch,
        invalidAccountingFields,
      )
      if (ytdMtmMatch) {
        addBoundedSourceRef(otherNumericSourceRefs, ytdMtmMatch.sourceRef)
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
      (instrumentHasContractAlias(
        primaryYtdInstrumentMappingResult,
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
  const eventRecords = selectedEventRecords
  const optionMappingEventRecords = [
    ...lifecycleEventSection.records,
    ...tradeEventSection.records,
  ]
  // Dedicated rows own the count, but a contradictory lifecycle code in the
  // unused Trades fallback must not be hidden by source precedence.
  const conflictingCodeInAnyEventSection = optionMappingEventRecords.some(
    (record) =>
      isOptionEventRecordCandidate(record) &&
      inferEventType(valueFor(record, ['Transaction Type', 'Type', 'Code'])) === 'conflict',
  )
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
  const eventResult = parseOptionEvents(
    eventRecords,
    symbols,
    primaryYtdInstrumentMappingResult,
    startIso,
    endIso,
  )
  if (eventResult.capacityExceeded) return reportCapacityFailure()
  const events = eventResult.events
  if (eventResult.invalidEventDate) {
    errors.push({ code: 'option_event_date_invalid' })
  }
  if (eventResult.conflictingEventType || conflictingCodeInAnyEventSection) {
    errors.push({ code: 'option_event_type_conflict' })
  }
  if (eventResult.invalidEventContract) {
    errors.push({ code: 'accounting_section_conflict' })
  }
  if (eventResult.ambiguousEventIdentity) {
    errors.push({ code: 'option_event_identity_conflict' })
  }
  if (primaryYtdInstrumentMappingResult.hasConflicts) {
    errors.push({ code: 'instrument_alias_conflict' })
  }

  const normalizedSymbols: SymbolPnl[] = []
  for (const item of symbols.values()) {
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

    const retained =
      item.totalYtdMtm !== 0 ||
      item.totalRealizedYtd !== 0 ||
      item.totalCurrentUnrealized !== 0 ||
      item.assignmentCount > 0 ||
      item.exerciseCount > 0 ||
      item.expirationCount > 0
    if (!retained) continue
    if (normalizedSymbols.length >= MAX_REPORT_UNDERLYINGS) {
      return reportCapacityFailure()
    }

    normalizedSymbols.push({
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
    })
  }
  normalizedSymbols.sort((a, b) => b.totalYtdMtm - a.totalYtdMtm)

  if (normalizedSymbols.length === 0) {
    errors.push({ code: 'underlyings_missing' })
  }

  const stockPnl =
    sumAccountingValues(
      normalizedSymbols.map((item) => item.stockYtdMtm),
      stockNumericSourceRefs.refs,
      invalidAccountingFields,
    ) ?? 0
  const optionPnl =
    sumAccountingValues(
      normalizedSymbols.map((item) => item.optionYtdMtm),
      optionNumericSourceRefs.refs,
      invalidAccountingFields,
    ) ?? 0
  const otherPnl =
    sumAccountingValues(
      normalizedSymbols.map((item) => item.otherYtdMtm),
      otherNumericSourceRefs.refs,
      invalidAccountingFields,
    ) ?? 0
  const parsedAllAssetsSourceRefs = dedupeSourceRefs([
    ...stockNumericSourceRefs.refs,
    ...optionNumericSourceRefs.refs,
    ...otherNumericSourceRefs.refs,
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
      : signedCsvDifference(reportedAllAssetsYtdMtm, parsedAllAssetsYtdMtm)
  if (
    reportedAllAssetsYtdMtm != null &&
    mtmReconciliationDifference == null
  ) {
    markInvalidAccounting(invalidAccountingFields, [
      ...reportedAllAssetsSourceRefs,
      ...parsedAllAssetsSourceRefs,
    ])
  }
  const mtmCheck: ReconciliationCheck = {
    id: 'mtm_all_assets',
    status:
      reportedAllAssetsYtdMtm == null
        ? 'BLOCKED'
        : mtmReconciliationDifference != null && isWithinCsvTolerance(mtmReconciliationDifference)
          ? 'PASS_EXACT'
          : 'WARNING',
    reportedValue: reportedAllAssetsYtdMtm,
    calculatedValue: parsedAllAssetsYtdMtm,
    difference: mtmReconciliationDifference,
    tolerance: CSV_RECONCILIATION_EPSILON,
    reasonCode:
      reportedAllAssetsYtdMtm == null
        ? 'source_missing'
        : mtmReconciliationDifference != null && isWithinCsvTolerance(mtmReconciliationDifference)
          ? 'within_tolerance'
          : 'difference_exceeds_tolerance',
    sourceRefs: dedupeSourceRefs([
      ...reportedAllAssetsSourceRefs,
      ...parsedAllAssetsSourceRefs,
    ]),
  }

  if (
    mtmReconciliationDifference != null &&
    !isWithinCsvTolerance(mtmReconciliationDifference)
  ) {
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
  const metricSourceRefs: PortfolioReport['metricSourceRefs'] = {
    seasonPnl: reportedAllAssetsSourceRefs,
    reportedAllAssetsYtdMtm: reportedAllAssetsSourceRefs,
    parsedAllAssetsYtdMtm: parsedAllAssetsSourceRefs,
    stockPnl: dedupeSourceRefs(stockNumericSourceRefs.refs),
    optionPnl: dedupeSourceRefs(optionNumericSourceRefs.refs),
    otherPnl: dedupeSourceRefs(otherNumericSourceRefs.refs),
    seasonReturn: seasonReturnDiagnostic.sourceRefs,
    netLiquidationValue: netAssetValues.netLiquidationSourceRefs,
    cashValue: netAssetValues.cashSourceRefs,
    statementPeriodTotalPnl: statementDiagnostic.sourceRefs,
    beginningNav: nav.beginningSourceRefs,
    endingNav: nav.endingSourceRefs,
  }
  const sourceRefCollections = [
    ...Object.values(metricSourceRefs),
    ...normalizedSymbols.flatMap((symbol) => Object.values(symbol.sourceRefs)),
    ...events.map((event) => event.sourceRefs),
    ...reconciliations.map((check) => check.sourceRefs),
  ]
  if (!sourceRefCollectionsFitReportCapacity(sourceRefCollections)) {
    return reportCapacityFailure()
  }
  const hasIncompleteReconciliation = reconciliations.some(
    (check) => check.status !== 'PASS_EXACT' && check.status !== 'PASS_ROUNDED',
  )
  const hasQualityWarning =
    hasIncompleteReconciliation ||
    warnings.some((warning) => !informationalWarnings.has(warning.code))

  const fingerprint = source.fingerprint()
  const isKnownSyntheticStatement =
    accountId !== undefined &&
    accountId.startsWith('SYNTHETIC_') &&
    KNOWN_SYNTHETIC_STATEMENTS.has(source.knownSyntheticIdentity())

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
    metricSourceRefs,
    parserFacts: {
      realizedSectionMissing,
      seasonReturnConflict: seasonReturnDiagnostic.conflict,
    },
    reconciliations,
    sections: sectionNames.sort(),
    warnings,
    dataQuality: hasQualityWarning ? 'warning' : 'good',
  }

  const result = { report, errors, warnings }
  if (!parseResultFitsReportResourceBudget(result)) {
    return reportCapacityFailure()
  }
  return result
}
