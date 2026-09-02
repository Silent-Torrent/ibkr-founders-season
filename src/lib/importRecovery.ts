import type { MessageKey } from '../i18n'
import type { ParserDiagnostic, ParserDiagnosticCode } from '../types'

const recoveryKeyByCode = {
  file_not_csv: 'recoveryFile',
  file_empty: 'recoveryFile',
  file_too_large: 'recoveryCapacity',
  statement_unreadable: 'recoveryFile',
  csv_too_large: 'recoveryCapacity',
  csv_malformed: 'recoveryFile',
  csv_not_enough_rows: 'recoveryFile',
  csv_too_many_rows: 'recoveryCapacity',
  csv_too_many_fields: 'recoveryCapacity',
  csv_field_too_large: 'recoveryCapacity',
  csv_unterminated_quote: 'recoveryFile',
  not_activity_statement: 'recoveryExportSettings',
  statement_period_missing: 'recoveryExportSettings',
  not_ytd: 'recoveryPeriodAccount',
  period_reversed: 'recoveryPeriodAccount',
  future_end_date: 'recoveryPeriodAccount',
  wrong_season: 'recoveryPeriodAccount',
  account_missing: 'recoveryPeriodAccount',
  multi_account: 'recoveryPeriodAccount',
  currency_missing: 'recoveryExportSettings',
  currency_conflict: 'recoveryExportSettings',
  currency_invalid: 'recoveryExportSettings',
  mtm_total_conflict: 'recoveryReconciliation',
  mtm_section_missing: 'recoveryExportSettings',
  accounting_value_invalid: 'recoveryReconciliation',
  accounting_section_conflict: 'recoveryReconciliation',
  underlyings_missing: 'recoveryExportSettings',
  mtm_total_missing: 'recoveryExportSettings',
  instrument_alias_conflict: 'recoveryReconciliation',
  report_capacity_exceeded: 'recoveryCapacity',
  realized_section_missing: 'recoveryReconciliation',
  mtm_difference: 'recoveryReconciliation',
  other_pnl_included: 'recoveryReconciliation',
  no_option_events: 'recoveryReconciliation',
  nav_missing: 'recoveryReconciliation',
  twr_conflict: 'recoveryReconciliation',
  statement_pnl_mismatch: 'recoveryReconciliation',
  nav_bridge_review: 'recoveryReconciliation',
  worker_unavailable: 'recoveryBrowser',
  worker_timeout: 'recoveryBrowser',
  worker_failure: 'recoveryBrowser',
  worker_cancelled: 'recoveryBrowser',
} as const satisfies Record<ParserDiagnosticCode, MessageKey>

export function importRecoveryKey(code: ParserDiagnosticCode): MessageKey {
  return recoveryKeyByCode[code]
}

export function importRecoveryKeys(diagnostics: ParserDiagnostic[]): MessageKey[] {
  return [...new Set(diagnostics.map(({ code }) => importRecoveryKey(code)))]
}
