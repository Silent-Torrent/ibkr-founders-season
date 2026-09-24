export type Locale = 'en' | 'zh-CN' | 'zh-TW'
export type PageId = 'ledger' | 'arena' | 'trophies' | 'import'
export type AssetClass = 'STOCK' | 'OPTION' | 'OTHER'
export type DataQuality = 'good' | 'warning' | 'error'
export type ReportSource = 'demo' | 'synthetic' | 'local'

export type ParserDiagnosticCode =
  | 'file_not_csv'
  | 'file_empty'
  | 'file_too_large'
  | 'statement_unreadable'
  | 'csv_too_large'
  | 'csv_malformed'
  | 'csv_not_enough_rows'
  | 'csv_too_many_rows'
  | 'csv_too_many_fields'
  | 'csv_field_too_large'
  | 'csv_unterminated_quote'
  | 'not_activity_statement'
  | 'statement_period_missing'
  | 'not_ytd'
  | 'period_reversed'
  | 'future_end_date'
  | 'wrong_season'
  | 'account_missing'
  | 'multi_account'
  | 'currency_missing'
  | 'currency_conflict'
  | 'currency_invalid'
  | 'mtm_total_conflict'
  | 'mtm_section_missing'
  | 'accounting_value_invalid'
  | 'accounting_section_conflict'
  | 'option_event_date_invalid'
  | 'option_event_identity_conflict'
  | 'underlyings_missing'
  | 'mtm_total_missing'
  | 'instrument_alias_conflict'
  | 'report_capacity_exceeded'
  | 'realized_section_missing'
  | 'mtm_difference'
  | 'other_pnl_included'
  | 'no_option_events'
  | 'nav_missing'
  | 'twr_conflict'
  | 'statement_pnl_mismatch'
  | 'nav_bridge_review'
  | 'worker_unavailable'
  | 'worker_timeout'
  | 'worker_failure'
  | 'worker_cancelled'

export type ParserDiagnostic =
  | {
      code: 'wrong_season'
      params: { currentYear: number }
    }
  | {
      code: 'mtm_difference'
      params: { currency: string; difference: number }
    }
  | {
      code: Exclude<
        ParserDiagnosticCode,
        'wrong_season' | 'mtm_difference'
      >
      params?: never
    }

export interface SourceRef {
  source: 'csv' | 'pdf'
  section: string
  recordType?: string
  rowNumber?: number
  pageNumber?: number
  headerSignature?: string
  field: string
}

export type ReconciliationCheckId =
  | 'mtm_all_assets'
  | 'statement_period_pnl'
  | 'nav_bridge'

export type ReconciliationStatus =
  | 'PASS_EXACT'
  | 'PASS_ROUNDED'
  | 'WARNING'
  | 'BLOCKED'
  | 'NOT_AVAILABLE'

export type ReconciliationReasonCode =
  | 'within_tolerance'
  | 'source_missing'
  | 'difference_exceeds_tolerance'
  | 'unsupported_component'
  | 'ambiguous_schema'

export interface ReconciliationCheck {
  id: ReconciliationCheckId
  status: ReconciliationStatus
  reportedValue?: number
  calculatedValue?: number
  difference?: number
  tolerance?: number
  reasonCode: ReconciliationReasonCode
  sourceRefs: SourceRef[]
}

export type PortfolioMetricKey =
  | 'seasonPnl'
  | 'seasonReturn'
  | 'netLiquidationValue'
  | 'cashValue'
  | 'stockPnl'
  | 'optionPnl'
  | 'otherPnl'
  | 'reportedAllAssetsYtdMtm'
  | 'parsedAllAssetsYtdMtm'
  | 'statementPeriodTotalPnl'
  | 'beginningNav'
  | 'endingNav'

export type SymbolMetricKey =
  | 'stockYtdMtm'
  | 'optionYtdMtm'
  | 'otherYtdMtm'
  | 'totalYtdMtm'
  | 'otherRealizedYtd'
  | 'otherCurrentUnrealized'
  | 'totalRealizedYtd'
  | 'totalCurrentUnrealized'

export interface OptionEvent {
  symbol: string
  contract?: string
  date: string
  type: 'assignment' | 'exercise' | 'expiration'
  sourceRefs: SourceRef[]
}

export interface SymbolPnl {
  symbol: string
  description?: string
  stockYtdMtm: number
  optionYtdMtm: number
  otherYtdMtm: number
  totalYtdMtm: number
  stockRealizedYtd: number
  optionRealizedYtd: number
  otherRealizedYtd: number
  totalRealizedYtd: number
  stockCurrentUnrealized: number
  optionCurrentUnrealized: number
  otherCurrentUnrealized: number
  totalCurrentUnrealized: number
  assignmentCount: number
  exerciseCount: number
  expirationCount: number
  sourceRefs: Partial<Record<SymbolMetricKey, SourceRef[]>>
}

export interface ParserFacts {
  realizedSectionMissing: boolean
  seasonReturnConflict: boolean
}

export interface PortfolioReport {
  source: ReportSource
  fingerprint?: string
  accountComparisonKey: string
  accountIdMasked: string
  baseCurrency: string
  seasonYear: number
  startDate: string
  endDate: string
  importedAt: string
  isYtd: boolean
  netLiquidationValue?: number
  cashValue?: number
  seasonReturn?: number
  seasonPnl: number
  reportedAllAssetsYtdMtm?: number
  parsedAllAssetsYtdMtm: number
  mtmReconciliationDifference?: number
  statementPeriodTotalPnl?: number
  beginningNav?: number
  endingNav?: number
  calculatedEndingNav?: number
  stockPnl: number
  optionPnl: number
  otherPnl: number
  symbols: SymbolPnl[]
  events: OptionEvent[]
  metricSourceRefs: Partial<Record<PortfolioMetricKey, SourceRef[]>>
  parserFacts: ParserFacts
  reconciliations: ReconciliationCheck[]
  sections: string[]
  warnings: ParserDiagnostic[]
  dataQuality: DataQuality
}

export interface ParseResult {
  report?: PortfolioReport
  errors: ParserDiagnostic[]
  warnings: ParserDiagnostic[]
}

export interface TrophyDefinition {
  id: string
  icon: string
  tone: 'positive' | 'warning' | 'neutral' | 'rare'
  unlocked: boolean
  progress?: number
}
