import assert from 'node:assert/strict'

const fields = ['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize']

function number(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${label}: expected finite nonnegative number`)
  return value
}

// This analysis is independent of the sampler's aggregate fields. A protocol
// request/response interval must fit wholly in a host-clock holding window;
// neither its response alone nor the Worker's separate clock is sufficient.
export function analyzeHeldPhases({ allocatorHeap, controlHeap, phaseWindows }) {
  assert.deepEqual(phaseWindows.map(({ name }) => name), ['idle', 'objects', 'buffer'])
  let previousEnd = 0
  for (const phase of phaseWindows) {
    number(phase.startAtMs, `${phase.name} start`)
    number(phase.endAtMs, `${phase.name} end`)
    assert(phase.startAtMs >= previousEnd && phase.endAtMs > phase.startAtMs, 'Invalid or overlapping host phase windows')
    previousEnd = phase.endAtMs
  }
  for (const heap of [allocatorHeap, controlHeap]) {
    verifySampleReport(heap)
    assert(heap.executionReleasedAtMs !== null, 'Held calibration requires both Workers to have been released')
    assert(phaseWindows[0].startAtMs >= heap.executionReleasedAtMs, 'Held windows cannot precede either Worker release acknowledgement')
  }

  const phases = phaseWindows.map((window) => ({
    ...window,
    allocator: summarize(allocatorHeap.samples, window),
    idleControl: summarize(controlHeap.samples, window),
  }))
  const [idle, objects, buffer] = phases
  return {
    clock: 'host-monotonic-ms',
    membership: 'request-and-response-wholly-inside-window',
    phases,
    allPhasesHaveSamples: phases.every((phase) => phase.allocator.sampleCount > 0 && phase.idleControl.sampleCount > 0),
    // Positive separation is a descriptive response to this control, not a
    // conversion from object count to bytes or proof of exclusive ownership.
    objectUsedHeapRangeSeparationBytes: separation(objects.allocator, idle.allocator, 'usedSize'),
    bufferBackingRangeSeparationBytes: separation(buffer.allocator, objects.allocator, 'backingStorageSize'),
    controlBackingRangeSeparationBytes: separation(buffer.idleControl, objects.idleControl, 'backingStorageSize'),
    exactObjectBytesProven: false,
    exactArrayBufferAccountingProven: false,
    truePeakMeasured: false,
    fullCoverageProven: false,
    finalReclamationProven: false,
    deviceThresholdEstablished: false,
  }
}

function summarize(samples, window) {
  const selected = samples.filter((sample) => sample.phase === 'after-release' && sample.requestAtMs >= window.startAtMs && sample.responseAtMs <= window.endAtMs)
  return {
    sampleCount: selected.length,
    fields: Object.fromEntries(fields.map((field) => {
      const values = selected.flatMap((sample) => sample[field] === undefined ? [] : [sample[field]])
      return [field, {
        count: values.length,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
      }]
    })),
  }
}

function separation(later, earlier, field) {
  const low = later.fields[field].min
  const high = earlier.fields[field].max
  return low === null || high === null ? null : low - high
}

export function verifySampleReport(heap) {
  assert(heap && heap.method === 'Runtime.getHeapUsage' && heap.clock === 'host-monotonic-ms', 'Unexpected instrument or clock')
  assert.equal(heap.units, 'bytes')
  assert.equal(heap.truePeakMeasured, false, 'Samples cannot establish a true peak')
  assert.equal(heap.coverageIncomplete, true)
  assert.equal(heap.finalReclamationProven, false)
  if (heap.executionReleasedAtMs !== null) number(heap.executionReleasedAtMs, 'execution release marker')
  assert(Array.isArray(heap.samples))
  assert.equal(heap.sampleCount, heap.samples.length)
  let previousResponse = 0
  const runtime = []
  heap.samples.forEach((sample, index) => {
    number(sample.requestAtMs, 'request')
    number(sample.responseAtMs, 'response')
    assert(sample.requestAtMs >= previousResponse && sample.responseAtMs >= sample.requestAtMs, 'Overlapping or reversed observations')
    previousResponse = sample.responseAtMs
    assert.equal(sample.latencyMs, sample.responseAtMs - sample.requestAtMs)
    for (const field of fields) {
      if (sample[field] === undefined && field !== 'usedSize' && field !== 'totalSize') continue
      number(sample[field], field)
    }
    const phase = index === 0 ? 'baseline' : heap.executionReleasedAtMs === null || sample.responseAtMs < heap.executionReleasedAtMs
      ? 'before-release' : sample.requestAtMs < heap.executionReleasedAtMs ? 'crosses-release' : 'after-release'
    assert.equal(sample.phase, phase, 'Sample phase disagrees with the host release marker')
    if (phase === 'after-release') runtime.push(sample)
  })
  assert.equal(heap.runtimeSampleCount, runtime.length)
  assert.equal(heap.coverage, runtime.length >= 2 ? 'limited' : 'insufficient')
  for (const [samples, aggregate] of [[heap.samples, heap.observedSampledMaxima], [runtime, heap.runtimeObservedSampledMaxima]]) {
    for (const field of fields) {
      const values = samples.flatMap((sample) => sample[field] === undefined ? [] : [sample[field]])
      assert.equal(aggregate[field], values.length ? Math.max(...values) : null, `Incorrect ${field} sampled maximum`)
    }
  }
  for (const field of fields) {
    assert.equal(heap.fieldSampleCounts[field], heap.samples.filter((sample) => sample[field] !== undefined).length)
  }
  return { sampleCount: heap.samples.length, runtimeSampleCount: runtime.length, truePeakMeasured: false }
}
