import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const projectRoot = resolve(import.meta.dirname, '..')
const output = mkdtempSync(join(tmpdir(), 'pnl-arena-parser-'))
const localTsc = resolve(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
)
const tsc = existsSync(localTsc) ? localTsc : 'tsc'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hasDiagnostic(result, code) {
  return result.errors.some((diagnostic) => diagnostic.code === code)
}

function diagnosticsText(result) {
  return JSON.stringify(result.errors)
}

try {
  execFileSync(
    tsc,
    [
      '--ignoreConfig',
      '--ignoreDeprecations', '6.0',
      '--target', 'ES2022',
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--strict',
      '--esModuleInterop',
      '--outDir', output,
      resolve(projectRoot, 'src/types.ts'),
      resolve(projectRoot, 'src/lib/csv.ts'),
      resolve(projectRoot, 'src/lib/ibkr.ts'),
      resolve(projectRoot, 'src/lib/parserDiagnostics.ts'),
    ],
    { stdio: 'inherit' },
  )

  writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}\n')
  const require = createRequire(import.meta.url)
  const {
    parseIbkrActivityStatement: parseIbkrActivityStatementRaw,
    ytdInstrumentMappingSectionAliases,
  } = require(join(output, 'lib/ibkr.js'))
  const {
    CsvParseFailure,
    MAX_CSV_FIELDS_PER_ROW,
    parseCsvRows,
    parseDateFlexible,
    parseNumber,
    parsePercent,
    sumExactNumbers,
    toIsoDate,
    visitCsvRows,
  } = require(join(output, 'lib/csv.js'))
  const {
    PARSER_DIAGNOSTIC_CODES,
    formatParserDiagnostic,
    isParserDiagnostic,
  } = require(join(output, 'lib/parserDiagnostics.js'))
  const fixtureCurrentDate = new Date(2026, 7, 30)
  const parseIbkrActivityStatement = (text) =>
    parseIbkrActivityStatementRaw(text, { currentDate: fixtureCurrentDate })
  const sample = readFileSync(resolve(projectRoot, 'public/sample-ibkr-ytd.csv'), 'utf8')
  const currentSchemaFixture = readFileSync(
    resolve(projectRoot, 'tests/fixtures/ibkr-current-schema-synthetic.csv'),
    'utf8',
  )

  const encodeCsvCell = (value) =>
    /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  const appendCellToFirstMatchingLine = (fixture, prefix, value) => {
    let changed = false
    const result = fixture.split('\n').map((line) => {
      if (changed || !line.startsWith(prefix)) return line
      changed = true
      return `${line},${value}`
    }).join('\n')
    assert(changed, `Missing synthetic row for ${prefix}`)
    return result
  }
  const dropSectionColumn = (fixture, section, columnName) => {
    let columnIndex
    return parseCsvRows(fixture)
      .map((row) => {
        if (row[0] !== section) return row
        if (row[1]?.toUpperCase() === 'HEADER') {
          columnIndex = row.indexOf(columnName)
        }
        if (columnIndex == null || columnIndex < 0) return row
        const next = [...row]
        next.splice(columnIndex, 1)
        return next
      })
      .map((row) => row.map(encodeCsvCell).join(','))
      .join('\n')
  }
  const addColumnToFirstSectionBlock = (
    fixture,
    section,
    columnName,
    value,
  ) => {
    let insideFirstBlock = false
    let firstHeaderSeen = false
    return parseCsvRows(fixture)
      .map((row) => {
        if (row[0] !== section) return row
        if (row[1]?.toUpperCase() === 'HEADER') {
          if (firstHeaderSeen) {
            insideFirstBlock = false
            return row
          }
          firstHeaderSeen = true
          insideFirstBlock = true
          return [...row, columnName]
        }
        return insideFirstBlock ? [...row, value] : row
      })
      .map((row) => row.map(encodeCsvCell).join(','))
      .join('\n')
  }
  const addColumnToEverySectionBlock = (
    fixture,
    section,
    columnName,
    value,
  ) => parseCsvRows(fixture)
    .map((row) => {
      if (row[0] !== section) return row
      if (row[1]?.toUpperCase() === 'HEADER') return [...row, columnName]
      return [...row, value]
    })
    .map((row) => row.map(encodeCsvCell).join(','))
    .join('\n')
  const buildWideNavFixture = (
    sectionName,
    {
      cash = '17113.340479',
      slbCashCollateral = '0.000000',
      stock = '16500.250000',
      options = '135.666865',
      interestAccruals = '1.111111',
      total = '33750.368455',
    } = {},
  ) => {
    const wideRows = [
      `${sectionName},Header,Cash,SLB Cash Collateral,Stock,SLB Direct Securities Borrowed,SLB Direct Securities Lent,Options,Commodities,Bonds,Notes,Interest Accruals,Soft Dollars,Dividend Accruals,Total`,
      `${sectionName},Data,${cash},${slbCashCollateral},${stock},0.000000,0.000000,${options},0.000000,0.000000,0.000000,${interestAccruals},0.000000,0.000000,${total}`,
      `${sectionName},Header,Time Weighted Rate of Return`,
      `${sectionName},Data,7.654321%`,
    ]
    let inserted = false
    const rows = []
    for (const line of currentSchemaFixture.split('\n')) {
      if (line.startsWith('Net Asset Value,')) {
        if (!inserted) {
          rows.push(...wideRows)
          inserted = true
        }
        continue
      }
      rows.push(line)
    }
    return rows.join('\n')
  }
  const buildMonthYtdSection = (
    sectionName = 'Month & Year to Date Performance Summary',
  ) => [
    `${sectionName},Header,Asset Class,Symbol,Description,Mark-to-Market MTD,Mark-to-Market YTD,Realized S/T MTD,Reazlied S/T YTD,Realized L/T MTD,Realized L/T YTD,Total`,
    `${sectionName},Data,Stocks,ZZFICTA,Synthetic Alpha Systems,0.000000,208.863355,0.000000,150.111111,0.000000,0.000000,208.863355`,
    `${sectionName},Data,Stocks,ZZFICTB,Synthetic Beta Dynamics,0.000000,-41.240878,0.000000,-50.333333,0.000000,0.000000,-41.240878`,
    `${sectionName},Data,Equity and Index Options,ZZFICTA,Synthetic Alpha options,0.000000,354.777778,0.000000,220.555555,0.000000,0.000000,354.777778`,
    `${sectionName},Data,Equity and Index Options,ZZFICTB,Synthetic Beta options,0.000000,95.444445,0.000000,80.777777,0.000000,0.000000,95.444445`,
    `${sectionName},Data,Forex,XTS.USD,Synthetic test currency,0.000000,122.278756,0.000000,10.101010,0.000000,0.000000,122.278756`,
    `${sectionName},Data,Total (All Assets),,,0.000000,740.123456,0.000000,411.212120,0.000000,0.000000,740.123456`,
  ].join('\n')

  const deliberatelyContaminatedSharedMappingAliases = [
    'Mark-to-Market Performance Summary',
    'Month & Year to Date Performance Summary',
    'Profit and Loss by Underlying Instruments',
    'Trades',
  ]
  const mtmMappingAliases = ytdInstrumentMappingSectionAliases(
    'MTM',
    deliberatelyContaminatedSharedMappingAliases,
  )
  const monthYtdMappingAliases = ytdInstrumentMappingSectionAliases(
    'MONTH_YTD',
    deliberatelyContaminatedSharedMappingAliases,
  )
  assert(
    mtmMappingAliases.includes('Mark-to-Market Performance Summary') &&
      mtmMappingAliases.includes('Trades') &&
      !mtmMappingAliases.includes('Month & Year to Date Performance Summary') &&
      !mtmMappingAliases.includes('Profit and Loss by Underlying Instruments') &&
      monthYtdMappingAliases.includes('Month & Year to Date Performance Summary') &&
      monthYtdMappingAliases.includes('Profit and Loss by Underlying Instruments') &&
      monthYtdMappingAliases.includes('Trades') &&
      !monthYtdMappingAliases.includes('Mark-to-Market Performance Summary'),
    'The production YTD mapping selector allowed one source family to pollute the other.',
  )

  assert(toIsoDate(parseDateFlexible('2024-02-29')) === '2024-02-29', 'A valid leap date was rejected.')
  assert(parseDateFlexible('2026-02-29') === undefined, 'A nonexistent numeric date was normalized instead of rejected.')
  assert(toIsoDate(parseDateFlexible('February 29, 2024')) === '2024-02-29', 'A valid English leap date was rejected.')
  assert(parseDateFlexible('February 30, 2026') === undefined, 'A nonexistent English date was normalized instead of rejected.')

  const supportedNumericForms = [
    ['1,234.567890', 1234.56789],
    ['(1,234.50)', -1234.5],
    ['-1,234.50', -1234.5],
    ['+1,234.50', 1234.5],
    ['0', 0],
    ['(0)', 0],
    ['-0', 0],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ]
  for (const [raw, expected] of supportedNumericForms) {
    assert(parseNumber(raw) === expected, `A supported numeric form was rejected: ${raw}`)
  }
  const rejectedNumericForms = [
    '1USD2',
    'C1N2Y',
    '1e3',
    '1 2',
    ' 740.123456',
    '740.123456 ',
    '\n740.123456\n',
    '\t740.123456',
    '1,23',
    '(1,234.50',
    '1,234.50)',
    '( 1,234.50 )',
    '(1 )',
    '$',
    'USD',
    '$1,234.50',
    'USD 1,234.50',
    '1,234.50 USD',
    '7.654321%',
    '($-1)',
    '(USD -1)',
    '$1%',
    '9007199254740992',
    '9007199254740990.5',
    '999999999999999.123456',
    `0.${'0'.repeat(400)}1`,
  ]
  for (const raw of rejectedNumericForms) {
    assert(parseNumber(raw) === undefined, `Malformed numeric text was accepted: ${raw}`)
  }
  const supportedPercentForms = [
    ['7.654321%', 0.07654321],
    ['7.654321', 0.07654321],
    ['-7.5%', -0.075],
  ]
  for (const [raw, expected] of supportedPercentForms) {
    assert(parsePercent(raw) === expected, `A supported percent form was rejected: ${raw}`)
  }
  const rejectedPercentForms = [
    '7%%', '$1%', 'USD 1%', '1% USD', '(7.5)%', '(7.5%)',
    ' 7.5%', '7.5% ', '7.5 %', '\n7.5%\n',
  ]
  for (const raw of rejectedPercentForms) {
    assert(parsePercent(raw) === undefined, `Malformed percent text was accepted: ${raw}`)
  }
  assert(
    sumExactNumbers([0.1, 0.2]) === 0.3,
    'Ordinary decimal addition used binary floating-point drift.',
  )
  assert(
    sumExactNumbers([Number.MAX_SAFE_INTEGER, 2, -Number.MAX_SAFE_INTEGER]) === 2,
    'Large-value cancellation lost an exact unit.',
  )
  assert(
    sumExactNumbers([Number.MAX_SAFE_INTEGER, 1]) === undefined,
    'An unrepresentable aggregate crossed the safe output boundary.',
  )
  assert(
    !Object.is(sumExactNumbers([-0, 0]), -0),
    'Exact decimal aggregation retained negative zero.',
  )

  for (const code of PARSER_DIAGNOSTIC_CODES) {
    const diagnostic =
      code === 'wrong_season'
        ? { code, params: { currentYear: 2026 } }
        : code === 'mtm_difference'
          ? { code, params: { currency: 'USD', difference: 1.25 } }
          : { code }
    assert(isParserDiagnostic(diagnostic), `The ${code} diagnostic schema was rejected.`)
    for (const locale of ['en', 'zh-CN', 'zh-TW']) {
      assert(
        formatParserDiagnostic(diagnostic, locale).length > 0,
        `The ${code} diagnostic has no ${locale} message.`,
      )
    }
  }
  assert(
    !isParserDiagnostic({ code: 'account_missing', account: 'SENSITIVE' }),
    'A diagnostic with an unknown sensitive field was accepted.',
  )
  assert(
    !isParserDiagnostic({ code: 'wrong_season', params: { currentYear: 2026, raw: 'SENSITIVE' } }),
    'A diagnostic with an unknown dynamic parameter was accepted.',
  )
  assert(
    !isParserDiagnostic({ code: 'mtm_difference', params: { currency: 'SENSITIVE', difference: 1 } }),
    'A free-form currency was accepted into a dynamic diagnostic.',
  )
  assert(
    !isParserDiagnostic({ code: 'mtm_difference', params: { currency: 'USD', difference: Number.NaN } }),
    'A non-finite diagnostic amount was accepted.',
  )
  const invalidDiagnosticMessage = formatParserDiagnostic(
    { code: 'unknown', raw: 'SENSITIVE' },
    'en',
  )
  assert(
    !invalidDiagnosticMessage.includes('SENSITIVE'),
    'An invalid diagnostic reflected untrusted source content into the UI.',
  )
  assert(
    formatParserDiagnostic(
      { code: 'mtm_difference', params: { currency: 'BASE', difference: -1.5 } },
      'en',
    ).includes('-1.500000 BASE'),
    'The fixed BASE diagnostic fallback was not formatted deterministically.',
  )

  const result = parseIbkrActivityStatement(sample, 'sample-ibkr-ytd.csv')
  assert(result.errors.length === 0 && result.report, `Parser errors: ${diagnosticsText(result)}`)
  assert(result.report.source === 'synthetic', 'The bundled sample was not labelled as synthetic test data.')
  assert(result.report.seasonPnl === 20040, `Unexpected season P&L: ${result.report.seasonPnl}`)
  assert(result.report.stockPnl === 13690, `Unexpected stock P&L: ${result.report.stockPnl}`)
  assert(result.report.optionPnl === 6350, `Unexpected options P&L: ${result.report.optionPnl}`)
  assert(result.report.events.length === 5, `Unexpected event count: ${result.report.events.length}`)
  assert(result.report.mtmReconciliationDifference === 0, `Unexpected reconciliation difference: ${result.report.mtmReconciliationDifference}`)
  assert(result.report.symbols.length === 6, `Unexpected symbol count: ${result.report.symbols.length}`)
  assert(
    result.report.dataQuality === 'warning',
    'Unavailable reconciliation checks were incorrectly labelled as fully passed.',
  )
  assert(
    result.report.reconciliations.find((check) => check.id === 'mtm_all_assets')?.status === 'PASS_EXACT',
    'The bundled sample MTM check did not pass exactly.',
  )

  const currentSchemaResult = parseIbkrActivityStatement(currentSchemaFixture)
  assert(
    currentSchemaResult.errors.length === 0 && currentSchemaResult.report,
    `Current-schema fixture errors: ${diagnosticsText(currentSchemaResult)}`,
  )
  const currentReport = currentSchemaResult.report
  assert(currentReport.source === 'synthetic', 'The current-schema fixture was not labelled as synthetic test data.')
  assert(currentReport.seasonPnl === 740.123456, `Unexpected current-schema Season P&L: ${currentReport.seasonPnl}`)
  assert(currentReport.stockPnl === 167.622477, `Unexpected current-schema Stock P&L: ${currentReport.stockPnl}`)
  assert(currentReport.optionPnl === 450.222223, `Unexpected current-schema Options P&L: ${currentReport.optionPnl}`)
  assert(currentReport.otherPnl === 122.278756, `Unexpected current-schema Other P&L: ${currentReport.otherPnl}`)
  assert(currentReport.symbols.length === 3, `Unexpected current-schema symbol count: ${currentReport.symbols.length}`)
  assert(currentReport.events.length === 2, `Unexpected current-schema event count: ${currentReport.events.length}`)
  assert(currentReport.dataQuality === 'good', 'A supported Other bucket was incorrectly treated as a reconciliation failure.')
  for (const [label, prefix, extraCell] of [
    ['ambiguous option code', 'Trades,Data,Equity and Index Options,USD,ZZFICTA 19JUN26 125 P,', 'Ex'],
    ['unexpected MTM amount', 'Mark-to-Market Performance Summary,Data,Stocks,ZZFICTA,', '9999.99'],
    ['unexpected realized subtotal', 'Realized & Unrealized Performance Summary,SubTotal,Total Stocks,', '9999.99'],
    ['unexpected statement-period total', 'Total P/L for Statement Period,', '9999.99'],
    ['unexpected FII identity', 'Financial Instrument Information,Data,Equity and Index Options,ZZFICTA,', 'ZZOTHER'],
  ]) {
    const variant = appendCellToFirstMatchingLine(currentSchemaFixture, prefix, extraCell)
    const parsed = parseIbkrActivityStatement(variant)
    assert(
      hasDiagnostic(parsed, 'accounting_section_conflict') && !parsed.report,
      `An extra non-empty ${label} cell was silently discarded: ${diagnosticsText(parsed)}`,
    )
  }
  const harmlessEmptyTail = appendCellToFirstMatchingLine(
    currentSchemaFixture,
    'Trades,Data,Equity and Index Options,USD,ZZFICTA 19JUN26 125 P,',
    '',
  )
  const harmlessEmptyTailResult = parseIbkrActivityStatement(harmlessEmptyTail)
  assert(
    harmlessEmptyTailResult.errors.length === 0 && harmlessEmptyTailResult.report,
    'An empty trailing CSV cell was rejected without source evidence that it changes the row.',
  )
  const emptyStatementTotalTail = appendCellToFirstMatchingLine(
    currentSchemaFixture,
    'Total P/L for Statement Period,',
    '',
  )
  const emptyStatementTotalTailResult = parseIbkrActivityStatement(emptyStatementTotalTail)
  assert(
    emptyStatementTotalTailResult.errors.length === 0 &&
      emptyStatementTotalTailResult.report?.statementPeriodTotalPnl === 750.243455,
    'An empty trailing CSV cell silently removed the statement-period P/L source.',
  )
  assert(currentReport.statementPeriodTotalPnl === 750.243455, 'Statement-period P&L was not parsed from the verified empty record-type row.')
  assert(currentReport.beginningNav === 25000.125, 'Beginning NAV was not parsed.')
  assert(currentReport.endingNav === 33750.368455, 'Ending NAV was not parsed.')
  assert(currentReport.calculatedEndingNav === 33750.368455, 'Calculated ending NAV is incorrect.')
  assert(
    currentReport.parserFacts.realizedSectionMissing === false &&
      currentReport.parserFacts.seasonReturnConflict === false,
    'The complete current-schema fixture has incorrect parser facts.',
  )
  const currentOtherSymbol = currentReport.symbols.find(
    (symbol) => symbol.symbol === 'XTS.USD',
  )
  assert(
    currentOtherSymbol?.otherRealizedYtd === 10.10101 &&
      currentOtherSymbol.otherCurrentUnrealized === -4.040404 &&
      currentOtherSymbol.totalRealizedYtd === 10.10101 &&
      currentOtherSymbol.totalCurrentUnrealized === -4.040404,
    'Other realized/current-unrealized values were dropped or misclassified.',
  )
  assert(
    sumExactNumbers(
      currentReport.symbols.map((symbol) => symbol.totalRealizedYtd),
    ) === 411.21212 &&
      sumExactNumbers(
        currentReport.symbols.map((symbol) => symbol.totalCurrentUnrealized),
      ) === 95.515152,
    'The all-underlying realized/current-unrealized explanation totals are incorrect.',
  )

  const stockDetailTemplate = currentSchemaFixture
    .split('\n')
    .find((line) =>
      line.startsWith('Mark-to-Market Performance Summary,Data,Stocks,ZZFICTA,'),
    )
  assert(
    stockDetailTemplate,
    'The punctuation-identity fixture is incomplete.',
  )
  const offsettingStockDetail = (symbol, amount) => {
    const row = [...parseCsvRows(stockDetailTemplate)[0]]
    row[3] = symbol
    for (let index = 8; index <= 12; index += 1) row[index] = '0.000000'
    row[8] = amount
    row[12] = amount
    return row.map(encodeCsvCell).join(',')
  }
  const punctuationIdentityResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      stockDetailTemplate,
      `${offsettingStockDetail('BRK.B', '1.000000')}\n${offsettingStockDetail('BRK-B', '-1.000000')}\n${stockDetailTemplate}`,
    ),
  )
  assert(
    punctuationIdentityResult.report &&
      !hasDiagnostic(punctuationIdentityResult, 'accounting_section_conflict') &&
      punctuationIdentityResult.report.symbols.some(
        (symbol) => symbol.symbol === 'BRK.B',
      ) &&
      punctuationIdentityResult.report.symbols.some(
        (symbol) => symbol.symbol === 'BRK-B',
      ),
    `Distinct punctuated symbols collapsed into one accounting identity: ${diagnosticsText(punctuationIdentityResult)}`,
  )

  const realizedOtherTemplate = currentSchemaFixture
    .split('\n')
    .find((line) =>
      line.startsWith(
        'Realized & Unrealized Performance Summary,Data,Forex,XTS.USD,',
      ),
    )
  const realizedAllAssetsRow = currentSchemaFixture
    .split('\n')
    .find((line) =>
      line.startsWith(
        'Realized & Unrealized Performance Summary,Total,Total (All Assets),',
      ),
    )
  assert(
    realizedOtherTemplate && realizedAllAssetsRow,
    'The realized-only Other fixture is incomplete.',
  )
  const closedCfdRow = realizedOtherTemplate
    .replace(',Forex,XTS.USD,', ',Equity CFDs,CLOSED.CFD,')
    .replaceAll('10.101010', '5.000000')
    .replaceAll('-4.040404', '0.000000')
    .replace('6.060606', '5.000000')
  const adjustedRealizedAllAssets = realizedAllAssetsRow
    .replace('461.545453', '466.545453')
    .replace('411.212120', '416.212120')
    .replace('506.727272', '511.727272')
  const realizedOnlyOtherResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      realizedAllAssetsRow,
      `${closedCfdRow}\n${adjustedRealizedAllAssets}`,
    ),
  )
  const closedCfd = realizedOnlyOtherResult.report?.symbols.find(
    (symbol) => symbol.symbol === 'CLOSED.CFD',
  )
  assert(
    realizedOnlyOtherResult.errors.length === 0 &&
      closedCfd?.totalYtdMtm === 0 &&
      closedCfd.otherRealizedYtd === 5 &&
      closedCfd.totalRealizedYtd === 5,
    'A realized-only CFD/Other instrument was dropped from the explanation ledger.',
  )

  const withoutRealizedSection = currentSchemaFixture
    .split('\n')
    .filter((line) => !line.startsWith('Realized & Unrealized Performance Summary,'))
    .join('\n')
  const missingRealizedResult = parseIbkrActivityStatement(withoutRealizedSection)
  assert(
    missingRealizedResult.report?.parserFacts.realizedSectionMissing === true &&
      missingRealizedResult.warnings.some(
        (warning) => warning.code === 'realized_section_missing',
      ),
    'A missing realized/unrealized section was not preserved as a fixed parser fact and warning.',
  )
  const sampleWithoutRealizedSummary = sample
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('Realized & Unrealized Performance Summary,'),
    )
    .join('\n')
    .replace(
      'Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,20040,0,0,0,0',
      'Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,20040,0,11280,0,0',
    )
  const sampleYtdRealizedFallbackResult = parseIbkrActivityStatement(
    sampleWithoutRealizedSummary,
  )
  assert(
    sampleYtdRealizedFallbackResult.report?.parserFacts.realizedSectionMissing ===
      true &&
      sampleYtdRealizedFallbackResult.report.symbols.find(
        (symbol) => symbol.symbol === 'NVDA',
      )?.totalRealizedYtd === 6450,
    'Month/YTD realized fields were not retained as the warned fallback when the dedicated realized section was absent.',
  )

  const misleadingSummaryResult = parseIbkrActivityStatement(
    `${withoutRealizedSection}\nSummary,Header,Field Name,Field Value\nSummary,Data,Not a realized section,0\n`,
  )
  assert(
    misleadingSummaryResult.report?.parserFacts.realizedSectionMissing === true &&
      misleadingSummaryResult.warnings.some(
        (warning) => warning.code === 'realized_section_missing',
      ),
    'A generic Summary section impersonated the realized/unrealized section.',
  )

  const misleadingMtmSection = currentSchemaFixture.replaceAll(
    'Mark-to-Market Performance Summary',
    'Summary',
  )
  const misleadingMtmResult = parseIbkrActivityStatement(misleadingMtmSection)
  assert(
    hasDiagnostic(misleadingMtmResult, 'mtm_section_missing') && !misleadingMtmResult.report,
    'A generic Summary section impersonated the YTD MTM section.',
  )

  const officialInBaseFixture = currentSchemaFixture
    .replaceAll(
      'Mark-to-Market Performance Summary',
      'Mark-to-Market Performance Summary in Base',
    )
    .replaceAll(
      'Realized & Unrealized Performance Summary',
      'Realized & Unrealized Performance Summary in Base',
    )
  const officialInBaseResult = parseIbkrActivityStatement(officialInBaseFixture)
  assert(
    officialInBaseResult.errors.length === 0 &&
      officialInBaseResult.report?.seasonPnl === 740.123456 &&
      officialInBaseResult.report.parserFacts.realizedSectionMissing === false,
    'Registered official in-Base accounting section titles were rejected.',
  )

  const officialNavTitleResult = parseIbkrActivityStatement(
    currentSchemaFixture.replaceAll(
      'Net Asset Value',
      'Net Asset Value (NAV) in Base Currency',
    ),
  )
  assert(
    officialNavTitleResult.report?.netLiquidationValue === 33750.368455 &&
      officialNavTitleResult.report.reconciliations.find(
        (check) => check.id === 'nav_bridge',
      )?.status === 'PASS_EXACT',
    'The registered official NAV in-Base title was rejected.',
  )

  const codedBosFixture = `MTMP,BOS,MTM Performance Summary in Base\nFIFO,BOS,FIFO Performance Summary in Base\n${currentSchemaFixture
    .replaceAll('Mark-to-Market Performance Summary', 'MTMP')
    .replaceAll('Realized & Unrealized Performance Summary', 'FIFO')}`
  const codedBosResult = parseIbkrActivityStatement(codedBosFixture)
  assert(
    codedBosResult.errors.length === 0 &&
      codedBosResult.report?.seasonPnl === 740.123456 &&
      codedBosResult.report.parserFacts.realizedSectionMissing === false,
    'Known IBKR section codes were overridden by variable BOS descriptions.',
  )
  const codedPluiResult = parseIbkrActivityStatement(
    sample.replaceAll('Month & Year to Date Performance Summary', 'PLUI'),
  )
  assert(
    codedPluiResult.errors.length === 0 &&
      codedPluiResult.report?.seasonPnl === 20040,
    'The registered PLUI YTD section code was rejected.',
  )
  for (const monthYtdSectionName of [
    'Month & Year to Date Performance Summary',
    'Month & Year to Date Performance Summary in Base',
    'Month and Year to Date Performance Summary',
    'Month and Year to Date Performance Summary in Base',
    'Profit and Loss by Underlying Instruments',
  ]) {
    const namedYtdResult = parseIbkrActivityStatement(
      sample.replaceAll(
        'Month & Year to Date Performance Summary',
        monthYtdSectionName,
      ),
    )
    assert(
      namedYtdResult.errors.length === 0 &&
        namedYtdResult.report?.seasonPnl === 20040,
      `A registered Month/YTD section name was rejected: ${monthYtdSectionName}`,
    )
  }
  const renamedMtmAsPluiResult = parseIbkrActivityStatement(
    currentSchemaFixture.replaceAll('Mark-to-Market Performance Summary', 'PLUI'),
  )
  assert(
    hasDiagnostic(renamedMtmAsPluiResult, 'accounting_section_conflict') &&
      !renamedMtmAsPluiResult.report,
    'An MTM component layout was accepted after only relabelling it as PLUI.',
  )
  for (const realizedSectionName of [
    'Realized & Unrealized Performance Summary in Base',
    'Realized and Unrealized Performance Summary',
    'Realized and Unrealized Performance Summary in Base',
  ]) {
    const namedRealizedResult = parseIbkrActivityStatement(
      currentSchemaFixture.replaceAll(
        'Realized & Unrealized Performance Summary',
        realizedSectionName,
      ),
    )
    assert(
      namedRealizedResult.errors.length === 0 &&
        namedRealizedResult.report?.parserFacts.realizedSectionMissing === false,
      `A registered realized/unrealized section name was rejected: ${realizedSectionName}`,
    )
  }
  for (const navCode of ['EQUT', 'EQUS']) {
    const codedNavResult = parseIbkrActivityStatement(
      currentSchemaFixture.replaceAll('Net Asset Value', navCode),
    )
    assert(
      codedNavResult.errors.length === 0 &&
        codedNavResult.report?.netLiquidationValue === 33750.368455,
      `The registered ${navCode} NAV section code was rejected.`,
    )
  }
  for (const wideNavSection of [
    'EQUT',
    'EQUS',
    'Net Asset Value (NAV) Summary in Base',
  ]) {
    const wideNavResult = parseIbkrActivityStatement(
      buildWideNavFixture(wideNavSection),
    )
    assert(
      wideNavResult.errors.length === 0 &&
        wideNavResult.report?.netLiquidationValue === 33750.368455 &&
        wideNavResult.report.cashValue === 17113.340479,
      `The official wide ${wideNavSection} NAV layout was rejected: ${diagnosticsText(wideNavResult)}`,
    )
  }
  const wideNavWithSlbResult = parseIbkrActivityStatement(
    buildWideNavFixture('EQUS', {
      slbCashCollateral: '10.000000',
      stock: '16490.250000',
    }),
  )
  assert(
    wideNavWithSlbResult.report?.cashValue === 17113.340479,
    'Wide NAV SLB Cash Collateral was published as ordinary Cash.',
  )
  const wideNavMismatchResult = parseIbkrActivityStatement(
    buildWideNavFixture('EQUS', { stock: '16501.250000' }),
  )
  assert(
    hasDiagnostic(wideNavMismatchResult, 'accounting_section_conflict') &&
      !wideNavMismatchResult.report,
    'A wide NAV component sum that differed from Total was accepted.',
  )
  const wideNavUnknownFieldResult = parseIbkrActivityStatement(
    buildWideNavFixture('EQUS')
      .replace('Dividend Accruals,Total', 'Dividend Accruals,Mystery Asset,Total')
      .replace('1.111111,33750.368455', '1.111111,0.000000,33750.368455'),
  )
  assert(
    hasDiagnostic(wideNavUnknownFieldResult, 'accounting_section_conflict') &&
      !wideNavUnknownFieldResult.report,
    'An unregistered wide NAV field was silently ignored.',
  )
  const wideNavMissingComponentResult = parseIbkrActivityStatement(
    dropSectionColumn(
      buildWideNavFixture('EQUS', { stock: '16635.916865' }),
      'EQUS',
      'Options',
    ),
  )
  assert(
    hasDiagnostic(wideNavMissingComponentResult, 'accounting_section_conflict') &&
      !wideNavMissingComponentResult.report,
    'A missing wide NAV component was treated as absent zero and compensated in another asset.',
  )
  const withWideNavMetadata = (fixture, field, value) =>
    fixture
      .replace('EQUS,Header,Cash,', `EQUS,Header,${field},Cash,`)
      .replace('EQUS,Data,17113.340479,', `EQUS,Data,${value},17113.340479,`)
  for (const [field, value] of [
    ['Account ID', 'SYNTHETIC_ACCOUNT_2026_A'],
    ['Report Date', '2026-08-15'],
    ['Model', ''],
  ]) {
    const matchingWideMetadataResult = parseIbkrActivityStatement(
      withWideNavMetadata(buildWideNavFixture('EQUS'), field, value),
    )
    assert(
      matchingWideMetadataResult.errors.length === 0 &&
        matchingWideMetadataResult.report,
      `Matching wide NAV ${field} metadata was rejected: ${diagnosticsText(matchingWideMetadataResult)}`,
    )
  }
  const mismatchingWideAccountResult = parseIbkrActivityStatement(
    withWideNavMetadata(
      buildWideNavFixture('EQUS'),
      'Account ID',
      'SYNTHETIC_DIFFERENT_ACCOUNT',
    ),
  )
  assert(
    hasDiagnostic(mismatchingWideAccountResult, 'multi_account') &&
      !mismatchingWideAccountResult.report,
    'A wide NAV Account ID that disagreed with Account Information was ignored.',
  )
  const mismatchingWideDateResult = parseIbkrActivityStatement(
    withWideNavMetadata(
      buildWideNavFixture('EQUS'),
      'Report Date',
      '2025-12-31',
    ),
  )
  assert(
    hasDiagnostic(mismatchingWideDateResult, 'accounting_section_conflict') &&
      !mismatchingWideDateResult.report,
    'A wide NAV Report Date that disagreed with the statement end was ignored.',
  )
  const slicedWideModelResult = parseIbkrActivityStatement(
    withWideNavMetadata(
      buildWideNavFixture('EQUS'),
      'Model',
      'GROWTH_MODEL',
    ),
  )
  assert(
    hasDiagnostic(slicedWideModelResult, 'accounting_section_conflict') &&
      !slicedWideModelResult.report,
    'A model-sliced wide NAV was treated as the full account identity.',
  )
  for (const navSectionName of [
    'NAV Summary',
    'Net Asset Value (NAV) in Base Currency',
    'Net Asset Value (NAV) Summary in Base',
  ]) {
    const namedNavResult = parseIbkrActivityStatement(
      currentSchemaFixture.replaceAll('Net Asset Value', navSectionName),
    )
    assert(
      namedNavResult.errors.length === 0 &&
        namedNavResult.report?.netLiquidationValue === 33750.368455,
      `A registered NAV section name was rejected: ${navSectionName}`,
    )
  }
  for (const [sectionName, code] of [
    ['Account Information', 'ACCT'],
    ['Cash Report', 'CRTT'],
    ['Cash Report', 'CRTS'],
    ['Trades', 'TRNT'],
    ['Trades', 'TRNS'],
    ['Open Positions', 'POST'],
    ['Open Positions', 'POSS'],
  ]) {
    const codedSectionResult = parseIbkrActivityStatement(
      currentSchemaFixture.replaceAll(sectionName, code),
    )
    assert(
      codedSectionResult.errors.length === 0 && codedSectionResult.report,
      `A registered IBKR section code was rejected: ${code}`,
    )
  }
  const singularLifecycleResult = parseIbkrActivityStatement(
    sample.replaceAll(
      'Options Exercises, Assignments and Expirations',
      'Option Exercises, Assignments and Expirations',
    ),
  )
  assert(
    singularLifecycleResult.errors.length === 0 &&
      singularLifecycleResult.report?.events.length === 5,
    'The registered singular option-lifecycle section name was rejected.',
  )

  const unknownBosImpersonation = `ZZZZ,BOS,Mark-to-Market Performance Summary\n${currentSchemaFixture.replaceAll(
    'Mark-to-Market Performance Summary',
    'ZZZZ',
  )}`
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(unknownBosImpersonation),
      'mtm_section_missing',
    ),
    'An unknown BOS section code impersonated the registered MTM section.',
  )

  const secondaryYtdSection = buildMonthYtdSection()
  const monthYtdOnlyFixture = `${currentSchemaFixture
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('Mark-to-Market Performance Summary,') &&
        !line.startsWith('Total P/L for Statement Period,'),
    )
    .join('\n')}\n${secondaryYtdSection}\n`
  const monthYtdOnlyResult = parseIbkrActivityStatement(monthYtdOnlyFixture)
  assert(
    monthYtdOnlyResult.errors.length === 0 &&
      monthYtdOnlyResult.report?.seasonPnl === 740.123456 &&
      monthYtdOnlyResult.report.stockPnl === 167.622477 &&
      monthYtdOnlyResult.report.optionPnl === 450.222223,
    `A family-correct Month/YTD-only statement was rejected: ${diagnosticsText(monthYtdOnlyResult)}`,
  )
  const coexistingYtdResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${secondaryYtdSection}\n`,
  )
  assert(
    coexistingYtdResult.errors.length === 0 &&
      coexistingYtdResult.report?.seasonPnl === 740.123456 &&
      coexistingYtdResult.report.stockPnl === 167.622477 &&
      coexistingYtdResult.report.optionPnl === 450.222223 &&
      coexistingYtdResult.report.otherPnl === 122.278756 &&
      coexistingYtdResult.report.metricSourceRefs.seasonPnl?.every(
        (ref) => ref.section === 'Mark-to-Market Performance Summary',
      ),
    `Equivalent MTM and Month/YTD sections were not cross-checked safely: ${diagnosticsText(coexistingYtdResult)}`,
  )
  const monthYtdWithDistinctGenericTotal = parseCsvRows(secondaryYtdSection)
    .map((row) => {
      if (row[1]?.toUpperCase() !== 'DATA') return row
      const next = [...row]
      next[next.length - 1] = '999.000000'
      return next
    })
    .map((row) => row.map(encodeCsvCell).join(','))
    .join('\n')
  const distinctGenericTotalResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${monthYtdWithDistinctGenericTotal}\n`,
  )
  assert(
    distinctGenericTotalResult.errors.length === 0 &&
      distinctGenericTotalResult.report?.seasonPnl === 740.123456,
    'The generic Month/YTD Total field was mistaken for Mark-to-Market YTD.',
  )
  const alteredUnusedMonthRealized = secondaryYtdSection.replace(
    ',0.000000,150.111111,0.000000,0.000000,208.863355',
    ',0.000000,999.000000,0.000000,0.000000,208.863355',
  )
  const alteredUnusedMonthRealizedResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${alteredUnusedMonthRealized}\n`,
  )
  const alteredUnusedMonthStock =
    alteredUnusedMonthRealizedResult.report?.symbols.find(
      (symbol) => symbol.symbol === 'ZZFICTA',
    )
  assert(
    alteredUnusedMonthRealizedResult.errors.length === 0 &&
      alteredUnusedMonthStock?.stockRealizedYtd === 150.111111 &&
      alteredUnusedMonthStock.sourceRefs.totalRealizedYtd?.some(
        (ref) => ref.section === 'Realized & Unrealized Performance Summary',
      ) &&
      !alteredUnusedMonthStock.sourceRefs.totalRealizedYtd?.some(
        (ref) => ref.section === 'Month & Year to Date Performance Summary',
      ),
    'Month/YTD realized fields overrode the dedicated realized/FIFO section.',
  )
  const alteredMonthOnlyRealizedResult = parseIbkrActivityStatement(
    monthYtdOnlyFixture.replace(
      ',0.000000,150.111111,0.000000,0.000000,208.863355',
      ',0.000000,999.000000,0.000000,0.000000,208.863355',
    ),
  )
  assert(
    alteredMonthOnlyRealizedResult.report?.symbols.find(
      (symbol) => symbol.symbol === 'ZZFICTA',
    )?.stockRealizedYtd === 150.111111,
    'Month/YTD-only MTM authority also overrode the dedicated realized/FIFO explanation source.',
  )
  const mixedWithoutDedicatedRealized = `${currentSchemaFixture
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('Realized & Unrealized Performance Summary,'),
    )
    .join('\n')}\n${secondaryYtdSection}\n`
  const mixedWithoutDedicatedRealizedWithLong =
    mixedWithoutDedicatedRealized
      .replace(
        ',0.000000,150.111111,0.000000,0.000000,208.863355',
        ',0.000000,100.111111,0.000000,50.000000,208.863355',
      )
      .replace(
        ',0.000000,411.212120,0.000000,0.000000,740.123456',
        ',0.000000,361.212120,0.000000,50.000000,740.123456',
      )
  const mixedWithoutDedicatedRealizedResult = parseIbkrActivityStatement(
    mixedWithoutDedicatedRealizedWithLong,
  )
  const mixedFallbackAlpha =
    mixedWithoutDedicatedRealizedResult.report?.symbols.find(
      (symbol) => symbol.symbol === 'ZZFICTA',
    )
  assert(
    mixedWithoutDedicatedRealizedResult.errors.length === 0 &&
      mixedWithoutDedicatedRealizedResult.report?.parserFacts
        .realizedSectionMissing === true &&
      mixedFallbackAlpha?.stockRealizedYtd === 150.111111 &&
      mixedFallbackAlpha.optionRealizedYtd === 220.555555 &&
      mixedFallbackAlpha.totalRealizedYtd === 370.666666 &&
      mixedFallbackAlpha.sourceRefs.totalRealizedYtd?.some(
        (ref) =>
          ref.section === 'Month & Year to Date Performance Summary' &&
          ref.field === 'Reazlied S/T YTD',
      ) &&
      mixedFallbackAlpha.sourceRefs.totalRealizedYtd.some(
        (ref) =>
          ref.section === 'Month & Year to Date Performance Summary' &&
          ref.field === 'Realized L/T YTD',
      ),
    `Mixed MTM + Month/YTD did not retain the official Month/YTD realized fallback when FIFO was absent: ${JSON.stringify({ diagnostics: mixedWithoutDedicatedRealizedResult.errors, alpha: mixedFallbackAlpha })}`,
  )
  const symbolColumnTotalFallbackResult = parseIbkrActivityStatement(
    mixedWithoutDedicatedRealized.replace(
      ',Data,Total (All Assets),,,0.000000,740.123456,',
      ',Data,,Total (All Assets),,0.000000,740.123456,',
    ),
  )
  assert(
    symbolColumnTotalFallbackResult.errors.length === 0 &&
      symbolColumnTotalFallbackResult.report?.symbols.every(
        (symbol) => symbol.symbol !== 'TOTAL (ALL ASSETS)',
      ) &&
      symbolColumnTotalFallbackResult.report.symbols.find(
        (symbol) => symbol.symbol === 'ZZFICTA',
      )?.totalRealizedYtd === 370.666666,
    `A Month/YTD total in the Symbol column became a duplicate realized instrument: ${diagnosticsText(symbolColumnTotalFallbackResult)}`,
  )
  const unclosedRealizedFallbackResult = parseIbkrActivityStatement(
    mixedWithoutDedicatedRealized.replace(
      ',0.000000,150.111111,0.000000,0.000000,208.863355',
      ',0.000000,999.000000,0.000000,0.000000,208.863355',
    ),
  )
  assert(
    hasDiagnostic(
      unclosedRealizedFallbackResult,
      'accounting_section_conflict',
    ) && !unclosedRealizedFallbackResult.report,
    'Month/YTD realized fallback details did not close to the broker realized totals.',
  )
  const mtmWithImpersonatingRealized = addColumnToEverySectionBlock(
    addColumnToEverySectionBlock(
      currentSchemaFixture
        .split('\n')
        .filter(
          (line) =>
            !line.startsWith('Realized & Unrealized Performance Summary,'),
        )
        .join('\n'),
      'Mark-to-Market Performance Summary',
      'YTD Realized S/T',
      '999.000000',
    ),
    'Mark-to-Market Performance Summary',
    'YTD Realized L/T',
    '0.000000',
  )
  const mtmWithImpersonatingRealizedResult = parseIbkrActivityStatement(
    mtmWithImpersonatingRealized,
  )
  assert(
    hasDiagnostic(
      mtmWithImpersonatingRealizedResult,
      'accounting_section_conflict',
    ) && !mtmWithImpersonatingRealizedResult.report,
    'Recognized Month/YTD realized fields inside MTM supplied a false realized fallback.',
  )
  const codedMixedYtdResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${buildMonthYtdSection('PLUI')}\n`,
  )
  assert(
    codedMixedYtdResult.errors.length === 0 &&
      codedMixedYtdResult.report?.seasonPnl === 740.123456,
    `The official PLUI code failed the mixed-family equivalence gate: ${diagnosticsText(codedMixedYtdResult)}`,
  )
  const reversedYtdOrderResult = parseIbkrActivityStatement(
    `${secondaryYtdSection}\n${currentSchemaFixture}`,
  )
  assert(
    reversedYtdOrderResult.errors.length === 0 &&
      reversedYtdOrderResult.report?.seasonPnl ===
        coexistingYtdResult.report?.seasonPnl &&
      reversedYtdOrderResult.report?.stockPnl ===
        coexistingYtdResult.report?.stockPnl &&
      reversedYtdOrderResult.report?.optionPnl ===
        coexistingYtdResult.report?.optionPnl,
    'Changing the order of equivalent YTD source families changed the result.',
  )

  const multiContractMtmFixture = currentSchemaFixture.replace(
    'Mark-to-Market Performance Summary,Data,Equity and Index Options,ZZFICTA 19JUN26 125 P,-1.000000,0.000000,4.500000,0.000000,300.111111,60.222222,-5.555555,0.000000,354.777778,A',
    [
      'Mark-to-Market Performance Summary,Data,Equity and Index Options,ZZFICTA 19JUN26 125 P,-1.000000,0.000000,4.500000,0.000000,150.111111,30.222222,-2.555555,0.000000,177.777778,A',
      'Mark-to-Market Performance Summary,Data,Equity and Index Options,ZZFICTA 18DEC26 130 C,0.000000,1.000000,0.000000,1.000000,150.000000,30.000000,-3.000000,0.000000,177.000000,A',
    ].join('\n'),
  )
  const multiContractMixedResult = parseIbkrActivityStatement(
    `${multiContractMtmFixture}\n${secondaryYtdSection}\n`,
  )
  assert(
    multiContractMixedResult.errors.length === 0 &&
      multiContractMixedResult.report?.optionPnl === 450.222223 &&
      multiContractMixedResult.report.symbols.find(
        (symbol) => symbol.symbol === 'ZZFICTA',
      )?.optionYtdMtm === 354.777778,
    `Multiple MTM option contracts were not reconciled to one Month/YTD underlying: ${diagnosticsText(multiContractMixedResult)}`,
  )

  const withoutFiiOrTrades = currentSchemaFixture
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('Financial Instrument Information,') &&
        !line.startsWith('Trades,'),
    )
    .join('\n')
  const mixedWithoutFiiOrTradesResult = parseIbkrActivityStatement(
    `${withoutFiiOrTrades}\n${secondaryYtdSection}\n`,
  )
  assert(
    mixedWithoutFiiOrTradesResult.errors.length === 0 &&
      mixedWithoutFiiOrTradesResult.report?.symbols.find(
        (symbol) => symbol.symbol === 'ZZFICTA',
      )?.optionYtdMtm === 354.777778,
    `Independent option-contract inference failed without FII/Trades: ${diagnosticsText(mixedWithoutFiiOrTradesResult)}`,
  )
  const opaqueOptionContractResult = parseIbkrActivityStatement(
    withoutFiiOrTrades.replace(
      'Mark-to-Market Performance Summary,Data,Equity and Index Options,ZZFICTA 19JUN26 125 P,',
      'Mark-to-Market Performance Summary,Data,Equity and Index Options,OPAQUE-MTM-CONTRACT,',
    ),
  )
  assert(
    hasDiagnostic(opaqueOptionContractResult, 'accounting_section_conflict') &&
      !opaqueOptionContractResult.report,
    'An opaque MTM option contract was published as though the contract text were an underlying.',
  )
  const opaqueFifoWithoutMappingsResult = parseIbkrActivityStatement(
    monthYtdOnlyFixture
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('Financial Instrument Information,') &&
          !line.startsWith('Trades,'),
      )
      .join('\n')
      .replaceAll(
        'ZZFICTA 19JUN26 125 P',
        'OPAQUE-FIFO-CONTRACT',
      ),
  )
  assert(
    hasDiagnostic(
      opaqueFifoWithoutMappingsResult,
      'accounting_section_conflict',
    ) && !opaqueFifoWithoutMappingsResult.report,
    'An opaque FIFO option contract became a fabricated underlying in a Month/YTD-only statement.',
  )
  const crossPollutingMonthYtd = parseCsvRows(secondaryYtdSection)
    .map((row) => {
      if (row[1]?.toUpperCase() === 'HEADER') {
        return [...row, 'Underlying Symbol']
      }
      const next = [...row]
      if (
        row[1]?.toUpperCase() === 'DATA' &&
        row[2] === 'Equity and Index Options' &&
        row[3] === 'ZZFICTA'
      ) {
        next[3] = 'ZZFICTA 19JUN26 125 P'
        return [...next, 'ZZFICTB']
      }
      return [...next, '']
    })
    .map((row) => row.map(encodeCsvCell).join(','))
    .join('\n')
  const crossPollutingUnderlyingResult = parseIbkrActivityStatement(
    `${withoutFiiOrTrades}\n${crossPollutingMonthYtd}\n`,
  )
  assert(
    hasDiagnostic(
      crossPollutingUnderlyingResult,
      'accounting_section_conflict',
    ) && !crossPollutingUnderlyingResult.report,
    'One YTD family supplied a wrong option-underlying alias to both source snapshots.',
  )
  const equalOptionMtmFixture = withoutFiiOrTrades
    .replace(
      '300.111111,60.222222,-5.555555,0.000000,354.777778,A',
      '170.4444445,60.222222,-5.555555,0.000000,225.1111115,A',
    )
    .replace(
      '120.333333,-20.444444,-4.444444,0.000000,95.444445,Ep',
      '249.9999995,-20.444444,-4.444444,0.000000,225.1111115,Ep',
    )
  const equalOptionMonthYtd = parseCsvRows(
    secondaryYtdSection
      .replaceAll('354.777778', '225.1111115')
      .replaceAll('95.444445', '225.1111115'),
  )
    .map((row) => {
      if (row[1]?.toUpperCase() === 'HEADER') {
        return [...row, 'Underlying Symbol']
      }
      if (
        row[1]?.toUpperCase() === 'DATA' &&
        row[2] === 'Equity and Index Options'
      ) {
        return [...row, row[3] === 'ZZFICTA' ? 'ZZFICTB' : 'ZZFICTA']
      }
      return [...row, '']
    })
    .map((row) => row.map(encodeCsvCell).join(','))
    .join('\n')
  const equalAmountAliasSwapResult = parseIbkrActivityStatement(
    `${equalOptionMtmFixture}\n${equalOptionMonthYtd}\n`,
  )
  assert(
    hasDiagnostic(equalAmountAliasSwapResult, 'accounting_section_conflict') &&
      !equalAmountAliasSwapResult.report,
    'Equal MTM amounts hid a swapped Month/YTD option-underlying identity.',
  )

  const redistributedMonthYtd = secondaryYtdSection
    .replaceAll('208.863355', '209.863355')
    .replaceAll('-41.240878', '-42.240878')
  const redistributedYtdResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${redistributedMonthYtd}\n`,
  )
  assert(
    hasDiagnostic(redistributedYtdResult, 'accounting_section_conflict') &&
      !redistributedYtdResult.report,
    'Offsetting per-underlying changes hid behind an unchanged all-assets total.',
  )

  const swappedAssetBuckets = secondaryYtdSection
    .replace(
      ',Data,Stocks,ZZFICTA,Synthetic Alpha Systems,',
      ',Data,Equity and Index Options,ZZFICTA,Synthetic Alpha Systems,',
    )
    .replace(
      ',Data,Equity and Index Options,ZZFICTA,Synthetic Alpha options,',
      ',Data,Stocks,ZZFICTA,Synthetic Alpha options,',
    )
  const swappedAssetBucketsResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${swappedAssetBuckets}\n`,
  )
  assert(
    hasDiagnostic(swappedAssetBucketsResult, 'accounting_section_conflict') &&
      !swappedAssetBucketsResult.report,
    'A Stock/Option bucket swap hid behind equal underlying and total values.',
  )
  const changedOtherAssetCategory = secondaryYtdSection.replace(
    ',Data,Forex,XTS.USD,Synthetic test currency,',
    ',Data,Futures,XTS.USD,Synthetic test currency,',
  )
  const changedOtherAssetCategoryResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${changedOtherAssetCategory}\n`,
  )
  assert(
    hasDiagnostic(
      changedOtherAssetCategoryResult,
      'accounting_section_conflict',
    ) && !changedOtherAssetCategoryResult.report,
    'Different broker asset categories were treated as equivalent merely because both publish in the Other bucket.',
  )
  const nonAsciiAssetCategoryResult = parseIbkrActivityStatement(
    `${currentSchemaFixture.replace(
      'Mark-to-Market Performance Summary,Data,Forex,XTS.USD,',
      'Mark-to-Market Performance Summary,Data,期货,XTS.USD,',
    )}\n${secondaryYtdSection.replace(
      ',Data,Forex,XTS.USD,Synthetic test currency,',
      ',Data,外汇,XTS.USD,Synthetic test currency,',
    )}\n`,
  )
  assert(
    hasDiagnostic(nonAsciiAssetCategoryResult, 'accounting_section_conflict') &&
      !nonAsciiAssetCategoryResult.report,
    'Two unsupported non-English asset labels collapsed into one cross-source Other key.',
  )

  const missingUnderlyingMonthYtd = secondaryYtdSection.replace(
    ',Data,Forex,XTS.USD,Synthetic test currency,',
    ',Data,Forex,XTS2.USD,Synthetic test currency,',
  )
  const missingUnderlyingYtdResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${missingUnderlyingMonthYtd}\n`,
  )
  assert(
    hasDiagnostic(missingUnderlyingYtdResult, 'accounting_section_conflict') &&
      !missingUnderlyingYtdResult.report,
    'A missing Month/YTD asset-and-underlying key was accepted.',
  )

  const conflictingSecondaryYtd = secondaryYtdSection.replace(
    ',740.123456,',
    ',741.123456,',
  )
  const conflictingYtdSectionsResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${conflictingSecondaryYtd}\n`,
  )
  assert(
    hasDiagnostic(conflictingYtdSectionsResult, 'accounting_section_conflict') &&
      !conflictingYtdSectionsResult.report,
    'Conflicting all-assets totals across YTD families were accepted.',
  )

  const oneMicroDifferenceMonthYtd = secondaryYtdSection
    .replaceAll('208.863355', '208.863356')
    .replace('740.123456', '740.123457')
  const oneMicroDifferenceResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${oneMicroDifferenceMonthYtd}\n`,
  )
  assert(
    hasDiagnostic(oneMicroDifferenceResult, 'accounting_section_conflict') &&
      !oneMicroDifferenceResult.report,
    'A one-micro-unit cross-source accounting difference was rounded away.',
  )

  const duplicateMonthYtdFamily = buildMonthYtdSection(
    'Month and Year to Date Performance Summary in Base',
  )
  const duplicateMonthYtdFamilyResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${secondaryYtdSection}\n${duplicateMonthYtdFamily}\n`,
  )
  assert(
    hasDiagnostic(duplicateMonthYtdFamilyResult, 'accounting_section_conflict') &&
      !duplicateMonthYtdFamilyResult.report,
    'Two alternative Month/YTD sections were silently selected between.',
  )

  const monthYtdWithoutRealized = dropSectionColumn(
    dropSectionColumn(
      secondaryYtdSection,
      'Month & Year to Date Performance Summary',
      'Reazlied S/T YTD',
    ),
    'Month & Year to Date Performance Summary',
    'Realized L/T YTD',
  )
  const monthYtdWithoutRealizedResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${monthYtdWithoutRealized}\n`,
  )
  assert(
    monthYtdWithoutRealizedResult.errors.length === 0 &&
      monthYtdWithoutRealizedResult.report?.seasonPnl === 740.123456,
    `An optional all-section omission of Month/YTD realized fields was rejected: ${diagnosticsText(monthYtdWithoutRealizedResult)}`,
  )
  const partialMonthYtdRealized = dropSectionColumn(
    secondaryYtdSection,
    'Month & Year to Date Performance Summary',
    'Realized L/T YTD',
  )
  const partialMonthYtdRealizedResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${partialMonthYtdRealized}\n`,
  )
  assert(
    hasDiagnostic(partialMonthYtdRealizedResult, 'accounting_section_conflict') &&
      !partialMonthYtdRealizedResult.report,
    'A one-sided Month/YTD realized field selection bypassed the paired schema.',
  )

  const accountScopedMonthYtd = addColumnToFirstSectionBlock(
    addColumnToFirstSectionBlock(
      secondaryYtdSection,
      'Month & Year to Date Performance Summary',
      'Account ID',
      'SYNTHETIC_ACCOUNT_2026_A',
    ),
    'Month & Year to Date Performance Summary',
    'Model',
    '',
  )
  const accountScopedMonthYtdResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${accountScopedMonthYtd}\n`,
  )
  assert(
    accountScopedMonthYtdResult.errors.length === 0 &&
      accountScopedMonthYtdResult.report?.seasonPnl === 740.123456,
    `A matching full-account Month/YTD scope was rejected: ${diagnosticsText(accountScopedMonthYtdResult)}`,
  )
  const mismatchedYtdAccountResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${accountScopedMonthYtd.replaceAll(
      'SYNTHETIC_ACCOUNT_2026_A',
      'SYNTHETIC_OTHER_ACCOUNT',
    )}\n`,
  )
  assert(
    hasDiagnostic(mismatchedYtdAccountResult, 'accounting_section_conflict') &&
      !mismatchedYtdAccountResult.report,
    'A YTD section from a different account passed the full-account scope gate.',
  )
  const modelScopedYtdResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${addColumnToFirstSectionBlock(
      secondaryYtdSection,
      'Month & Year to Date Performance Summary',
      'Model',
      'SYNTHETIC_MODEL_A',
    )}\n`,
  )
  assert(
    hasDiagnostic(modelScopedYtdResult, 'accounting_section_conflict') &&
      !modelScopedYtdResult.report,
    'A partial Model slice was accepted as full-account ranking evidence.',
  )

  const matchingScopedRealized = addColumnToEverySectionBlock(
    addColumnToEverySectionBlock(
      currentSchemaFixture,
      'Realized & Unrealized Performance Summary',
      'Account ID',
      'SYNTHETIC_ACCOUNT_2026_A',
    ),
    'Realized & Unrealized Performance Summary',
    'Model',
    '',
  )
  const matchingScopedRealizedResult = parseIbkrActivityStatement(
    matchingScopedRealized,
  )
  assert(
    matchingScopedRealizedResult.errors.length === 0 &&
      matchingScopedRealizedResult.report,
    `A matching full-account Realized/FIFO scope was rejected: ${diagnosticsText(matchingScopedRealizedResult)}`,
  )
  for (const scopedRealizedFixture of [
    addColumnToEverySectionBlock(
      currentSchemaFixture,
      'Realized & Unrealized Performance Summary',
      'Account ID',
      'SYNTHETIC_OTHER_ACCOUNT',
    ),
    addColumnToEverySectionBlock(
      currentSchemaFixture,
      'Realized & Unrealized Performance Summary',
      'Model',
      'SYNTHETIC_MODEL_A',
    ),
  ]) {
    const scopedRealizedResult = parseIbkrActivityStatement(
      scopedRealizedFixture,
    )
    assert(
      hasDiagnostic(scopedRealizedResult, 'accounting_section_conflict') &&
        !scopedRealizedResult.report,
      'A different-account or Model-sliced Realized/FIFO section supplied ranking explanations.',
    )
  }

  for (const scopedFiiFixture of [
    addColumnToEverySectionBlock(
      currentSchemaFixture,
      'Financial Instrument Information',
      'Account ID',
      'SYNTHETIC_OTHER_ACCOUNT',
    ),
    addColumnToEverySectionBlock(
      currentSchemaFixture,
      'Financial Instrument Information',
      'Model',
      'SYNTHETIC_MODEL_A',
    ),
  ]) {
    const scopedFiiResult = parseIbkrActivityStatement(scopedFiiFixture)
    assert(
      hasDiagnostic(scopedFiiResult, 'accounting_section_conflict') &&
        !scopedFiiResult.report,
      'A different-account or Model-sliced FII section supplied an option-underlying mapping.',
    )
  }
  const duplicateFiiSymbolResult = parseIbkrActivityStatement(
    addColumnToEverySectionBlock(
      currentSchemaFixture,
      'Financial Instrument Information',
      'Symbol',
      'SYNTHETIC_CONFLICTING_SYMBOL',
    ),
  )
  assert(
    hasDiagnostic(duplicateFiiSymbolResult, 'accounting_section_conflict') &&
      !duplicateFiiSymbolResult.report,
    'A duplicate conflicting FII identity field silently supplied an option-underlying mapping.',
  )
  const emptyFiiAssetClassResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Financial Instrument Information,Data,Equity and Index Options,ZZFICTA,',
      'Financial Instrument Information,Data,,ZZFICTA,',
    ),
  )
  assert(
    hasDiagnostic(emptyFiiAssetClassResult, 'accounting_section_conflict') &&
      !emptyFiiAssetClassResult.report,
    'An empty FII Asset Class supplied an inferred option-underlying mapping.',
  )

  const modelScopedTradesResult = parseIbkrActivityStatement(
    addColumnToEverySectionBlock(
      currentSchemaFixture,
      'Trades',
      'Model',
      'SYNTHETIC_MODEL_A',
    ),
  )
  assert(
    hasDiagnostic(modelScopedTradesResult, 'accounting_section_conflict') &&
      !modelScopedTradesResult.report,
    'A Model-sliced event section supplied full-account option events.',
  )

  const duplicatedRealizedSection = currentSchemaFixture
    .split('\n')
    .filter((line) => line.startsWith('Realized & Unrealized Performance Summary,'))
    .join('\n')
    .replaceAll(
      'Realized & Unrealized Performance Summary',
      'Realized & Unrealized Performance Summary in Base',
    )
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(
        `${currentSchemaFixture}\n${duplicatedRealizedSection}\n`,
      ),
      'accounting_section_conflict',
    ),
    'Two alternative realized/unrealized sections were silently combined.',
  )

  const exactMtmRows = currentSchemaFixture
    .split('\n')
    .filter((line) => line.startsWith('Mark-to-Market Performance Summary,'))
    .join('\n')
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(`${currentSchemaFixture}\n${exactMtmRows}\n`),
      'accounting_section_conflict',
    ),
    'An exact duplicate MTM section was merged and counted twice.',
  )
  const exactRealizedRows = currentSchemaFixture
    .split('\n')
    .filter((line) =>
      line.startsWith('Realized & Unrealized Performance Summary,'),
    )
    .join('\n')
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(
        `${currentSchemaFixture}\n${exactRealizedRows}\n`,
      ),
      'accounting_section_conflict',
    ),
    'An exact duplicate realized/unrealized section was counted twice.',
  )

  const mtmHeader = currentSchemaFixture
    .split('\n')
    .find((line) =>
      line.startsWith('Mark-to-Market Performance Summary,Header,'),
    )
  const firstMtmDataRow = currentSchemaFixture
    .split('\n')
    .find((line) =>
      line.startsWith('Mark-to-Market Performance Summary,Data,Stocks,ZZFICTA,'),
    )
  assert(mtmHeader && firstMtmDataRow, 'The duplicate-column test fixture is incomplete.')
  for (const [firstValue, secondValue] of [
    ['208.863355', '1USD2'],
    ['1USD2', '208.863355'],
  ]) {
    const firstRow = firstMtmDataRow.replace(',208.863355,', `,${firstValue},`)
    const duplicateNumericColumnFixture = currentSchemaFixture.replace(
      `${mtmHeader}\n${firstMtmDataRow}`,
      `${mtmHeader},Mark-to-Market P/L Total\n${firstRow}${secondValue}`,
    )
    const duplicateNumericColumnResult = parseIbkrActivityStatement(
      duplicateNumericColumnFixture,
    )
    assert(
      hasDiagnostic(duplicateNumericColumnResult, 'accounting_value_invalid') &&
        !duplicateNumericColumnResult.report,
      'A duplicate recognized numeric column was resolved by header order.',
    )
  }

  const duplicateIdentityColumnFixture = currentSchemaFixture.replace(
    mtmHeader,
    `${mtmHeader},Symbol`,
  )
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(duplicateIdentityColumnFixture),
      'accounting_section_conflict',
    ),
    'A duplicate Symbol identity column was resolved by header order.',
  )

  const trailingDigitHeaderResult = parseIbkrActivityStatement(
    currentSchemaFixture.replaceAll(
      'Mark-to-Market P/L Total',
      'Mark-to-Market P/L Total 2',
    ),
  )
  assert(
    hasDiagnostic(trailingDigitHeaderResult, 'mtm_section_missing') &&
      !trailingDigitHeaderResult.report,
    'An unregistered raw header ending in a digit impersonated a known field.',
  )

  const removeMtmAmountCoherently = (fixture, removedAmount) => {
    if (removedAmount === 208.863355) {
      return fixture
        .replace(',740.123456,', ',531.260101,')
        .replace('Change in NAV,Data,Mark-to-Market,742.343458', 'Change in NAV,Data,Mark-to-Market,533.480103')
        .replace('Total P/L for Statement Period,,,,,,,,,,,,750.243455,', 'Total P/L for Statement Period,,,,,,,,,,,,541.380100,')
        .replace('Net Asset Value,Data,Stock,10000.000000,16500.250000,0.000000,16500.250000,6500.250000', 'Net Asset Value,Data,Stock,10000.000000,16291.386645,0.000000,16291.386645,6291.386645')
        .replace('Net Asset Value,Data,Total,25000.125000,33750.368455,0.000000,33750.368455,8750.243455', 'Net Asset Value,Data,Total,25000.125000,33541.505100,0.000000,33541.505100,8541.380100')
        .replace('Change in NAV,Data,Ending Value,33750.368455', 'Change in NAV,Data,Ending Value,33541.505100')
    }
    if (removedAmount === 167.622477) {
      return fixture
        .replace(',740.123456,', ',572.500979,')
        .replace('Change in NAV,Data,Mark-to-Market,742.343458', 'Change in NAV,Data,Mark-to-Market,574.720981')
        .replace('Total P/L for Statement Period,,,,,,,,,,,,750.243455,', 'Total P/L for Statement Period,,,,,,,,,,,,582.620978,')
        .replace('Net Asset Value,Data,Stock,10000.000000,16500.250000,0.000000,16500.250000,6500.250000', 'Net Asset Value,Data,Stock,10000.000000,16332.627523,0.000000,16332.627523,6332.627523')
        .replace('Net Asset Value,Data,Total,25000.125000,33750.368455,0.000000,33750.368455,8750.243455', 'Net Asset Value,Data,Total,25000.125000,33582.745978,0.000000,33582.745978,8582.620978')
        .replace('Change in NAV,Data,Ending Value,33750.368455', 'Change in NAV,Data,Ending Value,33582.745978')
    }
    throw new Error(`Unsupported coherent MTM reduction: ${removedAmount}`)
  }

  for (const placeholder of ['', '-', '--']) {
    const missingRequiredMtm = removeMtmAmountCoherently(
      currentSchemaFixture.replace(',208.863355,', `,${placeholder},`),
      208.863355,
    )
    const missingRequiredMtmResult = parseIbkrActivityStatement(missingRequiredMtm)
    assert(
      hasDiagnostic(missingRequiredMtmResult, 'accounting_value_invalid') &&
        !missingRequiredMtmResult.report,
      `A required YTD MTM placeholder was treated as zero: ${JSON.stringify(placeholder)}`,
    )
  }

  const mismatchingMtmComponentsResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace('180.123456,20.250000', '181.123456,20.250000'),
  )
  assert(
    hasDiagnostic(mismatchingMtmComponentsResult, 'accounting_section_conflict') &&
      !mismatchingMtmComponentsResult.report,
    'An MTM row whose components did not equal its broker total was accepted.',
  )
  const selfConsistentWrongAssetSubtotalResult =
    parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        'Mark-to-Market Performance Summary,Data,Total,,,,,,89.666667,70.375001,-1.919191,9.500000,167.622477,',
        'Mark-to-Market Performance Summary,Data,Total,,,,,,90.666667,70.375001,-1.919191,9.500000,168.622477,',
      ),
    )
  assert(
    hasDiagnostic(
      selfConsistentWrongAssetSubtotalResult,
      'accounting_section_conflict',
    ) && !selfConsistentWrongAssetSubtotalResult.report,
    'An internally self-consistent asset subtotal disagreed with its detail block but was accepted.',
  )
  const subtotalImpersonatesAllAssetsFixture = parseCsvRows(
    currentSchemaFixture,
  )
    .flatMap((row) => {
      if (
        row[0] === 'Mark-to-Market Performance Summary' &&
        row[1]?.toUpperCase() === 'DATA' &&
        row[2] === 'Total (All Assets)'
      ) {
        return []
      }
      if (
        row[0] === 'Mark-to-Market Performance Summary' &&
        row[2] === 'Total' &&
        row[12] === '167.622477'
      ) {
        const next = [...row]
        next[1] = 'SubTotal'
        next[2] = 'Stocks'
        next[3] = 'Total (All Assets)'
        return [next]
      }
      return [row]
    })
    .map((row) => row.map(encodeCsvCell).join(','))
    .join('\n')
  const subtotalImpersonatesAllAssetsResult = parseIbkrActivityStatement(
    subtotalImpersonatesAllAssetsFixture,
  )
  assert(
    hasDiagnostic(
      subtotalImpersonatesAllAssetsResult,
      'accounting_section_conflict',
    ) && !subtotalImpersonatesAllAssetsResult.report,
    'A contradictory per-asset subtotal impersonated the authoritative All Assets row.',
  )

  let delayedStockDetail
  const detailAfterClosedSubtotalFixture = parseCsvRows(currentSchemaFixture)
    .flatMap((row) => {
      if (
        row[0] === 'Mark-to-Market Performance Summary' &&
        row[1]?.toUpperCase() === 'DATA' &&
        row[2] === 'Stocks' &&
        row[3] === 'ZZFICTB'
      ) {
        delayedStockDetail = row
        return []
      }
      if (
        row[0] === 'Mark-to-Market Performance Summary' &&
        row[2] === 'Total' &&
        row[12] === '167.622477'
      ) {
        const subtotal = [...row]
        subtotal[1] = 'SubTotal'
        subtotal[2] = 'Stocks'
        subtotal[3] = 'Total Stocks'
        subtotal[8] = '180.123456'
        subtotal[9] = '20.250000'
        subtotal[10] = '-1.010101'
        subtotal[11] = '9.500000'
        subtotal[12] = '208.863355'
        return delayedStockDetail ? [subtotal, delayedStockDetail] : [subtotal]
      }
      return [row]
    })
    .map((row) => row.map(encodeCsvCell).join(','))
    .join('\n')
  assert(delayedStockDetail, 'The delayed-detail fixture did not find ZZFICTB.')
  const detailAfterClosedSubtotalResult = parseIbkrActivityStatement(
    detailAfterClosedSubtotalFixture,
  )
  assert(
    hasDiagnostic(
      detailAfterClosedSubtotalResult,
      'accounting_section_conflict',
    ) && !detailAfterClosedSubtotalResult.report,
    'A detail appended after its asset subtotal bypassed subtotal/detail closure.',
  )
  const emptyMtmAssetClassResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Mark-to-Market Performance Summary,Data,Forex,XTS.USD,',
      'Mark-to-Market Performance Summary,Data,,XTS.USD,',
    ),
  )
  assert(
    hasDiagnostic(emptyMtmAssetClassResult, 'accounting_section_conflict') &&
      !emptyMtmAssetClassResult.report,
    'An empty detail Asset Class was inferred into a different public asset bucket.',
  )
  const symbolLabelledStockSubtotalResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Mark-to-Market Performance Summary,Data,Total,,,,,,89.666667,70.375001,-1.919191,9.500000,167.622477,',
      'Mark-to-Market Performance Summary,SubTotal,Stocks,Total Stocks,,,,,89.666667,70.375001,-1.919191,9.500000,167.622477,',
    ),
  )
  assert(
    symbolLabelledStockSubtotalResult.errors.length === 0 &&
      symbolLabelledStockSubtotalResult.report?.stockPnl === 167.622477 &&
      symbolLabelledStockSubtotalResult.report.symbols.every(
        (symbol) => symbol.symbol !== 'TOTAL STOCKS',
      ),
    `A Symbol-labelled stock subtotal was counted as a second stock instrument: ${diagnosticsText(symbolLabelledStockSubtotalResult)}`,
  )
  const symbolLabelledFifoSubtotalResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Realized & Unrealized Performance Summary,SubTotal,Total Stocks,,',
      'Realized & Unrealized Performance Summary,SubTotal,Stocks,Total Stocks,',
    ),
  )
  assert(
    symbolLabelledFifoSubtotalResult.errors.length === 0 &&
      symbolLabelledFifoSubtotalResult.report?.symbols.every(
        (symbol) => symbol.symbol !== 'TOTAL STOCKS',
      ) &&
      symbolLabelledFifoSubtotalResult.report.symbols.find(
        (symbol) => symbol.symbol === 'ZZFICTA',
      )?.stockRealizedYtd === 150.111111,
    `A Symbol-labelled FIFO subtotal was counted as a second realized instrument: ${diagnosticsText(symbolLabelledFifoSubtotalResult)}`,
  )
  const optionContractMisclassifiedAsStockResult =
    parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        'Mark-to-Market Performance Summary,Data,Equity and Index Options,ZZFICTA 19JUN26 125 P,',
        'Mark-to-Market Performance Summary,Data,Stocks,ZZFICTA 19JUN26 125 P,',
      ),
    )
  assert(
    hasDiagnostic(
      optionContractMisclassifiedAsStockResult,
      'accounting_section_conflict',
    ) && !optionContractMisclassifiedAsStockResult.report,
    'A known option contract was relabelled as Stock and published as a new stock underlying.',
  )
  const fifoOptionMisclassifiedAsStockResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Realized & Unrealized Performance Summary,Data,Equity and Index Options,ZZFICTA 19JUN26 125 P,',
      'Realized & Unrealized Performance Summary,Data,Stocks,ZZFICTA 19JUN26 125 P,',
    ),
  )
  assert(
    hasDiagnostic(
      fifoOptionMisclassifiedAsStockResult,
      'accounting_section_conflict',
    ) && !fifoOptionMisclassifiedAsStockResult.report,
    'A known FIFO option contract was relabelled as Stock and attached to a fabricated stock underlying.',
  )
  const returnTaggedAccountingResult = parseIbkrActivityStatement(
    addColumnToFirstSectionBlock(
      currentSchemaFixture,
      'Mark-to-Market Performance Summary',
      'Time Weighted Rate of Return',
      '7.654321%',
    ).replace('180.123456,20.250000', '181.123456,20.250000'),
  )
  assert(
    hasDiagnostic(returnTaggedAccountingResult, 'accounting_section_conflict') &&
      !returnTaggedAccountingResult.report,
    'An added return column made accounting rows bypass component validation.',
  )

  for (const partialHeaderMutation of [
    mtmHeader.replace('Mark-to-Market P/L Total', 'Mark-to-Market P/L Total 2'),
    mtmHeader.replace(',Symbol,', ',Symbol 2,'),
    mtmHeader.replace(',Mark-to-Market P/L Other,', ',Mark-to-Market P/L Other 2,'),
  ]) {
    const partialHeaderFixture = removeMtmAmountCoherently(
      currentSchemaFixture.replace(mtmHeader, partialHeaderMutation),
      167.622477,
    )
    const partialHeaderResult = parseIbkrActivityStatement(partialHeaderFixture)
    assert(
      hasDiagnostic(partialHeaderResult, 'accounting_section_conflict') &&
        !partialHeaderResult.report,
      'A partially drifted repeated MTM header silently dropped a complete asset block.',
    )
  }

  const coherentlyRemoveRealizedDetail = (placeholder, metric) => {
    if (metric === 'realized') {
      return currentSchemaFixture
        .replace(',150.111111,100.222222,', `,${placeholder},100.222222,`)
        .replace('Total Stocks,,0.000000,150.111111,-50.333333,0.000000,0.000000,99.777778,100.222222,-30.444444,0.000000,0.000000,69.777778,169.555556', 'Total Stocks,,0.000000,0.000000,-50.333333,0.000000,0.000000,-50.333333,100.222222,-30.444444,0.000000,0.000000,69.777778,19.444445')
        .replace('Total (All Assets),,0.000000,461.545453,-50.333333,0.000000,0.000000,411.212120,140.888888,-45.373736,0.000000,0.000000,95.515152,506.727272', 'Total (All Assets),,0.000000,311.434342,-50.333333,0.000000,0.000000,261.101009,140.888888,-45.373736,0.000000,0.000000,95.515152,356.616161')
    }
    return currentSchemaFixture
      .replace(',150.111111,100.222222,0.000000,0.000000,0.000000,100.222222,250.333333,', `,150.111111,100.222222,0.000000,0.000000,0.000000,${placeholder},250.333333,`)
      .replace('Total Stocks,,0.000000,150.111111,-50.333333,0.000000,0.000000,99.777778,100.222222,-30.444444,0.000000,0.000000,69.777778,169.555556', 'Total Stocks,,0.000000,150.111111,-50.333333,0.000000,0.000000,99.777778,0.000000,-30.444444,0.000000,0.000000,-30.444444,69.333334')
      .replace('Total (All Assets),,0.000000,461.545453,-50.333333,0.000000,0.000000,411.212120,140.888888,-45.373736,0.000000,0.000000,95.515152,506.727272', 'Total (All Assets),,0.000000,461.545453,-50.333333,0.000000,0.000000,411.212120,40.666666,-45.373736,0.000000,0.000000,-4.707070,406.505050')
  }

  for (const metric of ['realized', 'unrealized']) {
    for (const placeholder of ['', '-', '--']) {
      const missingDetailResult = parseIbkrActivityStatement(
        coherentlyRemoveRealizedDetail(placeholder, metric),
      )
      assert(
        hasDiagnostic(missingDetailResult, 'accounting_value_invalid') &&
          !missingDetailResult.report,
        `A required ${metric} placeholder was silently dropped: ${JSON.stringify(placeholder)}`,
      )
    }
  }

  for (const placeholder of ['', '-', '--']) {
    const missingStatementComponent = currentSchemaFixture
      .replace(',,,,,,,,,,12.340001,', `,,,,,,,,,,${placeholder},`)
      .replace('Change in NAV,Data,Interest,12.340001', 'Change in NAV,Data,Interest,0.000000')
      .replace('Total P/L for Statement Period,,,,,,,,,,,,750.243455,', 'Total P/L for Statement Period,,,,,,,,,,,,737.903454,')
      .replace('Net Asset Value,Data,Cash,15000.125000,17113.340479,0.000000,17113.340479,2113.215479', 'Net Asset Value,Data,Cash,15000.125000,17101.000478,0.000000,17101.000478,2100.875478')
      .replace('Cash Report,Data,Base Currency Summary,USD,15000.125000,17113.340479,17113.340479', 'Cash Report,Data,Base Currency Summary,USD,15000.125000,17101.000478,17101.000478')
      .replace('Net Asset Value,Data,Total,25000.125000,33750.368455,0.000000,33750.368455,8750.243455', 'Net Asset Value,Data,Total,25000.125000,33738.028454,0.000000,33738.028454,8737.903454')
      .replace('Change in NAV,Data,Ending Value,33750.368455', 'Change in NAV,Data,Ending Value,33738.028454')
    const missingStatementComponentResult = parseIbkrActivityStatement(
      missingStatementComponent,
    )
    assert(
      hasDiagnostic(missingStatementComponentResult, 'accounting_value_invalid') &&
        !missingStatementComponentResult.report,
      `A required statement component placeholder was silently omitted: ${JSON.stringify(placeholder)}`,
    )
  }

  const unrelatedTwrResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\nUnrelated Section,Header,TWR\nUnrelated Section,Data,99%\n`,
  )
  assert(
    unrelatedTwrResult.report?.seasonReturn === 0.07654321 &&
      !unrelatedTwrResult.report.metricSourceRefs.seasonReturn?.some(
        (ref) => ref.section === 'Unrelated Section',
      ),
    'An unrelated section supplied or conflicted with the Season Return.',
  )

  const withoutNavTwr = currentSchemaFixture
    .split('\n')
    .filter(
      (line) =>
        line !== 'Net Asset Value,Header,Time Weighted Rate of Return' &&
        line !== 'Net Asset Value,Data,7.654321%',
    )
    .join('\n')
  const mtmTwrResult = parseIbkrActivityStatement(
    `${withoutNavTwr}\nMark-to-Market Performance Summary,Header,Time Weighted Rate of Return\nMark-to-Market Performance Summary,Data,12.5%\n`,
  )
  assert(
    mtmTwrResult.errors.length === 0 &&
      mtmTwrResult.report?.seasonReturn === 0.125 &&
      mtmTwrResult.report.metricSourceRefs.seasonReturn?.some(
        (ref) => ref.section === 'Mark-to-Market Performance Summary',
      ),
    `An official MTM TWR field was not retained as Season Return: ${diagnosticsText(mtmTwrResult)}`,
  )
  const mtmAccountingRowsWithTwrResult = parseIbkrActivityStatement(
    addColumnToEverySectionBlock(
      withoutNavTwr,
      'Mark-to-Market Performance Summary',
      'TWR',
      '12.5%',
    ),
  )
  assert(
    mtmAccountingRowsWithTwrResult.errors.length === 0 &&
      mtmAccountingRowsWithTwrResult.report?.seasonReturn === 0.125,
    `An official MTM TWR column was rejected: ${diagnosticsText(mtmAccountingRowsWithTwrResult)}`,
  )
  for (const monthYtdReturnSection of [
    'Month & Year to Date Performance Summary',
    'PLUI',
  ]) {
    const monthYtdTwrResult = parseIbkrActivityStatement(
      `${withoutNavTwr}\n${buildMonthYtdSection(monthYtdReturnSection)}\n${monthYtdReturnSection},Header,Time Weighted Rate of Return\n${monthYtdReturnSection},Data,99%\n`,
    )
    assert(
      hasDiagnostic(monthYtdTwrResult, 'accounting_section_conflict') &&
        !monthYtdTwrResult.report,
      `A non-official ${monthYtdReturnSection} return field impersonated MTM/NAV Season Return.`,
    )
    const monthYtdRowsWithTwrResult = parseIbkrActivityStatement(
      `${withoutNavTwr}\n${addColumnToEverySectionBlock(
        buildMonthYtdSection(monthYtdReturnSection),
        monthYtdReturnSection,
        'TWR',
        '99%',
      )}\n`,
    )
    assert(
      hasDiagnostic(
        monthYtdRowsWithTwrResult,
        'accounting_section_conflict',
      ) && !monthYtdRowsWithTwrResult.report,
      `A ${monthYtdReturnSection} TWR column bypassed the field-family gate.`,
    )

    let namedPairInserted = false
    const monthYtdNamedPairReturnFixture = parseCsvRows(
      buildMonthYtdSection(monthYtdReturnSection),
    )
      .map((row) => {
        if (row[1]?.toUpperCase() === 'HEADER') {
          return [...row, 'Field Name', 'Field Value']
        }
        if (row[1]?.toUpperCase() !== 'DATA') return row
        if (!namedPairInserted) {
          namedPairInserted = true
          return [...row, 'TWR', '99%']
        }
        return [...row, '', '']
      })
      .map((row) => row.map(encodeCsvCell).join(','))
      .join('\n')
    const monthYtdNamedPairReturnResult = parseIbkrActivityStatement(
      `${withoutNavTwr}\n${monthYtdNamedPairReturnFixture}\n`,
    )
    assert(
      hasDiagnostic(
        monthYtdNamedPairReturnResult,
        'accounting_section_conflict',
      ) && !monthYtdNamedPairReturnResult.report,
      `A ${monthYtdReturnSection} named Field Name/Field Value TWR pair bypassed the field-family gate.`,
    )
    const monthYtdBlankNamedReturnResult = parseIbkrActivityStatement(
      `${withoutNavTwr}\n${monthYtdNamedPairReturnFixture.replace(
        ',TWR,99%',
        ',TWR,',
      )}\n`,
    )
    assert(
      hasDiagnostic(
        monthYtdBlankNamedReturnResult,
        'accounting_section_conflict',
      ) && !monthYtdBlankNamedReturnResult.report,
      `A blank-valued ${monthYtdReturnSection} named return alias bypassed the field-family gate.`,
    )
  }

  const taintedSectionResult = parseIbkrActivityStatement(
    currentSchemaFixture.replaceAll(
      'Mark-to-Market Performance Summary',
      'Mark-to-Market Performance Summary张三',
    ),
  )
  assert(
    hasDiagnostic(taintedSectionResult, 'mtm_section_missing') &&
      !taintedSectionResult.report,
    'A non-ASCII-suffixed section label normalized into a registered section.',
  )

  const taintedHeaderFixture = currentSchemaFixture.replace(
    ',Conid,Underlying,Multiplier,',
    ',Conid,Underlying张三,Multiplier,',
  )
  const taintedHeaderResult = parseIbkrActivityStatement(taintedHeaderFixture)
  assert(
    taintedHeaderResult.errors.length === 0 &&
      taintedHeaderResult.report &&
      !JSON.stringify(taintedHeaderResult.report).includes('张三'),
    'A tainted schema header was accepted into provenance output.',
  )

  for (const [malformedValue, adjustedAllAssetsTotal] of [
    ['1USD2', '531.260101'],
    ['208.863355%', '740.123456'],
    ['CNY 208.863355', '740.123456'],
  ]) {
    const selfReconcilingMalformedMtm = currentSchemaFixture
      .replace(',208.863355,', `,${malformedValue},`)
      .replace(',740.123456,', `,${adjustedAllAssetsTotal},`)
    const selfReconcilingMalformedMtmResult = parseIbkrActivityStatement(
      selfReconcilingMalformedMtm,
    )
    assert(
      hasDiagnostic(selfReconcilingMalformedMtmResult, 'accounting_value_invalid') &&
        !selfReconcilingMalformedMtmResult.report,
      `A malformed YTD MTM value was silently omitted or coerced: ${malformedValue}`,
    )
  }

  for (const [optionalField, malformedOptionalFixture] of [
    ['TWR', currentSchemaFixture.replace('7.654321%', '7%%')],
    [
      'current unrealized',
      currentSchemaFixture.replace(
        ',-4.040404,0.000000,0.000000,-4.040404,6.060606,',
        ',-4.040404,0.000000,0.000000,1e3,6.060606,',
      ),
    ],
    [
      'NAV current total',
      currentSchemaFixture.replace(
        'Net Asset Value,Data,Total,25000.125000,33750.368455,0.000000,33750.368455,8750.243455',
        'Net Asset Value,Data,Total,25000.125000,33750.368455,0.000000,USD 33750.368455,8750.243455',
      ),
    ],
  ]) {
    const malformedOptionalResult = parseIbkrActivityStatement(
      malformedOptionalFixture,
    )
    assert(
      hasDiagnostic(malformedOptionalResult, 'accounting_value_invalid') &&
        !malformedOptionalResult.report,
      `A malformed optional ${optionalField} value was silently treated as missing: ${diagnosticsText(malformedOptionalResult)}`,
    )
  }

  for (const [label, mutatedTotal, expectedCode] of [
    ['malformed realized total', '1USD2', 'accounting_value_invalid'],
    ['mismatching realized total', '412.212120', 'accounting_section_conflict'],
  ]) {
    const resultWithBadRealizedTotal = parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        ',411.212120,140.888888,',
        `,${mutatedTotal},140.888888,`,
      ),
    )
    assert(
      hasDiagnostic(resultWithBadRealizedTotal, expectedCode) &&
        !resultWithBadRealizedTotal.report,
      `A ${label} was ignored.`,
    )
  }
  for (const [label, mutatedTotal, expectedCode] of [
    ['malformed unrealized total', 'USD 95.515152', 'accounting_value_invalid'],
    ['mismatching unrealized total', '96.515152', 'accounting_section_conflict'],
  ]) {
    const resultWithBadUnrealizedTotal = parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        ',95.515152,506.727272,',
        `,${mutatedTotal},506.727272,`,
      ),
    )
    assert(
      hasDiagnostic(resultWithBadUnrealizedTotal, expectedCode) &&
        !resultWithBadUnrealizedTotal.report,
      `A ${label} was ignored.`,
    )
  }

  const unsafeAggregateResult = parseIbkrActivityStatement(
    currentSchemaFixture
      .replace(',208.863355,', `,${Number.MAX_SAFE_INTEGER},`)
      .replace(',740.123456,', `,${Number.MAX_SAFE_INTEGER},`),
  )
  assert(
    hasDiagnostic(unsafeAggregateResult, 'accounting_value_invalid') &&
      !unsafeAggregateResult.report,
    'An exact decimal aggregate outside the safe output boundary was published.',
  )

  const cashHeader =
    'Cash Report,Header,Currency Summary,Currency,Starting Cash,Ending Cash,Ending Settled Cash'
  const cashRow =
    'Cash Report,Data,Base Currency Summary,USD,15000.125000,17113.340479,17113.340479'
  const navHeader =
    'Net Asset Value,Header,Asset Class,Prior Total,Current Long,Current Short,Current Total,Change'
  const navCashRow =
    'Net Asset Value,Data,Cash,15000.125000,17113.340479,0.000000,17113.340479,2113.215479'
  const withoutNavSection = currentSchemaFixture
    .split('\n')
    .filter((line) => !line.startsWith('Net Asset Value,'))
    .join('\n')
  const cashFallbackResult = parseIbkrActivityStatement(withoutNavSection)
  assert(
    cashFallbackResult.report?.cashValue === 17113.340479,
    'The Base Currency Summary cash fallback was not read.',
  )
  const verticalCashFixture = withoutNavSection
    .replace(
      cashHeader,
      'Cash Report,Header,Currency Summary,Currency,Total,Securities,Futures',
    )
    .replace(
      cashRow,
      'Cash Report,Data,Starting Cash,Base Currency Summary,15000.125000,15000.125000,0.000000\nCash Report,Data,Ending Cash,Base Currency Summary,17113.340479,17113.340479,0.000000',
    )
  const verticalCashResult = parseIbkrActivityStatement(verticalCashFixture)
  assert(
    verticalCashResult.report?.cashValue === 17113.340479,
    `The standard vertical Cash Report ending balance was not read: ${diagnosticsText(verticalCashResult)}`,
  )
  const currencyOnlyFlexCashFixture = withoutNavSection
    .replace(
      cashHeader,
      'Cash Report,Header,Currency,Starting Cash,Ending Cash,Ending Settled Cash',
    )
    .replace(
      cashRow,
      'Cash Report,Data,Base Currency Summary,15000.125000,17113.340479,17113.340479',
    )
  const currencyOnlyFlexCashResult = parseIbkrActivityStatement(
    currencyOnlyFlexCashFixture,
  )
  assert(
    currencyOnlyFlexCashResult.report?.cashValue === 17113.340479,
    `The official Currency-only Flex Cash Report layout was rejected: ${diagnosticsText(currencyOnlyFlexCashResult)}`,
  )
  const verticalCashWithNav = currentSchemaFixture
    .replace(
      cashHeader,
      'Cash Report,Header,Currency Summary,Currency,Total,Securities,Futures',
    )
    .replace(
      cashRow,
      'Cash Report,Data,Starting Cash,Base Currency Summary,15000.125000,15000.125000,0.000000\nCash Report,Data,Ending Cash,Base Currency Summary,17113.340479,17113.340479,0.000000',
    )
  for (const driftedVerticalHeader of [
    'Cash Report,Header,Currency Summary,Currency 2,Total,Securities,Futures',
    'Cash Report,Header,Currency Summary 2,Currency,Total,Securities,Futures',
    'Cash Report,Header,Currency Summary,Currency,Total 2,Securities,Futures',
  ]) {
    const driftedVerticalResult = parseIbkrActivityStatement(
      `${verticalCashWithNav}\n${driftedVerticalHeader}\nCash Report,Data,Ending Cash,Base Currency Summary,999.999999,999.999999,0.000000\n`,
    )
    assert(
      hasDiagnostic(driftedVerticalResult, 'accounting_section_conflict') &&
        !driftedVerticalResult.report,
      'A drifted repeated vertical Cash Report header was hidden by an earlier valid ending balance.',
    )
  }
  const crossSourceCashConflictResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Cash Report,Data,Base Currency Summary,USD,15000.125000,17113.340479,17113.340479',
      'Cash Report,Data,Base Currency Summary,USD,15000.125000,999.999999,999.999999',
    ),
  )
  assert(
    hasDiagnostic(crossSourceCashConflictResult, 'accounting_section_conflict') &&
      !crossSourceCashConflictResult.report,
    'Conflicting NAV and Cash Report base-currency cash values were resolved by source priority.',
  )
  for (const driftedCashHeader of [
    'Cash Report,Header,Currency Summary,Currency,Starting Cash,Ending Balance,Ending Settled Cash',
    'Cash Report,Header,Currency Group,Currency,Starting Cash,Ending Cash,Ending Settled Cash',
  ]) {
    const driftedCashConflictResult = parseIbkrActivityStatement(
      currentSchemaFixture
        .replace(
          'Cash Report,Header,Currency Summary,Currency,Starting Cash,Ending Cash,Ending Settled Cash',
          driftedCashHeader,
        )
        .replace(
          'Cash Report,Data,Base Currency Summary,USD,15000.125000,17113.340479,17113.340479',
          'Cash Report,Data,Base Currency Summary,USD,15000.125000,999.999999,999.999999',
        ),
    )
    assert(
      hasDiagnostic(driftedCashConflictResult, 'accounting_section_conflict') &&
        !driftedCashConflictResult.report,
      'A drifted Cash Report header bypassed the base-currency cash cross-check.',
    )
  }
  for (const partialCashHeader of [
    cashHeader.replace('Ending Cash', 'Ending Cash 2'),
    cashHeader.replace('Currency Summary', 'Currency Summary 2'),
    cashHeader.replace(',Currency,', ',Currency 2,'),
  ]) {
    const partialCashHeaderResult = parseIbkrActivityStatement(
      `${currentSchemaFixture}\n${partialCashHeader}\n${cashRow.replaceAll('17113.340479', '999.999999')}\n`,
    )
    assert(
      hasDiagnostic(partialCashHeaderResult, 'accounting_section_conflict') &&
        !partialCashHeaderResult.report,
      `A malformed repeated Cash Report header was hidden by an earlier valid base-currency row: ${partialCashHeader}`,
    )
  }
  const headerOnlyCashResult = parseIbkrActivityStatement(
    currentSchemaFixture
      .split('\n')
      .filter((line) => !line.startsWith('Cash Report,Data,'))
      .join('\n'),
  )
  assert(
    hasDiagnostic(headerOnlyCashResult, 'accounting_section_conflict') &&
      !headerOnlyCashResult.report,
    'A present but data-less Cash Report was treated as an absent optional section.',
  )
  for (const [label, danglingHeaderFixture] of [
    [
      'Cash Report',
      `${currentSchemaFixture}\nCash Report,Header,Currency Summary,Currency,Ending Cash 2\n`,
    ],
    [
      'row-oriented NAV',
      `${currentSchemaFixture}\nNet Asset Value,Header,Asset Class 2,Current Total\n`,
    ],
    [
      'wide NAV',
      `${buildWideNavFixture('EQUS')}\nEQUS,Header,Cash,Total\n`,
    ],
  ]) {
    const danglingHeaderResult = parseIbkrActivityStatement(
      danglingHeaderFixture,
    )
    assert(
      hasDiagnostic(danglingHeaderResult, 'accounting_section_conflict') &&
        !danglingHeaderResult.report,
      `A trailing ${label} header without data was ignored.`,
    )
  }
  const duplicateCashRows = currentSchemaFixture
    .split('\n')
    .filter((line) => line.startsWith('Cash Report,'))
    .join('\n')
    .replace(',17113.340479,17113.340479', ',999.999999,999.999999')
  const conflictingCashResult = parseIbkrActivityStatement(
    `${withoutNavSection}\n${duplicateCashRows}\n`,
  )
  assert(
    hasDiagnostic(conflictingCashResult, 'accounting_section_conflict') &&
      !conflictingCashResult.report,
    'A duplicate Base Currency cash row replaced the first value by row order.',
  )

  for (const conflictingMetadataFixture of [
    `${currentSchemaFixture}\nStatement,Header,Field Name,Field Value\nStatement,Data,Title,Portfolio Analyst\nStatement,Data,Period,"February 1, 2026 - August 15, 2026"\n`,
    `${currentSchemaFixture}\nAccount Information,Data,Period,"February 1, 2026 - August 15, 2026"\n`,
    `BOF,SYNTHETIC_ACCOUNT_2026_A,Activity Statement,2026-02-01,2026-08-15\n${currentSchemaFixture}`,
    `BOF,SYNTHETIC_ACCOUNT_2026_A,Activity Statement,not-a-date,2026-08-15\n${currentSchemaFixture}`,
  ]) {
    const conflictingMetadataResult = parseIbkrActivityStatement(
      conflictingMetadataFixture,
    )
    assert(
      hasDiagnostic(conflictingMetadataResult, 'accounting_section_conflict') &&
        !conflictingMetadataResult.report,
      'Conflicting mandatory statement metadata was resolved by source order.',
    )
  }

  const navTotalRow = currentSchemaFixture
    .split('\n')
    .find((line) => line.startsWith('Net Asset Value,Data,Total,'))
  assert(navTotalRow, 'The NAV duplicate-total fixture is incomplete.')
  const duplicateNavTotalResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\nNet Asset Value,Header,Asset Class,Prior Total,Current Long,Current Short,Current Total,Change\n${navTotalRow.replaceAll('33750.368455', '34750.368455')}\n`,
  )
  assert(
    hasDiagnostic(duplicateNavTotalResult, 'accounting_section_conflict') &&
      !duplicateNavTotalResult.report,
    'A duplicate NAV total replaced the first broker total by row order.',
  )
  const navComponentMismatchResult = parseIbkrActivityStatement(
    currentSchemaFixture
      .replace(
        navCashRow,
        'Net Asset Value,Data,Cash,15000.125000,17113.340479,0.000000,999.999999,2113.215479',
      )
      .replace(cashRow, cashRow.replaceAll('17113.340479', '999.999999')),
  )
  assert(
    hasDiagnostic(navComponentMismatchResult, 'accounting_section_conflict') &&
      !navComponentMismatchResult.report,
    'A NAV Current Long plus Current Short mismatch was published as cash.',
  )
  const navDetailSumMismatchResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Net Asset Value,Data,Stock,10000.000000,16500.250000,0.000000,16500.250000,6500.250000',
      'Net Asset Value,Data,Stock,10000.000000,16501.250000,0.000000,16501.250000,6501.250000',
    ),
  )
  assert(
    hasDiagnostic(navDetailSumMismatchResult, 'accounting_section_conflict') &&
      !navDetailSumMismatchResult.report,
    'NAV detail rows did not have to sum to the broker Total row.',
  )
  const partialNavHeaderResult = parseIbkrActivityStatement(
    currentSchemaFixture
      .replace(navHeader, navHeader.replace('Asset Class', 'Asset Class 2'))
      .replace(navCashRow, `${navCashRow}\n${navHeader}`)
      .replace(cashRow, cashRow.replaceAll('17113.340479', '999.999999')),
  )
  assert(
    hasDiagnostic(partialNavHeaderResult, 'accounting_section_conflict') &&
      !partialNavHeaderResult.report,
    'A partial NAV identity-header drift made the Cash row disappear from validation.',
  )
  const returnTaggedNavResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Net Asset Value,Header,Time Weighted Rate of Return',
      'Net Asset Value,Header,Asset Class 2,Current Total,Time Weighted Rate of Return\nNet Asset Value,Data,Cash,999.999999,7.654321%\nNet Asset Value,Header,Time Weighted Rate of Return',
    ),
  )
  assert(
    hasDiagnostic(returnTaggedNavResult, 'accounting_section_conflict') &&
      !returnTaggedNavResult.report,
    'An added return column made a malformed NAV accounting row bypass validation.',
  )
  const fullyDriftedReturnTaggedNavResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Net Asset Value,Header,Time Weighted Rate of Return',
      'Net Asset Value,Header,Asset Class 2,Current Total 2,Time Weighted Rate of Return\nNet Asset Value,Data,Cash,999.999999,7.654321%\nNet Asset Value,Header,Time Weighted Rate of Return',
    ),
  )
  assert(
    hasDiagnostic(
      fullyDriftedReturnTaggedNavResult,
      'accounting_section_conflict',
    ) && !fullyDriftedReturnTaggedNavResult.report,
    'A return field hid a NAV row after every accounting header was drifted.',
  )
  const withSlbCollateralResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      navCashRow,
      `${navCashRow}\nNet Asset Value,Data,SLB Cash Collateral,0.000000,0.000000,0.000000,0.000000,0.000000`,
    ),
  )
  assert(
    withSlbCollateralResult.report?.cashValue === 17113.340479,
    `SLB Cash Collateral was confused with ordinary Cash: ${diagnosticsText(withSlbCollateralResult)}`,
  )
  const onlySlbCollateralResult = parseIbkrActivityStatement(
    currentSchemaFixture
      .replace(
        navCashRow,
        navCashRow.replace(',Cash,', ',SLB Cash Collateral,'),
      )
      .split('\n')
      .filter((line) => !line.startsWith('Cash Report,'))
      .join('\n'),
  )
  assert(
    onlySlbCollateralResult.report &&
      onlySlbCollateralResult.report.cashValue === undefined,
    'SLB Cash Collateral was published as ordinary available cash.',
  )

  const conflictingTwrResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\nNet Asset Value,Data,8.654321%\n`,
  )
  assert(
    conflictingTwrResult.report?.parserFacts.seasonReturnConflict === true &&
      conflictingTwrResult.report.seasonReturn === undefined &&
      (conflictingTwrResult.report.metricSourceRefs.seasonReturn?.length ?? 0) > 0 &&
      conflictingTwrResult.warnings.some((warning) => warning.code === 'twr_conflict'),
    'Conflicting TWR candidates were not preserved as an inferable parser fact and warning.',
  )

  for (const id of ['mtm_all_assets', 'statement_period_pnl', 'nav_bridge']) {
    const check = currentReport.reconciliations.find((candidate) => candidate.id === id)
    assert(check?.status === 'PASS_EXACT', `${id} did not pass exactly.`)
    assert(check?.difference === 0, `${id} did not normalize its exact difference to zero.`)
    assert(check?.tolerance === 0.000001, `${id} used an unexpected CSV tolerance.`)
    assert((check?.sourceRefs.length ?? 0) > 0, `${id} has no source references.`)
  }

  const statementSource = currentReport.metricSourceRefs.statementPeriodTotalPnl?.[0]
  assert(statementSource?.recordType === 'EMPTY', 'The empty Total P/L record type was not preserved.')
  assert(statementSource?.field === 'Mark-to-Market P/L Total', 'The Total P/L field source is incorrect.')
  assert((statementSource?.rowNumber ?? 0) > 0, 'The Total P/L one-based row number is missing.')

  const withNumericStatementMetadata = `${currentSchemaFixture}\nStatement,Data,Report Version,1\n`
  const numericStatementMetadataCheck = parseIbkrActivityStatement(
    withNumericStatementMetadata,
  ).report?.reconciliations.find((check) => check.id === 'statement_period_pnl')
  assert(
    numericStatementMetadataCheck?.status === 'PASS_EXACT' &&
      !numericStatementMetadataCheck.sourceRefs.some((ref) => ref.section === 'Statement'),
    'Numeric Statement metadata leaked into the Total P/L section match.',
  )

  const optionWithMapping = currentReport.symbols.find((symbol) => symbol.optionYtdMtm !== 0)
  const optionRefs = optionWithMapping?.sourceRefs.optionYtdMtm ?? []
  assert(
    optionRefs.some((ref) => ref.section === 'Mark-to-Market Performance Summary'),
    'An option MTM source row is missing.',
  )
  assert(
    optionRefs.some((ref) => ref.section === 'Financial Instrument Information'),
    'An option underlying-mapping source row is missing.',
  )

  const repeatedSafeAlias = `${currentSchemaFixture}\nFinancial Instrument Information,Data,Equity and Index Options,  zzficta  ,  zzficta   19jun26  125 p  ,SYNTH-CONID-OPT-A-DUPLICATE,  zzficta  ,100,2026-06-19,P,125.000000,\n`
  const repeatedSafeAliasResult = parseIbkrActivityStatement(repeatedSafeAlias)
  assert(
    repeatedSafeAliasResult.errors.length === 0 && repeatedSafeAliasResult.report,
    'A repeated option alias pointing to the same underlying was rejected.',
  )
  const repeatedAliasRefs = repeatedSafeAliasResult.report.symbols
    .find((symbol) => symbol.symbol === 'ZZFICTA')
    ?.sourceRefs.optionYtdMtm?.filter(
      (ref) => ref.section === 'Financial Instrument Information',
    ) ?? []
  assert(
    repeatedAliasRefs.length >= 2,
    'Repeated same-underlying alias provenance did not retain both source rows.',
  )

  const conflictingAlias = `${currentSchemaFixture}\nFinancial Instrument Information,Data,Equity and Index Options,ZZFICTA,ZZFICTA 19JUN26 125 P,SYNTH-CONID-OPT-A-CONFLICT,ZZFICTB,100,2026-06-19,P,125.000000,\n`
  const conflictingAliasResult = parseIbkrActivityStatement(conflictingAlias)
  assert(
    hasDiagnostic(conflictingAliasResult, 'instrument_alias_conflict'),
    'A conflicting option-underlying alias was not surfaced as a fixed parser error.',
  )
  assert(
    !conflictingAliasResult.report,
    'A report was created after an ambiguous option-underlying mapping.',
  )

  const descriptionOnlyConflict = `${currentSchemaFixture}\nFinancial Instrument Information,Data,Equity and Index Options,UNIQUE-CONTRACT-ALIAS,ZZFICTA 19JUN26 125 P,SYNTH-CONID-DESCRIPTION-CONFLICT,ZZFICTB,100,2026-06-19,P,125.000000,\n`
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(descriptionOnlyConflict),
      'instrument_alias_conflict',
    ),
    'A Description-only alias conflict was not rejected.',
  )

  const symbolOnlyConflict = `${currentSchemaFixture}\nFinancial Instrument Information,Data,Equity and Index Options,ZZFICTA,UNIQUE DESCRIPTION ALIAS,SYNTH-CONID-SYMBOL-CONFLICT,ZZFICTB,100,2026-06-19,P,125.000000,\n`
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(symbolOnlyConflict),
      'instrument_alias_conflict',
    ),
    'A Symbol-only alias conflict was not rejected.',
  )

  const crossFieldConflict = `${currentSchemaFixture}\nFinancial Instrument Information,Data,Equity and Index Options,UNIQUE-CROSS-FIELD,ZZFICTA,SYNTH-CONID-CROSS-FIELD,ZZFICTB,100,2026-06-19,P,125.000000,\n`
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(crossFieldConflict),
      'instrument_alias_conflict',
    ),
    'A cross-field Symbol/Description alias conflict was not rejected.',
  )

  const canonicalInstrumentRow = 'Financial Instrument Information,Data,Equity and Index Options,ZZFICTA,ZZFICTA 19JUN26 125 P,SYNTH-CONID-OPT-A,ZZFICTA,100,2026-06-19,P,125.000000,'
  const conflictingInstrumentRow = 'Financial Instrument Information,Data,Equity and Index Options,ZZFICTA,ZZFICTA 19JUN26 125 P,SYNTH-CONID-OPT-A-CONFLICT,ZZFICTB,100,2026-06-19,P,125.000000,'
  const reversedConflict = currentSchemaFixture.replace(
    canonicalInstrumentRow,
    `${conflictingInstrumentRow}\n${canonicalInstrumentRow}`,
  )
  assert(
    hasDiagnostic(parseIbkrActivityStatement(reversedConflict), 'instrument_alias_conflict'),
    'Alias-conflict detection changed with input order.',
  )

  const conflictThenSafeDuplicate = `${reversedConflict}\n${canonicalInstrumentRow}\n`
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(conflictThenSafeDuplicate),
      'instrument_alias_conflict',
    ),
    'A later safe duplicate incorrectly cleared an earlier alias conflict.',
  )

  const unusedAliasConflict = `${currentSchemaFixture}\nFinancial Instrument Information,Data,Equity and Index Options,UNUSED-CONTRACT-ALIAS,UNUSED DESCRIPTION A,SYNTH-CONID-UNUSED-A,ZZUNUSED1,100,2026-06-19,P,1.000000,\nFinancial Instrument Information,Data,Equity and Index Options,UNUSED-CONTRACT-ALIAS,UNUSED DESCRIPTION B,SYNTH-CONID-UNUSED-B,ZZUNUSED2,100,2026-06-19,P,1.000000,\n`
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(unusedAliasConflict),
      'instrument_alias_conflict',
    ),
    'A conflicting unused FII alias was dropped before the global consistency check.',
  )

  const canonicalAssignmentRow = 'Trades,Data,Equity and Index Options,USD,ZZFICTA 19JUN26 125 P,ZZFICTA,"2026-06-19, 16:00:00",-1.000000,0.000000,0.000000,-5.555555,0.000000,220.555555,60.222222,A'
  const underlyingTradeHeader = currentSchemaFixture
    .split('\n')
    .find((row) => row.startsWith('Trades,Header,Asset Class,Currency,Symbol,Underlying,'))
  assert(underlyingTradeHeader, 'The synthetic Trades Underlying header is missing.')
  const unusedTradeRow = canonicalAssignmentRow
    .replace('ZZFICTA 19JUN26 125 P,ZZFICTA,', 'ZZUNUSED 19JUN26 1 C,ZZUNUSEDA,')
    .replace(/,A$/, ',')
  const conflictingUnusedTradeRow = unusedTradeRow.replace(
    'ZZUNUSEDA,',
    'ZZUNUSEDB,',
  )
  const unusedTradeConflict = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${underlyingTradeHeader}\n${unusedTradeRow}\n${conflictingUnusedTradeRow}\n`,
  )
  assert(
    hasDiagnostic(unusedTradeConflict, 'instrument_alias_conflict') &&
      !unusedTradeConflict.report,
    'Conflicting unused explicit Trades aliases were dropped.',
  )
  const unusedFiiRow = 'Financial Instrument Information,Data,Equity and Index Options,ZZUNUSED 19JUN26 1 C,UNUSED FII DESCRIPTION,SYNTH-CONID-UNUSED,ZZUNUSEDB,100,2026-06-19,C,1,'
  const unusedTradeFiiConflict = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${unusedFiiRow}\n${underlyingTradeHeader}\n${unusedTradeRow}\n`,
  )
  assert(
    hasDiagnostic(unusedTradeFiiConflict, 'instrument_alias_conflict') &&
      !unusedTradeFiiConflict.report,
    'An unused explicit Trades alias disagreeing with FII was dropped.',
  )
  for (const compatibleCode of ['A;P', 'A;A', 'Assignment;A']) {
    const compatibleCodeRow = canonicalAssignmentRow.replace(/,A$/, `,${compatibleCode}`)
    const result = parseIbkrActivityStatement(
      currentSchemaFixture.replace(canonicalAssignmentRow, compatibleCodeRow),
    )
    assert(
      result.errors.length === 0 &&
        result.report?.symbols.find((symbol) =>
          symbol.symbol === 'ZZFICTA')?.assignmentCount === 1,
      `A compatible assignment code was rejected: ${compatibleCode}; ${diagnosticsText(result)}`,
    )
  }
  for (const conflictingCode of [
    'A;Ep', 'A;Ex', 'Ex;Ep', 'Assignment;Expired',
    'A/Ep', 'A+Ep', 'A-Ep', 'A:Ep', 'A—Ep', 'A–Ep', 'A／Ep',
    'A\u00a0Ep', 'A\u200bEp', 'A—P',
    'Unassigned', 'No Assignment', 'Unexercised', 'Not Expired', 'Ex Date',
    'ExDate', 'Cancelled Assignment', 'Exercise Reversal', 'A;X', 'Aep',
    'AssignmentCancelled', 'Reassigned',
    'AEx', 'MEx', 'GEA',
  ]) {
    const conflictingCodeRow = canonicalAssignmentRow.replace(/,A$/, `,${conflictingCode}`)
    const result = parseIbkrActivityStatement(
      currentSchemaFixture.replace(canonicalAssignmentRow, conflictingCodeRow),
    )
    assert(
      hasDiagnostic(result, 'option_event_type_conflict') && !result.report,
      `Conflicting Trades lifecycle codes were silently reduced to one type: ${conflictingCode}; ${diagnosticsText(result)}`,
    )
  }
  const assignmentWithoutContract = canonicalAssignmentRow.replace(
    ',ZZFICTA 19JUN26 125 P,ZZFICTA,',
    ',,ZZFICTA,',
  )
  for (const [row, expectedCode, label] of [
    [assignmentWithoutContract, 'accounting_section_conflict', 'missing contract'],
    [assignmentWithoutContract.replace(/,A$/, ',A;Ep'), 'option_event_type_conflict', 'missing contract and conflicting codes'],
    [canonicalAssignmentRow.replace('Trades,Data,Equity and Index Options,', 'Trades,Data,Stocks,'), 'instrument_alias_conflict', 'misclassified option contract'],
    [canonicalAssignmentRow.replace('Trades,Data,Equity and Index Options,', 'Trades,Data,Stocks,').replace(/,A$/, ',A;Ep'), 'option_event_type_conflict', 'misclassified option contract and conflicting codes'],
  ]) {
    const result = parseIbkrActivityStatement(
      currentSchemaFixture.replace(canonicalAssignmentRow, row),
    )
    assert(
      hasDiagnostic(result, expectedCode) && !result.report,
      `An option lifecycle row with ${label} silently disappeared: ${diagnosticsText(result)}`,
    )
  }
  const opaqueAssignmentRow = 'Trades,Data,Equity and Index Options,USD,OPAQUE-CONTRACT-A,ZZFICTA,"2026-06-19, 16:00:00",-1.000000,0.000000,0.000000,-5.555555,0.000000,220.555555,60.222222,A'
  const dedicatedLifecycleFixture = `${currentSchemaFixture}
"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Underlying Symbol,Date,Transaction Type
"Options Exercises, Assignments and Expirations",Data,OPT,ZZFICTA 19JUN26 125 P,ZZFICTA,2026-06-20,Assignment
"Options Exercises, Assignments and Expirations",Data,OPT,ZZFICTB 17JUL26 80 C,ZZFICTB,2026-07-18,Expiration
`
  const dedicatedLifecycleResult = parseIbkrActivityStatement(
    dedicatedLifecycleFixture,
  )
  assert(
    dedicatedLifecycleResult.report?.events.length === 2 &&
      dedicatedLifecycleResult.report.events.some(
        (event) => event.type === 'assignment' && event.date === '2026-06-20',
      ) &&
      dedicatedLifecycleResult.report.events.some(
        (event) => event.type === 'expiration' && event.date === '2026-07-18',
      ),
    'Dedicated lifecycle rows were combined with Trades and counted twice.',
  )
  const dedicatedEventRow = '"Options Exercises, Assignments and Expirations",Data,OPT,ZZFICTA 19JUN26 125 P,ZZFICTA,2026-06-20,Assignment'
  const dedicatedWithConflictingFallback = parseIbkrActivityStatement(
    dedicatedLifecycleFixture.replace(canonicalAssignmentRow, canonicalAssignmentRow.replace(/,A$/, ',A;Ep')),
  )
  assert(
    hasDiagnostic(dedicatedWithConflictingFallback, 'option_event_type_conflict') &&
      !dedicatedWithConflictingFallback.report,
    `A conflicting unused Trades fallback was hidden by dedicated lifecycle precedence: ${diagnosticsText(dedicatedWithConflictingFallback)}`,
  )
  for (const conflictingCode of ['Assignment;Expired', 'A;Ex']) {
    const result = parseIbkrActivityStatement(
      dedicatedLifecycleFixture.replace(
        dedicatedEventRow,
        dedicatedEventRow.replace(/,Assignment$/, `,${conflictingCode}`),
      ),
    )
    assert(
      hasDiagnostic(result, 'option_event_type_conflict') && !result.report,
      `Conflicting dedicated lifecycle codes were silently reduced to one type: ${conflictingCode}; ${diagnosticsText(result)}`,
    )
  }
  for (const date of ['June 20, 2026', 'June 20, 2026, 16:00:00']) {
    const result = parseIbkrActivityStatement(
      dedicatedLifecycleFixture.replace(
        dedicatedEventRow,
        dedicatedEventRow.replace('2026-06-20', encodeCsvCell(date)),
      ),
    )
    assert(
      result.errors.length === 0 &&
        result.report?.events.some(
          (event) => event.type === 'assignment' && event.date === '2026-06-20',
        ),
      `A supported English event-date form was rejected: ${date}; ${diagnosticsText(result)}`,
    )
  }
  for (const [date, label] of [
    ['', 'missing'],
    ['2026-02-30', 'nonexistent'],
    ['2026-06-20, 25:00:00', 'invalid-time'],
    ['2025-12-31', 'before-period'],
    ['2026-08-16', 'after-period'],
  ]) {
    const result = parseIbkrActivityStatement(
      dedicatedLifecycleFixture.replace(
        dedicatedEventRow,
        dedicatedEventRow.replace('2026-06-20', encodeCsvCell(date)),
      ),
    )
    assert(
      hasDiagnostic(result, 'option_event_date_invalid') && !result.report,
      `A dedicated ${label} option-event date was accepted: ${diagnosticsText(result)}`,
    )
  }
  const missingDedicatedDateColumn = parseIbkrActivityStatement(
    dropSectionColumn(
      dedicatedLifecycleFixture,
      'Options Exercises, Assignments and Expirations',
      'Date',
    ),
  )
  assert(
    hasDiagnostic(missingDedicatedDateColumn, 'option_event_date_invalid') &&
      !missingDedicatedDateColumn.report,
    `A dedicated option-event row without a Date column was accepted: ${diagnosticsText(missingDedicatedDateColumn)}`,
  )
  for (const [date, label] of [
    ['""', 'missing'],
    ['2026-02-30', 'nonexistent'],
    ['2025-12-31', 'before-period'],
    ['2026-08-16', 'after-period'],
  ]) {
    const result = parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        canonicalAssignmentRow,
        canonicalAssignmentRow.replace('"2026-06-19, 16:00:00"', date),
      ),
    )
    assert(
      hasDiagnostic(result, 'option_event_date_invalid') && !result.report,
      `A Trades-fallback ${label} option-event date was accepted: ${diagnosticsText(result)}`,
    )
  }
  const distinctSameDayAssignmentRow = canonicalAssignmentRow
    .replace('16:00:00', '17:00:00')
    .replace(',-1.000000,', ',-2.000000,')
  const distinctSameDayAssignment = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      canonicalAssignmentRow,
      `${canonicalAssignmentRow}\n${distinctSameDayAssignmentRow}`,
    ),
  )
  assert(
    hasDiagnostic(distinctSameDayAssignment, 'option_event_identity_conflict') &&
      !distinctSameDayAssignment.report,
    `Distinct same-day assignment rows were silently collapsed: ${diagnosticsText(distinctSameDayAssignment)}`,
  )
  for (const contractVariant of [
    'zzficta 19jun26 125 p',
    'ZZFICTA   19JUN26 125 P',
    'ZZFICTA260619P00125000',
  ]) {
    const variantAssignmentRow = distinctSameDayAssignmentRow.replace(
      'ZZFICTA 19JUN26 125 P',
      contractVariant,
    )
    const result = parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        canonicalAssignmentRow,
        `${canonicalAssignmentRow}\n${variantAssignmentRow}`,
      ),
    )
    assert(
      hasDiagnostic(result, 'option_event_identity_conflict') && !result.report,
      `A same-contract spelling variant bypassed event collision detection: ${contractVariant}; ${diagnosticsText(result)}`,
    )
  }
  for (const [spacedStrike, compactStrike] of [
    ['125.5', '00125500'],
    ['125.005', '00125005'],
  ]) {
    const spacedAssignmentRow = canonicalAssignmentRow.replace(
      ' 125 P',
      ` ${spacedStrike} P`,
    )
    const compactAssignmentRow = distinctSameDayAssignmentRow.replace(
      'ZZFICTA 19JUN26 125 P',
      `ZZFICTA260619P${compactStrike}`,
    )
    const result = parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        canonicalAssignmentRow,
        `${spacedAssignmentRow}\n${compactAssignmentRow}`,
      ),
    )
    assert(
      hasDiagnostic(result, 'option_event_identity_conflict') && !result.report,
      `An exact decimal strike pair bypassed event collision detection: ${spacedStrike}; ${diagnosticsText(result)}`,
    )
  }
  for (const distinctContract of [
    'ZZFICTA260626P00125000',
    'ZZFICTA260619C00125000',
    'ZZFICTA260619P00125500',
  ]) {
    const distinctContractRow = distinctSameDayAssignmentRow.replace(
      'ZZFICTA 19JUN26 125 P',
      distinctContract,
    )
    const result = parseIbkrActivityStatement(
      currentSchemaFixture.replace(
        canonicalAssignmentRow,
        `${canonicalAssignmentRow}\n${distinctContractRow}`,
      ),
    )
    assert(
      result.errors.length === 0 &&
        result.report?.symbols.find((symbol) =>
          symbol.symbol === 'ZZFICTA')?.assignmentCount === 2,
      `Different option series were incorrectly merged: ${distinctContract}; ${diagnosticsText(result)}`,
    )
  }
  const exactDuplicateAssignment = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      canonicalAssignmentRow,
      `${canonicalAssignmentRow}\n${canonicalAssignmentRow}`,
    ),
  )
  assert(
    exactDuplicateAssignment.errors.length === 0 &&
      exactDuplicateAssignment.report?.symbols.find((symbol) =>
        symbol.symbol === 'ZZFICTA')?.assignmentCount === 1,
    `An exact repeated assignment row changed existing deduplication: ${diagnosticsText(exactDuplicateAssignment)}`,
  )
  const firstAssignmentRowNumber = currentSchemaFixture
    .split('\n')
    .findIndex((row) => row === canonicalAssignmentRow) + 1
  const repeatedTradeRefs = exactDuplicateAssignment.report?.events
    .find((event) => event.type === 'assignment' && event.symbol === 'ZZFICTA')?.sourceRefs
    .filter((ref) => ref.section === 'Trades') ?? []
  assert(
    repeatedTradeRefs.length > 0 &&
      repeatedTradeRefs.every((ref) => ref.rowNumber === firstAssignmentRowNumber),
    'A repeated assignment changed its first-row provenance.',
  )
  const duplicateBeforeDistinct = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      canonicalAssignmentRow,
      `${canonicalAssignmentRow}\n${canonicalAssignmentRow}\n${distinctSameDayAssignmentRow}`,
    ),
  )
  assert(
    hasDiagnostic(duplicateBeforeDistinct, 'option_event_identity_conflict') &&
      !duplicateBeforeDistinct.report,
    'An exact duplicate hid a later distinct same-day assignment.',
  )
  const narrowedRepeatedTrades = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      canonicalAssignmentRow,
      `${canonicalAssignmentRow}\n${canonicalAssignmentRow}\nTrades,Header,Asset Class\n${canonicalAssignmentRow}`,
    ),
  )
  assert(
    hasDiagnostic(narrowedRepeatedTrades, 'accounting_section_conflict') &&
      !narrowedRepeatedTrades.report,
    'Repeated Trades concealed a later changed header and unmapped cells.',
  )
  const distinctSameDayDedicatedRow = dedicatedEventRow.replace(
    '2026-06-20',
    '"2026-06-20, 17:00:00"',
  )
  const distinctSameDayDedicated = parseIbkrActivityStatement(
    dedicatedLifecycleFixture.replace(
      dedicatedEventRow,
      `${dedicatedEventRow}\n${distinctSameDayDedicatedRow}`,
    ),
  )
  assert(
    hasDiagnostic(distinctSameDayDedicated, 'option_event_identity_conflict') &&
      !distinctSameDayDedicated.report,
    `Distinct same-day dedicated events were silently collapsed: ${diagnosticsText(distinctSameDayDedicated)}`,
  )
  const subtotalOnlyLifecycleResult = parseIbkrActivityStatement(`${currentSchemaFixture}
"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Underlying Symbol,Date,Transaction Type
"Options Exercises, Assignments and Expirations",SubTotal,OPT,ZZFICTA 19JUN26 125 P,ZZFICTA,2026-06-20,Assignment
`)
  assert(
    subtotalOnlyLifecycleResult.errors.length === 0 &&
      subtotalOnlyLifecycleResult.report?.events.length === 2 &&
      subtotalOnlyLifecycleResult.report.events.every((event) =>
        event.sourceRefs.every((ref) => ref.recordType !== 'SUBTOTAL'),
      ),
    `A lifecycle subtotal became a real event or suppressed the Trades fallback: ${diagnosticsText(subtotalOnlyLifecycleResult)}`,
  )
  const ambiguousLifecycleTypeResult = parseIbkrActivityStatement(`${currentSchemaFixture}
"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Underlying Symbol,Date,Transaction Type,Type
"Options Exercises, Assignments and Expirations",Data,OPT,ZZFICTA 19JUN26 125 P,ZZFICTA,2026-06-20,Open,Exercise
`)
  assert(
    hasDiagnostic(
      ambiguousLifecycleTypeResult,
      'accounting_section_conflict',
    ) && !ambiguousLifecycleTypeResult.report,
    'A duplicate lifecycle type column was filtered before ambiguity validation and silently fell back to Trades.',
  )
  const misclassifiedDedicatedEventResult = parseIbkrActivityStatement(`${currentSchemaFixture}
"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Underlying Symbol,Date,Transaction Type
"Options Exercises, Assignments and Expirations",Data,Stocks,ZZFICTA 19JUN26 125 P,ZZFICTA,2026-06-20,Exercise
"Options Exercises, Assignments and Expirations",Data,OPT,ZZFICTB 17JUL26 80 C,ZZFICTB,2026-07-18,Expiration
`)
  assert(
    hasDiagnostic(
      misclassifiedDedicatedEventResult,
      'accounting_section_conflict',
    ) && !misclassifiedDedicatedEventResult.report,
    'A non-option dedicated lifecycle Data row disappeared beside a valid event.',
  )
  const lifecycleMappingPrecedenceFixture = `${currentSchemaFixture
    .split('\n')
    .filter((line) => !line.startsWith('Financial Instrument Information,'))
    .join('\n')
    .replace(
      ',ZZFICTA 19JUN26 125 P,ZZFICTA,"2026-06-19, 16:00:00",',
      ',ZZFICTA 19JUN26 125 P,ZZFICTB,"2026-06-19, 16:00:00",',
    )}
"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Date,Transaction Type
"Options Exercises, Assignments and Expirations",Data,OPT,ZZFICTA 19JUN26 125 P,2026-06-20,Assignment
`
  const lifecycleMappingPrecedenceResult = parseIbkrActivityStatement(
    lifecycleMappingPrecedenceFixture,
  )
  const lifecycleMappedAlpha =
    lifecycleMappingPrecedenceResult.report?.symbols.find(
      (symbol) => symbol.symbol === 'ZZFICTA',
    )
  assert(
    lifecycleMappingPrecedenceResult.errors.length === 0 &&
      lifecycleMappedAlpha?.optionYtdMtm === 354.777778 &&
      lifecycleMappedAlpha.optionRealizedYtd === 220.555555 &&
      lifecycleMappingPrecedenceResult.report?.events.length === 1 &&
      lifecycleMappingPrecedenceResult.report.events[0]?.symbol === 'ZZFICTA' &&
      !lifecycleMappingPrecedenceResult.report.events[0]?.sourceRefs.some(
        (ref) => ref.section === 'Trades',
      ),
    `An unselected Trades fallback overrode dedicated lifecycle mapping: ${diagnosticsText(lifecycleMappingPrecedenceResult)}`,
  )
  const explicitUnderlyingResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(canonicalAssignmentRow, opaqueAssignmentRow),
  )
  const explicitUnderlyingEvent = explicitUnderlyingResult.report?.events.find(
    (event) => event.contract === 'OPAQUE-CONTRACT-A',
  )
  assert(
    explicitUnderlyingEvent?.symbol === 'ZZFICTA',
    'An explicit Trades Underlying field did not control an opaque option contract.',
  )
  assert(
    explicitUnderlyingEvent.sourceRefs.some(
      (ref) => ref.section === 'Trades' && ref.field === 'Underlying',
    ),
    'The explicit Trades Underlying provenance was not retained.',
  )

  const conflictingAssignmentRow = canonicalAssignmentRow.replace(
    ',ZZFICTA,"2026-06-19',
    ',ZZFICTB,"2026-06-19',
  )
  const conflictingTradeUnderlyingResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(canonicalAssignmentRow, conflictingAssignmentRow),
  )
  assert(
    hasDiagnostic(conflictingTradeUnderlyingResult, 'instrument_alias_conflict') &&
      !conflictingTradeUnderlyingResult.report,
    'A Trades Underlying that disagreed with the same contract FII mapping was accepted.',
  )

  const ytdOptionHeader = 'Mark-to-Market Performance Summary,Header,Asset Category,Symbol,Prior Quantity,Current Quantity,Prior Price,Current Price,Mark-to-Market P/L Position,Mark-to-Market P/L Transaction,Mark-to-Market P/L Commissions,Mark-to-Market P/L Other,Mark-to-Market P/L Total,Code'
  const ytdOptionHeaderWithUnderlying = ytdOptionHeader.replace(
    ',Symbol,Prior Quantity',
    ',Symbol,Underlying,Prior Quantity',
  )
  const ytdOptionRow = 'Mark-to-Market Performance Summary,Data,Equity and Index Options,ZZFICTA 19JUN26 125 P,-1.000000,0.000000,4.500000,0.000000,300.111111,60.222222,-5.555555,0.000000,354.777778,A'
  const ytdOptionRowWithConflict = ytdOptionRow.replace(
    ',ZZFICTA 19JUN26 125 P,-1.000000',
    ',ZZFICTA 19JUN26 125 P,ZZFICTB,-1.000000',
  )
  const conflictingYtdUnderlying = currentSchemaFixture.replace(
    ytdOptionRow,
    `${ytdOptionHeaderWithUnderlying}\n${ytdOptionRowWithConflict}\n${ytdOptionHeader}`,
  )
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(conflictingYtdUnderlying),
      'instrument_alias_conflict',
    ),
    'A YTD Underlying that disagreed with FII was accepted.',
  )

  const realizedOptionHeader = 'Realized & Unrealized Performance Summary,Header,Asset Class,Symbol,Cost Adj.,Realized S/T Profit,Realized S/T Loss,Realized L/T Profit,Realized L/T Loss,Total Realized P/L,Unrealized S/T Profit,Unrealized S/T Loss,Unrealized L/T Profit,Unrealized L/T Loss,Total Unrealized P/L,Total,Code'
  const realizedOptionHeaderWithUnderlying = realizedOptionHeader.replace(
    ',Symbol,Cost Adj.',
    ',Symbol,Underlying,Cost Adj.',
  )
  const realizedOptionRow = 'Realized & Unrealized Performance Summary,Data,Equity and Index Options,ZZFICTA 19JUN26 125 P,0.000000,220.555555,0.000000,0.000000,0.000000,220.555555,40.666666,0.000000,0.000000,0.000000,40.666666,261.222221,'
  const realizedOptionRowWithConflict = realizedOptionRow.replace(
    ',ZZFICTA 19JUN26 125 P,0.000000',
    ',ZZFICTA 19JUN26 125 P,ZZFICTB,0.000000',
  )
  const conflictingRealizedUnderlying = currentSchemaFixture.replace(
    realizedOptionRow,
    `${realizedOptionHeaderWithUnderlying}\n${realizedOptionRowWithConflict}\n${realizedOptionHeader}`,
  )
  assert(
    hasDiagnostic(
      parseIbkrActivityStatement(conflictingRealizedUnderlying),
      'instrument_alias_conflict',
    ),
    'A realized/unrealized Underlying that disagreed with FII was accepted.',
  )

  const dualUnderlyingHeader = 'Financial Instrument Information,Header,Asset Class,Symbol,Description,Conid,Underlying,Underlying Symbol,Multiplier,Expiry,Type,Strike,Code'
  const agreeingDualUnderlyingRow = 'Financial Instrument Information,Data,Equity and Index Options,ZZFICTA,ZZFICTA 19JUN26 125 P,SYNTH-CONID-DUAL-SAFE,ZZFICTA,  zzficta  ,100,2026-06-19,P,125.000000,'
  const agreeingDualUnderlyingResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${dualUnderlyingHeader}\n${agreeingDualUnderlyingRow}\n`,
  )
  assert(
    agreeingDualUnderlyingResult.errors.length === 0 && agreeingDualUnderlyingResult.report,
    'Agreeing Underlying and Underlying Symbol fields were rejected.',
  )
  const agreeingDualRefs = agreeingDualUnderlyingResult.report.symbols
    .find((symbol) => symbol.symbol === 'ZZFICTA')
    ?.sourceRefs.optionYtdMtm ?? []
  assert(
    agreeingDualRefs.some((ref) => ref.field === 'Underlying') &&
      agreeingDualRefs.some((ref) => ref.field === 'Underlying Symbol'),
    'Agreeing Underlying synonym fields did not retain both source references.',
  )

  const conflictingDualUnderlyingRow = agreeingDualUnderlyingRow.replace(
    ',ZZFICTA,  zzficta  ,100,',
    ',ZZFICTA,ZZFICTB,100,',
  )
  const reversedDualUnderlyingHeader = dualUnderlyingHeader.replace(
    ',Underlying,Underlying Symbol,',
    ',Underlying Symbol,Underlying,',
  )
  const reversedConflictingDualRow = conflictingDualUnderlyingRow.replace(
    ',ZZFICTA,ZZFICTB,100,',
    ',ZZFICTB,ZZFICTA,100,',
  )
  for (const dualFieldConflict of [
    `${currentSchemaFixture}\n${dualUnderlyingHeader}\n${conflictingDualUnderlyingRow}\n`,
    `${currentSchemaFixture}\n${reversedDualUnderlyingHeader}\n${reversedConflictingDualRow}\n`,
  ]) {
    assert(
      hasDiagnostic(
        parseIbkrActivityStatement(dualFieldConflict),
        'instrument_alias_conflict',
      ),
      'Conflicting Underlying synonym fields depended on column order.',
    )
  }

  const withoutInstrumentInformation = currentSchemaFixture
    .split('\n')
    .filter((line) => !line.startsWith('Financial Instrument Information,'))
    .join('\n')
  const fallbackMappingResult = parseIbkrActivityStatement(withoutInstrumentInformation)
  assert(
    fallbackMappingResult.errors.length === 0 &&
      fallbackMappingResult.report?.symbols.some(
        (symbol) => symbol.symbol === 'ZZFICTA' && symbol.optionYtdMtm === 354.777778,
      ),
    'The deterministic option-symbol fallback stopped working without instrument metadata.',
  )

  const multiWordContractFixture = withoutInstrumentInformation
    .replaceAll('ZZFICTA 19JUN26 125 P', 'BRK B 19JUN26 125 P')
    .replace(
      'Trades,Data,Equity and Index Options,USD,BRK B 19JUN26 125 P,ZZFICTA,',
      'Trades,Data,Equity and Index Options,USD,BRK B 19JUN26 125 P,BRK B,',
    )
  const multiWordContractResult = parseIbkrActivityStatement(multiWordContractFixture)
  assert(
    multiWordContractResult.errors.length === 0 &&
      multiWordContractResult.report?.symbols.some(
        (symbol) =>
          symbol.symbol === 'BRK B' &&
          symbol.optionYtdMtm === 354.777778 &&
          symbol.assignmentCount === 1,
      ),
    'A multi-word option underlying was truncated or incorrectly rejected.',
  )

  const adjustedRootFixture = withoutInstrumentInformation.replaceAll(
    'ZZFICTA 19JUN26 125 P',
    'ZZFICTA1 19JUN26 125 P',
  )
  const adjustedRootResult = parseIbkrActivityStatement(adjustedRootFixture)
  assert(
    adjustedRootResult.errors.length === 0 &&
      adjustedRootResult.report?.symbols.some(
        (symbol) =>
          symbol.symbol === 'ZZFICTA' &&
          symbol.optionYtdMtm === 354.777778 &&
          symbol.assignmentCount === 1,
      ) &&
      !adjustedRootResult.report.symbols.some(
        (symbol) => symbol.symbol === 'ZZFICTA1' && symbol.optionYtdMtm !== 0,
      ),
    'An authoritative explicit underlying was rejected because the adjusted contract root differed.',
  )

  const noFiiOpaqueResult = parseIbkrActivityStatement(
    withoutInstrumentInformation.replace(canonicalAssignmentRow, opaqueAssignmentRow),
  )
  assert(
    noFiiOpaqueResult.errors.length === 0 &&
      noFiiOpaqueResult.report?.events.some(
        (event) => event.contract === 'OPAQUE-CONTRACT-A' && event.symbol === 'ZZFICTA',
      ),
    'A unique explicit underlying for an opaque contract was rejected without FII.',
  )

  const noFiiExplicitOverride = parseIbkrActivityStatement(
    withoutInstrumentInformation.replace(canonicalAssignmentRow, conflictingAssignmentRow),
  )
  assert(
    noFiiExplicitOverride.errors.length === 0 &&
      noFiiExplicitOverride.report?.events.some(
        (event) =>
          event.contract === 'ZZFICTA 19JUN26 125 P' && event.symbol === 'ZZFICTB',
      ) &&
      noFiiExplicitOverride.report.symbols.some(
        (symbol) => symbol.symbol === 'ZZFICTB' && symbol.optionYtdMtm === 450.222223,
      ),
    'An authoritative explicit underlying did not override a contract-string fallback across sections.',
  )

  const opaqueYtdOptionRow = ytdOptionRow.replace(
    ',ZZFICTA 19JUN26 125 P,-1.000000',
    ',OPAQUE-CONTRACT-A,ZZFICTA,-1.000000',
  )
  const conflictingOpaqueAssignmentRow = opaqueAssignmentRow.replace(
    ',ZZFICTA,"2026-06-19',
    ',ZZFICTB,"2026-06-19',
  )
  const noFiiOpaqueCrossSectionConflict = withoutInstrumentInformation
    .replace(
      ytdOptionRow,
      `${ytdOptionHeaderWithUnderlying}\n${opaqueYtdOptionRow}\n${ytdOptionHeader}`,
    )
    .replace(canonicalAssignmentRow, conflictingOpaqueAssignmentRow)
  const noFiiOpaqueCrossSectionResult = parseIbkrActivityStatement(
    noFiiOpaqueCrossSectionConflict,
  )
  assert(
    hasDiagnostic(noFiiOpaqueCrossSectionResult, 'instrument_alias_conflict') &&
      !noFiiOpaqueCrossSectionResult.report,
    'Conflicting explicit underlyings for the same opaque contract across YTD and Trades were accepted.',
  )

  const allSourceRefs = [
    ...Object.values(currentReport.metricSourceRefs).flat(),
    ...currentReport.reconciliations.flatMap((check) => check.sourceRefs),
    ...currentReport.symbols.flatMap((symbol) => Object.values(symbol.sourceRefs).flat()),
    ...currentReport.events.flatMap((event) => event.sourceRefs),
  ]
  const serializedRefs = JSON.stringify(allSourceRefs)
  for (const forbidden of ['"raw"', '"value"', 'filename', 'accountId']) {
    assert(!serializedRefs.includes(forbidden), `Source references expose forbidden property: ${forbidden}`)
  }

  const higherReported = sample.replace(
    'Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,20040,0,0,0,0',
    'Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,20041,0,0,0,0',
  )
  assert(
    parseIbkrActivityStatement(higherReported).report?.mtmReconciliationDifference === 1,
    'A broker total above the parsed sum did not produce a positive signed difference.',
  )
  const lowerReported = sample.replace(
    'Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,20040,0,0,0,0',
    'Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,20039,0,0,0,0',
  )
  assert(
    parseIbkrActivityStatement(lowerReported).report?.mtmReconciliationDifference === -1,
    'A broker total below the parsed sum did not produce a negative signed difference.',
  )

  const missingNavComponent = currentSchemaFixture.replace(
    'Change in NAV,Data,Other FX Translations,-1.111111\n',
    '',
  )
  assert(
    parseIbkrActivityStatement(missingNavComponent).report?.reconciliations.find(
      (check) => check.id === 'nav_bridge',
    )?.status === 'NOT_AVAILABLE',
    'A missing NAV component was silently treated as zero.',
  )

  const mismatchedStatementPnl = currentSchemaFixture.replace(
    'Total P/L for Statement Period,,,,,,,,,,,,750.243455,',
    'Total P/L for Statement Period,,,,,,,,,,,,751.243455,',
  )
  const mismatchedStatementCheck = parseIbkrActivityStatement(
    mismatchedStatementPnl,
  ).report?.reconciliations.find((check) => check.id === 'statement_period_pnl')
  assert(
    mismatchedStatementCheck?.status === 'WARNING' && mismatchedStatementCheck.difference === 1,
    'A statement-period P&L mismatch did not produce a positive signed warning.',
  )

  const monthly = sample.replace(
    'January 1, 2026 - August 27, 2026',
    'August 1, 2026 - August 27, 2026',
  )
  const monthlyResult = parseIbkrActivityStatement(monthly, 'monthly.csv')
  assert(
    hasDiagnostic(monthlyResult, 'not_ytd'),
    'A non-YTD report was not rejected.',
  )

  const futureDated = sample.replace(
    'January 1, 2026 - August 27, 2026',
    'January 1, 2026 - August 31, 2026',
  )
  assert(
    hasDiagnostic(parseIbkrActivityStatement(futureDated), 'future_end_date'),
    'A future statement end date was not rejected.',
  )

  const invalidCalendarDate = sample.replace(
    'January 1, 2026 - August 27, 2026',
    'January 1, 2026 - February 30, 2026',
  )
  assert(
    hasDiagnostic(parseIbkrActivityStatement(invalidCalendarDate), 'statement_period_missing'),
    'A nonexistent statement date was not rejected.',
  )

  const priorSeason = sample.replace(
    'January 1, 2026 - August 27, 2026',
    'January 1, 2025 - August 27, 2025',
  )
  assert(
    hasDiagnostic(parseIbkrActivityStatement(priorSeason), 'wrong_season'),
    'A prior-year statement was not rejected against the injected current date.',
  )

  const reversedPeriod = sample.replace(
    'January 1, 2026 - August 27, 2026',
    'December 31, 2026 - August 27, 2026',
  )
  assert(
    hasDiagnostic(parseIbkrActivityStatement(reversedPeriod), 'period_reversed'),
    'A reversed statement date range was not rejected.',
  )

  const multiAccount = `${sample}\nAccount Information,Data,Account,U9992026\n`
  const multiResult = parseIbkrActivityStatement(multiAccount, 'multi-account.csv')
  assert(
    hasDiagnostic(multiResult, 'multi_account'),
    'A multi-account report was not rejected.',
  )

  const codedAssignment = sample.replace(
    '2026-07-18,Assignment',
    '2026-07-18,A;P',
  )
  const codedResult = parseIbkrActivityStatement(codedAssignment, 'coded-event.csv')
  assert(
    codedResult.report?.events.some((event) => event.symbol === 'NVDA' && event.type === 'assignment'),
    'A combined assignment code was not recognized.',
  )

  const withForex = sample.replace(
    'Month & Year to Date Performance Summary,Data,Stocks,NVDA,NVIDIA Corp.,600,9840,500,4100,0,0',
    'Month & Year to Date Performance Summary,Data,Stocks,NVDA,NVIDIA Corp.,600,9840,500,4100,0,0\nMonth & Year to Date Performance Summary,Data,Forex,EUR.USD,Forex conversion,0,125,0,0,0,0',
  )
  const forexResult = parseIbkrActivityStatement(withForex, 'with-forex.csv')
  assert(forexResult.report?.otherPnl === 125, 'Explicit non-stock performance was not classified as Other.')
  assert(forexResult.report?.stockPnl === 13690, 'Forex performance polluted stock P&L.')

  for (const cfdCategory of ['Equity CFD', 'Stock CFD']) {
    const cfdFixture = currentSchemaFixture.replace(
      'Mark-to-Market Performance Summary,Data,Forex,XTS.USD,',
      `Mark-to-Market Performance Summary,Data,${cfdCategory},XTS.USD,`,
    )
    const cfdResult = parseIbkrActivityStatement(cfdFixture)
    const cfdSymbol = cfdResult.report?.symbols.find(
      (symbol) => symbol.symbol === 'XTS.USD',
    )
    assert(
      cfdResult.report?.otherPnl === 122.278756 &&
        cfdResult.report.stockPnl === 167.622477 &&
        cfdSymbol?.otherYtdMtm === 122.278756 &&
        cfdSymbol.stockYtdMtm === 0,
      `An explicit ${cfdCategory} category was incorrectly classified as stock.`,
    )
  }
  for (const unsupportedOptionCategory of [
    'Options on Futures',
    'Futures Options',
  ]) {
    const unsupportedOptionFixture = currentSchemaFixture.replace(
      'Mark-to-Market Performance Summary,Data,Forex,XTS.USD,',
      `Mark-to-Market Performance Summary,Data,${unsupportedOptionCategory},XTS.USD,`,
    )
    const unsupportedOptionResult = parseIbkrActivityStatement(
      unsupportedOptionFixture,
    )
    const unsupportedOptionSymbol =
      unsupportedOptionResult.report?.symbols.find(
        (symbol) => symbol.symbol === 'XTS.USD',
      )
    assert(
      unsupportedOptionResult.errors.length === 0 &&
        unsupportedOptionResult.report?.optionPnl === 450.222223 &&
        unsupportedOptionResult.report.otherPnl === 122.278756 &&
        unsupportedOptionSymbol?.optionYtdMtm === 0 &&
        unsupportedOptionSymbol.otherYtdMtm === 122.278756,
      `Unsupported ${unsupportedOptionCategory} performance entered the equity/index option ranking bucket.`,
    )
  }

  const currentMtmStyle = currentSchemaFixture
    .replaceAll(
      'Mark-to-Market P/L Position',
      'Prior Open MTM Profit and Loss',
    )
    .replaceAll(
      'Mark-to-Market P/L Transaction',
      'Transaction MTM Profit and Loss',
    )
    .replaceAll('Mark-to-Market P/L Commissions', 'Commissions')
    .replaceAll('Mark-to-Market P/L Other', 'Other')
    .replaceAll('Mark-to-Market P/L Total', 'Total')
    .replaceAll('Mark-to-Market Performance Summary', 'MTMP')
  const currentMtmResult = parseIbkrActivityStatement(currentMtmStyle)
  assert(
    currentMtmResult.report?.seasonPnl === 740.123456,
    'The official code-tagged Mark-to-Market Flex field layout was not parsed.',
  )
  const currentMtmWithoutOther = dropSectionColumn(
    currentMtmStyle,
    'MTMP',
    'Other',
  )
  const currentMtmWithoutOtherResult = parseIbkrActivityStatement(
    currentMtmWithoutOther,
  )
  assert(
    currentMtmWithoutOtherResult.report?.seasonPnl === 740.123456,
    `A current Flex MTMP layout without the retired Other field was rejected: ${diagnosticsText(currentMtmWithoutOtherResult)}`,
  )
  assert(
    currentMtmWithoutOtherResult.report.statementPeriodTotalPnl === undefined &&
      currentMtmWithoutOtherResult.report.dataQuality === 'warning' &&
      ['statement_period_pnl', 'nav_bridge'].every((id) =>
        currentMtmWithoutOtherResult.report.reconciliations.find((check) => check.id === id)?.status === 'NOT_AVAILABLE',
      ),
    'A headerless old-width Total P/L row was guessed against a shorter Flex MTMP header.',
  )
  const currentMtmWithoutOtherAlignedTotal = parseCsvRows(currentMtmWithoutOther)
    .map((row) => {
      if (row[0] !== 'Total P/L for Statement Period') return row
      const aligned = [...row]
      assert(aligned[11] === '' && aligned[12] === '750.243455')
      aligned.splice(11, 1)
      return aligned
    })
    .map((row) => row.map(encodeCsvCell).join(','))
    .join('\n')
  const currentMtmWithoutOtherAlignedResult = parseIbkrActivityStatement(
    currentMtmWithoutOtherAlignedTotal,
  )
  assert(
    currentMtmWithoutOtherAlignedResult.report?.statementPeriodTotalPnl === 750.243455 &&
      currentMtmWithoutOtherAlignedResult.report.dataQuality === 'good' &&
      ['statement_period_pnl', 'nav_bridge'].every((id) =>
        currentMtmWithoutOtherAlignedResult.report.reconciliations.find((check) => check.id === id)?.status === 'PASS_EXACT',
      ),
    `An aligned headerless Total P/L row was not reconciled: ${diagnosticsText(currentMtmWithoutOtherAlignedResult)}`,
  )

  const wrongReportType = sample.replace(
    'Statement,Header,Field Name,Field Value',
    'Statement,Header,Field Name,Field Value\nStatement,Data,Title,Portfolio Analyst',
  )
  const wrongReportResult = parseIbkrActivityStatement(wrongReportType)
  assert(
    hasDiagnostic(wrongReportResult, 'not_activity_statement'),
    'A non-Activity Statement title was not rejected.',
  )

  for (const invalidCurrency of ['US', '', '<img>', 'TOO_LONG', 'U\u0000D']) {
    const invalidCurrencyFixture = currentSchemaFixture.replace(
      'Account Information,Data,Base Currency,USD',
      `Account Information,Data,Base Currency,${invalidCurrency}`,
    )
    const invalidCurrencyResult = parseIbkrActivityStatement(invalidCurrencyFixture)
    assert(
      hasDiagnostic(
        invalidCurrencyResult,
        invalidCurrency ? 'currency_invalid' : 'currency_missing',
      ),
      'An invalid or missing base currency was not rejected.',
    )
    if (invalidCurrency) {
      assert(
        !JSON.stringify(invalidCurrencyResult.errors).includes(invalidCurrency),
        'A rejected base currency was reflected into an error message.',
      )
    }
  }

  for (const validCurrency of ['USD', 'HKD', 'CNY']) {
    const validCurrencyFixture = currentSchemaFixture.replace(
      'Account Information,Data,Base Currency,USD',
      `Account Information,Data,Base Currency,${validCurrency}`,
    )
    assert(
      parseIbkrActivityStatement(validCurrencyFixture).report?.baseCurrency === validCurrency,
      `A valid ${validCurrency} base currency was rejected.`,
    )
  }

  const conflictingCurrency = `${currentSchemaFixture}\nAccount Information,Data,Base Currency,CNY\n`
  assert(
    hasDiagnostic(parseIbkrActivityStatement(conflictingCurrency), 'currency_conflict'),
    'Conflicting base currencies were not rejected.',
  )

  const missingAccount = currentSchemaFixture.replace(
    'Account Information,Data,Account,SYNTHETIC_ACCOUNT_2026_A\n',
    '',
  )
  const missingAccountResult = parseIbkrActivityStatement(missingAccount)
  assert(
    hasDiagnostic(missingAccountResult, 'account_missing'),
    'A missing account identifier was not rejected with a fixed error.',
  )
  assert(!missingAccountResult.report, 'A report was created without an account identifier.')

  const collectVisitedCsvRows = (text) => {
    const rows = []
    const rowNumbers = []
    const rowCount = visitCsvRows(text, (row, rowNumber) => {
      rows.push(row)
      rowNumbers.push(rowNumber)
    })
    assert(rowCount === rows.length, 'visitCsvRows returned the wrong row count.')
    assert(
      rowNumbers.every((rowNumber, index) => rowNumber === index + 1),
      'visitCsvRows returned non-contiguous logical row numbers.',
    )
    return rows
  }
  const tokenizerEquivalenceFixture = [
    '\uFEFFSection,Header,Name,Note',
    'Statement,Data,"\u4e2d\u6587 \ud83d\ude00","line one',
    'line two with ""quote"""',
    '',
    ',,,',
    'Final,Data,\u5c3e\u884c,\ud83d\ude42',
  ].join('\r\n')
  const expectedTokenizerRows = [
    ['Section', 'Header', 'Name', 'Note'],
    ['Statement', 'Data', '\u4e2d\u6587 \ud83d\ude00', 'line one\r\nline two with "quote"'],
    ['Final', 'Data', '\u5c3e\u884c', '\ud83d\ude42'],
  ]
  const parsedTokenizerRows = parseCsvRows(tokenizerEquivalenceFixture)
  const visitedTokenizerRows = collectVisitedCsvRows(tokenizerEquivalenceFixture)
  assert(
    isDeepStrictEqual(parsedTokenizerRows, expectedTokenizerRows),
    `parseCsvRows changed BOM/CRLF/quoted/Unicode behavior: ${JSON.stringify(parsedTokenizerRows)}`,
  )
  assert(
    isDeepStrictEqual(visitedTokenizerRows, expectedTokenizerRows),
    `visitCsvRows changed BOM/CRLF/quoted/Unicode behavior: ${JSON.stringify(visitedTokenizerRows)}`,
  )
  assert(
    isDeepStrictEqual(visitedTokenizerRows, parsedTokenizerRows),
    'parseCsvRows and visitCsvRows produced different logical rows.',
  )

  const exactFieldBoundaryCsv = Array.from(
    { length: MAX_CSV_FIELDS_PER_ROW },
    (_, index) => `F${index}`,
  ).join(',')
  const exactFieldRows = parseCsvRows(exactFieldBoundaryCsv)
  const exactVisitedFieldRows = collectVisitedCsvRows(exactFieldBoundaryCsv)
  assert(
    exactFieldRows.length === 1 &&
      exactFieldRows[0].length === MAX_CSV_FIELDS_PER_ROW,
    'parseCsvRows rejected the exact 4,096-field boundary.',
  )
  assert(
    isDeepStrictEqual(exactVisitedFieldRows, exactFieldRows),
    'visitCsvRows did not match parseCsvRows at the exact 4,096-field boundary.',
  )

  const assertTooManyCsvFields = (operation, label) => {
    let failure
    try {
      operation()
    } catch (error) {
      failure = error
    }
    assert(
      failure instanceof CsvParseFailure && failure.code === 'csv_too_many_fields',
      `${label} did not throw fixed csv_too_many_fields at 4,097 fields.`,
    )
  }
  const overFieldBoundaryCsv = `${exactFieldBoundaryCsv},overflow`
  assertTooManyCsvFields(
    () => parseCsvRows(overFieldBoundaryCsv),
    'parseCsvRows',
  )
  assertTooManyCsvFields(
    () => visitCsvRows(overFieldBoundaryCsv, () => {}),
    'visitCsvRows',
  )
  const overFieldBoundaryResult = parseIbkrActivityStatement(
    overFieldBoundaryCsv,
  )
  assert(
    hasDiagnostic(overFieldBoundaryResult, 'csv_too_many_fields') &&
      !overFieldBoundaryResult.report,
    'The parser did not expose the fixed csv_too_many_fields diagnostic.',
  )

  const malformedResult = parseIbkrActivityStatement('Statement,Data,"unterminated')
  assert(
    hasDiagnostic(malformedResult, 'csv_unterminated_quote'),
    'An unterminated quoted field was not rejected.',
  )
  const malformedAmountText = currentSchemaFixture.replace(
    ',740.123456,',
    ',7"40.123456",',
  )
  assert(
    malformedAmountText !== currentSchemaFixture,
    'The fictional total-amount quote fixture changed unexpectedly.',
  )
  const malformedAmountResult = parseIbkrActivityStatement(malformedAmountText)
  assert(
    hasDiagnostic(malformedAmountResult, 'csv_malformed') &&
      !malformedAmountResult.report,
    `A malformed quoted financial total was accepted: ${diagnosticsText(malformedAmountResult)}`,
  )
  for (const malformedCell of ['"\n740.123456\n"', ' 740.123456 ']) {
    const malformedWhitespaceText = currentSchemaFixture.replace(
      ',740.123456,',
      `,${malformedCell},`,
    )
    const malformedWhitespaceResult = parseIbkrActivityStatement(malformedWhitespaceText)
    assert(
      hasDiagnostic(malformedWhitespaceResult, 'accounting_value_invalid') &&
        !malformedWhitespaceResult.report,
      `Whitespace-wrapped financial total was accepted: ${JSON.stringify(malformedCell)} ${diagnosticsText(malformedWhitespaceResult)}`,
    )
  }
  const malformedReturnText = currentSchemaFixture.replace(
    '7.654321%',
    '"\n7.654321%\n"',
  )
  assert(malformedReturnText !== currentSchemaFixture, 'The fictional return fixture changed unexpectedly.')
  const malformedReturnResult = parseIbkrActivityStatement(malformedReturnText)
  assert(
    hasDiagnostic(malformedReturnResult, 'accounting_value_invalid') &&
      !malformedReturnResult.report,
    `Whitespace-wrapped TWR was accepted: ${diagnosticsText(malformedReturnResult)}`,
  )

  const oversizedResult = parseIbkrActivityStatement('x'.repeat(10_000_001))
  assert(
    hasDiagnostic(oversizedResult, 'csv_too_large'),
    'An oversized CSV payload was not rejected before parsing.',
  )

  const oversizedFieldResult = parseIbkrActivityStatement(
    `Statement,Data,"${'x'.repeat(250_001)}"`,
  )
  assert(
    hasDiagnostic(oversizedFieldResult, 'csv_field_too_large'),
    'An oversized individual CSV field was not rejected.',
  )

  const tooManyRowsResult = parseIbkrActivityStatement(
    `${'Statement,Data,Field,Value\n'.repeat(100_001)}`,
  )
  assert(
    hasDiagnostic(tooManyRowsResult, 'csv_too_many_rows'),
    'A row-exhaustion payload was not rejected.',
  )

  console.log('Parser smoke suite passed.')
  console.log({
    seasonPnl: result.report.seasonPnl,
    stockPnl: result.report.stockPnl,
    optionPnl: result.report.optionPnl,
    symbols: result.report.symbols.length,
    events: result.report.events.length,
    numericGrammarCases:
      supportedNumericForms.length +
      rejectedNumericForms.length +
      supportedPercentForms.length +
      rejectedPercentForms.length,
    sectionBoundaryCases: 12,
    explicitOtherAssetCases: 5,
    localizedDiagnosticCodes: PARSER_DIAGNOSTIC_CODES.length,
    currentSchemaChecks: 5,
    sourceReferenceChecks: allSourceRefs.length,
  })
} finally {
  rmSync(output, { recursive: true, force: true })
}
