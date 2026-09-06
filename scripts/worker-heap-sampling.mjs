const method = 'Runtime.getHeapUsage'
const fields = ['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize']
const defaultClock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
}

function finiteNonnegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite nonnegative number.`)
  }
  return value
}

function numericUsage(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new TypeError(`${method} returned no numeric result object.`)
  }
  const usage = {}
  for (const field of fields) {
    if (response[field] === undefined && field !== 'usedSize' && field !== 'totalSize') continue
    usage[field] = finiteNonnegative(response[field], `${method}.${field}`)
  }
  return usage
}

function knownClosed(error) {
  // Do not turn unsupported methods, timeouts, or arbitrary errors containing
  // "closed" into a successful zero reading. These are specific CDP closures.
  const message = String(error?.message ?? error).replace(/^Runtime\.getHeapUsage:\s*/, '').trim()
  return /^(?:Session with given id not found|No session with given id|Target closed|Session closed|Inspected target navigated or closed)\.?$/i.test(message)
}

function maxima(samples) {
  return Object.fromEntries(fields.map((field) => {
    const values = samples.flatMap((sample) => sample[field] === undefined ? [] : [sample[field]])
    return [field, values.length ? Math.max(...values) : null]
  }))
}

function maxGap(samples) {
  if (samples.length < 2) return null
  return Math.max(...samples.slice(1).map((sample, index) => sample.responseAtMs - samples[index].responseAtMs))
}

function latencyStats(requests) {
  const values = requests.filter((request) => request.responseAtMs !== null).map((request) => request.latencyMs)
  return values.length ? {
    min: Math.min(...values), max: Math.max(...values), mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  } : { min: null, max: null, mean: null }
}

/**
 * Host-side, numerical-only sampling of one already-attached Worker session.
 * Bind send to that session. Await start BEFORE releasing the Worker, then call
 * markExecutionReleased AFTER the release acknowledgement. The marker is not
 * the precise execution start. No GC, script evaluation, object lookup, or
 * lifecycle command is sent here. The owner remains responsible for terminate.
 */
export function createWorkerHeapSampler({ send, intervalMs = 50, requestTimeoutMs = 2_000, clock = defaultClock } = {}) {
  if (typeof send !== 'function') throw new TypeError('A session-bound CDP send function is required.')
  if (!(finiteNonnegative(intervalMs, 'intervalMs') > 0)) throw new TypeError('intervalMs must be positive.')
  if (!(finiteNonnegative(requestTimeoutMs, 'requestTimeoutMs') > 0)) throw new TypeError('requestTimeoutMs must be positive.')
  for (const key of ['now', 'setTimeout', 'clearTimeout']) {
    if (typeof clock?.[key] !== 'function') throw new TypeError(`clock.${key} must be a function.`)
  }
  const requests = []
  const samples = []
  let lastClockValue = 0
  let startedAtMs = null
  let executionReleasedAtMs = null
  let stopRequestedAtMs = null
  let endedAtMs = null
  let stopReason = null
  let endReason = null
  let skippedInFlightTicks = 0
  let active = false
  let startFinished = false
  let startPromise = null
  let stopPromise = null
  let timer = null
  let inFlight = null
  let failure = null

  function now() {
    const value = finiteNonnegative(clock.now(), 'Host monotonic timestamp')
    if (value < lastClockValue) throw new Error('Host monotonic clock moved backwards.')
    lastClockValue = value
    return value
  }

  function clearHostTimer() {
    const previous = timer
    timer = null
    if (previous !== null) clock.clearTimeout(previous)
  }

  function recordFailure(error, atMs = null) {
    failure ??= error instanceof Error ? error : new Error(String(error))
    active = false
    endReason = { kind: 'error', message: failure.message }
    endedAtMs = atMs
    // A broken injected timer adapter must not replace the first failure or
    // prevent the in-flight promise from being released.
    try { clearHostTimer() } catch { /* The sampler is already terminal-error. */ }
  }

  function end(kind, message, atMs) {
    active = false
    endReason = { kind, message }
    endedAtMs = atMs
    try { clearHostTimer() } catch (error) { recordFailure(error, atMs) }
  }

  function report() {
    const classified = samples.map((sample, index) => ({
      ...sample,
      phase: index === 0 ? 'baseline' : executionReleasedAtMs === null || sample.responseAtMs < executionReleasedAtMs
        ? 'before-release' : sample.requestAtMs < executionReleasedAtMs ? 'crosses-release' : 'after-release',
    }))
    const runtimeSamples = classified.filter((sample) => sample.phase === 'after-release')
    const firstResponseAtMs = samples[0]?.responseAtMs ?? null
    const lastResponseAtMs = samples.at(-1)?.responseAtMs ?? null
    return {
      method, units: 'bytes', clock: 'host-monotonic-ms', intervalMs, requestTimeoutMs,
      releaseMarker: 'host-after-release-acknowledgement',
      coverage: runtimeSamples.length >= 2 ? 'limited' : 'insufficient',
      coverageIncomplete: true, truePeakMeasured: false, finalReclamationProven: false,
      sampleCount: samples.length, runtimeSampleCount: runtimeSamples.length,
      baseline: classified[0] ? { ...classified[0] } : null,
      samples: classified, requests: requests.map((request) => ({ ...request })),
      observedSampledMaxima: maxima(samples), runtimeObservedSampledMaxima: maxima(runtimeSamples),
      fieldSampleCounts: Object.fromEntries(fields.map((field) => [field, samples.filter((sample) => sample[field] !== undefined).length])),
      maxObservationGapMs: maxGap(samples), runtimeMaxObservationGapMs: maxGap(runtimeSamples),
      requestLatencyMs: latencyStats(requests),
      requestLatencyScope: 'host request-to-response; no-response timeouts excluded',
      startedAtMs, executionReleasedAtMs, stopRequestedAtMs, endedAtMs,
      firstResponseAtMs, lastResponseAtMs,
      observedTimeSpanMs: lastResponseAtMs === null ? null : lastResponseAtMs - firstResponseAtMs,
      releaseToFirstRuntimeResponseMs: runtimeSamples.length ? runtimeSamples[0].responseAtMs - executionReleasedAtMs : null,
      lastResponseToStopMs: lastResponseAtMs !== null && stopRequestedAtMs !== null && stopRequestedAtMs >= lastResponseAtMs
        ? stopRequestedAtMs - lastResponseAtMs : null,
      lastResponseAfterStopMs: lastResponseAtMs !== null && stopRequestedAtMs !== null
        ? Math.max(0, lastResponseAtMs - stopRequestedAtMs) : 0,
      lastResponseToEndMs: lastResponseAtMs !== null && endedAtMs !== null ? endedAtMs - lastResponseAtMs : null,
      endReason: endReason ? { ...endReason } : null, stopReason, skippedInFlightTicks,
    }
  }

  function throwFailure() {
    if (!failure) return
    const error = new Error(failure.message, { cause: failure })
    error.partialReport = report()
    throw error
  }

  function sample() {
    const requestAtMs = now()
    const request = { requestAtMs, responseAtMs: null, settledAtMs: null, latencyMs: null, outcome: 'pending' }
    requests.push(request)
    const pending = new Promise((resolve) => {
      let settled = false
      let deadline = null
      function finish(outcome, payload) {
        if (settled) return // The sent protocol command cannot be recalled; ignore its late settlement.
        settled = true
        let atMs = null
        try {
          if (deadline !== null) clock.clearTimeout(deadline)
          atMs = now()
          Object.assign(request, { settledAtMs: atMs, latencyMs: atMs - requestAtMs, outcome })
          if (outcome !== 'timeout') request.responseAtMs = atMs
          if (outcome === 'success') {
            samples.push({ requestAtMs, responseAtMs: atMs, latencyMs: atMs - requestAtMs, ...numericUsage(payload) })
          } else if (outcome !== 'timeout' && knownClosed(payload)) {
            request.outcome = 'session-closed'
            end('session-closed', String(payload?.message ?? payload), atMs)
          } else throw payload
        } catch (error) {
          request.outcome = outcome === 'timeout' && atMs !== null ? 'timeout' : 'error'
          recordFailure(error, atMs)
        } finally { resolve() }
      }
      try {
        deadline = clock.setTimeout(() => finish('timeout', new Error(`${method} sampling timed out after ${requestTimeoutMs} ms.`)), requestTimeoutMs)
        Promise.resolve(send(method, {})).then((response) => finish('success', response), (error) => finish('error', error))
      } catch (error) { finish('error', error) }
    })
    inFlight = pending
    // This promise always fulfils; protocol errors are exposed by start/stop,
    // never leaked as an unhandled background rejection.
    pending.then(() => { if (inFlight === pending) inFlight = null })
    return pending
  }

  function tick() {
    timer = null
    if (!active) return
    try {
      if (inFlight) skippedInFlightTicks += 1
      else sample()
      if (active) timer = clock.setTimeout(tick, intervalMs)
    } catch (error) { recordFailure(error) }
  }

  function start() {
    if (startPromise) return startPromise
    if (stopPromise) return Promise.reject(new Error('Cannot start a stopped Worker heap sampler.'))
    startPromise = (async () => {
      try {
        startedAtMs = now()
        active = true
        await sample()
        startFinished = true
        if (active) timer = clock.setTimeout(tick, intervalMs)
      } catch (error) { recordFailure(error) }
      throwFailure()
      return samples[0] ? { ...samples[0], phase: 'baseline' } : null
    })()
    return startPromise
  }

  function markExecutionReleased() {
    if (!startFinished) throw new Error('Await the baseline before marking the Worker release acknowledgement.')
    if (executionReleasedAtMs !== null) throw new Error('Worker release acknowledgement was already marked.')
    if (!active || stopPromise) throw new Error('Cannot mark execution release on an ended Worker heap sampler.')
    try { executionReleasedAtMs = now() } catch (error) { recordFailure(error); throwFailure() }
    return executionReleasedAtMs
  }

  function stop(reason = 'caller-stopped') {
    if (stopPromise) return stopPromise
    if (typeof reason !== 'string' || !reason.trim()) return Promise.reject(new TypeError('A nonempty stop reason is required.'))
    stopPromise = (async () => {
      try { stopRequestedAtMs = now() } catch (error) { recordFailure(error) }
      stopReason = reason
      active = false
      try { clearHostTimer() } catch (error) { recordFailure(error) }
      const pending = inFlight
      if (pending) await pending
      if (!endReason) {
        try { end('stopped', reason, now()) } catch (error) { recordFailure(error) }
      }
      throwFailure()
      return report()
    })()
    return stopPromise
  }

  return { start, markExecutionReleased, stop }
}
