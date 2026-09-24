import type {
  Locale,
  ParserDiagnostic,
  ParserDiagnosticCode,
} from '../types'

export const PARSER_DIAGNOSTIC_CODES = Object.freeze([
  'file_not_csv',
  'file_empty',
  'file_too_large',
  'statement_unreadable',
  'csv_too_large',
  'csv_malformed',
  'csv_not_enough_rows',
  'csv_too_many_rows',
  'csv_too_many_fields',
  'csv_field_too_large',
  'csv_unterminated_quote',
  'not_activity_statement',
  'statement_period_missing',
  'not_ytd',
  'period_reversed',
  'future_end_date',
  'wrong_season',
  'account_missing',
  'multi_account',
  'currency_missing',
  'currency_conflict',
  'currency_invalid',
  'mtm_total_conflict',
  'mtm_section_missing',
  'accounting_value_invalid',
  'accounting_section_conflict',
  'account_boundary_unsupported',
  'option_event_date_invalid',
  'option_event_type_conflict',
  'option_event_identity_conflict',
  'underlyings_missing',
  'mtm_total_missing',
  'instrument_alias_conflict',
  'report_capacity_exceeded',
  'realized_section_missing',
  'mtm_difference',
  'other_pnl_included',
  'no_option_events',
  'nav_missing',
  'twr_conflict',
  'statement_pnl_mismatch',
  'nav_bridge_review',
  'worker_unavailable',
  'worker_timeout',
  'worker_failure',
  'worker_cancelled',
] as const satisfies readonly ParserDiagnosticCode[])

type ListedParserDiagnosticCode = (typeof PARSER_DIAGNOSTIC_CODES)[number]
type MissingParserDiagnosticCode = Exclude<
  ParserDiagnosticCode,
  ListedParserDiagnosticCode
>

// This assignment fails at compile time when a code is added to ParserDiagnosticCode
// without also being added to the runtime allow-list above.
const ALL_DIAGNOSTIC_CODES_ARE_LISTED: [MissingParserDiagnosticCode] extends [never]
  ? true
  : never = true

void ALL_DIAGNOSTIC_CODES_ARE_LISTED

const parserDiagnosticCodeAllowList = new Set<string>(PARSER_DIAGNOSTIC_CODES)
const MIN_DIAGNOSTIC_YEAR = 1900
const MAX_DIAGNOSTIC_YEAR = 9999
const MAX_DIAGNOSTIC_AMOUNT = Number.MAX_SAFE_INTEGER

const messages: Record<
  Locale,
  Record<ParserDiagnosticCode, string>
> = {
  en: {
    file_not_csv: 'Please choose a CSV file.',
    file_empty: 'The CSV file is empty.',
    file_too_large: 'The CSV file is larger than the 5 MB safety limit.',
    statement_unreadable: 'The statement could not be read.',
    csv_too_large: 'The CSV file exceeds the parser safety limit.',
    csv_malformed: 'The CSV structure is malformed.',
    csv_not_enough_rows: 'The file does not contain enough CSV rows.',
    csv_too_many_rows:
      'The CSV file contains too many rows for safe local processing.',
    csv_too_many_fields:
      'A CSV row contains too many columns for safe local processing.',
    csv_field_too_large: 'A CSV field exceeds the parser safety limit.',
    csv_unterminated_quote: 'The CSV contains an unterminated quoted field.',
    not_activity_statement:
      'Only an IBKR Activity Statement is accepted in this MVP.',
    statement_period_missing:
      'The statement period could not be detected. Export an English Activity Statement CSV.',
    not_ytd:
      'Only a Year-to-Date statement beginning on January 1 is accepted in this MVP.',
    period_reversed:
      'The statement period start date is later than its end date.',
    future_end_date: 'A statement with a future end date is not accepted.',
    wrong_season: 'This MVP accepts the current {currentYear} season only.',
    account_missing: 'The statement account identifier could not be detected.',
    multi_account:
      'This MVP accepts one IBKR account per statement. Consolidated or concatenated multi-account reports are not supported.',
    currency_missing: 'The statement base currency could not be detected.',
    currency_conflict: 'Conflicting statement base currencies were found.',
    currency_invalid:
      'The statement base currency is not a valid three-letter currency code.',
    mtm_total_conflict:
      'Conflicting all-assets YTD MTM totals were found in the performance section.',
    mtm_section_missing:
      'The Mark-to-Market performance section is missing or contains no YTD MTM values.',
    accounting_value_invalid:
      'An accounting value has an unsupported format or cannot be calculated safely. Export a fresh English Activity Statement CSV.',
    accounting_section_conflict:
      'The statement contains ambiguous or conflicting source sections, columns, or accounting totals. Export a fresh English Activity Statement CSV.',
    account_boundary_unsupported:
      'This CSV contains BOA/EOA account-boundary rows. This single-account version cannot verify their account ownership, so this report shape is not supported. This does not mean the file is forged.',
    option_event_date_invalid:
      'An option assignment, exercise or expiration event has a missing, invalid or out-of-period date. Export a fresh English Activity Statement CSV.',
    option_event_type_conflict:
      'One option lifecycle row uses conflicting or unsupported event codes. Export a fresh English Activity Statement CSV; do not choose a type by hand.',
    option_event_identity_conflict:
      'Different option lifecycle rows share the same contract, date and event type. This version cannot distinguish them safely. Export a fresh English Activity Statement CSV.',
    underlyings_missing:
      'No stock or option underlying rows could be parsed from the YTD statement.',
    mtm_total_missing:
      'The IBKR all-assets YTD MTM total is missing from the performance section.',
    instrument_alias_conflict:
      'Conflicting stock-symbol or option-contract mappings to an underlying were found in the statement.',
    report_capacity_exceeded:
      'This statement exceeds the current local capacity for underlyings, option lifecycle events, report sections, or safely traceable source details.',
    realized_section_missing:
      'Current unrealized P&L could not be read because the realized/unrealized section is missing.',
    mtm_difference:
      'IBKR reported all-assets YTD MTM minus the parsed detail sum is {amount}.',
    other_pnl_included:
      'Non-stock and non-option performance is included in total season P&L as “Other”.',
    no_option_events:
      'No option assignment, exercise or expiration events were found.',
    nav_missing: 'Net liquidation value was not found in the statement.',
    twr_conflict:
      'Conflicting IBKR TWR values were found; Season Return is unavailable.',
    statement_pnl_mismatch:
      'Statement-period P&L does not reconcile to its supported named components.',
    nav_bridge_review:
      'The NAV bridge is incomplete, conflicting, or outside the CSV precision tolerance.',
    worker_unavailable:
      'Secure background parsing is unavailable in this browser.',
    worker_timeout:
      'The statement took too long to parse and was stopped safely.',
    worker_failure:
      'The statement could not be parsed safely in the background.',
    worker_cancelled: 'The statement import was cancelled.',
  },
  'zh-CN': {
    file_not_csv: '请选择 CSV 文件。',
    file_empty: 'CSV 文件为空。',
    file_too_large: 'CSV 文件超过 5 MB 安全上限。',
    statement_unreadable: '无法读取这份报表。',
    csv_too_large: 'CSV 文件超过解析器的安全上限。',
    csv_malformed: 'CSV 结构格式错误。',
    csv_not_enough_rows: '文件中没有足够的 CSV 数据行。',
    csv_too_many_rows: 'CSV 数据行过多，无法安全地在本地处理。',
    csv_too_many_fields: 'CSV 中有单行的列数过多，无法安全地在本地处理。',
    csv_field_too_large: 'CSV 中有字段超过解析器的安全上限。',
    csv_unterminated_quote: 'CSV 中有未正确闭合引号的字段。',
    not_activity_statement:
      '当前 MVP 仅接受 IBKR Activity Statement（活动报表）。',
    statement_period_missing:
      '无法识别报表期间。请导出英文版 Activity Statement CSV。',
    not_ytd: '当前 MVP 仅接受从 1 月 1 日开始的年初至今报表。',
    period_reversed: '报表期间的开始日期晚于结束日期。',
    future_end_date: '不接受结束日期在未来的报表。',
    wrong_season: '当前 MVP 仅接受 {currentYear} 赛季。',
    account_missing: '无法识别报表中的账户标识。',
    multi_account:
      '当前 MVP 每份报表只接受一个 IBKR 账户，不支持合并或拼接的多账户报表。',
    currency_missing: '无法识别报表的基准币种。',
    currency_conflict: '报表中存在相互冲突的基准币种。',
    currency_invalid: '报表基准币种不是有效的三位字母代码。',
    mtm_total_conflict: '业绩部分中存在相互冲突的全部资产 YTD MTM 合计值。',
    mtm_section_missing:
      '缺少盯市业绩部分，或该部分没有 YTD MTM 数值。',
    accounting_value_invalid:
      '报表会计数值格式不受支持，或无法安全计算。请重新导出英文版 Activity Statement CSV。',
    accounting_section_conflict:
      '报表的来源区块、字段列或会计合计存在歧义或冲突。请重新导出英文版 Activity Statement CSV。',
    account_boundary_unsupported:
      '这份 CSV 含 BOA/EOA 账户边界行。当前单账户版本无法核对其归属，因此暂不支持这种结构；这不表示文件造假。',
    option_event_date_invalid:
      '期权指派、行权或到期事件的日期缺失、无效或不在报表期间内。请重新导出英文版 Activity Statement CSV。',
    option_event_type_conflict:
      '一条期权事件记录使用了相互冲突或尚未支持的类型代码。请重新导出英文版 Activity Statement CSV，不要手工选择事件类型。',
    option_event_identity_conflict:
      '同一合约、日期和事件类型出现内容不同的期权事件记录，当前版本无法安全区分。请重新导出英文版 Activity Statement CSV。',
    underlyings_missing: '无法从年初至今报表中解析出股票或期权标的行。',
    mtm_total_missing: '业绩部分中缺少 IBKR 全部资产 YTD MTM 合计值。',
    instrument_alias_conflict:
      '报表中的股票代码或期权合约与标的的对应关系存在冲突。',
    report_capacity_exceeded:
      '这份报表的标的、期权生命周期事件、报表区块或可安全追溯的来源明细超过当前本地处理上限。',
    realized_section_missing:
      '缺少已实现/未实现业绩部分，因此无法读取当前未实现盈亏。',
    mtm_difference: 'IBKR 报告的全部资产 YTD MTM 减去解析明细合计后相差 {amount}。',
    other_pnl_included: '非股票、非期权的业绩已作为“其他”计入赛季总盈亏。',
    no_option_events: '未找到期权被指派（对方行权）、本账户行权或到期事件。',
    nav_missing: '报表中未找到净清算价值。',
    twr_conflict: '找到了相互冲突的 IBKR 时间加权收益率，暂无法提供赛季收益率。',
    statement_pnl_mismatch: '报表期间盈亏无法与已支持的各项具名组成项对账。',
    nav_bridge_review: 'NAV 衔接不完整、存在冲突，或超出 CSV 精度容差。',
    worker_unavailable: '当前浏览器无法使用安全的后台解析。',
    worker_timeout: '报表解析耗时过长，已安全停止。',
    worker_failure: '无法在后台安全解析这份报表。',
    worker_cancelled: '已取消报表导入。',
  },
  'zh-TW': {
    file_not_csv: '請選擇 CSV 檔案。',
    file_empty: 'CSV 檔案為空。',
    file_too_large: 'CSV 檔案超過 5 MB 安全上限。',
    statement_unreadable: '無法讀取這份報表。',
    csv_too_large: 'CSV 檔案超過剖析器的安全上限。',
    csv_malformed: 'CSV 結構格式錯誤。',
    csv_not_enough_rows: '檔案中沒有足夠的 CSV 資料列。',
    csv_too_many_rows: 'CSV 資料列過多，無法安全地在本機處理。',
    csv_too_many_fields: 'CSV 中有單列的欄位數過多，無法安全地在本機處理。',
    csv_field_too_large: 'CSV 中有欄位超過剖析器的安全上限。',
    csv_unterminated_quote: 'CSV 中有未正確閉合引號的欄位。',
    not_activity_statement:
      '目前 MVP 僅接受 IBKR Activity Statement（活動報表）。',
    statement_period_missing:
      '無法識別報表期間。請匯出英文版 Activity Statement CSV。',
    not_ytd: '目前 MVP 僅接受從 1 月 1 日開始的年初至今報表。',
    period_reversed: '報表期間的開始日期晚於結束日期。',
    future_end_date: '不接受結束日期在未來的報表。',
    wrong_season: '目前 MVP 僅接受 {currentYear} 賽季。',
    account_missing: '無法識別報表中的帳戶標識。',
    multi_account:
      '目前 MVP 每份報表只接受一個 IBKR 帳戶，不支援合併或拼接的多帳戶報表。',
    currency_missing: '無法識別報表的基準幣別。',
    currency_conflict: '報表中存在相互衝突的基準幣別。',
    currency_invalid: '報表基準幣別不是有效的三位字母代碼。',
    mtm_total_conflict: '績效部分中存在相互衝突的全部資產 YTD MTM 合計值。',
    mtm_section_missing:
      '缺少盯市績效部分，或該部分沒有 YTD MTM 數值。',
    accounting_value_invalid:
      '報表會計數值格式不受支援，或無法安全計算。請重新匯出英文版 Activity Statement CSV。',
    accounting_section_conflict:
      '報表的來源區塊、欄位或會計合計存在歧義或衝突。請重新匯出英文版 Activity Statement CSV。',
    account_boundary_unsupported:
      '這份 CSV 含 BOA/EOA 帳戶邊界列。目前單帳戶版本無法核對其歸屬，因此暫不支援這種結構；這不表示檔案造假。',
    option_event_date_invalid:
      '選擇權指派、行權或到期事件的日期缺失、無效或不在報表期間內。請重新匯出英文版 Activity Statement CSV。',
    option_event_type_conflict:
      '一條選擇權事件紀錄使用了相互衝突或尚未支援的類型代碼。請重新匯出英文版 Activity Statement CSV，不要手動選擇事件類型。',
    option_event_identity_conflict:
      '同一合約、日期和事件類型出現內容不同的選擇權事件紀錄，目前版本無法安全區分。請重新匯出英文版 Activity Statement CSV。',
    underlyings_missing: '無法從年初至今報表中剖析出股票或選擇權標的列。',
    mtm_total_missing: '績效部分中缺少 IBKR 全部資產 YTD MTM 合計值。',
    instrument_alias_conflict:
      '報表中的股票代碼或選擇權合約與標的的對應關係存在衝突。',
    report_capacity_exceeded:
      '這份報表的標的、選擇權生命週期事件、報表區塊或可安全追溯的來源明細超過目前本機處理上限。',
    realized_section_missing:
      '缺少已實現/未實現績效部分，因此無法讀取目前未實現損益。',
    mtm_difference: 'IBKR 報告的全部資產 YTD MTM 減去剖析明細合計後相差 {amount}。',
    other_pnl_included: '非股票、非選擇權的績效已作為「其他」計入賽季總損益。',
    no_option_events: '未找到期權被指派（對方行權）、本帳戶行權或到期事件。',
    nav_missing: '報表中未找到淨清算價值。',
    twr_conflict: '找到了相互衝突的 IBKR 時間加權報酬率，暫無法提供賽季報酬率。',
    statement_pnl_mismatch: '報表期間損益無法與已支援的各項具名組成項對帳。',
    nav_bridge_review: 'NAV 銜接不完整、存在衝突，或超出 CSV 精度容差。',
    worker_unavailable: '目前瀏覽器無法使用安全的背景剖析。',
    worker_timeout: '報表剖析耗時過長，已安全停止。',
    worker_failure: '無法在背景安全剖析這份報表。',
    worker_cancelled: '已取消報表匯入。',
  },
}

interface PlainDataRecord {
  keys: string[]
  values: Record<string, unknown>
}

function readPlainDataRecord(value: unknown): PlainDataRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return undefined

    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => typeof key !== 'string')) return undefined

    const keys = ownKeys as string[]
    const values: Record<string, unknown> = {}
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return undefined
      }
      values[key] = descriptor.value
    }

    return { keys, values }
  } catch {
    return undefined
  }
}

function hasExactKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key))
  )
}

function isAllowedCode(value: unknown): value is ParserDiagnosticCode {
  return typeof value === 'string' && parserDiagnosticCodeAllowList.has(value)
}

function isSafeYear(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= MIN_DIAGNOSTIC_YEAR &&
    value <= MAX_DIAGNOSTIC_YEAR
  )
}

function isSafeAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_DIAGNOSTIC_AMOUNT
  )
}

function isSafeCurrency(value: unknown): value is string {
  // Only a normalized ISO-style code or the parser's fixed BASE placeholder is
  // allowed into UI text or list keys. Free-form parser values could contain
  // account, holding, or filename data.
  return value === 'BASE' || (typeof value === 'string' && /^[A-Z]{3}$/.test(value))
}

export function isParserDiagnostic(value: unknown): value is ParserDiagnostic {
  const diagnostic = readPlainDataRecord(value)
  if (!diagnostic) return false

  const code = diagnostic.values.code
  if (!isAllowedCode(code)) return false

  if (code === 'wrong_season') {
    if (!hasExactKeys(diagnostic.keys, ['code', 'params'])) return false
    const params = readPlainDataRecord(diagnostic.values.params)
    return Boolean(
      params &&
        hasExactKeys(params.keys, ['currentYear']) &&
        isSafeYear(params.values.currentYear)
    )
  }

  if (code === 'mtm_difference') {
    if (!hasExactKeys(diagnostic.keys, ['code', 'params'])) return false
    const params = readPlainDataRecord(diagnostic.values.params)
    return Boolean(
      params &&
        hasExactKeys(params.keys, ['difference', 'currency']) &&
        isSafeAmount(params.values.difference) &&
        isSafeCurrency(params.values.currency)
    )
  }

  return hasExactKeys(diagnostic.keys, ['code'])
}

function safeLocale(locale: Locale): Locale {
  return locale === 'zh-CN' || locale === 'zh-TW' ? locale : 'en'
}

function formatYear(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(value)
}

function formatAmount(value: number, currency: string, locale: Locale): string {
  if (currency === 'BASE') return `${value.toFixed(6)} BASE`

  return new Intl.NumberFormat(locale, {
    currency,
    currencyDisplay: 'code',
    maximumFractionDigits: 6,
    minimumFractionDigits: 6,
    style: 'currency',
    useGrouping: true,
  }).format(value)
}

export function formatParserDiagnostic(
  diagnostic: unknown,
  locale: Locale,
): string {
  const normalizedLocale = safeLocale(locale)
  if (!isParserDiagnostic(diagnostic)) {
    return messages[normalizedLocale].worker_failure
  }

  const template = messages[normalizedLocale][diagnostic.code]
  try {
    if (diagnostic.code === 'wrong_season') {
      return template.replace(
        '{currentYear}',
        formatYear(diagnostic.params!.currentYear!, normalizedLocale),
      )
    }

    if (diagnostic.code === 'mtm_difference') {
      return template.replace(
        '{amount}',
        formatAmount(
          diagnostic.params!.difference!,
          diagnostic.params!.currency!,
          normalizedLocale,
        ),
      )
    }

    return template
  } catch {
    return messages[normalizedLocale].worker_failure
  }
}

function appendDiagnosticIndex(key: string, index: number | undefined): string {
  return index === undefined ? key : `${key}:${index}`
}

export function diagnosticKey(diagnostic: unknown, index?: number): string {
  if (!isParserDiagnostic(diagnostic)) {
    return appendDiagnosticIndex('worker_failure', index)
  }

  if (diagnostic.code === 'wrong_season') {
    return appendDiagnosticIndex(
      `${diagnostic.code}:${diagnostic.params!.currentYear!}`,
      index,
    )
  }

  if (diagnostic.code === 'mtm_difference') {
    const difference = Object.is(diagnostic.params!.difference, -0)
      ? 0
      : diagnostic.params!.difference!
    return appendDiagnosticIndex(
      `${diagnostic.code}:${difference}:${diagnostic.params!.currency!}`,
      index,
    )
  }

  return appendDiagnosticIndex(diagnostic.code, index)
}
