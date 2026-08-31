import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import {
  generateSyntheticCapacityStatement,
  generateSyntheticOverEventStatement,
  generateSyntheticOverSymbolStatement,
  SYNTHETIC_CAPACITY_EVENTS,
  SYNTHETIC_CAPACITY_MAX_BYTES,
  SYNTHETIC_CAPACITY_ROWS,
  SYNTHETIC_CAPACITY_SYMBOLS,
  SYNTHETIC_CAPACITY_TARGET_BYTES,
  SYNTHETIC_OVER_CAP_EVENTS,
  SYNTHETIC_OVER_CAP_SYMBOLS,
} from './synthetic-capacity-statement.mjs'

const projectRoot = resolve(import.meta.dirname, '..')
const referenceTimeMs = Date.UTC(2026, 7, 30, 12)

class FakeWorker {
  constructor(
    mode = 'idle',
    response,
    expectedSalt = 'standalone-worker-v1',
    expectedReferenceTimeMs = referenceTimeMs,
  ) {
    this.mode = mode
    this.response = response
    this.expectedSalt = expectedSalt
    this.expectedReferenceTimeMs = expectedReferenceTimeMs
    this.listeners = new Map()
    this.lastRequest = undefined
    this.terminateCount = 0
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  postMessage(request) {
    this.lastRequest = request
    assert.deepEqual(Object.keys(request).sort(), [
      'accountComparisonSalt',
      'protocolVersion',
      'referenceTimeMs',
      'statement',
      'type',
    ])
    assert.equal(request.protocolVersion, 1)
    assert.equal(request.type, 'parse')
    assert.equal(request.accountComparisonSalt, this.expectedSalt)
    assert.equal(request.referenceTimeMs, this.expectedReferenceTimeMs)
    assert.ok(request.statement instanceof Blob)
    assert.equal('name' in request.statement, false)

    if (this.mode === 'post-throw') throw new Error('synthetic post failure')
    if (this.mode === 'result') {
      queueMicrotask(() => this.emit('message', { data: this.response }))
    }
    if (this.mode === 'messageerror') {
      queueMicrotask(() => this.emit('messageerror', {}))
    }
    if (this.mode === 'error') {
      queueMicrotask(() =>
        this.emit('error', {
          preventDefault() {},
        }),
      )
    }
  }

  terminate() {
    this.terminateCount += 1
  }
}

class StreamOnlyBlob extends Blob {
  constructor(parts, options) {
    super(parts, options)
    this.arrayBufferCallCount = 0
    this.streamByteCounts = []
    this.textCallCount = 0
  }

  async text() {
    this.textCallCount += 1
    throw new Error('The production Worker must not materialize the Blob with text().')
  }

  async arrayBuffer() {
    this.arrayBufferCallCount += 1
    throw new Error('The production Worker must not materialize the whole Blob with arrayBuffer().')
  }

  stream() {
    const passIndex = this.streamByteCounts.length
    this.streamByteCounts.push(0)
    const reader = super.stream().getReader()
    const streamByteCounts = this.streamByteCounts

    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            reader.releaseLock()
            controller.close()
            return
          }
          streamByteCounts[passIndex] += value.byteLength
          controller.enqueue(value)
        } catch (error) {
          try {
            reader.releaseLock()
          } catch {
            // Preserve the original stream error.
          }
          controller.error(error)
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason)
        } finally {
          reader.releaseLock()
        }
      },
    })
  }
}

function assertSafeError(result, expectedCode) {
  assert.equal(result.report, undefined)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.errors.length, 1)
  assert.deepEqual(Object.keys(result.errors[0]), ['code'])
  if (expectedCode) assert.equal(result.errors[0].code, expectedCode)
}

function sourceRef(overrides = {}) {
  return {
    source: 'csv',
    section: 'Statement',
    recordType: 'DATA',
    rowNumber: 1,
    headerSignature: '0123abcd',
    field: 'Value',
    ...overrides,
  }
}

function symbolPnl(symbol = 'ZZFICTA', overrides = {}) {
  return {
    symbol,
    description: 'Fictional test symbol',
    stockYtdMtm: 1,
    optionYtdMtm: 2,
    otherYtdMtm: 3,
    totalYtdMtm: 6,
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
    ...overrides,
  }
}

function reconciliation(id, overrides = {}) {
  return {
    id,
    status: 'PASS_EXACT',
    reportedValue: 6,
    calculatedValue: 6,
    difference: 0,
    tolerance: 0.000001,
    reasonCode: 'within_tolerance',
    sourceRefs: [sourceRef()],
    ...overrides,
  }
}

function validReport(overrides = {}) {
  const warnings = [
    { code: 'other_pnl_included' },
    { code: 'no_option_events' },
  ]
  return {
    source: 'synthetic',
    fingerprint: '0123abcd',
    accountComparisonKey: 'a'.repeat(64),
    accountIdMasked: '••••0001',
    baseCurrency: 'USD',
    seasonYear: 2026,
    startDate: '2026-01-01',
    endDate: '2026-08-28',
    importedAt: '2026-08-30T12:00:00.000Z',
    isYtd: true,
    netLiquidationValue: 100,
    cashValue: 20,
    seasonReturn: 0.06,
    seasonPnl: 6,
    reportedAllAssetsYtdMtm: 6,
    parsedAllAssetsYtdMtm: 6,
    mtmReconciliationDifference: 0,
    statementPeriodTotalPnl: 6,
    beginningNav: 94,
    endingNav: 100,
    calculatedEndingNav: 100,
    stockPnl: 1,
    optionPnl: 2,
    otherPnl: 3,
    symbols: [symbolPnl()],
    events: [],
    metricSourceRefs: {},
    parserFacts: {
      realizedSectionMissing: false,
      seasonReturnConflict: false,
    },
    reconciliations: [
      reconciliation('mtm_all_assets'),
      reconciliation('statement_period_pnl'),
      reconciliation('nav_bridge', { reportedValue: 100, calculatedValue: 100 }),
    ],
    sections: ['Statement'],
    warnings,
    dataQuality: 'good',
    ...overrides,
  }
}

function workerResponse(report = validReport(), warnings = report.warnings) {
  return {
    protocolVersion: 1,
    type: 'result',
    result: { errors: [], warnings, report },
  }
}

function mutateReport(mutator) {
  const report = validReport()
  mutator(report)
  return report
}

function synchronizePnlTotals(report) {
  report.stockPnl = report.symbols.reduce((sum, symbol) => sum + symbol.stockYtdMtm, 0)
  report.optionPnl = report.symbols.reduce((sum, symbol) => sum + symbol.optionYtdMtm, 0)
  report.otherPnl = report.symbols.reduce((sum, symbol) => sum + symbol.otherYtdMtm, 0)
  report.parsedAllAssetsYtdMtm = report.stockPnl + report.optionPnl + report.otherPnl
  report.reportedAllAssetsYtdMtm = report.parsedAllAssetsYtdMtm
  report.seasonPnl = report.reportedAllAssetsYtdMtm
  report.mtmReconciliationDifference = 0
  const mtm = report.reconciliations.find((check) => check.id === 'mtm_all_assets')
  mtm.reportedValue = report.reportedAllAssetsYtdMtm
  mtm.calculatedValue = report.parsedAllAssetsYtdMtm
  mtm.difference = 0
}

function countWorkerBudgetStringCharacters(result) {
  let total = 0
  const add = (value) => {
    if (value !== undefined) total += value.length
  }
  const addDiagnostic = (diagnostic) => {
    add(diagnostic.code)
    if (diagnostic.code === 'mtm_difference') add(diagnostic.params.currency)
  }
  const addRefs = (refs = []) => {
    for (const ref of refs) {
      add(ref.section)
      add(ref.recordType)
      add(ref.headerSignature)
      add(ref.field)
    }
  }

  result.errors.forEach(addDiagnostic)
  result.warnings.forEach(addDiagnostic)
  const report = result.report
  if (!report) return total

  add(report.fingerprint)
  add(report.accountComparisonKey)
  add(report.accountIdMasked)
  add(report.baseCurrency)
  add(report.startDate)
  add(report.endDate)
  add(report.importedAt)
  for (const symbol of report.symbols) {
    add(symbol.symbol)
    add(symbol.description)
    Object.values(symbol.sourceRefs).forEach(addRefs)
  }
  for (const event of report.events) {
    add(event.symbol)
    add(event.contract)
    add(event.date)
    addRefs(event.sourceRefs)
  }
  Object.values(report.metricSourceRefs).forEach(addRefs)
  report.reconciliations.forEach((check) => addRefs(check.sourceRefs))
  report.sections.forEach(add)
  report.warnings.forEach(addDiagnostic)
  return total
}

function parseResultAtExactStringBudget(targetCharacters) {
  const report = mutateReport((candidate) => {
    candidate.symbols = Array.from({ length: 4 }, (_, index) =>
      symbolPnl(`L${index}`, { sourceRefs: { totalYtdMtm: [] } }),
    )
    synchronizePnlTotals(candidate)
  })
  const result = workerResponse(report).result
  let remaining = targetCharacters - countWorkerBudgetStringCharacters(result)
  let refIndex = 0

  while (remaining > 0) {
    const maxRefCharacters = 524
    const minRefCharacters = 14
    let refCharacters = Math.min(maxRefCharacters, remaining)
    if (
      remaining > maxRefCharacters &&
      remaining - maxRefCharacters < minRefCharacters
    ) {
      refCharacters = remaining - minRefCharacters
    }
    assert(refCharacters >= minRefCharacters)

    const variableCharacters = refCharacters - 12
    const sectionCharacters = Math.min(256, variableCharacters - 1)
    const fieldCharacters = variableCharacters - sectionCharacters
    assert(sectionCharacters >= 1 && sectionCharacters <= 256)
    assert(fieldCharacters >= 1 && fieldCharacters <= 256)

    const symbolIndex = Math.floor(refIndex / 500)
    assert(symbolIndex < report.symbols.length)
    report.symbols[symbolIndex].sourceRefs.totalYtdMtm.push(
      sourceRef({
        section: 'S'.repeat(sectionCharacters),
        field: 'F'.repeat(fieldCharacters),
      }),
    )
    remaining -= refCharacters
    refIndex += 1
  }

  assert.equal(countWorkerBudgetStringCharacters(result), targetCharacters)
  return result
}

function mtmWarningReport() {
  return mutateReport((report) => {
    report.seasonPnl = 7
    report.reportedAllAssetsYtdMtm = 7
    report.mtmReconciliationDifference = 1
    report.reconciliations[0] = reconciliation('mtm_all_assets', {
      status: 'WARNING',
      reportedValue: 7,
      calculatedValue: 6,
      difference: 1,
      reasonCode: 'difference_exceeds_tolerance',
    })
    report.warnings = [
      { code: 'mtm_difference', params: { currency: 'USD', difference: 1 } },
      { code: 'other_pnl_included' },
      { code: 'no_option_events' },
    ]
    report.dataQuality = 'warning'
  })
}

function statementWarningReport() {
  return mutateReport((report) => {
    report.reconciliations[1] = reconciliation('statement_period_pnl', {
      status: 'WARNING',
      reportedValue: 6,
      calculatedValue: 5,
      difference: 1,
      reasonCode: 'difference_exceeds_tolerance',
    })
    report.warnings = [
      { code: 'other_pnl_included' },
      { code: 'no_option_events' },
      { code: 'statement_pnl_mismatch' },
    ]
    report.dataQuality = 'warning'
  })
}

function navWarningReport() {
  return mutateReport((report) => {
    report.calculatedEndingNav = 99
    report.reconciliations[2] = reconciliation('nav_bridge', {
      status: 'WARNING',
      reportedValue: 100,
      calculatedValue: 99,
      difference: 1,
      reasonCode: 'difference_exceeds_tolerance',
    })
    report.warnings = [
      { code: 'other_pnl_included' },
      { code: 'no_option_events' },
      { code: 'nav_bridge_review' },
    ]
    report.dataQuality = 'warning'
  })
}

function exactDecimalDifferenceReport() {
  return mutateReport((report) => {
    const calculated = 999999999999999.9
    const reported = 1000000000000000
    report.symbols = [
      symbolPnl('DECIMAL', {
        stockYtdMtm: calculated,
        optionYtdMtm: 0,
        otherYtdMtm: 0,
        totalYtdMtm: calculated,
      }),
    ]
    report.stockPnl = calculated
    report.optionPnl = 0
    report.otherPnl = 0
    report.parsedAllAssetsYtdMtm = calculated
    report.reportedAllAssetsYtdMtm = reported
    report.seasonPnl = reported
    report.mtmReconciliationDifference = 0.1
    report.reconciliations[0] = reconciliation('mtm_all_assets', {
      status: 'WARNING',
      reportedValue: reported,
      calculatedValue: calculated,
      difference: 0.1,
      reasonCode: 'difference_exceeds_tolerance',
    })
    report.warnings = [
      { code: 'mtm_difference', params: { currency: 'USD', difference: 0.1 } },
      { code: 'no_option_events' },
    ]
    report.dataQuality = 'warning'
  })
}

function boundaryStatement(symbolCount) {
  const rows = [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Period,"January 1, 2026 - August 28, 2026"',
    'Account Information,Header,Field Name,Field Value',
    'Account Information,Data,Account,U500BOUNDARY',
    'Account Information,Data,Base Currency,USD',
    'Month & Year to Date Performance Summary,Header,Asset Class,Symbol,Description,MTD Mark-to-Market,YTD Mark-to-Market,MTD Realized S/T,YTD Realized S/T,MTD Realized L/T,YTD Realized L/T',
  ]
  for (let index = 0; index < symbolCount; index += 1) {
    rows.push(
      `Month & Year to Date Performance Summary,Data,Stocks,S${String(index).padStart(3, '0')},Boundary,0,1,0,0,0,0`,
    )
  }
  rows.push(
    `Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,${symbolCount},0,0,0,0`,
  )
  return rows.join('\n')
}

function boundaryStatementWithAdditionalSections(additionalSectionCount) {
  const rows = [boundaryStatement(1)]
  for (let index = 0; index < additionalSectionCount; index += 1) {
    rows.push(`Synthetic Extra Section ${index},Data,Ignored`)
  }
  return rows.join('\n')
}

function optionBoundaryStatement(symbolCount) {
  const rows = [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Period,"January 1, 2026 - August 28, 2026"',
    'Account Information,Header,Field Name,Field Value',
    'Account Information,Data,Account,U500OPTIONBOUNDARY',
    'Account Information,Data,Base Currency,USD',
    'Month & Year to Date Performance Summary,Header,Asset Class,Symbol,Description,MTD Mark-to-Market,YTD Mark-to-Market,MTD Realized S/T,YTD Realized S/T,MTD Realized L/T,YTD Realized L/T',
  ]
  const instruments = []
  for (let index = 0; index < symbolCount; index += 1) {
    const underlying = `O${String(index).padStart(3, '0')}`
    const strike = index + 1
    const contract = `${underlying} 19JUN26 ${strike} C`
    rows.push(
      `Month & Year to Date Performance Summary,Data,Equity and Index Options,${underlying},Boundary,0,1,0,0,0,0`,
    )
    instruments.push(
      `Financial Instrument Information,Data,Equity and Index Options,${underlying},${contract},SYNTH-CONID-${String(index).padStart(3, '0')},${underlying},100,2026-06-19,C,${strike},`,
    )
  }
  rows.push(
    `Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,${symbolCount},0,0,0,0`,
    'Financial Instrument Information,Header,Asset Class,Symbol,Description,Conid,Underlying,Multiplier,Expiry,Type,Strike,Code',
    ...instruments,
  )
  return rows.join('\n')
}

function optionMappingReferenceStatement(
  symbolCount,
  mappingRowsPerSymbol,
  additionalLastMappingRows = 0,
) {
  const rows = optionBoundaryStatement(symbolCount).split('\n')
  const headerIndex = rows.findIndex((row) =>
    row.startsWith('Financial Instrument Information,Header,'),
  )
  assert(headerIndex >= 0)
  const prefix = rows.slice(0, headerIndex + 1)
  const mappingRows = rows.slice(headerIndex + 1)
  return [
    ...prefix,
    ...mappingRows.flatMap((row, index) =>
      Array(
        mappingRowsPerSymbol +
          (index === mappingRows.length - 1 ? additionalLastMappingRows : 0),
      ).fill(row),
    ),
  ].join('\n')
}

function optionEventMappingReferenceStatement(mappingRowsPerSymbol) {
  return [
    optionMappingReferenceStatement(1, mappingRowsPerSymbol),
    '"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Underlying Symbol,Date,Transaction Type',
    '"Options Exercises, Assignments and Expirations",Data,Equity and Index Options,O000 19JUN26 1 C,O000,2026-06-20,Assignment',
  ].join('\n')
}

function statementWithUnusedMappingReferences(mappingRowCount) {
  const unusedMapping =
    'Financial Instrument Information,Data,Equity and Index Options,UNUSED,UNUSED 19JUN26 999 C,SYNTH-CONID-UNUSED,UNUSED,100,2026-06-19,C,999,'
  return [
    optionBoundaryStatement(1),
    ...Array(mappingRowCount).fill(unusedMapping),
  ].join('\n')
}

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    IBKR_PARSER_TIMEOUT_MS,
    parseIbkrActivityStatementInWorker,
  } = await vite.ssrLoadModule('/src/lib/parseInWorker.ts')
  const {
    IBKR_PARSER_WORKER_PROTOCOL_VERSION,
    MAX_ACCOUNT_COMPARISON_SALT_CHARACTERS,
    MIN_ACCOUNT_COMPARISON_SALT_CHARACTERS,
    isIbkrParserWorkerRequest,
    isIbkrParserWorkerResponse,
  } = await vite.ssrLoadModule('/src/lib/ibkrParserWorkerProtocol.ts')
  const {
    MAX_IBKR_WORKER_STATEMENT_BYTES,
    MAX_WORKER_DIAGNOSTICS,
    MAX_WORKER_REPORT_EVENTS,
    MAX_WORKER_REPORT_SECTIONS,
    MAX_WORKER_REPORT_SOURCE_REFS,
    MAX_WORKER_REPORT_SYMBOLS,
    MAX_WORKER_SOURCE_REFS_PER_COLLECTION,
    MAX_WORKER_TOTAL_STRING_CHARACTERS,
    isWorkerParseResultWithinLimits,
    isWorkerReportWithinLimits,
  } = await vite.ssrLoadModule('/src/lib/workerOutputLimits.ts')
  const { parseIbkrActivityStatement } = await vite.ssrLoadModule('/src/lib/ibkr.ts')
  const { parseResultFitsReportResourceBudget } = await vite.ssrLoadModule(
    '/src/lib/reportCapacity.ts',
  )

  const statement = new Blob(['fully fictional statement bytes'], {
    type: 'text/csv',
  })
  const validRequest = () => ({
    protocolVersion: IBKR_PARSER_WORKER_PROTOCOL_VERSION,
    type: 'parse',
    accountComparisonSalt: 'standalone-worker-v1',
    referenceTimeMs,
    statement,
  })

  assert.equal(IBKR_PARSER_TIMEOUT_MS, 12_000)
  assert.equal(IBKR_PARSER_WORKER_PROTOCOL_VERSION, 1)
  assert.equal(MAX_IBKR_WORKER_STATEMENT_BYTES, 5 * 1024 * 1024)
  assert.equal(MIN_ACCOUNT_COMPARISON_SALT_CHARACTERS, 16)
  assert.equal(MAX_ACCOUNT_COMPARISON_SALT_CHARACTERS, 128)
  assert.equal(MAX_WORKER_REPORT_SYMBOLS, 500)
  assert.equal(MAX_WORKER_REPORT_EVENTS, 1_000)
  assert.equal(MAX_WORKER_REPORT_SOURCE_REFS, 20_000)
  assert.equal(MAX_WORKER_SOURCE_REFS_PER_COLLECTION, 501)
  assert.equal(MAX_WORKER_REPORT_SECTIONS, 256)
  assert.equal(MAX_WORKER_DIAGNOSTICS, 32)
  assert.equal(MAX_IBKR_WORKER_STATEMENT_BYTES, SYNTHETIC_CAPACITY_MAX_BYTES)

  const exactSectionResult = parseIbkrActivityStatement(
    boundaryStatementWithAdditionalSections(MAX_WORKER_REPORT_SECTIONS - 3),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.deepEqual(exactSectionResult.errors, [])
  assert.equal(exactSectionResult.report?.sections.length, MAX_WORKER_REPORT_SECTIONS)
  assert.equal(isWorkerParseResultWithinLimits(exactSectionResult, referenceTimeMs), true)

  const overSectionResult = parseIbkrActivityStatement(
    boundaryStatementWithAdditionalSections(MAX_WORKER_REPORT_SECTIONS - 2),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assertSafeError(overSectionResult, 'report_capacity_exceeded')
  assert.equal(overSectionResult.report, undefined)

  for (const overlongResult of [
    parseIbkrActivityStatement(
      boundaryStatement(1).replace(
        ',S000,Boundary,',
        `,${'A'.repeat(129)},Boundary,`,
      ),
      {
        accountComparisonSalt: 'worker-boundary-salt',
        currentDate: new Date(referenceTimeMs),
      },
    ),
    parseIbkrActivityStatement(
      `${boundaryStatement(1)}\n${'S'.repeat(257)},Data,Ignored`,
      {
        accountComparisonSalt: 'worker-boundary-salt',
        currentDate: new Date(referenceTimeMs),
      },
    ),
  ]) {
    assertSafeError(overlongResult, 'report_capacity_exceeded')
    assert.equal(
      isWorkerParseResultWithinLimits(overlongResult, referenceTimeMs),
      true,
      'An input-controlled overlong output string escaped as worker_failure.',
    )
  }

  assert.equal(isIbkrParserWorkerRequest(validRequest()), true)
  if (typeof File !== 'undefined') {
    assert.equal(
      isIbkrParserWorkerRequest({
        ...validRequest(),
        statement: new File(['fully fictional statement bytes'], 'private-statement.csv', {
          type: 'text/csv',
        }),
      }),
      false,
      'The Worker protocol accepted a File carrying an input-controlled filename.',
    )
  }
  for (const invalidRequest of [
    { ...validRequest(), protocolVersion: 0 },
    { ...validRequest(), accountComparisonSalt: 'x'.repeat(15) },
    { ...validRequest(), accountComparisonSalt: 'x'.repeat(129) },
    { ...validRequest(), accountComparisonSalt: `${'x'.repeat(16)}\0` },
    { ...validRequest(), referenceTimeMs: Number.NaN },
    { ...validRequest(), referenceTimeMs: Date.UTC(2200, 0, 1) },
    { ...validRequest(), statement: 'not-a-blob' },
    { ...validRequest(), statement: new Blob([new Uint8Array(MAX_IBKR_WORKER_STATEMENT_BYTES + 1)]) },
    { ...validRequest(), unexpected: true },
  ]) {
    assert.equal(isIbkrParserWorkerRequest(invalidRequest), false)
  }

  assert.equal(isWorkerReportWithinLimits(validReport(), referenceTimeMs), true)
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => { report.symbols[0].description = '' }),
      referenceTimeMs,
    ),
    true,
    'A present but empty optional Description cell was rejected.',
  )
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.events = [{ symbol: 'ZZFICTA', contract: '', type: 'assignment', sourceRefs: [] }]
        report.symbols[0].assignmentCount = 1
        report.warnings = [{ code: 'other_pnl_included' }]
      }),
      referenceTimeMs,
    ),
    true,
    'A present but empty optional event Contract cell was rejected.',
  )
  assert.equal(isWorkerParseResultWithinLimits(workerResponse().result, referenceTimeMs), true)
  assert.equal(isIbkrParserWorkerResponse(workerResponse(), referenceTimeMs), true)
  assert.equal(isWorkerReportWithinLimits(mtmWarningReport(), referenceTimeMs), true)
  assert.equal(isWorkerReportWithinLimits(statementWarningReport(), referenceTimeMs), true)
  assert.equal(isWorkerReportWithinLimits(navWarningReport(), referenceTimeMs), true)
  assert.equal(
    isWorkerReportWithinLimits(exactDecimalDifferenceReport(), referenceTimeMs),
    true,
    'Exact decimal reconciliation evidence was rejected by binary subtraction.',
  )
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.symbols[0].otherRealizedYtd = 1
        report.symbols[0].totalRealizedYtd = 1
      }),
      referenceTimeMs,
    ),
    true,
    'A valid Other realized explanation total was rejected.',
  )
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.symbols[0].otherRealizedYtd = 1
      }),
      referenceTimeMs,
    ),
    false,
    'A mismatching Other realized explanation total crossed the Worker boundary.',
  )
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        const repeated = { symbol: 'ZZFICTA', type: 'assignment', sourceRefs: [] }
        report.events = [repeated, { ...repeated, sourceRefs: [] }]
        report.symbols[0].assignmentCount = 2
        report.warnings = [{ code: 'other_pnl_included' }]
      }),
      referenceTimeMs,
    ),
    true,
    'Same-day same-type lifecycle events cannot be proven duplicate without quantity or trade ID.',
  )

  const parserBoundaryResult = parseIbkrActivityStatement(
    boundaryStatement(MAX_WORKER_REPORT_SYMBOLS),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.deepEqual(parserBoundaryResult.errors, [])
  assert.equal(parserBoundaryResult.report?.symbols.length, MAX_WORKER_REPORT_SYMBOLS)
  assert.equal(
    parserBoundaryResult.report?.reconciliations.find(
      (check) => check.id === 'mtm_all_assets',
    )?.sourceRefs.length,
    MAX_WORKER_SOURCE_REFS_PER_COLLECTION,
  )
  assert.equal(
    isWorkerParseResultWithinLimits(parserBoundaryResult, referenceTimeMs),
    true,
    'A real parser result at the supported 500-symbol boundary was rejected.',
  )

  for (const optionSymbolCount of [251, MAX_WORKER_REPORT_SYMBOLS]) {
    const optionBoundaryResult = parseIbkrActivityStatement(
      optionBoundaryStatement(optionSymbolCount),
      {
        accountComparisonSalt: 'worker-boundary-salt',
        currentDate: new Date(referenceTimeMs),
      },
    )
    const optionBoundaryReport = optionBoundaryResult.report
    assert.deepEqual(optionBoundaryResult.errors, [])
    assert.equal(optionBoundaryReport?.symbols.length, optionSymbolCount)
    assert.equal(
      optionBoundaryReport?.metricSourceRefs.optionPnl?.length,
      optionSymbolCount,
      'Portfolio option P&L provenance included non-numeric mapping rows.',
    )
    assert.equal(
      optionBoundaryReport?.metricSourceRefs.parsedAllAssetsYtdMtm?.length,
      optionSymbolCount,
      'Parsed all-assets provenance included non-numeric mapping rows.',
    )
    assert.equal(
      optionBoundaryReport?.reconciliations.find(
        (check) => check.id === 'mtm_all_assets',
      )?.sourceRefs.length,
      optionSymbolCount + 1,
      'MTM reconciliation provenance did not contain one numeric detail row per symbol plus the broker total.',
    )
    assert.equal(
      optionBoundaryReport?.symbols.every((symbol) => {
        const refs = symbol.sourceRefs.optionYtdMtm ?? []
        return (
          refs.some(
            (ref) => ref.section === 'Month & Year to Date Performance Summary',
          ) &&
          refs.some((ref) => ref.section === 'Financial Instrument Information')
        )
      }),
      true,
      'Per-symbol option provenance lost either its numeric row or FII mapping row.',
    )
    assert.equal(
      isWorkerParseResultWithinLimits(optionBoundaryResult, referenceTimeMs),
      true,
      `A real ${optionSymbolCount}-option parser result was rejected by the Worker boundary.`,
    )
  }
  const exactMappingReferenceResult = parseIbkrActivityStatement(
    optionMappingReferenceStatement(1, MAX_WORKER_SOURCE_REFS_PER_COLLECTION - 2),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.deepEqual(exactMappingReferenceResult.errors, [])
  assert.equal(
    exactMappingReferenceResult.report?.symbols[0].sourceRefs.totalRealizedYtd?.length,
    MAX_WORKER_SOURCE_REFS_PER_COLLECTION,
    'The parser rejected an exact-limit per-metric source-reference collection.',
  )
  assert.equal(
    isWorkerParseResultWithinLimits(exactMappingReferenceResult, referenceTimeMs),
    true,
    'The exact-limit per-metric parser result did not fit the Worker envelope.',
  )

  const overMappingReferenceResult = parseIbkrActivityStatement(
    optionMappingReferenceStatement(1, MAX_WORKER_SOURCE_REFS_PER_COLLECTION - 1),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assertSafeError(overMappingReferenceResult, 'report_capacity_exceeded')
  assert.equal(overMappingReferenceResult.report, undefined)

  const exactEventReferenceResult = parseIbkrActivityStatement(
    optionEventMappingReferenceStatement(
      MAX_WORKER_SOURCE_REFS_PER_COLLECTION - 4,
    ),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.deepEqual(exactEventReferenceResult.errors, [])
  assert.equal(
    exactEventReferenceResult.report?.events[0]?.sourceRefs.length,
    MAX_WORKER_SOURCE_REFS_PER_COLLECTION,
    'The parser rejected an event at the exact source-reference boundary.',
  )
  assert.equal(
    isWorkerParseResultWithinLimits(exactEventReferenceResult, referenceTimeMs),
    true,
    'The exact-limit event parser result did not fit the Worker envelope.',
  )

  const overEventReferenceResult = parseIbkrActivityStatement(
    optionEventMappingReferenceStatement(
      MAX_WORKER_SOURCE_REFS_PER_COLLECTION - 3,
    ),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assertSafeError(overEventReferenceResult, 'report_capacity_exceeded')
  assert.equal(overEventReferenceResult.report, undefined)

  const unusedMappingReferenceResult = parseIbkrActivityStatement(
    statementWithUnusedMappingReferences(
      MAX_WORKER_SOURCE_REFS_PER_COLLECTION + 1,
    ),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.deepEqual(unusedMappingReferenceResult.errors, [])
  assert.equal(
    unusedMappingReferenceResult.report?.symbols.length,
    1,
    'An unused over-limit internal mapping should not reject a safe final report.',
  )
  assert.equal(
    isWorkerParseResultWithinLimits(unusedMappingReferenceResult, referenceTimeMs),
    true,
    'An unused bounded mapping produced a report outside the Worker envelope.',
  )

  const withinSerializedBudgetResult = parseIbkrActivityStatement(
    optionMappingReferenceStatement(499, 9),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.deepEqual(withinSerializedBudgetResult.errors, [])
  assert.equal(
    isWorkerParseResultWithinLimits(
      withinSerializedBudgetResult,
      referenceTimeMs,
    ),
    true,
    'The parser rejected a dense report that still fits every Worker resource budget.',
  )

  const overSerializedBudgetResult = parseIbkrActivityStatement(
    optionMappingReferenceStatement(499, 10),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assertSafeError(overSerializedBudgetResult, 'report_capacity_exceeded')
  assert.equal(overSerializedBudgetResult.report, undefined)
  assert.equal(
    isWorkerParseResultWithinLimits(overSerializedBudgetResult, referenceTimeMs),
    true,
    'A parser-side serialized-budget failure did not fit the safe Worker envelope.',
  )

  const overTotalReferenceResult = parseIbkrActivityStatement(
    optionMappingReferenceStatement(MAX_WORKER_REPORT_SYMBOLS, 20),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assertSafeError(overTotalReferenceResult, 'report_capacity_exceeded')
  assert.equal(overTotalReferenceResult.report, undefined)

  const capacityStatement = generateSyntheticCapacityStatement()
  assert.equal(capacityStatement.byteLength, SYNTHETIC_CAPACITY_TARGET_BYTES)
  assert.equal(capacityStatement.rowCount, SYNTHETIC_CAPACITY_ROWS)
  const capacityResult = parseIbkrActivityStatement(capacityStatement.text, {
    accountComparisonSalt: 'worker-boundary-salt',
    currentDate: new Date(referenceTimeMs),
  })
  const capacityReport = capacityResult.report
  assert.deepEqual(capacityResult.errors, [])
  assert.equal(capacityReport?.symbols.length, SYNTHETIC_CAPACITY_SYMBOLS)
  assert.equal(capacityReport?.events.length, SYNTHETIC_CAPACITY_EVENTS)
  assert.equal(
    capacityReport?.symbols.every(
      (symbol) =>
        symbol.assignmentCount === 1 &&
        symbol.exerciseCount === 0 &&
        symbol.expirationCount === 1,
    ),
    true,
    'The combined capacity fixture did not preserve one assignment and one expiration per underlying.',
  )
  assert.equal(
    capacityReport?.reconciliations.find(
      (check) => check.id === 'mtm_all_assets',
    )?.status,
    'PASS_EXACT',
  )
  assert.equal(
    isWorkerParseResultWithinLimits(capacityResult, referenceTimeMs),
    true,
    'A real parser result at the exact byte, row, symbol, and event caps was rejected.',
  )

  const overSymbolResult = parseIbkrActivityStatement(
    generateSyntheticOverSymbolStatement().text,
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assertSafeError(overSymbolResult, 'report_capacity_exceeded')
  assert.equal(overSymbolResult.report, undefined)
  assert.equal(isWorkerParseResultWithinLimits(overSymbolResult, referenceTimeMs), true)

  const overEventStatement = generateSyntheticOverEventStatement()
  const overEventResult = parseIbkrActivityStatement(
    overEventStatement.text,
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assertSafeError(overEventResult, 'report_capacity_exceeded')
  assert.equal(overEventResult.report, undefined)
  assert.equal(isWorkerParseResultWithinLimits(overEventResult, referenceTimeMs), true)

  const duplicateEventRows = overEventStatement.text.split('\n')
  duplicateEventRows[duplicateEventRows.length - 1] = duplicateEventRows[10]
  const dedupedEventBoundaryResult = parseIbkrActivityStatement(
    duplicateEventRows.join('\n'),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.deepEqual(dedupedEventBoundaryResult.errors, [])
  assert.equal(
    dedupedEventBoundaryResult.report?.events.length,
    MAX_WORKER_REPORT_EVENTS,
    'A duplicate raw event row consumed the unique lifecycle-event capacity.',
  )

  const currentSchemaFixture = readFileSync(
    resolve(projectRoot, 'tests/fixtures/ibkr-current-schema-synthetic.csv'),
    'utf8',
  )
  const missingRealizedResult = parseIbkrActivityStatement(
    currentSchemaFixture
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('Realized & Unrealized Performance Summary,'),
      )
      .join('\n'),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.equal(missingRealizedResult.report?.parserFacts.realizedSectionMissing, true)
  assert.equal(
    missingRealizedResult.warnings.some(
      (warning) => warning.code === 'realized_section_missing',
    ),
    true,
  )
  assert.equal(
    isWorkerParseResultWithinLimits(missingRealizedResult, referenceTimeMs),
    true,
    'A real parser result with no realized/unrealized section was rejected.',
  )
  const missingRealizedWarningRemoved = structuredClone(missingRealizedResult.report)
  missingRealizedWarningRemoved.warnings = missingRealizedWarningRemoved.warnings.filter(
    (warning) => warning.code !== 'realized_section_missing',
  )
  missingRealizedWarningRemoved.dataQuality = 'good'
  assert.equal(
    isWorkerReportWithinLimits(missingRealizedWarningRemoved, referenceTimeMs),
    false,
    'A missing realized-section warning was removable by relabelling quality as good.',
  )

  const conflictingTwrResult = parseIbkrActivityStatement(
    `${currentSchemaFixture}\nNet Asset Value,Data,8.654321%\n`,
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  assert.equal(conflictingTwrResult.report?.parserFacts.seasonReturnConflict, true)
  assert.equal(conflictingTwrResult.report?.seasonReturn, undefined)
  assert.ok(
    (conflictingTwrResult.report?.metricSourceRefs.seasonReturn?.length ?? 0) > 0,
  )
  assert.equal(
    isWorkerParseResultWithinLimits(conflictingTwrResult, referenceTimeMs),
    true,
    'A real parser result with conflicting TWR candidates was rejected.',
  )
  const twrWarningRemoved = structuredClone(conflictingTwrResult.report)
  twrWarningRemoved.warnings = twrWarningRemoved.warnings.filter(
    (warning) => warning.code !== 'twr_conflict',
  )
  twrWarningRemoved.dataQuality = 'good'
  assert.equal(
    isWorkerReportWithinLimits(twrWarningRemoved, referenceTimeMs),
    false,
    'A TWR-conflict warning was removable by relabelling quality as good.',
  )

  const navComponentMismatchResult = parseIbkrActivityStatement(
    currentSchemaFixture.replace(
      'Change in NAV,Data,Mark-to-Market,742.343458',
      'Change in NAV,Data,Mark-to-Market,743.343458',
    ),
    {
      accountComparisonSalt: 'worker-boundary-salt',
      currentDate: new Date(referenceTimeMs),
    },
  )
  const navComponentMismatch = navComponentMismatchResult.report?.reconciliations.find(
    (check) => check.id === 'nav_bridge',
  )
  assert.equal(navComponentMismatch?.status, 'WARNING')
  assert.equal(navComponentMismatch?.reasonCode, 'difference_exceeds_tolerance')
  assert.equal(navComponentMismatch?.difference, 0)
  assert.equal(
    isWorkerParseResultWithinLimits(navComponentMismatchResult, referenceTimeMs),
    true,
    'A valid NAV component warning with a zero top-level bridge difference was rejected.',
  )

  for (const invalidReport of [
    {},
    [],
    new Date(),
    { ...validReport(), unexpected: true },
    mutateReport((report) => delete report.fingerprint),
    mutateReport((report) => { report.source = 'demo' }),
    mutateReport((report) => { report.fingerprint = 'not-a-hash' }),
    mutateReport((report) => { report.accountComparisonKey = 'a'.repeat(63) }),
    mutateReport((report) => { report.accountIdMasked = 'U12345678' }),
    mutateReport((report) => { report.baseCurrency = 'usd' }),
    mutateReport((report) => { report.startDate = '2026-02-30' }),
    mutateReport((report) => { report.endDate = '2026-08-31' }),
    mutateReport((report) => { report.importedAt = 'not-a-timestamp' }),
    mutateReport((report) => { report.importedAt = '2026-08-30T12:00:00.001Z' }),
    mutateReport((report) => { report.isYtd = false }),
    mutateReport((report) => { report.dataQuality = 'excellent' }),
    mutateReport((report) => { delete report.parserFacts }),
    mutateReport((report) => { report.parserFacts.unexpected = true }),
    mutateReport((report) => { report.parserFacts.realizedSectionMissing = 'false' }),
    mutateReport((report) => { report.parserFacts.seasonReturnConflict = true }),
    mutateReport((report) => {
      report.warnings.push({ code: 'twr_conflict' })
      report.dataQuality = 'warning'
    }),
    mutateReport((report) => {
      report.parserFacts.seasonReturnConflict = true
      report.warnings.push({ code: 'twr_conflict' })
      report.dataQuality = 'warning'
    }),
    mutateReport((report) => {
      delete report.seasonReturn
      report.metricSourceRefs.seasonReturn = [sourceRef()]
    }),
    mutateReport((report) => {
      report.parserFacts.realizedSectionMissing = true
    }),
    mutateReport((report) => { report.seasonPnl = Number.NaN }),
    mutateReport((report) => { report.seasonPnl = 999_999_999 }),
    mutateReport((report) => { report.stockPnl = 999_999_999 }),
    mutateReport((report) => { report.symbols[0].totalYtdMtm = 999_999_999 }),
    mutateReport((report) => { report.cashValue = Number.POSITIVE_INFINITY }),
    mutateReport((report) => { report.symbols[0].optionYtdMtm = Number.NEGATIVE_INFINITY }),
    mutateReport((report) => { report.symbols[0].assignmentCount = -1 }),
    mutateReport((report) => { report.symbols[0].exerciseCount = 0.5 }),
    mutateReport((report) => { report.symbols[0].sourceRefs = { unknownMetric: [] } }),
    mutateReport((report) => { report.metricSourceRefs = { unknownMetric: [] } }),
    mutateReport((report) => {
      report.events = [{ symbol: 'ZZFICTA', type: 'invalid', sourceRefs: [] }]
    }),
    mutateReport((report) => {
      report.events = [{ symbol: 'ZZFICTA', date: '2025-01-01', type: 'assignment', sourceRefs: [] }]
    }),
    mutateReport((report) => { report.symbols[0].assignmentCount = 1 }),
    mutateReport((report) => {
      report.events = [{ symbol: 'ZZFICTA', type: 'assignment', sourceRefs: [] }]
      report.warnings = [{ code: 'other_pnl_included' }]
    }),
    mutateReport((report) => {
      report.events = [{ symbol: 'MISSING', type: 'assignment', sourceRefs: [] }]
      report.warnings = [{ code: 'other_pnl_included' }]
    }),
    mutateReport((report) => {
      report.metricSourceRefs = { seasonPnl: [{ ...sourceRef(), unexpected: true }] }
    }),
    mutateReport((report) => {
      report.metricSourceRefs = { seasonPnl: [sourceRef({ rowNumber: 0 })] }
    }),
    mutateReport((report) => {
      report.metricSourceRefs = {
        seasonPnl: [{ source: 'pdf', section: 'Statement', pageNumber: 1, field: 'Value' }],
      }
    }),
    mutateReport((report) => {
      report.reconciliations[2] = reconciliation('mtm_all_assets')
    }),
    mutateReport((report) => {
      report.reconciliations[0].status = 'UNKNOWN'
    }),
    mutateReport((report) => {
      report.reconciliations[0].reasonCode = 'unknown_reason'
    }),
    mutateReport((report) => {
      report.reconciliations[0].difference = Number.NaN
    }),
    mutateReport((report) => {
      report.reconciliations[0] = reconciliation('mtm_all_assets', { status: 'WARNING' })
    }),
    mutateReport((report) => {
      report.reconciliations[0].reasonCode = 'source_missing'
    }),
    mutateReport((report) => {
      report.reconciliations[0].sourceRefs = []
    }),
    mutateReport((report) => {
      delete report.reconciliations[0].reportedValue
    }),
    mutateReport((report) => {
      report.reconciliations[0].reportedValue = 6.0000005
      report.reconciliations[0].difference = 0.0000005
    }),
    mutateReport((report) => {
      report.reconciliations[0].reportedValue = 999
      report.reconciliations[0].calculatedValue = 6
      report.reconciliations[0].tolerance = 1_000
    }),
    mutateReport((report) => {
      report.reconciliations[0].reportedValue = 0
      report.reconciliations[0].calculatedValue = 0
    }),
    mutateReport((report) => {
      report.reconciliations[1].reportedValue = 0
    }),
    mutateReport((report) => {
      report.reconciliations[2].calculatedValue = 0
    }),
    (() => {
      const report = statementWarningReport()
      report.reconciliations[1].difference = 2
      return report
    })(),
    (() => {
      const report = navWarningReport()
      report.reconciliations[2].difference = 2
      return report
    })(),
    (() => {
      const report = statementWarningReport()
      report.reconciliations[1].reasonCode = 'unsupported_component'
      report.reconciliations[1].difference = 2
      return report
    })(),
    mutateReport((report) => { report.dataQuality = 'warning' }),
    mutateReport((report) => {
      report.warnings = [{ code: 'realized_section_missing' }]
    }),
    mutateReport((report) => {
      report.warnings = [{ code: 'account_missing' }]
    }),
    mutateReport((report) => {
      report.dataQuality = 'warning'
      report.mtmReconciliationDifference = 0
      report.warnings = [
        { code: 'mtm_difference', params: { currency: 'JPY', difference: 999 } },
      ]
    }),
    mutateReport((report) => { report.symbols = new Array(1) }),
    mutateReport((report) => { report.sections = new Array(1) }),
  ]) {
    assert.equal(isWorkerReportWithinLimits(invalidReport, referenceTimeMs), false)
  }

  const missingRequiredMtmWarning = mtmWarningReport()
  missingRequiredMtmWarning.warnings = missingRequiredMtmWarning.warnings.filter(
    (warning) => warning.code !== 'mtm_difference',
  )
  assert.equal(
    isWorkerReportWithinLimits(missingRequiredMtmWarning, referenceTimeMs),
    false,
  )

  for (const [report, requiredCode] of [
    [statementWarningReport(), 'statement_pnl_mismatch'],
    [navWarningReport(), 'nav_bridge_review'],
    [validReport(), 'other_pnl_included'],
    [validReport(), 'no_option_events'],
  ]) {
    report.warnings = report.warnings.filter(
      (warning) => warning.code !== requiredCode,
    )
    assert.equal(isWorkerReportWithinLimits(report, referenceTimeMs), false)
  }

  const navMissingReport = mutateReport((report) => {
    delete report.netLiquidationValue
    report.warnings.push({ code: 'nav_missing' })
    report.dataQuality = 'warning'
  })
  assert.equal(isWorkerReportWithinLimits(navMissingReport, referenceTimeMs), true)
  navMissingReport.warnings = navMissingReport.warnings.filter(
    (warning) => warning.code !== 'nav_missing',
  )
  assert.equal(isWorkerReportWithinLimits(navMissingReport, referenceTimeMs), false)

  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.seasonPnl = 6.0000005
        report.reportedAllAssetsYtdMtm = 6.0000005
        report.mtmReconciliationDifference = 0.0000005
        report.reconciliations[0] = reconciliation('mtm_all_assets', {
          status: 'PASS_ROUNDED',
          reportedValue: 6.0000005,
          difference: 0.0000005,
        })
      }),
      referenceTimeMs,
    ),
    true,
    'A supported rounded reconciliation inside tolerance was rejected.',
  )
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.warnings = [{ code: 'other_pnl_included' }, { code: 'no_option_events' }]
      }),
      referenceTimeMs,
    ),
    true,
    'Informational warnings incorrectly downgraded an otherwise good report.',
  )

  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.symbols = Array.from(
          { length: MAX_WORKER_REPORT_SYMBOLS + 1 },
          (_, index) => symbolPnl(`S${index}`),
        )
      }),
      referenceTimeMs,
    ),
    false,
  )
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.events = Array.from({ length: MAX_WORKER_REPORT_EVENTS + 1 }, () => ({}))
      }),
      referenceTimeMs,
    ),
    false,
  )
  assert.equal(
    isWorkerReportWithinLimits(
      mutateReport((report) => {
        report.sections = Array.from(
          { length: MAX_WORKER_REPORT_SECTIONS + 1 },
          (_, index) => `Section ${index}`,
        )
      }),
      referenceTimeMs,
    ),
    false,
  )

  const compactRef = sourceRef({ section: 'S', field: 'F' })
  const exactCollectionLimit = mutateReport((report) => {
    report.metricSourceRefs = {
      seasonPnl: Array(MAX_WORKER_SOURCE_REFS_PER_COLLECTION).fill(compactRef),
    }
  })
  assert.equal(isWorkerReportWithinLimits(exactCollectionLimit, referenceTimeMs), true)
  exactCollectionLimit.metricSourceRefs.seasonPnl.push(compactRef)
  assert.equal(isWorkerReportWithinLimits(exactCollectionLimit, referenceTimeMs), false)

  const exactTotalRefLimit = mutateReport((report) => {
    report.symbols = Array.from({ length: 40 }, (_, index) =>
      symbolPnl(`S${index}`, {
        sourceRefs: {
          totalYtdMtm: Array(index === 39 ? 497 : 500).fill(compactRef),
        },
      }),
    )
    synchronizePnlTotals(report)
  })
  assert.equal(isWorkerReportWithinLimits(exactTotalRefLimit, referenceTimeMs), true)
  assert.equal(
    isWorkerParseResultWithinLimits(
      workerResponse(exactTotalRefLimit).result,
      referenceTimeMs,
    ),
    true,
  )
  assert.equal(
    parseResultFitsReportResourceBudget(
      workerResponse(exactTotalRefLimit).result,
    ),
    true,
  )
  exactTotalRefLimit.symbols[39].sourceRefs.totalYtdMtm.push(compactRef)
  assert.equal(isWorkerReportWithinLimits(exactTotalRefLimit, referenceTimeMs), false)
  assert.equal(
    isWorkerParseResultWithinLimits(
      workerResponse(exactTotalRefLimit).result,
      referenceTimeMs,
    ),
    false,
  )
  assert.equal(
    parseResultFitsReportResourceBudget(
      workerResponse(exactTotalRefLimit).result,
    ),
    false,
  )

  const stringBudgetOverflow = mutateReport((report) => {
    const largeRef = sourceRef({ section: 'S'.repeat(256), field: 'F'.repeat(256) })
    report.symbols = Array.from({ length: 4 }, (_, index) =>
      symbolPnl(`L${index}`, {
        sourceRefs: { totalYtdMtm: Array(500).fill(largeRef) },
      }),
    )
    synchronizePnlTotals(report)
  })
  assert.equal(isWorkerReportWithinLimits(stringBudgetOverflow, referenceTimeMs), false)
  assert.equal(
    isWorkerParseResultWithinLimits(
      workerResponse(stringBudgetOverflow).result,
      referenceTimeMs,
    ),
    false,
  )
  assert.equal(
    parseResultFitsReportResourceBudget(
      workerResponse(stringBudgetOverflow).result,
    ),
    false,
  )

  const exactStringBudgetResult = parseResultAtExactStringBudget(
    MAX_WORKER_TOTAL_STRING_CHARACTERS,
  )
  assert.equal(
    isWorkerParseResultWithinLimits(exactStringBudgetResult, referenceTimeMs),
    true,
  )
  assert.equal(
    parseResultFitsReportResourceBudget(exactStringBudgetResult),
    true,
  )

  const overStringBudgetResult = parseResultAtExactStringBudget(
    MAX_WORKER_TOTAL_STRING_CHARACTERS + 1,
  )
  assert.equal(
    isWorkerParseResultWithinLimits(overStringBudgetResult, referenceTimeMs),
    false,
  )
  assert.equal(
    parseResultFitsReportResourceBudget(overStringBudgetResult),
    false,
  )

  const denseDiagnostics = Array.from(
    { length: MAX_WORKER_DIAGNOSTICS },
    () => ({ code: 'csv_malformed' }),
  )
  assert.equal(
    isWorkerParseResultWithinLimits(
      { errors: denseDiagnostics, warnings: [] },
      referenceTimeMs,
    ),
    true,
  )
  assert.equal(
    isWorkerParseResultWithinLimits(
      {
        errors: [{ code: 'wrong_season', params: { currentYear: 2026 } }],
        warnings: [{ code: 'mtm_difference', params: { currency: 'BASE', difference: -1 } }],
      },
      referenceTimeMs,
    ),
    true,
  )
  for (const invalidResult of [
    { errors: [], warnings: [] },
    { errors: new Array(1), warnings: [] },
    { errors: Array(MAX_WORKER_DIAGNOSTICS + 1).fill({ code: 'csv_malformed' }), warnings: [] },
    { errors: ['free-form failure text'], warnings: [] },
    { errors: [{ code: 'unknown_code' }], warnings: [] },
    { errors: [{ code: 'csv_malformed', params: { unexpected: true } }], warnings: [] },
    { errors: [{ code: 'wrong_season' }], warnings: [] },
    { errors: [{ code: 'wrong_season', params: { currentYear: 2025 } }], warnings: [] },
    { errors: [{ code: 'wrong_season', params: { currentYear: 2026, unexpected: true } }], warnings: [] },
    { errors: [{ code: 'wrong_season', params: { currentYear: Number.NaN } }], warnings: [] },
    { errors: [{ code: 'mtm_difference', params: { currency: 'US D', difference: 1 } }], warnings: [] },
    { errors: [{ code: 'mtm_difference', params: { currency: 'USD', difference: Infinity } }], warnings: [] },
    { errors: [{ code: 'nav_missing' }], warnings: [] },
    { errors: [{ code: 'csv_malformed' }], warnings: [{ code: 'account_missing' }] },
    { errors: [{ code: 'csv_malformed' }], warnings: [], unexpected: true },
    { errors: [{ code: 'csv_malformed' }], warnings: [], report: validReport() },
    { errors: [], warnings: [{ code: 'nav_missing' }], report: validReport() },
  ]) {
    assert.equal(isWorkerParseResultWithinLimits(invalidResult, referenceTimeMs), false)
  }

  for (const invalidResponse of [
    { ...workerResponse(), protocolVersion: 0 },
    { ...workerResponse(), type: 'unexpected' },
    { ...workerResponse(), unexpected: true },
    { protocolVersion: 1, type: 'result', result: { errors: 'not-an-array', warnings: [] } },
    new Proxy({}, { getPrototypeOf() { throw new Error('synthetic proxy trap') } }),
  ]) {
    assert.equal(isIbkrParserWorkerResponse(invalidResponse, referenceTimeMs), false)
  }

  let factoryCalled = false
  assertSafeError(
    await parseIbkrActivityStatementInWorker(new Blob([]), {
      referenceTimeMs,
      workerFactory: () => {
        factoryCalled = true
        return new FakeWorker()
      },
    }),
    'file_empty',
  )
  assert.equal(factoryCalled, false)

  assertSafeError(
    await parseIbkrActivityStatementInWorker(
      new Blob([new Uint8Array(MAX_IBKR_WORKER_STATEMENT_BYTES + 1)]),
      {
        referenceTimeMs,
        workerFactory: () => {
          factoryCalled = true
          return new FakeWorker()
        },
      },
    ),
    'file_too_large',
  )
  assert.equal(factoryCalled, false)

  for (const options of [
    { accountComparisonSalt: 'short', referenceTimeMs },
    { accountComparisonSalt: 'x'.repeat(129), referenceTimeMs },
    { referenceTimeMs: Number.NaN },
  ]) {
    assertSafeError(
      await parseIbkrActivityStatementInWorker(statement, {
        ...options,
        workerFactory: () => {
          factoryCalled = true
          return new FakeWorker()
        },
      }),
      'worker_failure',
    )
    assert.equal(factoryCalled, false)
  }

  const originalWorker = globalThis.Worker
  globalThis.Worker = undefined
  try {
    assertSafeError(
      await parseIbkrActivityStatementInWorker(statement, { referenceTimeMs }),
      'worker_unavailable',
    )
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = originalWorker
  }

  const cancelledController = new AbortController()
  cancelledController.abort()
  assertSafeError(
    await parseIbkrActivityStatementInWorker(statement, {
      referenceTimeMs,
      signal: cancelledController.signal,
      workerFactory: () => {
        factoryCalled = true
        return new FakeWorker()
      },
    }),
    'worker_cancelled',
  )
  assert.equal(factoryCalled, false)

  assertSafeError(
    await parseIbkrActivityStatementInWorker(statement, {
      referenceTimeMs,
      workerFactory: () => {
        throw new Error('synthetic constructor failure')
      },
    }),
    'worker_unavailable',
  )

  const successWorker = new FakeWorker(
    'result',
    workerResponse(),
    'custom-session-salt',
  )
  const success = await parseIbkrActivityStatementInWorker(statement, {
    accountComparisonSalt: 'custom-session-salt',
    referenceTimeMs,
    workerFactory: () => successWorker,
  })
  assert.equal(success.report?.fingerprint, '0123abcd')
  assert.deepEqual(success.errors, [])
  assert.equal(successWorker.terminateCount, 1)

  if (typeof File !== 'undefined') {
    const fileWorker = new FakeWorker('result', workerResponse())
    const fileResult = await parseIbkrActivityStatementInWorker(
      new File(['fully fictional statement bytes'], 'private-statement.csv', {
        type: 'text/csv',
      }),
      {
        referenceTimeMs,
        workerFactory: () => fileWorker,
      },
    )
    assert.equal(fileResult.report?.fingerprint, '0123abcd')
    assert.deepEqual(fileResult.errors, [])
    assert.ok(fileWorker.lastRequest?.statement instanceof Blob)
    assert.equal(fileWorker.lastRequest.statement instanceof File, false)
    assert.equal('name' in fileWorker.lastRequest.statement, false)
    assert.equal(fileWorker.terminateCount, 1)
  }

  const parserErrorWorker = new FakeWorker('result', {
    protocolVersion: 1,
    type: 'result',
    result: { errors: [{ code: 'csv_malformed' }], warnings: [] },
  })
  assertSafeError(
    await parseIbkrActivityStatementInWorker(statement, {
      referenceTimeMs,
      workerFactory: () => parserErrorWorker,
    }),
    'csv_malformed',
  )

  const malformedWorker = new FakeWorker('result', {
    protocolVersion: 1,
    type: 'result',
    result: { errors: 'not-an-array', warnings: [] },
  })
  assertSafeError(
    await parseIbkrActivityStatementInWorker(statement, {
      referenceTimeMs,
      workerFactory: () => malformedWorker,
    }),
    'worker_failure',
  )
  assert.equal(malformedWorker.terminateCount, 1)

  for (const mode of ['post-throw', 'messageerror', 'error']) {
    const worker = new FakeWorker(mode)
    assertSafeError(
      await parseIbkrActivityStatementInWorker(statement, {
        referenceTimeMs,
        workerFactory: () => worker,
      }),
      'worker_failure',
    )
    assert.equal(worker.terminateCount, 1)
  }

  const abortWorker = new FakeWorker()
  const abortController = new AbortController()
  const abortPromise = parseIbkrActivityStatementInWorker(statement, {
    referenceTimeMs,
    signal: abortController.signal,
    workerFactory: () => abortWorker,
  })
  abortController.abort()
  assertSafeError(await abortPromise, 'worker_cancelled')
  assert.equal(abortWorker.terminateCount, 1)
  abortWorker.emit('message', { data: workerResponse() })
  assert.equal(abortWorker.terminateCount, 1)

  const timeoutWorker = new FakeWorker()
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let timeoutCallback
  let scheduledDelay
  let clearedTimer
  globalThis.setTimeout = (callback, delay) => {
    timeoutCallback = callback
    scheduledDelay = delay
    return 12_000
  }
  globalThis.clearTimeout = (timer) => {
    clearedTimer = timer
  }
  try {
    for (const { requestedTimeoutMs, expectedDelay } of [
      { requestedTimeoutMs: 12_001, expectedDelay: 12_000 },
      { requestedTimeoutMs: 0, expectedDelay: 12_000 },
      { requestedTimeoutMs: -1, expectedDelay: 12_000 },
      { requestedTimeoutMs: Number.NaN, expectedDelay: 12_000 },
      { requestedTimeoutMs: 2_500, expectedDelay: 2_500 },
    ]) {
      scheduledDelay = undefined
      const boundedTimeoutWorker = new FakeWorker('result', workerResponse())
      const boundedTimeoutResult = await parseIbkrActivityStatementInWorker(statement, {
        referenceTimeMs,
        timeoutMs: requestedTimeoutMs,
        workerFactory: () => boundedTimeoutWorker,
      })
      assert.deepEqual(boundedTimeoutResult.errors, [])
      assert.equal(scheduledDelay, expectedDelay)
      assert.equal(boundedTimeoutWorker.terminateCount, 1)
    }

    clearedTimer = undefined
    let settled = false
    const timeoutPromise = parseIbkrActivityStatementInWorker(statement, {
      referenceTimeMs,
      workerFactory: () => timeoutWorker,
    }).then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    assert.equal(scheduledDelay, 12_000)
    assert.equal(settled, false)
    assert.equal(typeof timeoutCallback, 'function')
    timeoutCallback()
    assertSafeError(await timeoutPromise, 'worker_timeout')
    assert.equal(clearedTimer, 12_000)
    assert.equal(timeoutWorker.terminateCount, 1)
    timeoutWorker.emit('message', { data: workerResponse() })
    assert.equal(timeoutWorker.terminateCount, 1)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }

  const previousOnmessage = globalThis.onmessage
  const previousPostMessage = globalThis.postMessage
  const postedResponses = []
  globalThis.postMessage = (message) => postedResponses.push(message)
  try {
    await vite.ssrLoadModule('/src/workers/ibkrParser.worker.ts?worker-boundary-test')
    assert.equal(typeof globalThis.onmessage, 'function')

    await globalThis.onmessage({ data: { ...validRequest(), protocolVersion: 0 } })
    assertSafeError(postedResponses.pop().result, 'worker_failure')

    const fixture = readFileSync(
      resolve(projectRoot, 'tests/fixtures/ibkr-current-schema-synthetic.csv'),
      'utf8',
    )
    const workerIntegrationSalt = 'worker-integration-salt'
    const plainFixtureBlob = new Blob([fixture], { type: 'text/csv' })
    const synchronousFixtureResult = parseIbkrActivityStatement(
      await plainFixtureBlob.text(),
      {
        accountComparisonSalt: workerIntegrationSalt,
        currentDate: new Date(referenceTimeMs),
      },
    )
    const streamOnlyFixtureBlob = new StreamOnlyBlob([fixture], {
      type: 'text/csv',
    })
    await globalThis.onmessage({
      data: {
        ...validRequest(),
        accountComparisonSalt: workerIntegrationSalt,
        statement: streamOnlyFixtureBlob,
      },
    })
    const integratedResponse = postedResponses.pop()
    assert.equal(isIbkrParserWorkerResponse(integratedResponse, referenceTimeMs), true)
    assert.equal(integratedResponse.result.report?.source, 'synthetic')
    assert.deepEqual(integratedResponse.result.errors, [])
    assert.deepEqual(
      integratedResponse.result,
      synchronousFixtureResult,
      'The production Blob-stream Worker path diverged from the synchronous parser.',
    )
    assert.equal(
      streamOnlyFixtureBlob.textCallCount,
      0,
      'The production Worker called Blob.text() instead of the streaming parser.',
    )
    assert.equal(
      streamOnlyFixtureBlob.arrayBufferCallCount,
      0,
      'The production Worker called whole-Blob arrayBuffer() instead of streaming.',
    )
    assert.deepEqual(
      streamOnlyFixtureBlob.streamByteCounts,
      [streamOnlyFixtureBlob.size, streamOnlyFixtureBlob.size],
      'The production Worker must read two complete, repeatable Blob streams.',
    )

    for (const overCapacityText of [
      generateSyntheticOverSymbolStatement().text,
      generateSyntheticOverEventStatement().text,
    ]) {
      await globalThis.onmessage({
        data: {
          ...validRequest(),
          accountComparisonSalt: 'worker-integration-salt',
          statement: new Blob([overCapacityText], { type: 'text/csv' }),
        },
      })
      const capacityResponse = postedResponses.pop()
      assert.equal(isIbkrParserWorkerResponse(capacityResponse, referenceTimeMs), true)
      assertSafeError(capacityResponse.result, 'report_capacity_exceeded')
      assert.equal(capacityResponse.result.report, undefined)
    }
  } finally {
    if (previousOnmessage === undefined) delete globalThis.onmessage
    else globalThis.onmessage = previousOnmessage
    if (previousPostMessage === undefined) delete globalThis.postMessage
    else globalThis.postMessage = previousPostMessage
  }

  console.log('Worker boundary contract checks passed.')
} finally {
  await vite.close()
}
