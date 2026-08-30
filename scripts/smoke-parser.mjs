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
  const { parseDateFlexible, toIsoDate } = require(join(output, 'lib/csv.js'))
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

  assert(toIsoDate(parseDateFlexible('2024-02-29')) === '2024-02-29', 'A valid leap date was rejected.')
  assert(parseDateFlexible('2026-02-29') === undefined, 'A nonexistent numeric date was normalized instead of rejected.')
  assert(toIsoDate(parseDateFlexible('February 29, 2024')) === '2024-02-29', 'A valid English leap date was rejected.')
  assert(parseDateFlexible('February 30, 2026') === undefined, 'A nonexistent English date was normalized instead of rejected.')

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
    negativeCases: 31,
    compatibilityCases: 10,
    localizedDiagnosticCodes: PARSER_DIAGNOSTIC_CODES.length,
    currentSchemaChecks: 5,
    sourceReferenceChecks: allSourceRefs.length,
  })
} finally {
  rmSync(output, { recursive: true, force: true })
}
