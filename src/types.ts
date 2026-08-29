export type Locale = 'en' | 'zh-CN' | 'zh-TW'
export type PageId = 'ledger' | 'arena' | 'trophies' | 'import'
export type AssetClass = 'STOCK' | 'OPTION' | 'OTHER'
export type DataQuality = 'good' | 'warning' | 'error'

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
  | 'totalRealizedYtd'
  | 'totalCurrentUnrealized'

export interface OptionEvent {
  symbol: string
  contract?: string
  date?: string
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
  totalRealizedYtd: number
  stockCurrentUnrealized: number
  optionCurrentUnrealized: number
  totalCurrentUnrealized: number
  assignmentCount: number
  exerciseCount: number
  expirationCount: number
  sourceRefs: Partial<Record<SymbolMetricKey, SourceRef[]>>
}

export interface PortfolioReport {
  source: 'demo' | 'local'
  fingerprint?: string
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
  reconciliations: ReconciliationCheck[]
  sections: string[]
  warnings: string[]
  dataQuality: DataQuality
}

export interface ParseResult {
  report?: PortfolioReport
  errors: string[]
  warnings: string[]
}

export interface TrophyDefinition {
  id: string
  icon: string
  tone: 'positive' | 'warning' | 'neutral' | 'rare'
  unlocked: boolean
  progress?: number
}
