import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
  const { parseIbkrActivityStatement: parseIbkrActivityStatementRaw } = require(join(output, 'lib/ibkr.js'))
  const {
    parseCsvRows,
    parseDateFlexible,
    parseNumber,
    parsePercent,
    sumExactNumbers,
    toIsoDate,
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
  const rejectedPercentForms = ['7%%', '$1%', 'USD 1%', '1% USD', '(7.5)%', '(7.5%)']
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
  const allAssetsYtdRow = currentSchemaFixture
    .split('\n')
    .find((line) =>
      line.startsWith(
        'Mark-to-Market Performance Summary,Data,Total (All Assets),',
      ),
    )
  assert(
    stockDetailTemplate && allAssetsYtdRow,
    'The punctuation-identity fixture is incomplete.',
  )
  const punctuationIdentityResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      allAssetsYtdRow,
      `${stockDetailTemplate.replace(',ZZFICTA,', ',BRK.B,')}\n${stockDetailTemplate.replace(',ZZFICTA,', ',BRK-B,')}\n${allAssetsYtdRow}`,
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
    'Distinct punctuated symbols collapsed into one accounting identity.',
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
    currentSchemaFixture.replaceAll('Mark-to-Market Performance Summary', 'PLUI'),
  )
  assert(
    codedPluiResult.errors.length === 0 &&
      codedPluiResult.report?.seasonPnl === 740.123456,
    'The registered PLUI YTD section code was rejected.',
  )
  for (const ytdSectionName of [
    'Mark-to-Market Performance Summary in Base',
    'Month & Year to Date Performance Summary',
    'Month & Year to Date Performance Summary in Base',
    'Month and Year to Date Performance Summary',
    'Month and Year to Date Performance Summary in Base',
    'Profit and Loss by Underlying Instruments',
  ]) {
    const namedYtdResult = parseIbkrActivityStatement(
      currentSchemaFixture.replaceAll(
        'Mark-to-Market Performance Summary',
        ytdSectionName,
      ),
    )
    assert(
      namedYtdResult.errors.length === 0 &&
        namedYtdResult.report?.seasonPnl === 740.123456,
      `A registered YTD section name was rejected: ${ytdSectionName}`,
    )
  }
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

  const secondaryYtdSection = currentSchemaFixture
    .split('\n')
    .filter((line) => line.startsWith('Mark-to-Market Performance Summary,'))
    .join('\n')
    .replaceAll(
      'Mark-to-Market Performance Summary',
      'Month & Year to Date Performance Summary',
    )
  const coexistingYtdResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\n${secondaryYtdSection}\n`,
  )
  assert(
    hasDiagnostic(coexistingYtdResult, 'accounting_section_conflict') &&
      !coexistingYtdResult.report,
    'Multiple alternative YTD sections were guessed between instead of failing closed.',
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
    'Conflicting alternative YTD sections were accepted.',
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

  const canonicalAssignmentRow = 'Trades,Data,Equity and Index Options,USD,ZZFICTA 19JUN26 125 P,ZZFICTA,"2026-06-19, 16:00:00",-1.000000,0.000000,0.000000,-5.555555,0.000000,220.555555,60.222222,A'
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

  const malformedResult = parseIbkrActivityStatement('Statement,Data,"unterminated')
  assert(
    hasDiagnostic(malformedResult, 'csv_unterminated_quote'),
    'An unterminated quoted field was not rejected.',
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
    explicitOtherAssetCases: 3,
    localizedDiagnosticCodes: PARSER_DIAGNOSTIC_CODES.length,
    currentSchemaChecks: 5,
    sourceReferenceChecks: allSourceRefs.length,
  })
} finally {
  rmSync(output, { recursive: true, force: true })
}
