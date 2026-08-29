import assert from 'node:assert/strict'
import { createServer } from 'vite'

class FakeWorker {
  constructor(mode = 'idle', response) {
    this.mode = mode
    this.response = response
    this.listeners = new Map()
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
    assert.deepEqual(Object.keys(request).sort(), ['statement', 'type'])
    assert.equal(request.type, 'parse')
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

function assertSafeError(result) {
  assert.equal(result.report, undefined)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.errors.length, 1)
  assert.equal(typeof result.errors[0], 'string')
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
    MAX_WORKER_REPORT_EVENTS,
    MAX_WORKER_REPORT_SOURCE_REFS,
    MAX_WORKER_REPORT_SYMBOLS,
    isWorkerReportWithinLimits,
  } = await vite.ssrLoadModule('/src/lib/workerOutputLimits.ts')
  const statement = new Blob(['fully fictional statement bytes'], {
    type: 'text/csv',
  })

  assert.equal(IBKR_PARSER_TIMEOUT_MS, 12_000)
  assert.equal(MAX_WORKER_REPORT_SYMBOLS, 5_000)
  assert.equal(MAX_WORKER_REPORT_EVENTS, 25_000)
  assert.equal(MAX_WORKER_REPORT_SOURCE_REFS, 100_000)

  const emptyReport = () => ({
    events: [],
    metricSourceRefs: {},
    reconciliations: [],
    symbols: [],
  })
  assert.equal(isWorkerReportWithinLimits(emptyReport()), true)
  assert.equal(
    isWorkerReportWithinLimits({
      ...emptyReport(),
      symbols: Array.from({ length: 5_001 }, () => ({ sourceRefs: {} })),
    }),
    false,
  )
  assert.equal(
    isWorkerReportWithinLimits({
      ...emptyReport(),
      events: Array.from({ length: 25_001 }, () => ({ sourceRefs: [] })),
    }),
    false,
  )

  const sourceRef = { field: 'fictional', section: 'fictional', source: 'csv' }
  const exactRefLimitReport = {
    ...emptyReport(),
    events: [{ sourceRefs: [sourceRef] }],
    metricSourceRefs: {
      seasonPnl: Array(MAX_WORKER_REPORT_SOURCE_REFS - 3).fill(sourceRef),
    },
    reconciliations: [{ sourceRefs: [sourceRef] }],
    symbols: [{ sourceRefs: { totalYtdMtm: [sourceRef] } }],
  }
  assert.equal(isWorkerReportWithinLimits(exactRefLimitReport), true)
  assert.equal(
    isWorkerReportWithinLimits({
      ...exactRefLimitReport,
      events: [{ sourceRefs: [sourceRef, sourceRef] }],
    }),
    false,
  )

  const originalWorker = globalThis.Worker
  globalThis.Worker = undefined
  try {
    assertSafeError(await parseIbkrActivityStatementInWorker(statement))
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = originalWorker
  }

  let factoryCalled = false
  const cancelledController = new AbortController()
  cancelledController.abort()
  const cancelledBeforeStart = await parseIbkrActivityStatementInWorker(
    statement,
    {
      signal: cancelledController.signal,
      workerFactory: () => {
        factoryCalled = true
        return new FakeWorker()
      },
    },
  )
  assertSafeError(cancelledBeforeStart)
  assert.equal(factoryCalled, false)

  assertSafeError(
    await parseIbkrActivityStatementInWorker(statement, {
      workerFactory: () => {
        throw new Error('synthetic constructor failure')
      },
    }),
  )

  const successWorker = new FakeWorker('result', {
    type: 'result',
    result: { errors: [], warnings: [] },
  })
  const success = await parseIbkrActivityStatementInWorker(statement, {
    workerFactory: () => successWorker,
  })
  assert.deepEqual(success, { errors: [], warnings: [] })
  assert.equal(successWorker.terminateCount, 1)

  const malformedWorker = new FakeWorker('result', {
    type: 'result',
    result: { errors: 'not-an-array', warnings: [] },
  })
  assertSafeError(
    await parseIbkrActivityStatementInWorker(statement, {
      workerFactory: () => malformedWorker,
    }),
  )
  assert.equal(malformedWorker.terminateCount, 1)

  for (const mode of ['post-throw', 'messageerror', 'error']) {
    const worker = new FakeWorker(mode)
    assertSafeError(
      await parseIbkrActivityStatementInWorker(statement, {
        workerFactory: () => worker,
      }),
    )
    assert.equal(worker.terminateCount, 1)
  }

  const abortWorker = new FakeWorker()
  const abortController = new AbortController()
  const abortPromise = parseIbkrActivityStatementInWorker(statement, {
    signal: abortController.signal,
    workerFactory: () => abortWorker,
  })
  abortController.abort()
  assertSafeError(await abortPromise)
  assert.equal(abortWorker.terminateCount, 1)
  abortWorker.emit('message', {
    data: { type: 'result', result: { errors: [], warnings: [] } },
  })
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
    let settled = false
    const timeoutPromise = parseIbkrActivityStatementInWorker(statement, {
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
    assertSafeError(await timeoutPromise)
    assert.equal(clearedTimer, 12_000)
    assert.equal(timeoutWorker.terminateCount, 1)
    timeoutWorker.emit('message', {
      data: { type: 'result', result: { errors: [], warnings: [] } },
    })
    assert.equal(timeoutWorker.terminateCount, 1)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }

  console.log('Worker boundary contract checks passed.')
} finally {
  await vite.close()
}
