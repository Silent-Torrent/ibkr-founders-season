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
    ],
    { stdio: 'inherit' },
  )

  writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}\n')
  const require = createRequire(import.meta.url)
  const { parseIbkrActivityStatement } = require(join(output, 'lib/ibkr.js'))
  const sample = readFileSync(resolve(projectRoot, 'public/sample-ibkr-ytd.csv'), 'utf8')
  const currentSchemaFixture = readFileSync(
    resolve(projectRoot, 'tests/fixtures/ibkr-current-schema-synthetic.csv'),
    'utf8',
  )

  const result = parseIbkrActivityStatement(sample, 'sample-ibkr-ytd.csv')
  assert(result.errors.length === 0 && result.report, `Parser errors: ${result.errors.join('; ')}`)
  assert(result.report.seasonPnl === 20040, `Unexpected season P&L: ${result.report.seasonPnl}`)
  assert(result.report.stockPnl === 13690, `Unexpected stock P&L: ${result.report.stockPnl}`)
  assert(result.report.optionPnl === 6350, `Unexpected options P&L: ${result.report.optionPnl}`)
  assert(result.report.events.length === 5, `Unexpected event count: ${result.report.events.length}`)
  assert(result.report.mtmReconciliationDifference === 0, `Unexpected reconciliation difference: ${result.report.mtmReconciliationDifference}`)
  assert(result.report.symbols.length === 6, `Unexpected symbol count: ${result.report.symbols.length}`)
  assert(
    result.report.reconciliations.find((check) => check.id === 'mtm_all_assets')?.status === 'PASS_EXACT',
    'The bundled sample MTM check did not pass exactly.',
  )

  const currentSchemaResult = parseIbkrActivityStatement(currentSchemaFixture)
  assert(
    currentSchemaResult.errors.length === 0 && currentSchemaResult.report,
    `Current-schema fixture errors: ${currentSchemaResult.errors.join('; ')}`,
  )
  const currentReport = currentSchemaResult.report
  assert(currentReport.seasonPnl === 740.123456, `Unexpected current-schema Season P&L: ${currentReport.seasonPnl}`)
  assert(currentReport.stockPnl === 167.622477, `Unexpected current-schema Stock P&L: ${currentReport.stockPnl}`)
  assert(currentReport.optionPnl === 450.222223, `Unexpected current-schema Options P&L: ${currentReport.optionPnl}`)
  assert(currentReport.otherPnl === 122.278756, `Unexpected current-schema Other P&L: ${currentReport.otherPnl}`)
  assert(currentReport.dataQuality === 'good', 'A supported Other bucket was incorrectly treated as a reconciliation failure.')
  assert(currentReport.statementPeriodTotalPnl === 750.243455, 'Statement-period P&L was not parsed from the verified empty record-type row.')
  assert(currentReport.beginningNav === 25000.125, 'Beginning NAV was not parsed.')
  assert(currentReport.endingNav === 33750.368455, 'Ending NAV was not parsed.')
  assert(currentReport.calculatedEndingNav === 33750.368455, 'Calculated ending NAV is incorrect.')

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
    monthlyResult.errors.some((error) => error.includes('Year-to-Date')),
    'A non-YTD report was not rejected.',
  )

  const multiAccount = `${sample}\nAccount Information,Data,Account,U9992026\n`
  const multiResult = parseIbkrActivityStatement(multiAccount, 'multi-account.csv')
  assert(
    multiResult.errors.some((error) => error.includes('one IBKR account')),
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

  const currentMtmStyle = sample
    .replaceAll(
      'Month & Year to Date Performance Summary',
      'Mark-to-Market Performance Summary',
    )
    .replace('YTD Mark-to-Market', 'Mark-to-Market P/L Total')
  const currentMtmResult = parseIbkrActivityStatement(currentMtmStyle)
  assert(
    currentMtmResult.report?.seasonPnl === 20040,
    'The current Mark-to-Market Performance Summary field aliases were not parsed.',
  )

  const wrongReportType = sample.replace(
    'Statement,Header,Field Name,Field Value',
    'Statement,Header,Field Name,Field Value\nStatement,Data,Title,Portfolio Analyst',
  )
  const wrongReportResult = parseIbkrActivityStatement(wrongReportType)
  assert(
    wrongReportResult.errors.some((error) => error.includes('Activity Statement')),
    'A non-Activity Statement title was not rejected.',
  )

  const malformedResult = parseIbkrActivityStatement('Statement,Data,"unterminated')
  assert(
    malformedResult.errors.some((error) => error.includes('unterminated')),
    'An unterminated quoted field was not rejected.',
  )

  const oversizedResult = parseIbkrActivityStatement('x'.repeat(10_000_001))
  assert(
    oversizedResult.errors.some((error) => error.includes('safety limit')),
    'An oversized CSV payload was not rejected before parsing.',
  )

  const oversizedFieldResult = parseIbkrActivityStatement(
    `Statement,Data,"${'x'.repeat(250_001)}"`,
  )
  assert(
    oversizedFieldResult.errors.some((error) => error.includes('field exceeds')),
    'An oversized individual CSV field was not rejected.',
  )

  const tooManyRowsResult = parseIbkrActivityStatement(
    `${'Statement,Data,Field,Value\n'.repeat(100_001)}`,
  )
  assert(
    tooManyRowsResult.errors.some((error) => error.includes('too many rows')),
    'A row-exhaustion payload was not rejected.',
  )

  console.log('Parser smoke suite passed.')
  console.log({
    seasonPnl: result.report.seasonPnl,
    stockPnl: result.report.stockPnl,
    optionPnl: result.report.optionPnl,
    symbols: result.report.symbols.length,
    events: result.report.events.length,
      negativeCases: 7,
      compatibilityCases: 3,
      currentSchemaChecks: 5,
      sourceReferenceChecks: allSourceRefs.length,
    })
} finally {
  rmSync(output, { recursive: true, force: true })
}
