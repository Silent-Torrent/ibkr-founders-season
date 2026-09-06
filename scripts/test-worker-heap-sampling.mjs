import assert from 'node:assert/strict'
import { createWorkerHeapSampler } from './worker-heap-sampling.mjs'

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function fakeClock() {
  let time = 0
  let nextId = 0
  const timers = new Map()
  return {
    now: () => time,
    setTimeout(callback, delay) {
      const id = ++nextId
      timers.set(id, { callback, at: time + delay })
      return id
    },
    clearTimeout: (id) => timers.delete(id),
    pendingTimers: () => timers.size,
    async to(target) {
      assert(target >= time)
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
        if (!next || next[1].at > target) break
        time = next[1].at
        timers.delete(next[0])
        next[1].callback()
        await flush()
      }
      time = target
      await flush()
    },
  }
}

function harness(options = {}) {
  const clock = fakeClock()
  const calls = []
  let active = 0
  let maxActive = 0
  const sampler = createWorkerHeapSampler({
    clock, ...options,
    send(method, params) {
      assert.equal(method, 'Runtime.getHeapUsage', 'Sampler sent a lifecycle, GC, object, or script command.')
      assert.deepEqual(params, {})
      active += 1
      maxActive = Math.max(maxActive, active)
      let resolve
      let reject
      const promise = new Promise((success, failure) => { resolve = success; reject = failure })
      calls.push({ resolve, reject, at: clock.now() })
      return promise.finally(() => { active -= 1 })
    },
  })
  return { sampler, clock, calls, maxActive: () => maxActive }
}

async function baseline(test, value = { usedSize: 10, totalSize: 20 }, at = 0) {
  const started = test.sampler.start()
  assert.strictEqual(test.sampler.start(), started, 'start sent a second baseline request.')
  await test.clock.to(at)
  test.calls[0].resolve(value)
  await flush()
  return started
}

let cases = 0
async function run(name, test) {
  await test()
  cases += 1
  console.log(`PASS ${name}`)
}

await run('independent numeric maxima, actual response gaps and lifecycle timestamps', async () => {
  const test = harness()
  const first = await baseline(test, { usedSize: 10, totalSize: 50, embedderHeapUsedSize: 0 }, 5)
  assert.equal(first.phase, 'baseline')
  await test.clock.to(20)
  assert.equal(test.sampler.markExecutionReleased(), 20)
  await test.clock.to(55)
  assert.equal(test.calls.length, 2)
  await test.clock.to(60)
  test.calls[1].resolve({ usedSize: 40, totalSize: 80, backingStorageSize: 12 })
  await flush()
  await test.clock.to(105)
  await test.clock.to(120)
  test.calls[2].resolve({ usedSize: 30, totalSize: 90, embedderHeapUsedSize: 7, backingStorageSize: 20 })
  await flush()
  await test.clock.to(140)
  const stopping = test.sampler.stop('worker-target-terminated')
  assert.strictEqual(test.sampler.stop('ignored-second-reason'), stopping)
  const result = await stopping
  assert.equal(result.sampleCount, 3)
  assert.equal(result.runtimeSampleCount, 2)
  assert.equal(result.coverage, 'limited')
  assert.equal(result.coverageIncomplete, true)
  assert.equal(result.truePeakMeasured, false)
  assert.equal(result.finalReclamationProven, false)
  assert.deepEqual(result.observedSampledMaxima, { usedSize: 40, totalSize: 90, embedderHeapUsedSize: 7, backingStorageSize: 20 })
  assert.deepEqual(result.fieldSampleCounts, { usedSize: 3, totalSize: 3, embedderHeapUsedSize: 2, backingStorageSize: 2 })
  assert.equal(result.maxObservationGapMs, 60)
  assert.equal(result.runtimeMaxObservationGapMs, 60)
  assert.deepEqual(result.requestLatencyMs, { min: 5, max: 15, mean: 25 / 3 })
  assert.equal(result.startedAtMs, 0)
  assert.equal(result.executionReleasedAtMs, 20)
  assert.equal(result.stopRequestedAtMs, 140)
  assert.equal(result.endedAtMs, 140)
  assert.equal(result.firstResponseAtMs, 5)
  assert.equal(result.lastResponseAtMs, 120)
  assert.equal(result.observedTimeSpanMs, 115)
  assert.equal(result.releaseToFirstRuntimeResponseMs, 40)
  assert.equal(result.lastResponseToStopMs, 20)
  assert.equal(result.lastResponseAfterStopMs, 0)
  assert.equal(result.lastResponseToEndMs, 20)
  assert.equal(result.releaseMarker, 'host-after-release-acknowledgement')
  assert.deepEqual(result.endReason, { kind: 'stopped', message: 'worker-target-terminated' })
  assert(result.requests.every((request) => request.outcome === 'success'))
  await test.clock.to(1_000)
  assert.equal(test.calls.length, 3)
  assert.equal(test.clock.pendingTimers(), 0)
})

await run('baseline, pre-release and straddling responses never inflate runtime coverage', async () => {
  const test = harness()
  await baseline(test, undefined, 5)
  await test.clock.to(60)
  test.calls[1].resolve({ usedSize: 1_000, totalSize: 2_000 })
  await flush()
  await test.clock.to(110)
  test.sampler.markExecutionReleased()
  await test.clock.to(115)
  test.calls[2].resolve({ usedSize: 3_000, totalSize: 4_000 })
  await flush()
  await test.clock.to(160)
  test.calls[3].resolve({ usedSize: 7, totalSize: 8 })
  await flush()
  const result = await test.sampler.stop('observed target termination')
  assert.deepEqual(result.samples.map(({ phase }) => phase), ['baseline', 'before-release', 'crosses-release', 'after-release'])
  assert.equal(result.runtimeSampleCount, 1)
  assert.equal(result.coverage, 'insufficient')
  assert.equal(result.observedSampledMaxima.usedSize, 3_000)
  assert.equal(result.runtimeObservedSampledMaxima.usedSize, 7)
  assert.equal(result.runtimeMaxObservationGapMs, null)
})

await run('known closed targets are truncated coverage, never zero readings', async () => {
  for (const message of ['Runtime.getHeapUsage: Session with given id not found.', 'No session with given id',
    'Target closed.', 'Session closed.', 'Inspected target navigated or closed']) {
    const test = harness()
    const started = test.sampler.start()
    test.calls[0].reject(new Error(message))
    assert.equal(await started, null)
    await test.clock.to(20)
    const result = await test.sampler.stop('target disappeared')
    assert.equal(result.sampleCount, 0)
    assert.equal(result.baseline, null)
    assert.equal(result.coverage, 'insufficient')
    assert.equal(result.observedSampledMaxima.usedSize, null)
    assert.equal(result.endReason.kind, 'session-closed')
    assert.equal(result.requests[0].outcome, 'session-closed')
    assert.equal(result.lastResponseAtMs, null, 'A closure reply was mistaken for a heap observation.')
    assert.equal(result.lastResponseToStopMs, null)
    assert.equal(result.finalReclamationProven, false)
    await test.clock.to(100)
    assert.equal(test.calls.length, 1)
  }
})

await run('missing optional fields and genuine zero values remain distinct', async () => {
  const test = harness()
  await baseline(test, { usedSize: 0, totalSize: 0, backingStorageSize: 0, embedderHeapUsedSize: undefined, ignoredObject: { secret: 'never retain' } })
  const result = await test.sampler.stop('baseline only')
  assert.deepEqual(result.observedSampledMaxima, { usedSize: 0, totalSize: 0, embedderHeapUsedSize: null, backingStorageSize: 0 })
  assert.deepEqual(result.fieldSampleCounts, { usedSize: 1, totalSize: 1, embedderHeapUsedSize: 0, backingStorageSize: 1 })
  assert.equal(result.maxObservationGapMs, null)
  assert.equal(result.runtimeSampleCount, 0)
  assert.equal(result.coverage, 'insufficient')
  assert(!JSON.stringify(result).includes('never retain'))
  assert(!Object.hasOwn(result.baseline, 'embedderHeapUsedSize'))
})

await run('closure after runtime sampling preserves the last observation and uncovered tail', async () => {
  const test = harness()
  await baseline(test, undefined, 5)
  test.sampler.markExecutionReleased()
  await test.clock.to(65)
  test.calls[1].resolve({ usedSize: 100, totalSize: 200 })
  await flush()
  await test.clock.to(110)
  test.calls[2].reject(new Error('Runtime.getHeapUsage: Session with given id not found.'))
  await flush()
  await test.clock.to(140)
  const result = await test.sampler.stop('worker-target-terminated')
  assert.equal(result.endReason.kind, 'session-closed')
  assert.equal(result.sampleCount, 2)
  assert.equal(result.runtimeSampleCount, 1)
  assert.equal(result.coverage, 'insufficient')
  assert.equal(result.lastResponseAtMs, 65)
  assert.equal(result.lastResponseToStopMs, 75)
  assert.equal(result.lastResponseToEndMs, 45)
  assert.equal(result.samples.at(-1).usedSize, 100)
  assert.equal(result.requests.at(-1).outcome, 'session-closed')
  assert.equal(result.finalReclamationProven, false)
  assert.equal(test.clock.pendingTimers(), 0)
})

await run('invalid required or present optional numbers fail closed', async () => {
  const invalid = [null, [], {}, { usedSize: 1 }, ...['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize']
    .flatMap((field) => [NaN, Infinity, -1, '10', null].map((value) => ({ usedSize: 1, totalSize: 2, [field]: value })))]
  for (const response of invalid) {
    const test = harness()
    const started = test.sampler.start()
    const rejected = assert.rejects(started, (error) => {
      assert.equal(error.partialReport.sampleCount, 0)
      assert.equal(error.partialReport.endReason.kind, 'error')
      assert.equal(error.partialReport.requests[0].outcome, 'error')
      return true
    })
    test.calls[0].resolve(response)
    await rejected
    await assert.rejects(test.sampler.stop('cleanup invalid data'), /numeric|finite/)
    assert.equal(test.clock.pendingTimers(), 0)
  }
})

await run('unsupported and genuine protocol errors reject start and stop', async () => {
  for (const message of ["Runtime.getHeapUsage wasn't found", 'Unsupported method', 'Arbitrary closed resource error']) {
    const test = harness()
    const rejected = assert.rejects(test.sampler.start(), (error) => {
      assert.equal(error.message, message)
      assert.equal(error.partialReport.endReason.kind, 'error')
      return true
    })
    test.calls[0].reject(new Error(message))
    await rejected
    await assert.rejects(test.sampler.stop('cleanup error'), { message })
  }
  const clock = fakeClock()
  const sampler = createWorkerHeapSampler({ clock, send() { throw new Error('Synchronous transport failure') } })
  await assert.rejects(sampler.start(), /Synchronous transport failure/)
  await assert.rejects(sampler.stop('cleanup'), /Synchronous transport failure/)
})

await run('background failures are surfaced on stop without further sampling', async () => {
  const test = harness()
  await baseline(test)
  test.sampler.markExecutionReleased()
  await test.clock.to(50)
  test.calls[1].reject(new Error('CDP internal protocol error'))
  await flush()
  await test.clock.to(1_000)
  assert.equal(test.calls.length, 2)
  await assert.rejects(test.sampler.stop('cleanup background failure'), (error) => {
    assert.equal(error.partialReport.sampleCount, 1)
    assert.equal(error.partialReport.runtimeSampleCount, 0)
    assert.equal(error.partialReport.requests[1].outcome, 'error')
    assert.equal(error.partialReport.endReason.kind, 'error')
    return true
  })
})

await run('one in-flight request, skipped ticks and stop awaiting existing work only', async () => {
  const test = harness()
  await baseline(test)
  test.sampler.markExecutionReleased()
  await test.clock.to(205)
  assert.equal(test.calls.length, 2)
  assert.equal(test.maxActive(), 1)
  const stopping = test.sampler.stop('terminate is not blocked')
  let complete = false
  stopping.then(() => { complete = true })
  await test.clock.to(240)
  assert.equal(complete, false)
  assert.equal(test.calls.length, 2)
  test.calls[1].resolve({ usedSize: 30, totalSize: 40 })
  const result = await stopping
  assert.equal(result.skippedInFlightTicks, 3)
  assert.equal(result.samples[1].latencyMs, 190)
  assert.equal(result.lastResponseToStopMs, null)
  assert.equal(result.lastResponseAfterStopMs, 35)
  assert.equal(result.endedAtMs, 240)
  assert.equal(result.coverage, 'insufficient')
  await test.clock.to(3_000)
  assert.equal(test.calls.length, 2)
  assert.equal(test.clock.pendingTimers(), 0)
})

await run('stop during baseline cannot arm a later timer', async () => {
  const test = harness()
  const starting = test.sampler.start()
  await test.clock.to(10)
  const stopping = test.sampler.stop('stop while baseline pending')
  await test.clock.to(100)
  test.calls[0].resolve({ usedSize: 5, totalSize: 6 })
  await starting
  const result = await stopping
  assert.equal(result.sampleCount, 1)
  assert.equal(result.lastResponseAfterStopMs, 90)
  assert.equal(result.runtimeSampleCount, 0)
  await test.clock.to(5_000)
  assert.equal(test.calls.length, 1)
  assert.equal(test.clock.pendingTimers(), 0)
})

await run('bounded timeout is an error, not closure or a late zero sample', async () => {
  const test = harness({ requestTimeoutMs: 200 })
  await baseline(test)
  test.sampler.markExecutionReleased()
  await test.clock.to(100)
  let partial
  const rejected = assert.rejects(test.sampler.stop('pending transport cleanup'), (error) => {
    partial = error.partialReport
    assert.match(error.message, /timed out/)
    return true
  })
  await test.clock.to(250)
  await rejected
  assert.equal(partial.sampleCount, 1)
  assert.equal(partial.requests[1].outcome, 'timeout')
  assert.equal(partial.requests[1].responseAtMs, null)
  assert.equal(partial.requests[1].settledAtMs, 250)
  assert.equal(partial.requests[1].latencyMs, 200)
  assert.equal(partial.endReason.kind, 'error')
  assert.deepEqual(partial.requestLatencyMs, { min: 0, max: 0, mean: 0 })
  const original = JSON.stringify(partial)
  test.calls[1].resolve({ usedSize: 999_999, totalSize: 999_999 })
  await test.clock.to(1_000)
  assert.equal(JSON.stringify(partial), original)
  assert.equal(test.calls.length, 2)
  assert.equal(test.clock.pendingTimers(), 0)
})

await run('release marker and start/stop misuse are explicit errors', async () => {
  const test = harness()
  assert.throws(() => test.sampler.markExecutionReleased(), /Await the baseline/)
  await baseline(test)
  test.sampler.markExecutionReleased()
  assert.throws(() => test.sampler.markExecutionReleased(), /already marked/)
  await test.sampler.stop('done')
  const unused = harness()
  const result = await unused.sampler.stop('never started')
  assert.equal(result.sampleCount, 0)
  assert.equal(result.startedAtMs, null)
  assert.equal(result.coverage, 'insufficient')
  await assert.rejects(unused.sampler.start(), /Cannot start a stopped/)
  assert.equal(unused.calls.length, 0)
  for (const options of [{}, { send: () => {}, intervalMs: 0 }, { send: () => {}, intervalMs: NaN },
    { send: () => {}, requestTimeoutMs: -1 }, { send: () => {}, clock: {} }]) {
    assert.throws(() => createWorkerHeapSampler(options), /function|number|positive/)
  }
})

await run('asynchronous invalid or backwards response clocks reject without leaving pending work', async () => {
  for (const invalidNow of [() => NaN, () => -1, () => { throw new Error('Clock unavailable') }]) {
    const test = harness()
    const rejected = assert.rejects(test.sampler.start(), (error) => {
      assert.equal(error.partialReport.sampleCount, 0)
      assert.equal(error.partialReport.requests[0].outcome, 'error')
      assert.equal(error.partialReport.requests[0].responseAtMs, null)
      assert.equal(error.partialReport.requests[0].settledAtMs, null)
      assert.equal(error.partialReport.endedAtMs, null)
      return true
    })
    test.clock.now = invalidNow
    test.calls[0].resolve({ usedSize: 10, totalSize: 20 })
    await rejected
    await assert.rejects(test.sampler.stop('clock-failure cleanup'), /clock|Clock|timestamp/)
    assert.equal(test.clock.pendingTimers(), 0)
  }
  const test = harness()
  await baseline(test, undefined, 5)
  test.sampler.markExecutionReleased()
  await test.clock.to(55)
  test.clock.now = () => 54
  test.calls[1].resolve({ usedSize: 30, totalSize: 40 })
  await flush()
  await assert.rejects(test.sampler.stop('backwards-clock cleanup'), (error) => {
    assert.match(error.message, /moved backwards/)
    assert.equal(error.partialReport.sampleCount, 1)
    assert.equal(error.partialReport.requests[1].outcome, 'error')
    assert.equal(error.partialReport.requests[1].latencyMs, null)
    return true
  })
  assert.equal(test.clock.pendingTimers(), 0)
})

await run('invalid tick and stop clocks cannot throw an unhandled callback or hang cleanup', async () => {
  const tick = harness()
  await baseline(tick)
  tick.sampler.markExecutionReleased()
  tick.clock.now = () => NaN
  await tick.clock.to(1_000)
  assert.equal(tick.calls.length, 1)
  await assert.rejects(tick.sampler.stop('invalid tick clock'), (error) => {
    assert.equal(error.partialReport.sampleCount, 1)
    assert.equal(error.partialReport.endReason.kind, 'error')
    return true
  })
  assert.equal(tick.clock.pendingTimers(), 0)

  const stopping = harness({ requestTimeoutMs: 100 })
  await baseline(stopping)
  stopping.sampler.markExecutionReleased()
  await stopping.clock.to(50)
  stopping.clock.now = () => Infinity
  const rejected = assert.rejects(stopping.sampler.stop('invalid stop clock with pending request'), (error) => {
    assert.equal(error.partialReport.stopRequestedAtMs, null)
    assert.equal(error.partialReport.requests[1].outcome, 'error')
    assert.equal(error.partialReport.endReason.kind, 'error')
    return true
  })
  await stopping.clock.to(150)
  await rejected
  assert.equal(stopping.clock.pendingTimers(), 0)
  stopping.calls[1].resolve({ usedSize: 500, totalSize: 600 })
  await flush()
})

console.log(`Worker heap numerical sampling tests passed (${cases} cases; fake send/clock only).`)
