import assert from 'node:assert/strict'

function record(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`)
  return value
}

function text(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label}: expected nonempty string`)
  return value
}

function identifier(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label}: expected positive safe integer`)
  return value
}

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label}: duplicate identity`)
}

function processIndex(snapshot, label) {
  record(snapshot, label)
  assert(Array.isArray(snapshot.processInfo), `${label}: missing processInfo array`)
  const result = new Map()
  for (const process of snapshot.processInfo) {
    record(process, label)
    identifier(process.id, `${label} process id`)
    text(process.type, `${label} process type`)
    assert(!result.has(process.id), `${label}: duplicate process id`)
    result.set(process.id, process.type)
  }
  return result
}

function uniqueLocation(locations, label) {
  assert(locations.length > 0, `${label}: missing evidence`)
  const first = locations[0]
  for (const location of locations) {
    identifier(location.processId, `${label} process id`)
    identifier(location.threadId, `${label} thread id`)
    assert.equal(location.processId, first.processId, `${label}: conflicting process ids`)
    assert.equal(location.threadId, first.threadId, `${label}: conflicting thread ids`)
  }
  return { processId: first.processId, threadId: first.threadId, eventCount: locations.length }
}

function markLocation(events, markName) {
  const matches = events.filter((event) => event.name === markName)
  const locations = matches.map((event) => {
    assert(typeof event.cat === 'string' && event.cat.split(',').map((item) => item.trim()).includes('blink.user_timing'),
      `${markName}: wrong mark category`)
    assert(['R', 'I', 'i'].includes(event.ph), `${markName}: wrong mark phase`)
    return { processId: event.pid, threadId: event.tid }
  })
  return uniqueLocation(locations, `mark ${markName}`)
}

// A consistency check of supplied trace/target evidence, not authentication of
// the producer or a memory measurement. Browser ownership, bounded collection,
// exact target closure and trace completion remain the runner's responsibility.
export function analyzeWorkerProcessAttribution({ page, workers, traceEvents, dataLossOccurred, processesDuring, processesAfter }) {
  record(page, 'page')
  for (const field of ['targetId', 'frameId', 'isolateId', 'markName']) text(page[field], `page ${field}`)
  assert(Array.isArray(workers) && workers.length > 0, 'At least one Worker is required')
  for (const worker of workers) {
    record(worker, 'Worker')
    for (const field of ['caseId', 'targetId', 'sessionId', 'isolateId', 'workerUrl', 'markName']) text(worker[field], `Worker ${field}`)
  }
  unique([page.targetId, ...workers.map((worker) => worker.targetId)], 'target')
  unique(workers.map((worker) => worker.sessionId), 'Worker session')
  unique([page.isolateId, ...workers.map((worker) => worker.isolateId)], 'isolate')
  unique(workers.map((worker) => worker.caseId), 'Worker case')
  unique(workers.map((worker) => worker.workerUrl), 'Worker URL')
  unique([page.markName, ...workers.map((worker) => worker.markName)], 'mark name')
  assert.equal(dataLossOccurred, false, 'Trace must explicitly report no data loss')
  assert(Array.isArray(traceEvents), 'Missing traceEvents array')
  for (const event of traceEvents) record(event, 'trace event')

  const during = processIndex(processesDuring, 'during')
  const after = processIndex(processesAfter, 'after')
  const presence = (processId) => {
    assert.equal(during.get(processId), 'renderer', `Mapped process ${processId} is not a during renderer`)
    if (after.has(processId)) assert.equal(after.get(processId), 'renderer', `Mapped process ${processId} changed type after`)
    // An after-list entry means this renderer PID was still listed. It does
    // not prove resource reclamation or rule out PID reuse without start IDs.
    return { rendererPresentDuring: true, rendererPresentAfter: after.has(processId) }
  }

  const pageMark = markLocation(traceEvents, page.markName)
  const frameMappings = []
  for (const event of traceEvents) {
    if (event.name === 'TracingStartedInBrowser') {
      const data = record(event.args?.data, 'TracingStartedInBrowser data')
      if (data.frames !== undefined) {
        assert(Array.isArray(data.frames), 'TracingStartedInBrowser frames must be an array')
        for (const frame of data.frames) {
          record(frame, 'trace frame')
          if (frame.frame === page.frameId) frameMappings.push(frame.processId)
        }
      }
    } else if (event.name === 'FrameCommittedInBrowser') {
      const frame = record(event.args?.data, 'FrameCommittedInBrowser data')
      if (frame.frame === page.frameId) frameMappings.push(frame.processId)
    }
  }
  assert(frameMappings.length > 0, 'Page frame has no process mapping')
  for (const processId of frameMappings) {
    identifier(processId, 'frame process id')
    assert.equal(processId, pageMark.processId, 'Page frame mapping conflicts with the page mark')
  }

  const workerByTarget = new Map(workers.map((worker) => [worker.targetId, worker]))
  const metadata = new Map(workers.map((worker) => [worker.targetId, []]))
  for (const event of traceEvents) {
    if (event.name !== 'TracingSessionIdForWorker') continue
    const data = record(event.args?.data, 'Worker trace metadata')
    const worker = workerByTarget.get(data.workerId)
    assert(worker, 'Worker trace metadata contains a foreign or missing target id')
    assert.equal(data.url, worker.workerUrl, 'Worker metadata URL does not match its exact target')
    assert.equal(data.frame, page.frameId, 'Worker metadata parent frame does not match the page')
    identifier(data.workerThreadId, 'Worker native thread id')
    // This mode only accepts native IDs that survive the trace format's
    // signed-int32 thread conversion unchanged. Never mask or truncate an ID.
    assert(data.workerThreadId <= 2_147_483_647, 'Worker native thread id exceeds this mode\'s supported int32 range')
    metadata.get(worker.targetId).push({ processId: event.pid, threadId: data.workerThreadId })
  }
  const mappedWorkers = workers.map((worker) => {
    const location = uniqueLocation(metadata.get(worker.targetId), `Worker ${worker.caseId} metadata`)
    const mark = markLocation(traceEvents, worker.markName)
    assert.equal(mark.processId, location.processId, `Worker ${worker.caseId} mark process conflicts with metadata`)
    assert.equal(mark.threadId, location.threadId, `Worker ${worker.caseId} mark thread conflicts with metadata`)
    return {
      caseId: worker.caseId, targetId: worker.targetId, sessionId: worker.sessionId,
      isolateId: worker.isolateId, workerUrl: worker.workerUrl, markName: worker.markName,
      processId: location.processId, threadId: location.threadId,
      metadataEventCount: location.eventCount, markEventCount: mark.eventCount,
      sharesPageProcess: location.processId === pageMark.processId,
      ...presence(location.processId),
    }
  })
  const mappedPage = {
    targetId: page.targetId, frameId: page.frameId, isolateId: page.isolateId, markName: page.markName,
    processId: pageMark.processId, threadId: pageMark.threadId,
    markEventCount: pageMark.eventCount, frameMappingEventCount: frameMappings.length,
    ...presence(pageMark.processId),
  }
  const distinctRendererProcessIds = [...new Set([mappedPage.processId, ...mappedWorkers.map((worker) => worker.processId)])].sort((a, b) => a - b)
  const processGroups = distinctRendererProcessIds.map((processId) => {
    const workerCaseIds = mappedWorkers.filter((worker) => worker.processId === processId).map((worker) => worker.caseId)
    return { processId, includesPage: mappedPage.processId === processId, workerCaseIds, workerCount: workerCaseIds.length, ...presence(processId) }
  })
  return {
    schemaVersion: 1, kind: 'worker-process-attribution', dataLossOccurred: false,
    page: mappedPage, workers: mappedWorkers,
    topology: {
      distinctRendererProcessIds, rendererProcessCount: distinctRendererProcessIds.length, processGroups,
      allWorkersSharePageProcess: mappedWorkers.every((worker) => worker.sharesPageProcess),
      anyWorkerSharesPageProcess: mappedWorkers.some((worker) => worker.sharesPageProcess),
      anyWorkersShareProcess: processGroups.some((group) => group.workerCount > 1),
      allWorkersShareOneProcess: new Set(mappedWorkers.map((worker) => worker.processId)).size === 1,
    },
    flags: {
      memoryMeasured: false, workerMemoryExclusive: false, truePeakMeasured: false,
      fullLifetimeCoverageProven: false, finalReclamationProven: false,
      deviceThresholdEstablished: false, processStartIdentityProven: false,
    },
    scope: 'Observed target/frame/mark-to-renderer topology only. Renderer presence after is a PID-list observation, not memory reclamation or proof against PID reuse. No allocation or memory counter is analyzed.',
  }
}
