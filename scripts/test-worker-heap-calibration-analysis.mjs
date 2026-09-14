import assert from 'node:assert/strict'
import { analyzeHeldPhases, verifySampleReport } from './worker-heap-calibration-analysis.mjs'

const fields = ['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize']
function heap(rows) {
  const samples = rows.map(([requestAtMs, responseAtMs, usedSize, backingStorageSize], index) => ({
    requestAtMs, responseAtMs, latencyMs: responseAtMs - requestAtMs,
    usedSize, totalSize: usedSize + 10,
    ...(backingStorageSize === undefined ? {} : { backingStorageSize }),
    phase: index === 0 ? 'baseline' : 'after-release',
  }))
  const maxima = (items) => Object.fromEntries(fields.map((field) => {
    const values = items.flatMap((sample) => sample[field] === undefined ? [] : [sample[field]])
    return [field, values.length ? Math.max(...values) : null]
  }))
  return {
    method: 'Runtime.getHeapUsage', units: 'bytes', clock: 'host-monotonic-ms',
    truePeakMeasured: false, coverageIncomplete: true, finalReclamationProven: false,
    executionReleasedAtMs: 5, samples, sampleCount: samples.length,
    runtimeSampleCount: Math.max(0, samples.length - 1),
    coverage: samples.length >= 3 ? 'limited' : 'insufficient',
    observedSampledMaxima: maxima(samples), runtimeObservedSampledMaxima: maxima(samples.slice(1)),
    fieldSampleCounts: Object.fromEntries(fields.map((field) => [field, samples.filter((sample) => sample[field] !== undefined).length])),
  }
}
const windows = [
  { name: 'idle', startAtMs: 10, endAtMs: 20 },
  { name: 'objects', startAtMs: 30, endAtMs: 40 },
  { name: 'buffer', startAtMs: 50, endAtMs: 60 },
]
const allocator = heap([[0, 1, 5, 0], [10, 11, 10, 0], [18, 19, 12, 0], [30, 31, 100, 0], [50, 51, 110, 8192]])
const control = heap([[0, 1, 5, 0], [10, 11, 10, 0], [30, 31, 10, 0], [50, 51, 10, 0]])
let count = 0
function run(name, body) {
  body()
  count += 1
  console.log(`PASS ${name}`)
}
const analyze = (allocatorHeap = allocator, controlHeap = control, phaseWindows = windows) => analyzeHeldPhases({ allocatorHeap, controlHeap, phaseWindows })

run('independent held ranges retain separate counters and idle control', () => {
  const result = analyze()
  assert.equal(result.allPhasesHaveSamples, true)
  assert.equal(result.objectUsedHeapRangeSeparationBytes, 88)
  assert.equal(result.bufferBackingRangeSeparationBytes, 8192)
  assert.equal(result.controlBackingRangeSeparationBytes, 0)
  for (const flag of ['exactObjectBytesProven', 'exactArrayBufferAccountingProven', 'truePeakMeasured', 'fullCoverageProven', 'finalReclamationProven', 'deviceThresholdEstablished']) assert.equal(result[flag], false)
})
run('requests crossing either edge cannot count as held observations', () => {
  const result = analyze(heap([[0, 1, 5, 0], [9, 11, 999, 99], [19, 21, 999, 99], [30, 31, 100, 0], [50, 51, 110, 8192]]))
  assert.equal(result.phases[0].allocator.sampleCount, 0)
  assert.equal(result.objectUsedHeapRangeSeparationBytes, null)
  assert.equal(result.allPhasesHaveSamples, false)
})
run('missing optional fields are unavailable, not zeros or inferred buffer totals', () => {
  const result = analyze(heap([[0, 1, 5], [10, 11, 10], [30, 31, 100], [50, 51, 110]]))
  assert.equal(result.bufferBackingRangeSeparationBytes, null)
  assert.deepEqual(result.phases[2].allocator.fields.backingStorageSize, { count: 0, min: null, max: null })
})
run('pre-script baseline alone and short-lived empty coverage remain insufficient', () => {
  assert.deepEqual(verifySampleReport(heap([[0, 1, 5, 0]])), { sampleCount: 1, runtimeSampleCount: 0, truePeakMeasured: false })
  assert.deepEqual(verifySampleReport(heap([])), { sampleCount: 0, runtimeSampleCount: 0, truePeakMeasured: false })
})
run('overlapping windows, invalid clocks and reversed observations fail', () => {
  for (const changed of [
    windows.map((w) => w.name === 'objects' ? { ...w, startAtMs: 19 } : w),
    windows.map((w) => w.name === 'idle' ? { ...w, startAtMs: NaN } : w),
    windows.map((w) => w.name === 'buffer' ? { ...w, endAtMs: 49 } : w),
  ]) assert.throws(() => analyze(allocator, control, changed))
  assert.throws(() => verifySampleReport(heap([[0, 1, 5], [5, 4, 20]])))
  assert.throws(() => verifySampleReport(heap([[0, 1, 5], [0, 4, 20]])))
})
run('fabricated maxima, counts, field values, phases and peak claims fail', () => {
  for (const mutate of [
    (h) => { h.observedSampledMaxima.usedSize += 1 },
    (h) => { h.runtimeSampleCount += 1 },
    (h) => { h.fieldSampleCounts.backingStorageSize += 1 },
    (h) => { h.samples[1].phase = 'baseline' },
    (h) => { h.samples[1].backingStorageSize = -1 },
    (h) => { h.samples[1].latencyMs = 999 },
    (h) => { h.coverage = 'complete' },
    (h) => { h.truePeakMeasured = true },
    (h) => { h.clock = 'worker-elapsed-ms' },
  ]) {
    const changed = structuredClone(allocator)
    mutate(changed)
    assert.throws(() => verifySampleReport(changed))
  }
})
run('missing or invalid release markers fail instead of treating comparisons as runtime', () => {
  for (const marker of [undefined, NaN, Infinity, -1, '5']) {
    const changed = structuredClone(allocator)
    changed.executionReleasedAtMs = marker
    assert.throws(() => verifySampleReport(changed), /release marker/)
  }
})
run('a self-consistent never-released report cannot establish held coverage', () => {
  const unreleased = structuredClone(allocator)
  unreleased.executionReleasedAtMs = null
  unreleased.samples.slice(1).forEach((sample) => { sample.phase = 'before-release' })
  unreleased.runtimeSampleCount = 0
  unreleased.coverage = 'insufficient'
  unreleased.runtimeObservedSampledMaxima = Object.fromEntries(fields.map((field) => [field, null]))
  verifySampleReport(unreleased)
  assert.throws(() => analyze(unreleased), /both Workers/)
  assert.throws(() => analyze(allocator, unreleased), /both Workers/)
})
run('held windows cannot precede release and a baseline in-window remains excluded', () => {
  const delayed = heap([[0, 1, 5], [15, 16, 10], [30, 31, 100], [50, 51, 110]])
  delayed.executionReleasedAtMs = 12
  verifySampleReport(delayed)
  assert.throws(() => analyze(delayed), /precede either Worker/)
  const lateBaseline = heap([[10, 11, 5], [30, 31, 100], [50, 51, 110]])
  assert.equal(analyze(lateBaseline).phases[0].allocator.sampleCount, 0)
})
console.log(`Calibration analysis tests passed (${count} cases; fabricated numeric controls only, no browser).`)
