import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createServer } from 'vite'
import {
  generateSyntheticDuplicateTradesStatement,
  generateSyntheticFiiMaterializationStatement,
  generateSyntheticFiiCandidateMappingsStatement,
  SYNTHETIC_CAPACITY_ROWS,
  SYNTHETIC_CAPACITY_TARGET_BYTES,
  SYNTHETIC_DUPLICATE_TRADE_ROWS,
  SYNTHETIC_FII_CANDIDATE_OPTION_ROWS,
  SYNTHETIC_FII_UNUSED_OPTION_ROWS,
} from './synthetic-capacity-statement.mjs'

const referenceTime = new Date(Date.UTC(2026, 7, 30, 12))
const accountComparisonSalt = 'fii-materialization-regression'

function reportSourceRefs(report) {
  return [
    ...report.symbols.flatMap((symbol) =>
      Object.values(symbol.sourceRefs).flatMap((refs) => refs ?? []),
    ),
    ...report.events.flatMap((event) => event.sourceRefs),
    ...Object.values(report.metricSourceRefs).flatMap((refs) => refs ?? []),
    ...report.reconciliations.flatMap((check) => check.sourceRefs),
  ]
}

function coreReportProjection(report) {
  return {
    baseCurrency: report.baseCurrency,
    events: report.events.map(({ contract, date, symbol, type }) => ({
      contract,
      date,
      symbol,
      type,
    })),
    optionPnl: report.optionPnl,
    otherPnl: report.otherPnl,
    parsedAllAssetsYtdMtm: report.parsedAllAssetsYtdMtm,
    reportedAllAssetsYtdMtm: report.reportedAllAssetsYtdMtm,
    seasonPnl: report.seasonPnl,
    stockPnl: report.stockPnl,
    symbols: report.symbols.map((symbol) => ({
      assignmentCount: symbol.assignmentCount,
      exerciseCount: symbol.exerciseCount,
      expirationCount: symbol.expirationCount,
      optionYtdMtm: symbol.optionYtdMtm,
      otherYtdMtm: symbol.otherYtdMtm,
      stockYtdMtm: symbol.stockYtdMtm,
      symbol: symbol.symbol,
      totalYtdMtm: symbol.totalYtdMtm,
    })),
  }
}

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { parseIbkrActivityStatement } = await vite.ssrLoadModule(
    '/src/lib/ibkr.ts',
  )
  const results = []

  for (const noiseOrder of ['before', 'after']) {
    const statement = generateSyntheticFiiMaterializationStatement({ noiseOrder })
    assert.equal(statement.byteLength, SYNTHETIC_CAPACITY_TARGET_BYTES)
    assert.equal(Buffer.byteLength(statement.text, 'utf8'), SYNTHETIC_CAPACITY_TARGET_BYTES)
    assert.equal(statement.rowCount, SYNTHETIC_CAPACITY_ROWS)
    assert.equal(statement.text.split('\n').length, SYNTHETIC_CAPACITY_ROWS)
    assert.equal(statement.unusedOptionRows, SYNTHETIC_FII_UNUSED_OPTION_ROWS)
    assert(statement.unusedOptionRows >= 20_000)

    const noiseRows = statement.text
      .split('\n')
      .slice(statement.firstNoiseRowNumber - 1, statement.lastNoiseRowNumber)
    assert.equal(noiseRows.length, statement.unusedOptionRows)
    const noiseAliases = new Set()
    const noiseDescriptions = new Set()
    for (const row of noiseRows) {
      const fields = row.split(',')
      assert.equal(fields[0], 'Financial Instrument Information')
      assert.equal(fields[1], 'Data')
      assert.equal(fields[2], 'OPT')
      assert.match(fields[3], /^NF\d{5} 19JUN26 1 C$/)
      assert.match(fields[4], /^UNUSED FII DESCRIPTION \d{5}$/)
      assert.match(fields[6], /^NF\d{5}$/)
      noiseAliases.add(fields[3])
      noiseDescriptions.add(fields[4])
    }
    assert.equal(noiseAliases.size, statement.unusedOptionRows)
    assert.equal(noiseDescriptions.size, statement.unusedOptionRows)

    const result = parseIbkrActivityStatement(statement.text, {
      accountComparisonSalt,
      currentDate: referenceTime,
    })
    assert.deepEqual(result.errors, [], `${noiseOrder} noise produced parser errors.`)
    assert(result.report, `${noiseOrder} noise did not produce a report.`)
    assert.equal(result.report.symbols.length, 1)
    assert.equal(result.report.events.length, 1)
    assert.equal(result.report.seasonPnl, 7)
    assert.equal(result.report.optionPnl, 7)

    const fiiRefs = reportSourceRefs(result.report).filter(
      (ref) => ref.section === 'Financial Instrument Information',
    )
    assert(fiiRefs.length > 0, `${noiseOrder} case did not consume its core FII row.`)
    assert(
      fiiRefs.every((ref) => ref.rowNumber === statement.consumedFiiRowNumber),
      `${noiseOrder} case leaked an unused FII row into report provenance.`,
    )
    assert(
      fiiRefs.every(
        (ref) =>
          ref.rowNumber < statement.firstNoiseRowNumber ||
          ref.rowNumber > statement.lastNoiseRowNumber,
      ),
      `${noiseOrder} case retained a noise SourceRef.`,
    )

    results.push({ noiseOrder, report: result.report })
  }

  assert.deepEqual(
    coreReportProjection(results[0].report),
    coreReportProjection(results[1].report),
    'Moving unused FII rows changed core symbols, events, or P&L.',
  )

  const duplicateTrades = generateSyntheticDuplicateTradesStatement()
  assert.equal(duplicateTrades.duplicateTradeRows, SYNTHETIC_DUPLICATE_TRADE_ROWS)
  assert(duplicateTrades.duplicateTradeRows > 25_000)
  const duplicateTradesResult = parseIbkrActivityStatement(
    duplicateTrades.text,
    { accountComparisonSalt, currentDate: referenceTime },
  )
  assert.deepEqual(
    duplicateTradesResult.errors,
    [],
    'More than 25,000 valid duplicate Trades rows were rejected before output deduplication.',
  )
  assert.equal(duplicateTradesResult.report?.symbols.length, 1)
  assert.equal(duplicateTradesResult.report?.events.length, 1)
  assert.equal(duplicateTradesResult.report?.seasonPnl, 7)
  assert.equal(duplicateTradesResult.report?.symbols[0]?.assignmentCount, 1)
  const firstTradeRowNumber = duplicateTrades.text
    .split('\n')
    .findIndex((row) => row.startsWith('Trades,Data,')) + 1
  const tradeEventRefs = duplicateTradesResult.report.events[0].sourceRefs
    .filter((ref) => ref.section === 'Trades')
  assert(tradeEventRefs.length > 0)
  assert(
    tradeEventRefs.every((ref) => ref.rowNumber === firstTradeRowNumber),
    'Consecutive duplicate Trades did not preserve the first source row.',
  )
  const duplicateTradeRow = duplicateTrades.text
    .split('\n')[firstTradeRowNumber - 1]
  const conflictingCodeAfterDuplicates = parseIbkrActivityStatement(
    `${duplicateTrades.text}\n${duplicateTradeRow.replace(/,A$/, ',A;Ep')}`,
    { accountComparisonSalt, currentDate: referenceTime },
  )
  assert(
    conflictingCodeAfterDuplicates.errors.some(
      (diagnostic) => diagnostic.code === 'option_event_type_conflict',
    ) && !conflictingCodeAfterDuplicates.report,
    'A conflicting code after 25,001 duplicate Trades rows was hidden.',
  )
  const narrowerHeaderAfterDuplicates = parseIbkrActivityStatement(
    `${duplicateTrades.text}\nTrades,Header,Asset Class\n${duplicateTradeRow}`,
    { accountComparisonSalt, currentDate: referenceTime },
  )
  assert(
    narrowerHeaderAfterDuplicates.errors.some(
      (diagnostic) => diagnostic.code === 'accounting_section_conflict',
    ) && !narrowerHeaderAfterDuplicates.report,
    'A changed header after 25,001 duplicate Trades rows was hidden.',
  )

  const candidateMappings = generateSyntheticFiiCandidateMappingsStatement()
  assert.equal(candidateMappings.byteLength, SYNTHETIC_CAPACITY_TARGET_BYTES)
  assert.equal(candidateMappings.rowCount, SYNTHETIC_CAPACITY_ROWS)
  assert.equal(
    candidateMappings.candidateOptionRows,
    SYNTHETIC_FII_CANDIDATE_OPTION_ROWS,
  )
  const candidateMappingsResult = parseIbkrActivityStatement(
    candidateMappings.text,
    { accountComparisonSalt, currentDate: referenceTime },
  )
  assert.deepEqual(
    candidateMappingsResult.errors,
    [],
    'Ten thousand distinct cross-section mapping candidates produced parser errors.',
  )
  assert.equal(candidateMappingsResult.report?.symbols.length, 1)
  assert.equal(candidateMappingsResult.report?.events.length, 0)
  assert.equal(candidateMappingsResult.report?.seasonPnl, 7)
  assert.equal(candidateMappingsResult.report?.symbols[0]?.symbol, 'CORE')
  console.log('Parser selective-materialization pressure checks passed.')
} finally {
  await vite.close()
}
