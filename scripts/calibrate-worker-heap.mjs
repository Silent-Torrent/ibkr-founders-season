import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorkerHeapSampler } from './worker-heap-sampling.mjs'
import { analyzeHeldPhases, verifySampleReport } from './worker-heap-calibration-analysis.mjs'

// Explicit, fictional calibration only. This module does not import the app or
// run its browser regression. Held allocations deliberately expose a plateau;
// neither that plateau nor a short-lived sample is a continuous memory peak.
const config = Object.freeze({
  intervalMs: 50, requestTimeoutMs: 2_000, objectCount: 250_000,
  arrayBufferBytes: 8 * 1_048_576, idleMs: 400, holdMs: 600, pairs: 3,
  phaseTimeoutMs: 5_000, overallTimeoutMs: 60_000,
})
const flags = Object.freeze({
  truePeakMeasured: false, fullCoverageProven: false,
  finalReclamationProven: false, deviceThresholdEstablished: false,
  causalOverheadEstimate: false,
})
const runnerPath = fileURLToPath(import.meta.url)
const samplerPath = fileURLToPath(new URL('./worker-heap-sampling.mjs', import.meta.url))
const analysisPath = fileURLToPath(new URL('./worker-heap-calibration-analysis.mjs', import.meta.url))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const now = () => performance.now()
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

function parseArguments(args) {
  if (args.length === 0) return null
  assert.equal(args.length, 2, 'Usage: node scripts/calibrate-worker-heap.mjs [--output /absolute/new.json]')
  assert.equal(args[0], '--output', 'Only --output is supported.')
  const output = args[1]
  assert(isAbsolute(output), '--output must be an absolute path.')
  assert.equal(resolve(output), output, '--output must be a normalized absolute path.')
  assert.equal(parse(output).ext, '.json', '--output must name a new .json file.')
  // Check every existing parent, not merely the final path. Refuse symlink
  // routes, an existing file (including a dangling symlink), and absent parents.
  let directory = dirname(output)
  while (true) {
    const metadata = lstatSync(directory)
    assert(metadata.isDirectory() && !metadata.isSymbolicLink(), 'Output parents must be real directories without symlinks.')
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  try {
    lstatSync(output)
    throw new Error('Refusing to overwrite an existing output path.')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return output
}

const workerSource = `
'use strict';
const caseId = new URL(location.href).searchParams.get('case');
const objectCount = ${config.objectCount};
const bufferBytes = ${config.arrayBufferBytes};
const bootAt = performance.now();
let objects = null;
let bytes = null;
function mark(name, extra = {}) {
  __heapCalibrationMarker(JSON.stringify({caseId, name, workerElapsedMs: performance.now() - bootAt, ...extra}));
}
function retainObjects() {
  objects = new Array(objectCount);
  for (let i = 0; i < objectCount; i++) objects[i] = {index: i, value: i + 1};
}
function retainBuffer() {
  bytes = new Uint8Array(bufferBytes);
  bytes.fill(90);
}
function counts() {
  return {
    count: objects ? objects.length : 0,
    objectChecksum: objects ? objects[0].value + objects[objects.length - 1].value : 0,
    byteLength: bytes ? bytes.byteLength : 0,
    bufferChecksum: bytes ? bytes[0] + bytes[bytes.length - 1] : 0,
  };
}
onmessage = ({data}) => {
  if (data === 'objects' && !objects && !bytes) {
    retainObjects();
    mark('objects', counts());
  } else if (data === 'buffer' && objects && !bytes) {
    retainBuffer();
    mark('buffer', counts());
  } else if (data === 'short' && !objects && !bytes) {
    const operationStartedAt = performance.now();
    retainObjects();
    retainBuffer();
    mark('short-complete', {...counts(), operationDurationMs: performance.now() - operationStartedAt});
    close();
  } else if (data === 'finish') {
    // Validate retained contents while still reachable. Dropping a reference is
    // not a request for GC, and no post-release zero/reclamation claim is made.
    mark('finished', counts());
    objects = null;
    bytes = null;
    close();
  } else {
    throw new Error('Invalid calibration command or phase.');
  }
};
mark('ready', counts());
`
const pageSource = `
'use strict';
globalThis.calibrationWorkers = new Map();
globalThis.createCalibrationWorker = (id) => {
  if (calibrationWorkers.has(id)) throw new Error('Duplicate calibration Worker');
  const worker = new Worker('/worker.js?case=' + encodeURIComponent(id), {type: 'module', name: id});
  worker.onerror = (event) => { throw new Error('Calibration Worker error: ' + event.message); };
  calibrationWorkers.set(id, worker);
};
globalThis.sendCalibrationCommand = (id, command) => {
  const worker = calibrationWorkers.get(id);
  if (!worker) throw new Error('Unknown calibration Worker');
  worker.postMessage(command);
};
globalThis.releaseCalibrationWorker = (id) => {
  const worker = calibrationWorkers.get(id);
  if (worker) worker.terminate();
  calibrationWorkers.delete(id);
};
`
const pageHtml = '<!doctype html><html><head><meta charset="utf-8"><title>Fictional Worker heap calibration</title></head><body><script src="/page.js"></script></body></html>'

let fatalError = null
let cdp = null
let pageSessionId = null
let chrome = null
let httpServer = null
let temporaryRoot = null
let cleanupPromise = null
let deadline = Infinity
const records = new Map()
const recordsBySession = new Map()
const recordsByTarget = new Map()
const samplers = new Map()
const serverRequestCounts = { page: 0, script: 0, worker: 0, favicon: 0, rejected: 0 }
let origin = null
let chromeOutput = ''
const fail = (error) => { fatalError ??= error instanceof Error ? error : new Error(String(error)) }
function checkHealth() {
  if (fatalError) throw fatalError
  assert(now() < deadline, 'Calibration exceeded its total deadline.')
  if (chrome && (chrome.exitCode !== null || chrome.signalCode !== null)) {
    throw new Error('The isolated Chrome process exited before calibration completed.')
  }
}

async function waitFor(predicate, label, timeoutMs = config.phaseTimeoutMs) {
  const endsAt = Math.min(deadline, now() + timeoutMs)
  while (now() < endsAt) {
    checkHealth()
    const value = await predicate()
    if (value) return value
    await delay(20)
  }
  checkHealth()
  throw new Error(`Timed out: ${label}.`)
}

class CdpConnection {
  static async connect(url) {
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    await new Promise((accept, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('CDP connection timed out.')) }, 5_000)
      socket.addEventListener('open', () => { clearTimeout(timer); accept() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed.')) }, { once: true })
    })
    return new CdpConnection(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    this.listeners = new Map()
    socket.addEventListener('message', (event) => { this.receive(event.data).catch(fail) })
    socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer)
        reject(new Error('Chrome DevTools connection closed.'))
      }
      this.pending.clear()
    })
    socket.addEventListener('error', () => fail(new Error('Chrome DevTools socket failed.')))
  }

  async receive(data) {
    const text = typeof data === 'string' ? data : data instanceof ArrayBuffer
      ? Buffer.from(data).toString('utf8') : await data.text()
    const message = JSON.parse(text)
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
      else pending.accept(message.result ?? {})
      return
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      Promise.resolve().then(() => listener(message.params ?? {}, message.sessionId)).catch(fail)
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? []
    listeners.push(listener)
    this.listeners.set(method, listeners)
  }

  send(method, params = {}, sessionId, timeoutMs = 5_000) {
    const id = ++this.nextId
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out after ${timeoutMs} ms.`))
      }, timeoutMs)
      this.pending.set(id, { method, accept, reject, timer })
      try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }

  close() { this.socket.close() }
}

async function evaluate(expression) {
  assert(pageSessionId, 'The owned calibration page is not attached.')
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, pageSessionId)
  assert.equal(result.exceptionDetails, undefined, 'The standalone calibration page rejected a command.')
  return result.result?.value
}

function readOwnedDebugEndpoint(profileDirectory) {
  const profile = lstatSync(profileDirectory)
  assert(profile.isDirectory() && !profile.isSymbolicLink(), 'The owned Chrome profile is not a real directory.')
  const activePortPath = join(profileDirectory, 'DevToolsActivePort')
  const metadata = lstatSync(activePortPath)
  assert(metadata.isFile() && !metadata.isSymbolicLink(), 'DevToolsActivePort must be a regular non-symlink file.')
  const descriptor = openSync(activePortPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  let bytes
  try {
    const opened = fstatSync(descriptor)
    assert(opened.isFile() && opened.dev === metadata.dev && opened.ino === metadata.ino,
      'DevToolsActivePort changed while opening the owned file.')
    assert(opened.size > 0 && opened.size <= 2_048, 'Invalid DevToolsActivePort file size.')
    bytes = readFileSync(descriptor)
  } finally { closeSync(descriptor) }
  const lines = bytes.toString('utf8').trimEnd().split('\n')
  assert.equal(lines.length, 2, 'Unexpected DevToolsActivePort contents.')
  assert(/^[1-9]\d{0,4}$/.test(lines[0]), 'Invalid Chrome-selected debugging port.')
  const port = Number(lines[0])
  assert(port <= 65_535)
  assert(/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(lines[1]), 'Invalid browser WebSocket path.')
  return { port, browserWebSocketPath: lines[1], activePortFileSha256: hash(bytes) }
}

function verifyBrowserEndpoint(version, endpoint) {
  const socket = new URL(version.webSocketDebuggerUrl)
  assert.equal(socket.protocol, 'ws:')
  assert.equal(socket.hostname, '127.0.0.1')
  assert.equal(socket.port, String(endpoint.port))
  assert.equal(socket.pathname, endpoint.browserWebSocketPath,
    'The debugging endpoint does not belong to the newly created Chrome profile.')
  assert.equal(socket.search + socket.hash + socket.username + socket.password, '')
  return socket.href
}

async function localResponse(url) {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1', 'Metadata fetch must stay on loopback.')
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(2_000) })
  assert(response.ok, 'Loopback metadata response was not successful.')
  return response
}

async function stopChrome() {
  if (!chrome || chrome.exitCode !== null || chrome.signalCode !== null) return
  for (const [signal, timeout] of [['SIGTERM', 3_000], ['SIGKILL', 1_000]]) {
    try { process.kill(-chrome.pid, signal) }
    catch (error) { if (error.code !== 'ESRCH') throw error }
    const endsAt = now() + timeout
    while (chrome.exitCode === null && chrome.signalCode === null && now() < endsAt) await delay(20)
    if (chrome.exitCode !== null || chrome.signalCode !== null) return
  }
  throw new Error('The owned Chrome process did not exit; its temporary profile was preserved.')
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise
  cleanupPromise = (async () => {
    const errors = []
    for (const [record, sampler] of samplers) {
      if (record.heap) continue
      try { record.heap = await sampler.stop('calibration-cleanup') } catch (error) { errors.push(error) }
    }
    try { cdp?.close() } catch (error) { errors.push(error) }
    let chromeStopped = false
    try { await stopChrome(); chromeStopped = true } catch (error) { errors.push(error) }
    if (httpServer) {
      httpServer.closeAllConnections()
      try {
        await new Promise((accept, reject) => httpServer.close((error) => error ? reject(error) : accept()))
      } catch (error) { errors.push(error) }
    }
    if (temporaryRoot && chromeStopped) {
      try {
        assert.equal(dirname(temporaryRoot), realpathSync(tmpdir()))
        assert(basename(temporaryRoot).startsWith('ibkr-worker-heap-calibration-'))
        const metadata = lstatSync(temporaryRoot)
        assert(metadata.isDirectory() && !metadata.isSymbolicLink())
        rmSync(temporaryRoot, { recursive: true })
        assert.equal(existsSync(temporaryRoot), false)
      } catch (error) { errors.push(error) }
    }
    if (errors.length) throw new AggregateError(errors, 'Calibration cleanup failed.')
  })()
  return cleanupPromise
}

function expectedCounts(marker, objects, buffer) {
  assert.equal(marker.count, objects ? config.objectCount : 0)
  assert.equal(marker.objectChecksum, objects ? config.objectCount + 1 : 0)
  assert.equal(marker.byteLength, buffer ? config.arrayBufferBytes : 0)
  assert.equal(marker.bufferChecksum, buffer ? 180 : 0)
}

function installListeners() {
  cdp.on('Runtime.exceptionThrown', () => { throw new Error('Calibration page or Worker raised an exception.') })
  cdp.on('Runtime.consoleAPICalled', () => { throw new Error('Calibration unexpectedly wrote to the browser console.') })
  cdp.on('Network.requestWillBeSent', ({ request }) => {
    const url = new URL(request.url)
    assert.equal(url.origin, origin, 'Standalone calibration attempted an external request.')
    assert.equal(request.method, 'GET', 'Standalone calibration attempted a non-GET request.')
    assert(['/', '/page.js', '/worker.js', '/favicon.ico'].includes(url.pathname), 'Unexpected calibration resource request.')
  })
  cdp.on('Runtime.bindingCalled', ({ name, payload }, sessionId) => {
    assert.equal(name, '__heapCalibrationMarker', 'Unexpected inspector binding.')
    const record = recordsBySession.get(sessionId)
    assert(record, 'Marker has no attributed Worker session.')
    const marker = JSON.parse(payload)
    assert.equal(marker.caseId, record.caseId)
    assert(['ready', 'objects', 'buffer', 'short-complete', 'finished'].includes(marker.name))
    assert.equal(record.markers.some((previous) => previous.name === marker.name), false, 'Duplicate phase marker.')
    for (const [key, value] of Object.entries(marker)) {
      if (key === 'caseId' || key === 'name') continue
      assert(['workerElapsedMs', 'count', 'objectChecksum', 'byteLength', 'bufferChecksum', 'operationDurationMs'].includes(key))
      assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'Non-numeric calibration marker.')
    }
    assert(typeof marker.workerElapsedMs === 'number')
    const previous = record.markers.at(-1)
    if (previous) assert(marker.workerElapsedMs >= previous.workerElapsedMs)
    record.markers.push({ ...marker, hostReceivedAtMs: now() })
  })
  cdp.on('Target.targetDestroyed', ({ targetId }) => {
    const record = recordsByTarget.get(targetId)
    if (record) record.closure ??= { eventKind: 'Target.targetDestroyed', hostObservedAtMs: now(), targetAbsent: false }
  })
  cdp.on('Target.detachedFromTarget', ({ sessionId, targetId }) => {
    const record = recordsBySession.get(sessionId)
    if (!record) return
    if (targetId) assert.equal(targetId, record.targetId)
    record.closure ??= { eventKind: 'Target.detachedFromTarget', hostObservedAtMs: now(), targetAbsent: false }
  })
  cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo, waitingForDebugger }, parentSessionId) => {
    assert.equal(parentSessionId, pageSessionId, 'Worker was attached outside the owned calibration page.')
    assert.equal(targetInfo.type, 'worker', 'Unexpected auto-attached target type.')
    const url = new URL(targetInfo.url)
    assert.equal(url.origin, origin)
    assert.equal(url.pathname, '/worker.js')
    assert.equal([...url.searchParams].length, 1)
    const record = records.get(url.searchParams.get('case'))
    assert(record && record.targetId === null, 'Unexpected or duplicate calibration Worker.')
    assert.equal(targetInfo.url, record.workerUrl)
    assert.equal(waitingForDebugger, true, 'Worker executed before the startup baseline.')
    Object.assign(record, { targetId: targetInfo.targetId, sessionId, attachedAtMs: now() })
    recordsBySession.set(sessionId, record)
    recordsByTarget.set(record.targetId, record)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Runtime.addBinding', { name: '__heapCalibrationMarker' }, sessionId)
    const { id } = await cdp.send('Runtime.getIsolateId', {}, sessionId)
    assert(typeof id === 'string' && id.length > 0, 'Worker isolate identity is missing.')
    record.isolateId = id
    if (record.samplingEnabled) {
      const sampler = createWorkerHeapSampler({
        send: (method, params) => cdp.send(method, params, sessionId, config.requestTimeoutMs),
        intervalMs: config.intervalMs, requestTimeoutMs: config.requestTimeoutMs,
      })
      samplers.set(record, sampler)
      await sampler.start()
    }
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId)
    record.releaseAcknowledgedAtMs = record.samplingEnabled
      ? samplers.get(record).markExecutionReleased() : now()
    record.attachmentReady = true
  })
}

async function createWorker(caseId, samplingEnabled) {
  checkHealth()
  assert.equal(records.has(caseId), false)
  const record = {
    caseId, samplingEnabled, targetId: null, sessionId: null, isolateId: null,
    workerUrl: `${origin}/worker.js?case=${caseId}`, attachedAtMs: null,
    releaseAcknowledgedAtMs: null, attachmentReady: false,
    markers: [], commandSends: [], closure: null, heap: null,
  }
  records.set(caseId, record)
  await evaluate(`createCalibrationWorker(${JSON.stringify(caseId)})`)
  await waitFor(() => record.attachmentReady && record.markers.find((marker) => marker.name === 'ready'), `${caseId} readiness`)
  expectedCounts(record.markers.find((marker) => marker.name === 'ready'), false, false)
  return record
}

async function command(record, name) {
  checkHealth()
  const sent = { name, hostSentAtMs: now() }
  record.commandSends.push(sent)
  await evaluate(`sendCalibrationCommand(${JSON.stringify(record.caseId)}, ${JSON.stringify(name)})`)
  return sent
}

async function marker(record, name) {
  return waitFor(() => record.markers.find((item) => item.name === name), `${record.caseId} ${name}`)
}

async function finishRecord(record) {
  await waitFor(() => record.closure, `${record.caseId} close event`)
  await waitFor(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets')
    return !targetInfos.some(({ targetId }) => targetId === record.targetId)
  }, `${record.caseId} exact target absence`)
  record.closure.targetAbsent = true
  record.closure.absenceCheckedAtMs = now()
  if (record.samplingEnabled) {
    record.heap = await samplers.get(record).stop('calibration-worker-target-terminated')
    assert.equal(record.heap.truePeakMeasured, false)
    assert.equal(record.heap.coverageIncomplete, true)
    assert.equal(record.heap.finalReclamationProven, false)
    verifySampleReport(record.heap)
  }
  await evaluate(`releaseCalibrationWorker(${JSON.stringify(record.caseId)})`)
}

async function heldCalibration() {
  const allocator = await createWorker('held-allocator', true)
  const idleControl = await createWorker('held-idle-control', true)
  assert.notEqual(allocator.targetId, idleControl.targetId)
  assert.notEqual(allocator.sessionId, idleControl.sessionId)
  assert.notEqual(allocator.isolateId, idleControl.isolateId, 'Allocator and idle control share an isolate.')
  const phaseWindows = []
  const idleStart = Math.max(...[allocator, idleControl].flatMap((record) => [
    record.markers.find((item) => item.name === 'ready').hostReceivedAtMs, record.releaseAcknowledgedAtMs,
  ]))
  await delay(config.idleMs)
  const objectsCommand = await command(allocator, 'objects')
  phaseWindows.push({ name: 'idle', startAtMs: idleStart, endAtMs: objectsCommand.hostSentAtMs })
  const objectsMarker = await marker(allocator, 'objects')
  expectedCounts(objectsMarker, true, false)
  await delay(config.holdMs)
  const bufferCommand = await command(allocator, 'buffer')
  phaseWindows.push({ name: 'objects', startAtMs: objectsMarker.hostReceivedAtMs, endAtMs: bufferCommand.hostSentAtMs })
  const bufferMarker = await marker(allocator, 'buffer')
  expectedCounts(bufferMarker, true, true)
  await delay(config.holdMs)
  const finishCommand = await command(allocator, 'finish')
  phaseWindows.push({ name: 'buffer', startAtMs: bufferMarker.hostReceivedAtMs, endAtMs: finishCommand.hostSentAtMs })
  expectedCounts(await marker(allocator, 'finished'), true, true)
  await finishRecord(allocator)
  await command(idleControl, 'finish')
  expectedCounts(await marker(idleControl, 'finished'), false, false)
  await finishRecord(idleControl)
  return { allocator, idleControl, phaseWindows }
}

async function shortCalibration(caseId, samplingEnabled) {
  const record = await createWorker(caseId, samplingEnabled)
  await command(record, 'short')
  expectedCounts(await marker(record, 'short-complete'), true, true)
  await finishRecord(record)
  return record
}

async function run() {
  const outputPath = parseArguments(process.argv.slice(2))
  assert.equal(process.platform, 'darwin', 'This explicitly scoped runner currently supports macOS only.')
  assert.equal(Number(process.versions.node.split('.')[0]), 22, 'Use the existing Node.js 22 runtime.')
  assert.equal(typeof WebSocket, 'function', 'Built-in Node WebSocket is required.')
  const chromeExecutable = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].filter(Boolean).find(existsSync)
  assert(chromeExecutable && isAbsolute(chromeExecutable), 'An existing absolute Chrome executable is required.')
  deadline = now() + config.overallTimeoutMs
  temporaryRoot = mkdtempSync(join(realpathSync(tmpdir()), 'ibkr-worker-heap-calibration-'))
  const allowedCaseIds = new Set(['held-allocator', 'held-idle-control',
    ...Array.from({ length: config.pairs }, (_, index) => [`short-${index + 1}-off`, `short-${index + 1}-on`]).flat()])
  httpServer = createServer((request, response) => {
    try {
      const url = new URL(request.url, origin ?? 'http://127.0.0.1')
      assert.equal(request.method, 'GET')
      let body
      let type
      if (url.pathname === '/' && !url.search) {
        body = pageHtml; type = 'text/html'; serverRequestCounts.page += 1
      } else if (url.pathname === '/page.js' && !url.search) {
        body = pageSource; type = 'text/javascript'; serverRequestCounts.script += 1
      } else if (url.pathname === '/worker.js' && [...url.searchParams].length === 1 && allowedCaseIds.has(url.searchParams.get('case'))) {
        body = workerSource; type = 'text/javascript'; serverRequestCounts.worker += 1
      } else if (url.pathname === '/favicon.ico' && !url.search) {
        serverRequestCounts.favicon += 1
        response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return
      } else throw new Error('Unexpected standalone calibration request.')
      response.writeHead(200, {
        'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'",
      })
      response.end(body)
    } catch (error) {
      serverRequestCounts.rejected += 1
      response.writeHead(404); response.end(); fail(error)
    }
  })
  await new Promise((accept, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', accept)
  })
  checkHealth()
  origin = `http://127.0.0.1:${httpServer.address().port}`
  const profileDirectory = join(temporaryRoot, 'profile')
  chrome = spawn(chromeExecutable, [
    '--headless=new', '--disable-background-networking', '--disable-background-timer-throttling',
    '--disable-breakpad', '--disable-component-update', '--disable-default-apps',
    '--disable-domain-reliability', '--disable-extensions',
    '--disable-features=MediaRouter,OptimizationHints,Translate', '--disable-renderer-backgrounding',
    '--disable-search-engine-choice-screen', '--disable-sync', '--metrics-recording-only',
    '--lang=en-US', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    '--no-default-browser-check', '--no-first-run', '--no-proxy-server',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profileDirectory}`, 'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  chrome.once('error', fail)
  for (const stream of [chrome.stdout, chrome.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => { chromeOutput = (chromeOutput + chunk).slice(-2_000) })
  }
  const endpoint = await waitFor(() => {
    try { return readOwnedDebugEndpoint(profileDirectory) }
    catch (error) { if (error.code === 'ENOENT') return false; throw error }
  }, 'owned Chrome DevToolsActivePort', 15_000)
  checkHealth()
  const metadataOrigin = `http://127.0.0.1:${endpoint.port}`
  const endpointVersion = await (await localResponse(`${metadataOrigin}/json/version`)).json()
  checkHealth()
  const browserSocketUrl = verifyBrowserEndpoint(endpointVersion, endpoint)
  // Connect the exact browser path from the owned profile, not an arbitrary
  // page returned by a port lookup. Page creation is confined to this socket.
  cdp = await CdpConnection.connect(browserSocketUrl)
  checkHealth()
  const browserVersion = await cdp.send('Browser.getVersion')
  checkHealth()
  assert.equal(browserVersion.product, endpointVersion.Browser)
  assert.equal(browserVersion.protocolVersion, endpointVersion['Protocol-Version'])
  const protocolBytes = Buffer.from(await (await localResponse(`${metadataOrigin}/json/protocol`)).arrayBuffer())
  checkHealth()
  const versionAfterProtocol = await (await localResponse(`${metadataOrigin}/json/version`)).json()
  checkHealth()
  assert.equal(verifyBrowserEndpoint(versionAfterProtocol, endpoint), browserSocketUrl)
  assert.deepEqual(readOwnedDebugEndpoint(profileDirectory), endpoint, 'Owned endpoint file changed during metadata reads.')
  const protocol = JSON.parse(protocolBytes)
  const runtimeDomain = protocol.domains.find(({ domain }) => domain === 'Runtime')
  const getHeapUsageSchema = runtimeDomain?.commands?.find(({ name }) => name === 'getHeapUsage')
  assert(getHeapUsageSchema, 'The live Chrome protocol omits Runtime.getHeapUsage.')
  const getIsolateIdSchema = runtimeDomain?.commands?.find(({ name }) => name === 'getIsolateId')
  assert(getIsolateIdSchema, 'The live Chrome protocol omits Runtime.getIsolateId.')
  const { targetId: pageTargetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  checkHealth()
  const { targetInfo: pageInfo } = await cdp.send('Target.getTargetInfo', { targetId: pageTargetId })
  checkHealth()
  assert.equal(pageInfo.targetId, pageTargetId)
  assert.equal(pageInfo.type, 'page')
  assert.equal(pageInfo.url, 'about:blank')
  const pageAttachment = await cdp.send('Target.attachToTarget', { targetId: pageTargetId, flatten: true })
  checkHealth()
  pageSessionId = pageAttachment.sessionId
  assert(typeof pageSessionId === 'string' && pageSessionId.length > 0)
  installListeners()
  await cdp.send('Runtime.enable', {}, pageSessionId)
  checkHealth()
  await cdp.send('Page.enable', {}, pageSessionId)
  checkHealth()
  await cdp.send('Network.enable', {}, pageSessionId)
  checkHealth()
  await cdp.send('Target.setDiscoverTargets', { discover: true })
  checkHealth()
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    filter: [{ type: 'worker', exclude: false }, { exclude: true }] }, pageSessionId)
  checkHealth()
  const navigation = await cdp.send('Page.navigate', { url: origin }, pageSessionId)
  checkHealth()
  assert.equal(navigation.errorText, undefined)
  await waitFor(async () => evaluate('typeof createCalibrationWorker === "function"'), 'standalone page readiness')
  const held = await heldCalibration()
  const shortLivedPairs = []
  for (let index = 0; index < config.pairs; index++) {
    const order = index % 2 === 0 ? ['off', 'on'] : ['on', 'off']
    const pair = { pair: index + 1, order }
    for (const mode of order) pair[mode] = await shortCalibration(`short-${index + 1}-${mode}`, mode === 'on')
    shortLivedPairs.push(pair)
  }
  checkHealth()
  assert.equal(serverRequestCounts.rejected, 0)
  assert.equal(serverRequestCounts.worker, 2 + config.pairs * 2)
  const analysis = analyzeHeldPhases({
    allocatorHeap: held.allocator.heap, controlHeap: held.idleControl.heap, phaseWindows: held.phaseWindows,
  })
  assert(analysis.allPhasesHaveSamples, 'Held calibration has insufficient samples inside a fixed phase window.')
  const result = {
    schemaVersion: 1, kind: 'worker-heap-sampler-calibration', flags,
    clocks: { host: 'Node performance.now() monotonic milliseconds', worker: 'elapsed from each Worker script start; not synchronized with host' },
    environment: { browserVersion, protocolSha256: hash(protocolBytes), getHeapUsageSchema, getIsolateIdSchema, chromeExecutable,
      protocolSource: 'live isolated Chrome loopback /json/protocol', nodeVersion: process.version,
      endpointBinding: { method: 'owned-profile-active-port-and-exact-browser-websocket', ...endpoint,
        activePortFileRegular: true, activePortFileSymlink: false, versionWebSocketPathMatched: true,
        versionRecheckedAfterProtocol: true, pageCreatedOnOwnedBrowser: true, pageTargetId, pageSessionId } },
    provenance: { runnerSha256: hash(readFileSync(runnerPath)), samplerSha256: hash(readFileSync(samplerPath)),
      analysisSha256: hash(readFileSync(analysisPath)), workerSourceSha256: hash(workerSource), pageSourceSha256: hash(pageSource) },
    config, held, analysis, shortLivedPairs, serverRequestCounts,
    shortLivedScope: 'Each fresh Worker first completes the shared debugger startup/readiness handshake. The short command then performs the same fictional object/buffer allocation and self-closes in one message task without a holding delay. Runtime sample counts can include the handshake-to-command interval; operationDurationMs uses only that Worker clock.',
    comparisonScope: 'Both off and on attach the debugger, identify the isolate and install the same numeric binding. Off omits all heap-sampler requests. Alternating cases are descriptive, not a causal overhead estimate.',
    cleanup: { browserProcessExited: false, loopbackServerClosed: false, temporaryProfileRemoved: false },
  }
  await cleanup()
  if (fatalError) throw fatalError
  result.cleanup = { browserProcessExited: true, loopbackServerClosed: true, temporaryProfileRemoved: true }
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  if (outputPath) {
    // Recheck parents immediately before an exclusive, no-follow creation.
    parseArguments(['--output', outputPath])
    writeFileSync(outputPath, serialized, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode: 0o600 })
  }
  process.stdout.write(serialized)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    // Cancellation is observed by bounded work above. Only run()/its catch may
    // start cleanup; a signal cannot cache cleanup before a later spawn.
    fail(new Error(`Calibration interrupted by ${signal}.`))
    process.exitCode = 1
  })
}

try {
  await run()
} catch (error) {
  let cleanupError
  try { await cleanup() } catch (failure) { cleanupError = failure }
  // Chrome stderr is bounded in memory but intentionally not persisted in the
  // numeric evidence. Error output contains no statement or object contents.
  process.stderr.write(`${error.message}${cleanupError ? `; ${cleanupError.message}` : ''}\n`)
  process.exitCode = 1
}
