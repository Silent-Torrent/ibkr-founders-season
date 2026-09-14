import assert from 'node:assert/strict'
import { analyzeWorkerProcessAttribution } from './worker-process-attribution-analysis.mjs'

const page = { targetId: 'page-target', frameId: 'page-frame', isolateId: 'page-isolate', markName: 'page-mark' }
const workers = [1, 2].map((index) => ({
  caseId: `worker-${index}`, targetId: `worker-target-${index}`, sessionId: `worker-session-${index}`,
  isolateId: `worker-isolate-${index}`, workerUrl: `http://127.0.0.1:4567/worker.js?case=${index}`, markName: `worker-mark-${index}`,
}))
const mark = (name, pid, tid, ph = 'R') => ({ name, pid, tid, ph, cat: 'blink.user_timing' })
const workerMetadata = (worker, pid, tid) => ({
  name: 'TracingSessionIdForWorker', pid, tid, ph: 'I', cat: 'disabled-by-default-devtools.timeline',
  args: { data: { workerId: worker.targetId, frame: page.frameId, url: worker.workerUrl, workerThreadId: tid } },
})
const startFrame = { name: 'TracingStartedInBrowser', args: { data: { frames: [{ frame: page.frameId, processId: 101 }] } } }
const committedFrame = { name: 'FrameCommittedInBrowser', args: { data: { frame: page.frameId, processId: 101 } } }
const fixture = () => structuredClone({
  page, workers, dataLossOccurred: false,
  traceEvents: [startFrame, committedFrame, mark(page.markName, 101, 10), workerMetadata(workers[0], 101, 11), mark(workers[0].markName, 101, 11), workerMetadata(workers[1], 101, 12), mark(workers[1].markName, 101, 12)],
  processesDuring: { processInfo: [{ type: 'browser', id: 100 }, { type: 'renderer', id: 101 }] },
  processesAfter: { processInfo: [{ type: 'browser', id: 100 }, { type: 'renderer', id: 101 }] },
})
const metadataAt = (input, index = 0) => input.traceEvents.find((event) => event.name === 'TracingSessionIdForWorker' && event.args.data.workerId === input.workers[index].targetId)
const markAt = (input, name) => input.traceEvents.find((event) => event.name === name)
function reject(mutate, message) {
  const input = fixture()
  mutate(input)
  assert.throws(() => analyzeWorkerProcessAttribution(input), message)
}
let count = 0
function run(name, body) {
  body()
  count += 1
  console.log(`PASS ${name}`)
}

run('shared renderer topology keeps distinct target/session/isolate and all memory claims false', () => {
  const input = fixture()
  const original = structuredClone(input)
  const result = analyzeWorkerProcessAttribution(input)
  assert.deepEqual(input, original, 'Analysis must not mutate evidence')
  assert.equal(result.page.processId, 101)
  assert.equal(result.page.threadId, 10)
  assert.equal(result.page.frameMappingEventCount, 2)
  assert.deepEqual(result.workers.map((worker) => worker.threadId), [11, 12])
  assert.deepEqual(result.topology.distinctRendererProcessIds, [101])
  assert.equal(result.topology.allWorkersSharePageProcess, true)
  assert.equal(result.topology.anyWorkersShareProcess, true)
  assert.equal(result.topology.processGroups[0].workerCount, 2)
  assert(result.workers.every((worker) => worker.rendererPresentAfter))
  for (const value of Object.values(result.flags)) assert.equal(value, false)
})
run('distinct renderers are a valid result and missing after PID is not reclamation', () => {
  const input = fixture()
  input.workers.forEach((worker, index) => {
    metadataAt(input, index).pid = 201 + index
    markAt(input, worker.markName).pid = 201 + index
    input.processesDuring.processInfo.push({ type: 'renderer', id: 201 + index })
  })
  input.processesAfter.processInfo.push({ type: 'renderer', id: 201 })
  const result = analyzeWorkerProcessAttribution(input)
  assert.deepEqual(result.topology.distinctRendererProcessIds, [101, 201, 202])
  assert.equal(result.topology.rendererProcessCount, 3)
  assert.equal(result.topology.allWorkersSharePageProcess, false)
  assert.equal(result.topology.anyWorkerSharesPageProcess, false)
  assert.equal(result.topology.anyWorkersShareProcess, false)
  assert.equal(result.topology.allWorkersShareOneProcess, false)
  assert.equal(result.workers[1].rendererPresentAfter, false)
  assert.equal(result.flags.finalReclamationProven, false)
})
run('consistent duplicate metadata, marks and frame mappings are accepted', () => {
  const input = fixture()
  input.traceEvents.push(structuredClone(metadataAt(input)), structuredClone(startFrame), structuredClone(markAt(input, page.markName)))
  const result = analyzeWorkerProcessAttribution(input)
  assert.equal(result.workers[0].metadataEventCount, 2)
  assert.equal(result.page.markEventCount, 2)
  assert.equal(result.page.frameMappingEventCount, 3)
})
run('either supported frame-event shape is enough but unrelated frame is not', () => {
  for (const name of ['TracingStartedInBrowser', 'FrameCommittedInBrowser']) {
    const input = fixture()
    input.traceEvents = input.traceEvents.filter((event) => event.name !== name)
    assert.equal(analyzeWorkerProcessAttribution(input).page.frameMappingEventCount, 1)
  }
  reject((input) => { input.traceEvents = input.traceEvents.filter((event) => !['TracingStartedInBrowser', 'FrameCommittedInBrowser'].includes(event.name)) }, /no process mapping/)
  reject((input) => {
    input.traceEvents[0].args.data.frames[0].frame = 'foreign-frame'
    input.traceEvents[1].args.data.frame = 'foreign-frame'
  }, /no process mapping/)
})
run('missing or foreign Worker metadata cannot be replaced by an isolated same-name mark', () => {
  reject((input) => { input.traceEvents = input.traceEvents.filter((event) => event !== metadataAt(input)) }, /missing evidence/)
  for (const foreign of ['foreign-target', undefined, null]) reject((input) => { metadataAt(input).args.data.workerId = foreign }, /foreign or missing target/)
  reject((input) => {
    const extra = structuredClone(metadataAt(input)); extra.args.data.workerId = 'foreign-target'; input.traceEvents.push(extra)
  }, /foreign or missing target/)
})
run('wrong exact Worker URL or parent frame fails, including a conflicting duplicate', () => {
  for (const [field, value] of [['url', 'http://127.0.0.1:4567/worker.js?case=999'], ['frame', 'foreign-frame']]) {
    reject((input) => { metadataAt(input).args.data[field] = value }, /URL|parent frame/)
    reject((input) => { const copy = structuredClone(metadataAt(input)); copy.args.data[field] = value; input.traceEvents.push(copy) }, /URL|parent frame/)
  }
})
run('ambiguous Worker process or thread mappings fail even if one matches a mark', () => {
  for (const change of [(event) => { event.pid = 102 }, (event) => { event.args.data.workerThreadId = 99 }]) {
    reject((input) => { const copy = structuredClone(metadataAt(input)); change(copy); input.traceEvents.push(copy) }, /conflicting/)
  }
})
run('Worker mark process/thread must match independently identified metadata', () => {
  reject((input) => { markAt(input, workers[0].markName).pid = 102 }, /mark process conflicts/)
  reject((input) => { markAt(input, workers[0].markName).tid = 99 }, /mark thread conflicts/)
  reject((input) => { metadataAt(input).args.data.workerThreadId = 99 }, /mark thread conflicts/)
})
run('missing and ambiguous page or Worker marks fail', () => {
  for (const name of [page.markName, workers[0].markName]) {
    reject((input) => { input.traceEvents = input.traceEvents.filter((event) => event.name !== name) }, /missing evidence/)
    for (const field of ['pid', 'tid']) reject((input) => {
      const copy = structuredClone(markAt(input, name)); copy[field] += 1; input.traceEvents.push(copy)
    }, /conflicting/)
  }
})
run('mark categories are comma-delimited exact tokens and phases are R/I/i only', () => {
  for (const ph of ['R', 'I', 'i']) {
    const input = fixture()
    markAt(input, page.markName).ph = ph
    markAt(input, page.markName).cat = 'devtools.timeline, blink.user_timing'
    analyzeWorkerProcessAttribution(input)
  }
  for (const name of [page.markName, workers[0].markName]) {
    for (const cat of ['', 'devtools.timeline', 'not-blink.user_timing', undefined]) reject((input) => { markAt(input, name).cat = cat }, /wrong mark category/)
    for (const ph of ['B', 'E', 'X', undefined]) reject((input) => { markAt(input, name).ph = ph }, /wrong mark phase/)
  }
  reject((input) => { const copy = structuredClone(markAt(input, page.markName)); copy.cat = 'foreign'; input.traceEvents.push(copy) }, /wrong mark category/)
})
run('conflicting or invalid frame process mappings fail', () => {
  reject((input) => { input.traceEvents[1].args.data.processId = 102 }, /frame mapping conflicts/)
  for (const processId of [undefined, null, NaN, 0, -1, '101', 1.5]) reject((input) => { input.traceEvents[0].args.data.frames[0].processId = processId }, /positive safe integer/)
})
run('trace loss, missing loss verdict and malformed collections fail closed', () => {
  for (const loss of [true, undefined, null, 'false', 0]) reject((input) => { input.dataLossOccurred = loss }, /explicitly report no data loss/)
  for (const events of [undefined, null, {}, [null]]) reject((input) => { input.traceEvents = events }, /trace/)
  reject((input) => { input.traceEvents[0].args.data.frames = {} }, /frames must be an array/)
})
run('targets, sessions, isolates, cases, URLs and marker identities cannot collide', () => {
  for (const field of ['targetId', 'sessionId', 'isolateId', 'caseId', 'workerUrl', 'markName']) reject((input) => { input.workers[1][field] = input.workers[0][field] }, /duplicate identity/)
  for (const field of ['targetId', 'isolateId', 'markName']) reject((input) => { input.workers[0][field] = input.page[field] }, /duplicate identity/)
})
run('missing identity fields and empty Worker list are rejected', () => {
  for (const field of ['targetId', 'frameId', 'isolateId', 'markName']) reject((input) => { delete input.page[field] }, /nonempty string/)
  for (const field of ['caseId', 'targetId', 'sessionId', 'isolateId', 'workerUrl', 'markName']) reject((input) => { input.workers[0][field] = ' ' }, /nonempty string/)
  reject((input) => { input.workers = [] }, /At least one Worker/)
})
run('process snapshots reject duplicate ids even with a different type', () => {
  for (const snapshot of ['processesDuring', 'processesAfter']) {
    for (const type of ['renderer', 'utility']) reject((input) => { input[snapshot].processInfo.push({ id: 101, type }) }, /duplicate process id/)
    reject((input) => { delete input[snapshot].processInfo }, /processInfo array/)
  }
})
run('mapped PIDs must be renderers during and cannot change listed type after', () => {
  reject((input) => { input.processesDuring.processInfo = [{ id: 100, type: 'browser' }] }, /not a during renderer/)
  reject((input) => { input.processesDuring.processInfo[1].type = 'utility' }, /not a during renderer/)
  reject((input) => { input.processesAfter.processInfo[1].type = 'utility' }, /changed type after/)
  const input = fixture()
  input.processesAfter.processInfo = []
  assert.equal(analyzeWorkerProcessAttribution(input).page.rendererPresentAfter, false)
})
run('invalid numeric PID and TID values are rejected rather than coerced', () => {
  for (const value of [undefined, null, NaN, Infinity, 0, -1, 1.5, '101', Number.MAX_SAFE_INTEGER + 1]) {
    reject((input) => { metadataAt(input).pid = value }, /positive safe integer/)
    reject((input) => { metadataAt(input).args.data.workerThreadId = value }, /positive safe integer/)
    reject((input) => { markAt(input, page.markName).tid = value }, /positive safe integer/)
    reject((input) => { input.processesDuring.processInfo[1].id = value }, /positive safe integer/)
  }
})
run('native Worker thread IDs must fit positive signed int32 without truncation', () => {
  const input = fixture()
  metadataAt(input).args.data.workerThreadId = 2_147_483_647
  markAt(input, workers[0].markName).tid = 2_147_483_647
  assert.equal(analyzeWorkerProcessAttribution(input).workers[0].threadId, 2_147_483_647)
  for (const threadId of [2_147_483_648, 4_294_967_297, Number.MAX_SAFE_INTEGER]) {
    reject((changed) => {
      metadataAt(changed).args.data.workerThreadId = threadId
      markAt(changed, workers[0].markName).tid = 1
    }, /supported int32 range/)
  }
})
console.log(`Worker/process attribution analysis tests passed (${count} groups; synthetic evidence only, no browser or memory measurement).`)
