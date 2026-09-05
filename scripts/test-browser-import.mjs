import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testShareInteractions } from './test-share-interactions.mjs'
import { testImportRecovery } from './test-import-recovery.mjs'
import { testPngSaveGuidance } from './test-png-save-guidance.mjs'
import {
  generateSyntheticCapacityStatement,
  generateSyntheticOverEventStatement,
  generateSyntheticOverSymbolStatement,
  padSyntheticStatementToCapacity,
  SYNTHETIC_CAPACITY_EVENTS,
  SYNTHETIC_CAPACITY_MAX_BYTES,
  SYNTHETIC_CAPACITY_ROWS,
  SYNTHETIC_CAPACITY_SYMBOLS,
  SYNTHETIC_CAPACITY_TARGET_BYTES,
  SYNTHETIC_OVER_CAP_EVENTS,
  SYNTHETIC_OVER_CAP_SYMBOLS,
} from './synthetic-capacity-statement.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixedNowMs = Date.parse('2026-08-30T12:00:00+08:00')
const fixedDateSource = `(() => {
  if (globalThis.__pnlArenaFixedDateInstalled) return;
  const NativeDate = globalThis.Date;
  const fixedNow = ${fixedNowMs};
  class FixedDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) super(fixedNow);
      else super(...args);
    }
    static now() { return fixedNow; }
  }
  Object.defineProperty(globalThis, '__pnlArenaFixedDateInstalled', {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  globalThis.Date = FixedDate;
  try { globalThis.localStorage?.setItem('pnl-arena.locale.v1', 'en'); } catch {}
})()`

const fixturePath = resolve(
  projectRoot,
  'tests/fixtures/ibkr-current-schema-synthetic.csv',
)

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
].filter(Boolean)
const chromePath = chromeCandidates.find(existsSync)

const children = new Set()
let profileDirectory
let browserArtifactDirectory
let downloadDirectory
let invalidFixturePath
let invalidExtensionFixturePath
let sameDateFixturePath
let olderFixturePath
let capacityFixturePath
let overEventFixturePath
let overSymbolFixturePath
let oversizedFixturePath
let cdp
let cleanupStarted = false

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

function tail(value, maxCharacters = 4_000) {
  return value.length <= maxCharacters ? value : value.slice(-maxCharacters)
}

function trackedSpawn(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    detached: process.platform !== 'win32',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

async function waitForExit(child, timeoutMs = 3_000) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    delay(timeoutMs),
  ])
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      return
    }
  }
  await waitForExit(child)
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32') child.kill('SIGKILL')
    else process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // The process exited between the checks above.
    }
  }
  await waitForExit(child, 1_000)
}

async function cleanup() {
  if (cleanupStarted) return
  cleanupStarted = true
  try {
    cdp?.close()
  } catch {
    // The browser may already have closed its debugging socket.
  }
  await Promise.allSettled([...children].map(stopChild))
  if (browserArtifactDirectory) {
    rmSync(browserArtifactDirectory, { force: true, recursive: true })
  } else if (profileDirectory) {
    rmSync(profileDirectory, { force: true, recursive: true })
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
  })
}

async function runCommand(command, args, label) {
  const child = trackedSpawn(command, args)
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  const result = await new Promise((resolveResult, rejectResult) => {
    child.once('error', rejectResult)
    child.once('exit', (code, signal) => resolveResult({ code, signal }))
  })
  if (result.code !== 0) {
    throw new Error(`${label} failed (${result.signal ?? result.code}).\n${tail(output)}`)
  }
  return output
}

async function reserveLocalPort() {
  const server = createNetServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert(address && typeof address === 'object', 'Could not reserve a local TCP port.')
  const { port } = address
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()))
  })
  return port
}

async function waitForHttp(url, child, outputRef, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Preview server exited before becoming ready.\n${tail(outputRef.value)}`)
    }
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.ok) return
    } catch {
      // The listener may not be bound yet.
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${url}.\n${tail(outputRef.value)}`)
}

async function waitForJson(url, child, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Chrome exited before its DevTools endpoint became ready.')
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {
      // Chrome may still be creating the isolated profile.
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for Chrome DevTools at ${url}.`)
}

function stringifyRemoteObject(remoteObject) {
  if (!remoteObject) return ''
  if (Object.prototype.hasOwnProperty.call(remoteObject, 'value')) {
    if (typeof remoteObject.value === 'string') return remoteObject.value
    try {
      return JSON.stringify(remoteObject.value)
    } catch {
      return String(remoteObject.value)
    }
  }
  return remoteObject.description ?? remoteObject.unserializableValue ?? remoteObject.type ?? ''
}

class CdpConnection {
  static async connect(url) {
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    await new Promise((resolveOpen, rejectOpen) => {
      const onError = () => rejectOpen(new Error(`Could not connect to Chrome DevTools: ${url}`))
      socket.addEventListener('error', onError, { once: true })
      socket.addEventListener('open', () => {
        socket.removeEventListener('error', onError)
        resolveOpen()
      }, { once: true })
    })
    return new CdpConnection(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.socket.addEventListener('message', (event) => this.#receive(event.data))
    this.socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer)
        reject(new Error('Chrome DevTools connection closed.'))
      }
      this.pending.clear()
    })
  }

  async #receive(data) {
    let text
    if (typeof data === 'string') text = data
    else if (data instanceof ArrayBuffer) text = Buffer.from(data).toString('utf8')
    else if (ArrayBuffer.isView(data)) {
      text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
    } else if (typeof data?.text === 'function') text = await data.text()
    else return

    let message
    try {
      message = JSON.parse(text)
    } catch {
      return
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`))
      } else {
        pending.resolve(message.result ?? {})
      }
      return
    }

    const listeners = this.listeners.get(message.method) ?? []
    for (const listener of listeners) {
      Promise.resolve(listener(message.params ?? {}, message.sessionId)).catch(() => {})
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? []
    listeners.push(listener)
    this.listeners.set(method, listeners)
    return () => {
      const current = this.listeners.get(method) ?? []
      this.listeners.set(method, current.filter((item) => item !== listener))
    }
  }

  send(method, params = {}, sessionId, timeoutMs = 10_000) {
    const id = this.nextId++
    const message = { id, method, params }
    if (sessionId) message.sessionId = sessionId
    return new Promise((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rejectCommand(new Error(`${method} timed out after ${timeoutMs} ms.`))
      }, timeoutMs)
      this.pending.set(id, {
        method,
        reject: rejectCommand,
        resolve: resolveCommand,
        timer,
      })
      this.socket.send(JSON.stringify(message))
    })
  }

  close() {
    this.socket.close()
  }
}

async function evaluate(expression, timeoutMs = 10_000) {
  const response = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
    userGesture: true,
  }, undefined, timeoutMs)
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text
      ?? 'Unknown page evaluation error'
    throw new Error(detail)
  }
  return response.result?.value
}

async function waitForPageValue(expression, predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastValue
  while (Date.now() < deadline) {
    try {
      lastValue = await evaluate(expression)
      if (predicate(lastValue)) return lastValue
    } catch {
      // A navigation may temporarily destroy the execution context.
    }
    await delay(100)
  }
  throw new Error(`${label} timed out. Last observed value: ${JSON.stringify(lastValue)}`)
}

async function waitForCondition(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(100)
  }
  throw new Error(`${label} timed out.`)
}

async function waitForAsyncCondition(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await delay(100)
  }
  throw new Error(`${label} timed out.`)
}

function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert(buffer.length > 1_000, `Downloaded PNG is unexpectedly small: ${buffer.length} bytes.`)
  assert.deepEqual(buffer.subarray(0, signature.length), signature, 'Downloaded file has no PNG signature.')
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', 'Downloaded PNG has no leading IHDR chunk.')
  assert.equal(buffer.subarray(-8, -4).toString('ascii'), 'IEND', 'Downloaded PNG has no terminal IEND chunk.')
  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  }
}

async function clickPrimaryNavigation(label) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('nav.side-nav button')]
      .find((candidate) => [...candidate.querySelectorAll('span')]
        .some((part) => part.textContent?.trim() === ${JSON.stringify(label)}));
    if (!button) return false;
    button.click();
    return true;
  })()`)
  assert.equal(clicked, true, `Could not find the primary navigation button: ${label}`)
}

async function navigateAndWait(url) {
  const result = await cdp.send('Page.navigate', { url })
  assert.equal(result.errorText, undefined, `Navigation failed: ${result.errorText}`)
  await waitForPageValue(
    'document.readyState',
    (value) => value === 'complete',
    `Navigation to ${url}`,
  )
}

async function resolveFileInputNodeId() {
  await waitForPageValue(
    `Boolean(document.querySelector('input[type="file"]'))`,
    Boolean,
    'Import page file input',
  )
  const { root } = await cdp.send('DOM.getDocument', { depth: 0, pierce: true })
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: 'input[type="file"]',
  })
  assert.notEqual(nodeId, 0, 'The Import page file input could not be resolved.')
  return nodeId
}

async function assertProductionWorkerCapacityFailure(filePath, label) {
  const startedAt = performance.now()
  await clickPrimaryNavigation('Import')
  const nodeId = await resolveFileInputNodeId()
  const workerCountBefore = workerTargets.length
  await cdp.send('DOM.setFileInputFiles', {
    files: [filePath],
    nodeId,
  })
  const failureState = await waitForPageValue(
    `(() => ({
      busy: document.querySelector('.drop-zone')?.getAttribute('aria-busy'),
      error: document.querySelector('.error-message')?.textContent?.trim() ?? '',
      fileInput: Boolean(document.querySelector('input[type="file"]')),
    }))()`,
    (value) =>
      value?.error.includes('exceeds the current local capacity') &&
      value?.fileInput === true,
    label,
  )
  assert.equal(failureState.busy, 'false')
  const durationMs = performance.now() - startedAt
  assert(
    durationMs < 10_000,
    `${label} took ${durationMs.toFixed(1)} ms instead of failing within the 10 s gate.`,
  )
  await waitForCondition(
    () => workerTargets.length > workerCountBefore,
    `${label} Worker target creation`,
  )
  const rejectedWorkerTarget = workerTargets.at(-1)
  await waitForAsyncCondition(
    async () => {
      const { targetInfos = [] } = await cdp.send('Target.getTargets')
      return !targetInfos.some(({ targetId }) => targetId === rejectedWorkerTarget.targetId)
    },
    `${label} Worker target termination`,
  )

  await clickPrimaryNavigation('Ledger')
  const preservedLedger = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      rows: document.querySelectorAll('.data-table tbody tr').length,
      shareFooterTop: document.querySelector('.share-card-bottom')?.getBoundingClientRect().top ?? 0,
      shareGridBottom: document.querySelector('.share-grid')?.getBoundingClientRect().bottom ?? 0,
      shareGridItems: document.querySelectorAll('.share-grid > div').length,
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
    }))()`,
    (value) =>
      value?.heading === 'Ledger' &&
      value?.rows === SYNTHETIC_CAPACITY_SYMBOLS &&
      value?.source === 'Self-reported · not broker-verified',
    `${label} preserved prior Ledger`,
  )
  assert.equal(preservedLedger.rows, SYNTHETIC_CAPACITY_SYMBOLS)
  return durationMs
}

async function assertSnapshotNotice(filePath, expectedMessagePart, label) {
  await clickPrimaryNavigation('Import')
  const nodeId = await resolveFileInputNodeId()
  await cdp.send('DOM.setFileInputFiles', {
    files: [filePath],
    nodeId,
  })
  const noticeState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      notice: document.querySelector('.app-notice.warning')?.textContent?.trim() ?? '',
      parserError: document.querySelector('.error-message')?.textContent?.trim() ?? '',
    }))()`,
    (value) => value?.heading.startsWith('Import') && value?.notice.includes(expectedMessagePart),
    label,
  )
  assert.equal(noticeState.parserError, '', `${label} unexpectedly became a parser error.`)

  await clickPrimaryNavigation('Ledger')
  const preserved = await waitForPageValue(
    `(() => ({
      rows: document.querySelectorAll('.data-table tbody tr').length,
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
    }))()`,
    (value) => value?.rows === 3 && value?.source === 'Fully synthetic test',
    `${label} preserved the current report`,
  )
  assert.equal(preserved.rows, 3)
}

assert(existsSync(fixturePath), `The canonical synthetic fixture is missing: ${fixturePath}`)
assert(chromePath, `Google Chrome was not found. Checked:\n${chromeCandidates.join('\n')}`)
assert.equal(typeof WebSocket, 'function', 'Node.js 22 with the built-in WebSocket API is required.')

let previewOutput = ''
let chromeOutput = ''
const runtimeErrors = []
const consoleErrors = []
const logErrors = []
const requests = []
const webSockets = []
const responseErrors = []
const workerTargets = []
const workerFixedTimes = []
const asynchronousProtocolErrors = []
const downloadStarts = []
const downloadProgress = []
let nextWorkerHold = null

// Test-only gate: keep one real production Worker waiting at startup while
// the unchanged page timer exercises its normal 12-second timeout path.
function holdNextWorker() {
  assert.equal(nextWorkerHold, null, 'A Worker startup hold is already armed.')
  const ticket = { targetId: null, sessionId: null, ready: false }
  nextWorkerHold = ticket
  return ticket
}

async function releaseWorkerHold(ticket) {
  if (nextWorkerHold === ticket) nextWorkerHold = null
  if (!ticket.sessionId) return
  const { targetInfos = [] } = await cdp.send('Target.getTargets')
  if (targetInfos.some(({ targetId }) => targetId === ticket.targetId)) {
    try {
      await cdp.send('Runtime.runIfWaitingForDebugger', {}, ticket.sessionId)
    } catch (error) {
      if (!/Session with given id not found/.test(String(error))) throw error
    }
  }
}

try {
  if (process.env.IBKR_BROWSER_IMPORT_SKIP_BUILD === '1') {
    assert(
      existsSync(resolve(projectRoot, 'dist/index.html')),
      'IBKR_BROWSER_IMPORT_SKIP_BUILD=1 requires an existing dist/index.html.',
    )
    console.log('Using the existing production bundle...')
  } else {
    console.log('Building the production bundle...')
    await runCommand('npm', ['run', 'build'], 'Production build')
  }

  const previewPort = await reserveLocalPort()
  const previewUrl = `http://127.0.0.1:${previewPort}/`
  const viteCli = resolve(projectRoot, 'node_modules/vite/bin/vite.js')
  assert(existsSync(viteCli), 'Vite is not installed. Run npm ci before this browser check.')

  const preview = trackedSpawn(process.execPath, [
    viteCli,
    'preview',
    '--host', '127.0.0.1',
    '--port', String(previewPort),
    '--strictPort',
  ])
  const previewOutputRef = { value: '' }
  preview.stdout.on('data', (chunk) => {
    previewOutput += chunk
    previewOutputRef.value = previewOutput
  })
  preview.stderr.on('data', (chunk) => {
    previewOutput += chunk
    previewOutputRef.value = previewOutput
  })
  await waitForHttp(previewUrl, preview, previewOutputRef)

  const debugPort = await reserveLocalPort()
  browserArtifactDirectory = mkdtempSync(join(tmpdir(), 'pnl-arena-browser-'))
  profileDirectory = join(browserArtifactDirectory, 'profile')
  downloadDirectory = join(browserArtifactDirectory, 'downloads')
  invalidFixturePath = join(browserArtifactDirectory, 'invalid-activity-statement.csv')
  invalidExtensionFixturePath = join(browserArtifactDirectory, 'invalid-activity-statement.txt')
  sameDateFixturePath = join(browserArtifactDirectory, 'same-date-activity-statement.csv')
  olderFixturePath = join(browserArtifactDirectory, 'older-activity-statement.csv')
  capacityFixturePath = join(browserArtifactDirectory, 'synthetic-capacity-statement.csv')
  overEventFixturePath = join(browserArtifactDirectory, 'synthetic-over-event-cap.csv')
  overSymbolFixturePath = join(browserArtifactDirectory, 'synthetic-over-symbol-cap.csv')
  oversizedFixturePath = join(browserArtifactDirectory, 'oversized-activity-statement.csv')
  mkdirSync(profileDirectory)
  mkdirSync(downloadDirectory)
  writeFileSync(
    invalidFixturePath,
    'Statement,Header,Field Name,Field Value\nStatement,Data,Title,Not an Activity Statement\n',
  )
  writeFileSync(invalidExtensionFixturePath, 'This is deliberately not a CSV.\n')
  const canonicalFixtureText = readFileSync(fixturePath, 'utf8')
  writeFileSync(
    sameDateFixturePath,
    `${canonicalFixtureText}\nUnsupported UX Marker,Data,Note,Same date snapshot test\n`,
  )
  writeFileSync(
    olderFixturePath,
    canonicalFixtureText.replace(
      'January 1, 2026 - August 15, 2026',
      'January 1, 2026 - August 14, 2026',
    ),
  )
  const capacityStatement = generateSyntheticCapacityStatement()
  const overEventBaseStatement = generateSyntheticOverEventStatement()
  const overSymbolBaseStatement = generateSyntheticOverSymbolStatement()
  const overEventStatement = {
    ...overEventBaseStatement,
    ...padSyntheticStatementToCapacity(overEventBaseStatement.text),
  }
  const overSymbolStatement = {
    ...overSymbolBaseStatement,
    ...padSyntheticStatementToCapacity(overSymbolBaseStatement.text),
  }
  writeFileSync(capacityFixturePath, capacityStatement.text)
  writeFileSync(overEventFixturePath, overEventStatement.text)
  writeFileSync(overSymbolFixturePath, overSymbolStatement.text)
  writeFileSync(
    oversizedFixturePath,
    Buffer.alloc(SYNTHETIC_CAPACITY_MAX_BYTES + 1, 0x58),
  )
  assert.equal(statSync(capacityFixturePath).size, SYNTHETIC_CAPACITY_TARGET_BYTES)
  assert.equal(overEventStatement.eventCount, SYNTHETIC_OVER_CAP_EVENTS)
  assert.equal(overSymbolStatement.symbolCount, SYNTHETIC_OVER_CAP_SYMBOLS)
  assert.equal(overEventStatement.byteLength, SYNTHETIC_CAPACITY_TARGET_BYTES)
  assert.equal(overSymbolStatement.byteLength, SYNTHETIC_CAPACITY_TARGET_BYTES)
  assert.equal(overEventStatement.rowCount, SYNTHETIC_CAPACITY_ROWS)
  assert.equal(overSymbolStatement.rowCount, SYNTHETIC_CAPACITY_ROWS)
  assert.equal(statSync(oversizedFixturePath).size, SYNTHETIC_CAPACITY_MAX_BYTES + 1)
  const chrome = trackedSpawn(chromePath, [
    '--headless=new',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-features=MediaRouter,OptimizationHints,Translate',
    '--disable-renderer-backgrounding',
    '--disable-search-engine-choice-screen',
    '--disable-sync',
    '--metrics-recording-only',
    '--lang=en-US',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-proxy-server',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
    '--window-size=1440,1200',
    'about:blank',
  ])
  chrome.stdout.on('data', (chunk) => {
    chromeOutput += chunk
  })
  chrome.stderr.on('data', (chunk) => {
    chromeOutput += chunk
  })

  const targetsEndpoint = `http://127.0.0.1:${debugPort}/json/list`
  let targets = await waitForJson(targetsEndpoint, chrome)
  let pageTarget = targets.find((target) => target.type === 'page')
  if (!pageTarget) {
    await delay(250)
    targets = await waitForJson(targetsEndpoint, chrome)
    pageTarget = targets.find((target) => target.type === 'page')
  }
  assert(pageTarget?.webSocketDebuggerUrl, 'Chrome did not expose a page DevTools target.')

  cdp = await CdpConnection.connect(pageTarget.webSocketDebuggerUrl)

  cdp.on('Runtime.exceptionThrown', (params, sessionId) => {
    runtimeErrors.push({
      description: params.exceptionDetails?.exception?.description
        ?? params.exceptionDetails?.text
        ?? 'Unknown runtime exception',
      sessionId,
    })
  })
  cdp.on('Runtime.consoleAPICalled', (params, sessionId) => {
    if (!['assert', 'error', 'warning'].includes(params.type)) return
    consoleErrors.push({
      sessionId,
      text: (params.args ?? []).map(stringifyRemoteObject).join(' '),
      type: params.type,
    })
  })
  cdp.on('Log.entryAdded', (params) => {
    if (!['error', 'warning'].includes(params.entry?.level)) return
    logErrors.push({
      level: params.entry.level,
      text: params.entry.text,
      url: params.entry.url,
    })
  })
  cdp.on('Network.requestWillBeSent', (params) => {
    requests.push({
      method: params.request?.method,
      type: params.type,
      url: params.request?.url,
    })
  })
  cdp.on('Network.webSocketCreated', (params) => {
    webSockets.push({ url: params.url })
  })
  cdp.on('Network.responseReceived', (params) => {
    if ((params.response?.status ?? 0) >= 400) {
      responseErrors.push({ status: params.response.status, url: params.response.url })
    }
  })
  cdp.on('Browser.downloadWillBegin', (params) => {
    downloadStarts.push({
      guid: params.guid,
      suggestedFilename: params.suggestedFilename,
    })
  })
  cdp.on('Browser.downloadProgress', (params) => {
    downloadProgress.push({
      guid: params.guid,
      receivedBytes: params.receivedBytes,
      state: params.state,
      totalBytes: params.totalBytes,
    })
  })

  cdp.on('Target.attachedToTarget', async (params) => {
    const { sessionId, targetInfo } = params
    try {
      if (targetInfo?.type === 'worker') {
        const hold = nextWorkerHold
        nextWorkerHold = null
        if (hold) {
          hold.targetId = targetInfo.targetId
          hold.sessionId = sessionId
        }
        workerTargets.push({
          targetId: targetInfo.targetId,
          title: targetInfo.title,
          url: targetInfo.url,
        })
        await cdp.send('Runtime.enable', {}, sessionId)
        const result = await cdp.send('Runtime.evaluate', {
          expression: fixedDateSource,
          returnByValue: true,
        }, sessionId)
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
        }
        const observedClock = await cdp.send('Runtime.evaluate', {
          expression: 'Date.now()',
          returnByValue: true,
        }, sessionId)
        workerFixedTimes.push({
          url: targetInfo.url,
          value: observedClock.result?.value,
        })
        if (hold) {
          hold.ready = true
          return
        }
      }
      await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // An intentionally cancelled or fail-closed Worker may disappear between
      // attachment and clock injection. Its lifecycle assertions still verify
      // termination; only unrelated DevTools setup errors fail the suite.
      const workerSessionClosed =
        targetInfo?.type === 'worker' &&
        /^(?:Runtime\.(?:enable|evaluate|runIfWaitingForDebugger): )?Session with given id not found\.?$/.test(message)
      if (!workerSessionClosed) {
        asynchronousProtocolErrors.push(message)
      }
      try {
        await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId)
      } catch {
        // Preserve the first protocol error for the final assertion.
      }
    }
  })
  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('DOM.enable'),
    cdp.send('Network.enable'),
    cdp.send('Log.enable'),
  ])
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDirectory,
    eventsEnabled: true,
  })
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fixedDateSource })
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    flatten: true,
    waitForDebuggerOnStart: true,
  })

  console.log(`Opening ${previewUrl}`)
  await navigateAndWait(previewUrl)
  const observedPageNow = await evaluate('Date.now()')
  assert.equal(observedPageNow, fixedNowMs, 'The page did not receive the fixed 2026-08-30 clock.')

  const firstUseState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('#getting-started-main h1')?.textContent?.trim() ?? '',
      activeTag: document.activeElement?.tagName ?? '',
      importAction: Boolean(document.querySelector('[data-action="welcome-import"]')),
      primaryAction: Boolean(document.querySelector('[data-action="welcome-primary"]')),
      seen: localStorage.getItem('pnl-arena.onboarding.v1'),
      scrollY: window.scrollY,
    }))()`,
    (value) => value?.importAction === true && value?.primaryAction === true,
    'First-use choice screen',
  )
  assert.equal(firstUseState.seen, null, 'The guide was marked seen before the user chose a path.')
  assert.equal(firstUseState.activeTag, 'BODY', 'Initial document entry skipped the natural keyboard order.')
  assert.equal(firstUseState.scrollY, 0, 'The first-use screen moved away from the page top on initial load.')
  assert.match(firstUseState.heading, /demo or your own IBKR statement/i)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 700,
    mobile: false,
    screenHeight: 700,
    screenWidth: 768,
    width: 768,
  })
  const tabletWelcomeState = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.welcome-choice-card')]
      .map((card) => card.getBoundingClientRect());
    return {
      columns: getComputedStyle(document.querySelector('.welcome-choice-grid')).gridTemplateColumns,
      firstTop: cards[0]?.top ?? -1,
      secondTop: cards[1]?.top ?? -2,
    };
  })()`)
  assert.equal(
    tabletWelcomeState.firstTop,
    tabletWelcomeState.secondTop,
    'The 768 px guide unnecessarily stacked the two primary choices.',
  )
  assert.match(tabletWelcomeState.columns, /\S+px \S+px/)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 568,
    mobile: false,
    screenHeight: 568,
    screenWidth: 320,
    width: 320,
  })
  const welcomeScroll = await evaluate(`(() => {
    window.scrollTo(0, document.querySelector('[data-action="welcome-import"]')?.getBoundingClientRect().top ?? 0);
    return window.scrollY;
  })()`)
  assert(welcomeScroll > 0, 'The first-use transition test could not establish a scrolled starting point.')
  const choseImport = await evaluate(`(() => {
    const button = document.querySelector('[data-action="welcome-import"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`)
  assert.equal(choseImport, true, 'Could not choose the first-use import path.')
  const nodeId = await resolveFileInputNodeId()
  assert.equal(
    await evaluate('document.activeElement?.id ?? ""'),
    'main-content',
    'Leaving the guide did not move focus into the selected page.',
  )
  assert.equal(
    await evaluate(`localStorage.getItem('pnl-arena.onboarding.v1')`),
    'seen',
    'The explicit first-use choice did not save the non-financial seen-guide preference.',
  )

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 1024,
    width: 1024,
  })
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.import-layout')).gridTemplateColumns.trim().split(/\\s+/).length`,
    ),
    1,
    'The 1024 px import layout stayed cramped in two columns.',
  )

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 812,
    width: 812,
  })
  const compactDesktopImportState = await evaluate(`(() => {
    const layout = document.querySelector('.import-layout');
    const main = document.querySelector('.import-main');
    const side = document.querySelector('.import-side');
    return {
      columns: layout ? getComputedStyle(layout).gridTemplateColumns.trim().split(/\\s+/).length : 0,
      headingWidth: main?.querySelector('h1')?.getBoundingClientRect().width ?? 0,
      mainTop: main?.getBoundingClientRect().top ?? 0,
      sideTop: side?.getBoundingClientRect().top ?? 0,
    };
  })()`)
  assert.equal(
    compactDesktopImportState.columns,
    1,
    `The 812 px import layout stayed cramped in two columns: ${JSON.stringify(compactDesktopImportState)}`,
  )
  assert(compactDesktopImportState.headingWidth >= 400)
  assert(compactDesktopImportState.sideTop > compactDesktopImportState.mainTop)

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 320,
    width: 320,
  })
  await cdp.send('DOM.setFileInputFiles', {
    files: [invalidFixturePath],
    nodeId,
  })
  const invalidMessageState = await waitForPageValue(
    `(() => {
      const message = document.querySelector('.error-message');
      const recovery = document.querySelector('.import-recovery-panel');
      if (!message || !recovery) return null;
      const style = getComputedStyle(message);
      const rect = message.getBoundingClientRect();
      const recoveryRect = recovery.getBoundingClientRect();
      return {
        clientWidth: message.clientWidth,
        display: style.display,
        documentWidth: document.documentElement.scrollWidth,
        documentText: document.body.innerText,
        exportSettings: Boolean(document.querySelector('#export-settings')),
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        messageHeight: rect.height,
        messageLeft: rect.left,
        messageRight: rect.right,
        messageWidth: rect.width,
        opacity: Number.parseFloat(style.opacity),
        recoveryAction: Boolean(document.querySelector('[data-action="choose-file-after-error"]')),
        recoveryItems: recovery.querySelectorAll('li').length,
        recoveryLeft: recoveryRect.left,
        recoveryRight: recoveryRect.right,
        recoveryTitle: recovery.querySelector('h2')?.textContent?.trim() ?? '',
        scrollWidth: message.scrollWidth,
        text: message.textContent?.trim() ?? '',
        viewportWidth: window.innerWidth,
        visibility: style.visibility,
      };
    })()`,
    (value) => Boolean(value?.text),
    'Readable invalid-file message',
  )
  assert.equal(invalidMessageState.viewportWidth, 320, 'Chrome did not apply the simulated 320 px viewport.')
  assert.notEqual(invalidMessageState.display, 'none', 'Import error is display:none.')
  assert.equal(invalidMessageState.visibility, 'visible', 'Import error is not visible.')
  assert.equal(invalidMessageState.recoveryAction, true, 'Import recovery did not offer another file picker.')
  assert.equal(invalidMessageState.exportSettings, true, 'Import recovery could not point back to export settings.')
  assert(invalidMessageState.recoveryItems > 0, 'Import recovery did not include a concrete next step.')
  assert.equal(invalidMessageState.recoveryTitle, 'What to do next')
  assert(
    !invalidMessageState.documentText.includes(basename(invalidFixturePath)),
    'The invalid local filename leaked into visible UI copy.',
  )
  assert(invalidMessageState.opacity > 0, 'Import error is fully transparent.')
  assert(invalidMessageState.messageWidth > 0 && invalidMessageState.messageHeight > 0, 'Import error has no visible box.')
  assert(invalidMessageState.messageLeft >= 0, `Import error escaped left of the viewport: ${JSON.stringify(invalidMessageState)}`)
  assert(invalidMessageState.fontSize >= 14, `Import error font is too small: ${invalidMessageState.fontSize}px.`)
  assert(invalidMessageState.lineHeight >= 21, `Import error line height is too small: ${invalidMessageState.lineHeight}px.`)
  assert(
    invalidMessageState.scrollWidth <= invalidMessageState.clientWidth,
    `Invalid-file message has clipped horizontal text: ${JSON.stringify(invalidMessageState)}`,
  )
  assert(
    invalidMessageState.documentWidth <= invalidMessageState.viewportWidth,
    `Invalid-file message caused page overflow: ${JSON.stringify(invalidMessageState)}`,
  )
  assert(
    invalidMessageState.messageRight <= invalidMessageState.viewportWidth,
    `Invalid-file message escaped the 320 px viewport: ${JSON.stringify(invalidMessageState)}`,
  )
  assert(
    invalidMessageState.recoveryLeft >= 0 && invalidMessageState.recoveryRight <= invalidMessageState.viewportWidth,
    `Import recovery escaped the 320 px viewport: ${JSON.stringify(invalidMessageState)}`,
  )
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  console.log(`Selecting ${fixturePath.slice(projectRoot.length + 1)} through DevTools...`)
  await cdp.send('DOM.setFileInputFiles', {
    files: [fixturePath],
    nodeId,
  })

  const ledgerState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      notice: document.querySelector('.app-notice.success')?.textContent?.trim() ?? '',
      quality: document.querySelector('.quality-badge')?.textContent?.trim() ?? '',
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
      text: document.body.innerText,
    }))()`,
    (value) =>
      value?.heading === 'Ledger' &&
      value?.notice.includes('imported locally') &&
      value?.source === 'Fully synthetic test',
    'Synthetic Worker-backed import',
    20_000,
  )
  assert.equal(ledgerState.quality, 'Internal checks passed')
  assert(!ledgerState.text.includes('Self-reported'), 'The known synthetic fixture was labelled Self-reported.')

  const noticeDismissed = await evaluate(`(() => {
    const button = document.querySelector('[data-action="dismiss-notice"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.focus();
    button.click();
    return true;
  })()`)
  assert.equal(noticeDismissed, true, 'Could not dismiss the successful-import notice.')
  await waitForPageValue(
    `(() => ({
      activeId: document.activeElement?.id ?? '',
      notice: Boolean(document.querySelector('.app-notice')),
    }))()`,
    (value) => value?.activeId === 'main-content' && value?.notice === false,
    'Notice dismissal focus recovery',
  )

  const ledgerDetails = await evaluate(`(() => {
    const metrics = [...document.querySelectorAll('.metric-card')].map((card) => ({
      label: card.querySelector('.metric-card-head span')?.textContent?.trim() ?? '',
      value: card.querySelector('.metric-value')?.textContent?.trim() ?? '',
    }));
    return {
      exactChecks: document.querySelectorAll('.reconciliation-status.pass-exact').length,
      metricHelpNames: [...document.querySelectorAll('.metric-help summary')]
        .map((summary) => summary.getAttribute('aria-label')),
      metricDetails: document.querySelectorAll('.metric-card details.metric-help').length,
      metricSummaries: document.querySelectorAll('.metric-card .metric-summary').length,
      metrics,
      rows: document.querySelectorAll('.data-table tbody tr').length,
      shareFooterTop: document.querySelector('.share-card-bottom')?.getBoundingClientRect().top ?? 0,
      shareGridBottom: document.querySelector('.share-grid')?.getBoundingClientRect().bottom ?? 0,
      shareGridItems: document.querySelectorAll('.share-grid > div').length,
      trustColumns: document.querySelectorAll('.trust-status-grid > div').length,
      trustText: document.querySelector('.trust-status-panel')?.textContent ?? '',
    };
  })()`)
  assert.equal(ledgerDetails.rows, 3, 'The synthetic fixture did not render exactly three underlying rows.')
  assert.equal(ledgerDetails.exactChecks, 3, 'Not all three reconciliation checks rendered Exact match.')
  assert.equal(ledgerDetails.metricDetails, 4, 'Not all four core metrics exposed an expandable explanation.')
  assert.equal(ledgerDetails.metricSummaries, 4, 'Not all four core metrics exposed a plain-language summary.')
  assert.equal(ledgerDetails.trustColumns, 2, 'Data source and internal calculation checks were not separated.')
  assert.equal(ledgerDetails.shareGridItems, 4, 'The share preview did not disclose both trust dimensions.')
  assert(
    ledgerDetails.shareFooterTop >= ledgerDetails.shareGridBottom + 20,
    `Share preview content overlapped its footer: ${JSON.stringify(ledgerDetails)}`,
  )
  assert.deepEqual(ledgerDetails.metricHelpNames, [
    'Season P&L: What this means',
    'Season return: What this means',
    'Net liquidation: What this means',
    'Options P&L: What this means',
  ])
  assert(ledgerDetails.trustText.includes('Data source'))
  assert(ledgerDetails.trustText.includes('Internal calculation check'))
  const seasonPnl = ledgerDetails.metrics.find((metric) => metric.label === 'Season P&L')?.value
  assert.match(
    seasonPnl ?? '',
    /^\+(?:US)?\$740$/,
    `Unexpected rounded Season P&L display: ${seasonPnl}`,
  )

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 768,
    width: 768,
  })
  const tabletNavigationState = await evaluate(`(() => {
    const nav = document.querySelector('.bottom-nav');
    const label = nav?.querySelector('small');
    return {
      labelFontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0,
      navWidth: nav?.getBoundingClientRect().width ?? 0,
    };
  })()`)
  assert(tabletNavigationState.navWidth <= 560, `Tablet bottom navigation is too wide: ${JSON.stringify(tabletNavigationState)}`)
  assert(tabletNavigationState.labelFontSize >= 10, `Tablet navigation labels are too small: ${JSON.stringify(tabletNavigationState)}`)

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 320,
    width: 320,
  })
  const mobileLedgerState = await evaluate(`(() => {
    const visibleText = (element) => element && getComputedStyle(element).display !== 'none'
      ? element.textContent?.trim() ?? ''
      : null;
    return {
      headers: [...document.querySelectorAll('.data-table th')].map(visibleText).filter((value) => value !== null),
      pageWidth: document.documentElement.scrollWidth,
      rowCells: [...document.querySelectorAll('.data-table tbody tr:first-child td')]
        .map(visibleText).filter((value) => value !== null),
      viewportWidth: window.innerWidth,
    };
  })()`)
  assert.deepEqual(mobileLedgerState.headers, ['Symbol', 'YTD P&L', ''])
  assert.equal(mobileLedgerState.rowCells.length, 3)
  assert.match(mobileLedgerState.rowCells[1], /^\+(?:US)?\$/)
  assert(
    mobileLedgerState.pageWidth <= mobileLedgerState.viewportWidth,
    `The simplified mobile Ledger caused page overflow: ${JSON.stringify(mobileLedgerState)}`,
  )
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  const guideOpened = await evaluate(`(() => {
    window.scrollTo(0, 500);
    const button = [...document.querySelectorAll('[data-action="open-guide"]')]
      .find((candidate) => candidate.getClientRects().length > 0);
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`)
  assert.equal(guideOpened, true, 'Could not reopen the first-use guide from the app shell.')
  const reopenedGuide = await waitForPageValue(
    `(() => ({
      activeId: document.activeElement?.id ?? '',
      heading: document.querySelector('#getting-started-main h1')?.textContent?.trim() ?? '',
      primary: document.querySelector('[data-action="welcome-primary"]')?.textContent?.trim() ?? '',
      scrollY: window.scrollY,
    }))()`,
    (value) =>
      value?.activeId === 'getting-started-main' &&
      value?.primary === 'Return to current report' &&
      value?.scrollY === 0,
    'Reopenable guide preserving the current report',
  )
  assert.equal(reopenedGuide.activeId, 'getting-started-main')
  const returnedFromGuide = await evaluate(`(() => {
    const button = document.querySelector('[data-action="welcome-primary"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`)
  assert.equal(returnedFromGuide, true)
  await waitForPageValue(
    `(() => ({
      activeId: document.activeElement?.id ?? '',
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      scrollY: window.scrollY,
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
    }))()`,
    (value) =>
      value?.activeId === 'main-content' &&
      value?.heading === 'Ledger' &&
      value?.scrollY === 0 &&
      value?.source === 'Fully synthetic test',
    'Return from guide without replacing current report',
  )

  await assertSnapshotNotice(
    fixturePath,
    'already open. Nothing changed',
    'Duplicate snapshot in-page notice',
  )
  await assertSnapshotNotice(
    sameDateFixturePath,
    'same end date was not imported',
    'Same-date snapshot in-page notice',
  )
  await assertSnapshotNotice(
    olderFixturePath,
    'older YTD file was not imported',
    'Older snapshot in-page notice',
  )

  await clickPrimaryNavigation('Import')
  const confirmCancelNodeId = await resolveFileInputNodeId()
  const fixedWorkerCountBeforeDemoConfirmation = workerFixedTimes.length
  await cdp.send('DOM.setFileInputFiles', {
    files: [capacityFixturePath],
    nodeId: confirmCancelNodeId,
  })
  await waitForPageValue(
    `document.querySelector('.drop-zone')?.getAttribute('aria-busy')`,
    (value) => value === 'true',
    'Busy import before cancelling the Demo confirmation',
  )
  await waitForCondition(
    () => workerFixedTimes.length > fixedWorkerCountBeforeDemoConfirmation,
    'Demo-confirmation regression Worker setup',
  )
  const demoConfirmationCancelled = await evaluate(`(() => {
    const nativeConfirm = window.confirm;
    try {
      window.confirm = () => false;
      const button = document.querySelector('[data-action="use-demo"]');
      if (!(button instanceof HTMLButtonElement)) return null;
      button.click();
      return {
        busy: document.querySelector('.drop-zone')?.getAttribute('aria-busy'),
        heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      };
    } finally {
      window.confirm = nativeConfirm;
    }
  })()`)
  assert.deepEqual(
    demoConfirmationCancelled,
    { busy: 'true', heading: 'Import your current YTD statement' },
    'Cancelling the Demo confirmation silently stopped the active import.',
  )
  const explicitCancelClicked = await evaluate(`(() => {
    const button = document.querySelector('[data-action="cancel-import"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`)
  assert.equal(explicitCancelClicked, true, 'Could not cleanly cancel the confirmation regression import.')
  await waitForPageValue(
    `(() => ({
      busy: document.querySelector('.drop-zone')?.getAttribute('aria-busy'),
      visible: document.querySelector('.import-cancelled-message')?.textContent?.trim() ?? '',
    }))()`,
    (value) => value?.busy === 'false' && value?.visible.includes('report already open'),
    'Explicit cleanup after cancelled Demo confirmation',
  )
  await clickPrimaryNavigation('Ledger')
  await waitForPageValue(
    `document.querySelector('.trust-badge')?.textContent?.trim() ?? ''`,
    (value) => value === 'Fully synthetic test',
    'Current report preserved after cancelled Demo confirmation',
  )

  const canvasCaptureInstalled = await evaluate(`(() => {
    if (globalThis.__pnlArenaCanvasCapture) return false;
    const captured = { arcs: [], drawImage: 0, fillText: [], fillTextCalls: [], putImageData: 0, strokes: [], strokeText: [] };
    const nativeArc = CanvasRenderingContext2D.prototype.arc;
    const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
    const nativeStrokeText = CanvasRenderingContext2D.prototype.strokeText;
    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    const nativePutImageData = CanvasRenderingContext2D.prototype.putImageData;
    const nativeStroke = CanvasRenderingContext2D.prototype.stroke;
    Object.defineProperty(globalThis, '__pnlArenaCanvasCapture', {
      configurable: false,
      enumerable: false,
      value: captured,
      writable: false,
    });
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, ...args) {
      captured.arcs.push({ radius, x, y });
      return Reflect.apply(nativeArc, this, [x, y, radius, ...args]);
    };
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      const normalizedText = String(text);
      captured.fillText.push(normalizedText);
      captured.fillTextCalls.push({
        align: this.textAlign,
        text: normalizedText,
        width: this.measureText(normalizedText).width,
        x: args[0],
        y: args[1],
      });
      return Reflect.apply(nativeFillText, this, [text, ...args]);
    };
    CanvasRenderingContext2D.prototype.strokeText = function (text, ...args) {
      captured.strokeText.push(String(text));
      return Reflect.apply(nativeStrokeText, this, [text, ...args]);
    };
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      captured.drawImage += 1;
      return Reflect.apply(nativeDrawImage, this, args);
    };
    CanvasRenderingContext2D.prototype.putImageData = function (...args) {
      captured.putImageData += 1;
      return Reflect.apply(nativePutImageData, this, args);
    };
    CanvasRenderingContext2D.prototype.stroke = function (...args) {
      captured.strokes.push({
        alpha: this.globalAlpha,
        lineWidth: this.lineWidth,
        strokeStyle: String(this.strokeStyle),
      });
      return Reflect.apply(nativeStroke, this, args);
    };
    return true;
  })()`)
  assert.equal(canvasCaptureInstalled, true, 'Could not install the isolated canvas privacy capture.')
  const downloadClicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === 'Download PNG');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  assert.equal(downloadClicked, true, 'Could not find the Download PNG button.')
  await waitForCondition(() => downloadStarts.length > 0, 'PNG browser download start')
  assert.equal(downloadStarts.length, 1, `Expected one download, observed ${downloadStarts.length}.`)
  const expectedDownloadGuid = downloadStarts[0].guid
  await waitForCondition(() => {
    const matchingEvents = downloadProgress.filter(({ guid }) => guid === expectedDownloadGuid)
    if (matchingEvents.some(({ state }) => state === 'canceled')) {
      throw new Error(`PNG browser download was canceled: ${expectedDownloadGuid}`)
    }
    return matchingEvents.some(({ state }) => state === 'completed')
  }, 'PNG browser download completion')
  await waitForCondition(
    () => {
      const names = readdirSync(downloadDirectory)
      return names.length > 0 && names.every((name) => !name.endsWith('.crdownload'))
    },
    'PNG file flush',
  )
  const downloadStatus = await waitForPageValue(
    `document.querySelector('.share-delivery-status')?.textContent?.trim() ?? ''`,
    (value) => value === 'PNG download started.',
    'Visible PNG delivery status',
  )
  assert.equal(downloadStatus, 'PNG download started.')

  assert.equal(downloadStarts[0].suggestedFilename, 'pnl-arena-2026-season.png')
  const downloadedFiles = readdirSync(downloadDirectory).filter((name) => !name.startsWith('.'))
  assert.deepEqual(downloadedFiles, ['pnl-arena-2026-season.png'])
  const downloadedPngPath = join(downloadDirectory, downloadedFiles[0])
  const downloadedPng = readFileSync(downloadedPngPath)
  assert.equal(statSync(downloadedPngPath).size, downloadedPng.length)
  const pngDimensions = inspectPng(downloadedPng)
  assert.deepEqual(pngDimensions, { height: 1500, width: 1200 })

  const decodedPng = await evaluate(`(async () => {
    const binary = atob(${JSON.stringify(downloadedPng.toString('base64'))});
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const result = { height: bitmap.height, width: bitmap.width };
    bitmap.close();
    return result;
  })()`)
  assert.deepEqual(decodedPng, { height: 1500, width: 1200 }, 'Chrome could not decode the downloaded PNG.')

  const canvasCapture = await evaluate(`({
    arcs: globalThis.__pnlArenaCanvasCapture.arcs.map((item) => ({ ...item })),
    drawImage: globalThis.__pnlArenaCanvasCapture.drawImage,
    fillText: [...globalThis.__pnlArenaCanvasCapture.fillText],
    fillTextCalls: globalThis.__pnlArenaCanvasCapture.fillTextCalls.map((item) => ({ ...item })),
    putImageData: globalThis.__pnlArenaCanvasCapture.putImageData,
    strokes: globalThis.__pnlArenaCanvasCapture.strokes.map((item) => ({ ...item })),
    strokeText: [...globalThis.__pnlArenaCanvasCapture.strokeText],
  })`)
  assert.equal(canvasCapture.drawImage, 0, 'PNG generation introduced an unreviewed image source.')
  assert.equal(canvasCapture.putImageData, 0, 'PNG generation introduced unreviewed raw pixel data.')
  assert.deepEqual(canvasCapture.strokeText, [], 'PNG generation introduced unreviewed stroked text.')
  assert.deepEqual(canvasCapture.strokes.slice(-3), [
    { alpha: 0.52, lineWidth: 3.375, strokeStyle: '#d8ff4f' },
    { alpha: 0.55, lineWidth: 2.25, strokeStyle: '#8e9dab' },
    { alpha: 1, lineWidth: 4.5, strokeStyle: '#d8ff4f' },
  ])
  const pngBrandText = canvasCapture.fillTextCalls.find(({ text }) => text === 'P&L ARENA')
  const pngPrivacyLine = canvasCapture.fillTextCalls.find(
    ({ text }) => text === 'Excludes holdings, account identifiers, and exact net liquidation value.',
  )
  const pngBrandOuterRing = canvasCapture.arcs.at(-1)
  assert(pngBrandText && pngPrivacyLine && pngBrandOuterRing, 'PNG footer layout evidence was not captured.')
  assert.equal(pngBrandText?.align, 'right')
  assert(
    pngBrandOuterRing.x + pngBrandOuterRing.radius + 16 <= pngBrandText.x - pngBrandText.width,
    `PNG brand mark overlapped its label: ${JSON.stringify({ pngBrandOuterRing, pngBrandText })}`,
  )
  assert(
    pngBrandOuterRing.y - pngBrandOuterRing.radius - pngPrivacyLine.y >= 40,
    `PNG privacy line crowded the brand mark: ${JSON.stringify({ pngBrandOuterRing, pngPrivacyLine })}`,
  )
  const capturedCanvasText = canvasCapture.fillText
  const expectedCanvasText = [
    '2026 FOUNDERS SEASON',
    'Season P&L',
    '+$740',
    'Season return: +7.7%',
    'Division: Retail League',
    'Stocks',
    '+$168',
    'Options',
    '+$450',
    'Data through',
    'Aug 15, 2026',
    'Source',
    'Fully synthetic test',
    'Internal calculation check',
    'Internal checks passed',
    'Excludes holdings, account identifiers, and exact net liquidation value.',
    'P&L ARENA',
  ]
  assert.deepEqual(
    capturedCanvasText,
    expectedCanvasText,
    'PNG drawing text changed; review the complete privacy-safe allowlist before accepting it.',
  )
  for (const forbiddenValue of [
    'ZZFICTA',
    'ZZFICTB',
    'ZZFICTC',
    'SYNTHETIC_ACCOUNT_2026_A',
    '••••26_A',
    '33750',
    '33,750',
    '33750.368455',
    '$33,750',
    '$33,750.37',
  ]) {
    assert(
      !capturedCanvasText.some((value) => value.includes(forbiddenValue)),
      `PNG drawing received a sensitive synthetic canary: ${forbiddenValue}`,
    )
    assert(
      !downloadedPng.includes(Buffer.from(forbiddenValue)),
      `PNG binary contains a sensitive synthetic canary: ${forbiddenValue}`,
    )
  }

  const pngSaveGuidance = await testPngSaveGuidance({
    cdp, evaluate, waitForPageValue, waitForAsyncCondition, downloadDirectory, inspectPng,
  })
  const shareInteractions = await testShareInteractions((expression) => evaluate(expression, 30_000))

  const previewClearLifecycle = await evaluate(`(async () => {
    const navigatorKeys = ['clipboard', 'canShare', 'maxTouchPoints', 'platform', 'share', 'userAgent'];
    const navigatorDescriptors = Object.fromEntries(
      navigatorKeys.map((key) => [key, Object.getOwnPropertyDescriptor(navigator, key)]),
    );
    const nativeConfirm = window.confirm;
    const nativeCreateObjectURL = URL.createObjectURL;
    const nativeRevokeObjectURL = URL.revokeObjectURL;
    const nativeAnchorClick = HTMLAnchorElement.prototype.click;
    const createdUrls = [];
    const revokedUrls = [];
    let rejectPendingShare;
    let resolvePendingCopy;
    let lateDownloadCount = 0;
    const waitUntil = async (predicate, label) => {
      const deadline = performance.now() + 5_000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
      throw new Error(label + ' timed out.');
    };

    try {
      Object.defineProperties(navigator, {
        canShare: { configurable: true, value: undefined },
        maxTouchPoints: { configurable: true, value: 5 },
        platform: { configurable: true, value: 'iPhone' },
        share: { configurable: true, value: undefined },
        userAgent: {
          configurable: true,
          value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)',
        },
      });
      URL.createObjectURL = function (value) {
        const url = Reflect.apply(nativeCreateObjectURL, URL, [value]);
        createdUrls.push(url);
        return url;
      };
      URL.revokeObjectURL = function (url) {
        revokedUrls.push(url);
        return Reflect.apply(nativeRevokeObjectURL, URL, [url]);
      };

      const downloadButton = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Download PNG');
      if (!downloadButton) throw new Error('Download PNG button not found.');
      downloadButton.click();
      await waitUntil(
        () => {
          const panel = document.querySelector('.png-fallback-panel');
          return Boolean(panel?.querySelector('img') && document.activeElement === panel);
        },
        'iOS local PNG preview',
      );
      const initialPanel = document.querySelector('.png-fallback-panel');
      const initialPreviewAccessible =
        initialPanel?.getAttribute('role') === 'region' &&
        initialPanel?.tabIndex === -1 &&
        document.activeElement === initialPanel &&
        Boolean(initialPanel?.querySelector('button')) &&
        Boolean(initialPanel?.querySelector('a[target="_blank"]'));
      const closePreviewUrl = document.querySelector('.png-fallback-panel img')?.src ?? '';
      const closeButton = initialPanel?.querySelector('button');
      if (!closeButton) throw new Error('Local PNG preview close button not found.');
      closeButton.click();
      await waitUntil(
        () =>
          !document.querySelector('.png-fallback-panel') &&
          revokedUrls.includes(closePreviewUrl) &&
          document.activeElement === downloadButton,
        'closed iOS local PNG preview',
      );
      const closeFocusReturned = document.activeElement === downloadButton;

      downloadButton.click();
      await waitUntil(
        () => {
          const panel = document.querySelector('.png-fallback-panel');
          return Boolean(panel?.querySelector('img') && document.activeElement === panel);
        },
        'language-switch PNG preview',
      );
      const localePreviewUrl = document.querySelector('.png-fallback-panel img')?.src ?? '';

      const languageSelect = document.querySelector('select.language-select');
      if (!languageSelect) throw new Error('Language selector not found.');
      languageSelect.value = 'zh-CN';
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await waitUntil(
        () =>
          !document.querySelector('.png-fallback-panel') &&
          revokedUrls.includes(localePreviewUrl),
        'language-switched iOS local PNG preview',
      );
      languageSelect.value = 'en';
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await waitUntil(
        () => [...document.querySelectorAll('button')]
          .some((candidate) => candidate.textContent?.trim() === 'Download PNG'),
        'restored English language',
      );

      const secondDownloadButton = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Download PNG');
      if (!secondDownloadButton) throw new Error('Restored Download PNG button not found.');
      secondDownloadButton.click();
      await waitUntil(
        () => Boolean(document.querySelector('.png-fallback-panel img')),
        'second iOS local PNG preview',
      );
      const clearPreviewUrl = document.querySelector('.png-fallback-panel img')?.src ?? '';

      // Clear the report while both browser operations are pending, not only after PNG creation.
      Object.defineProperties(navigator, {
        canShare: { configurable: true, value: () => true },
        share: { configurable: true, value: () => new Promise((resolveShare, rejectShare) => {
          rejectPendingShare = rejectShare;
        }) },
        clipboard: { configurable: true, value: { writeText: () => new Promise((resolveCopy) => {
          resolvePendingCopy = resolveCopy;
        }) } },
      });
      secondDownloadButton.click();
      document.querySelector('[data-action="copy-summary"]').click();
      await waitUntil(
        () => typeof rejectPendingShare === 'function' && typeof resolvePendingCopy === 'function',
        'pending share and copy before report clearing',
      );
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) lateDownloadCount += 1;
        else return Reflect.apply(nativeAnchorClick, this, []);
      };
      window.confirm = () => true;
      const clearButton = document.querySelector('button.text-button.danger');
      if (!clearButton) throw new Error('Clear current statement button not found.');
      clearButton.click();
      await waitUntil(
        () =>
          Boolean(document.querySelector('.source-pill.demo')) &&
          !document.querySelector('.png-fallback-panel') &&
          revokedUrls.includes(clearPreviewUrl),
        'cleared iOS local PNG preview',
      );

      rejectPendingShare(new DOMException('Controlled delayed share rejection', 'NotAllowedError'));
      resolvePendingCopy();
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      const clearedRequestFeedback = document.querySelector('[data-action="copy-summary"]')?.textContent?.trim() === 'Copy summary' &&
        !document.querySelector('.share-delivery-status') && !document.querySelector('.png-fallback-panel');

      return {
        createdCount: createdUrls.length,
        closeFocusReturned,
        closePreviewUrl,
        closeRevoked: revokedUrls.includes(closePreviewUrl),
        clearPreviewUrl,
        clearRevoked: revokedUrls.includes(clearPreviewUrl),
        clearedRequestFeedback,
        lateDownloadCount,
        initialPreviewAccessible,
        localePreviewUrl,
        localeRevoked: revokedUrls.includes(localePreviewUrl),
        previewRemoved: !document.querySelector('.png-fallback-panel'),
        reportReset: Boolean(document.querySelector('.source-pill.demo')),
      };
    } finally {
      window.confirm = nativeConfirm;
      rejectPendingShare?.(new DOMException('Test cleanup', 'AbortError'));
      resolvePendingCopy?.();
      await new Promise((resolveWait) => setTimeout(resolveWait, 0));
      HTMLAnchorElement.prototype.click = nativeAnchorClick;
      URL.createObjectURL = nativeCreateObjectURL;
      URL.revokeObjectURL = nativeRevokeObjectURL;
      for (const url of createdUrls) {
        if (!revokedUrls.includes(url)) Reflect.apply(nativeRevokeObjectURL, URL, [url]);
      }
      for (const key of navigatorKeys) {
        const descriptor = navigatorDescriptors[key];
        if (descriptor) Object.defineProperty(navigator, key, descriptor);
        else delete navigator[key];
      }
    }
  })()`)
  assert.equal(previewClearLifecycle.createdCount, 3, 'iOS fallback created an unexpected number of Blob URLs.')
  assert.equal(previewClearLifecycle.clearedRequestFeedback, true, 'Cleared report received stale share/copy feedback.')
  assert.equal(previewClearLifecycle.lateDownloadCount, 0, 'Cleared report triggered a late download.')
  assert.equal(previewClearLifecycle.initialPreviewAccessible, true, 'iOS preview did not receive an operable focused region.')
  assert.ok(previewClearLifecycle.closePreviewUrl.startsWith('blob:'), 'The close-path iOS fallback did not expose a Blob preview URL.')
  assert.equal(previewClearLifecycle.closeRevoked, true, 'Closing the PNG preview did not release its Blob URL.')
  assert.equal(previewClearLifecycle.closeFocusReturned, true, 'Closing the PNG preview did not restore Download PNG focus.')
  assert.ok(previewClearLifecycle.localePreviewUrl.startsWith('blob:'), 'iOS fallback did not expose a Blob preview URL.')
  assert.equal(previewClearLifecycle.localeRevoked, true, 'Changing language did not release the old PNG Blob URL.')
  assert.ok(previewClearLifecycle.clearPreviewUrl.startsWith('blob:'), 'The second iOS fallback did not expose a Blob preview URL.')
  assert.equal(previewClearLifecycle.previewRemoved, true, 'Clearing the report left the old PNG visible.')
  assert.equal(previewClearLifecycle.reportReset, true, 'Clearing the report did not restore Demo data.')
  assert.equal(previewClearLifecycle.clearRevoked, true, 'Clearing the report did not release the old PNG Blob URL.')

  await clickPrimaryNavigation('Import')
  const reimportNodeId = await resolveFileInputNodeId()
  await cdp.send('DOM.setFileInputFiles', {
    files: [fixturePath],
    nodeId: reimportNodeId,
  })
  await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
    }))()`,
    (value) => value?.heading === 'Ledger' && value?.source === 'Fully synthetic test',
    'Synthetic re-import after PNG lifecycle check',
    20_000,
  )

  await clickPrimaryNavigation('Arena')
  const arenaState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      localSnapshots: document.querySelectorAll('.local-snapshot-panel').length,
      text: document.body.innerText,
    }))()`,
    (value) => value?.heading.includes('Founders Arena'),
    'Arena navigation',
  )
  assert.equal(arenaState.localSnapshots, 0, 'Synthetic fixture created a local ranking snapshot.')
  assert(!arenaState.text.includes('Your local snapshot'), 'Synthetic fixture exposed a local snapshot label.')
  assert(!arenaState.text.includes('Self-reported'), 'Synthetic fixture exposed a Self-reported Arena label.')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 320,
    width: 320,
  })
  const mobileArenaState = await evaluate(`(() => {
    const visibleText = (element) => getComputedStyle(element).display !== 'none'
      ? element.textContent?.trim() ?? ''
      : null;
    return {
      headers: [...document.querySelectorAll('.leaderboard-head > *')]
        .map(visibleText).filter((value) => value !== null),
      listWidth: document.querySelector('.leaderboard-list')?.getBoundingClientRect().width ?? 0,
      viewportWidth: window.innerWidth,
    };
  })()`)
  assert.deepEqual(mobileArenaState.headers, ['Rank', 'Trader', 'Return'])
  assert(mobileArenaState.listWidth <= mobileArenaState.viewportWidth)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 500,
    width: 500,
  })
  const arenaAt500 = await evaluate(`(() => {
    const visibleText = (element) => getComputedStyle(element).display !== 'none'
      ? element.textContent?.trim() ?? ''
      : null;
    const list = document.querySelector('.leaderboard-list');
    return {
      documentWidth: document.documentElement.scrollWidth,
      headers: [...document.querySelectorAll('.leaderboard-head > *')]
        .map(visibleText).filter((value) => value !== null),
      listClientWidth: list?.clientWidth ?? 0,
      listScrollWidth: list?.scrollWidth ?? 0,
    };
  })()`)
  assert.deepEqual(arenaAt500.headers, ['Rank', 'Trader', 'Return'])
  assert(arenaAt500.listScrollWidth <= arenaAt500.listClientWidth)
  assert(arenaAt500.documentWidth <= 500)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 501,
    width: 501,
  })
  const arenaAt501 = await evaluate(`(() => {
    const visibleText = (element) => getComputedStyle(element).display !== 'none'
      ? element.textContent?.trim() ?? ''
      : null;
    const list = document.querySelector('.leaderboard-list');
    list?.focus();
    return {
      documentWidth: document.documentElement.scrollWidth,
      focused: document.activeElement === list,
      headers: [...document.querySelectorAll('.leaderboard-head > *')]
        .map(visibleText).filter((value) => value !== null),
      listClientWidth: list?.clientWidth ?? 0,
      listOverflowX: list ? getComputedStyle(list).overflowX : '',
      listScrollWidth: list?.scrollWidth ?? 0,
    };
  })()`)
  assert.deepEqual(arenaAt501.headers, ['Rank', 'Trader', 'Division', 'Return', 'P&L'])
  assert.equal(arenaAt501.focused, true)
  assert.equal(arenaAt501.listOverflowX, 'auto')
  assert(arenaAt501.listScrollWidth > arenaAt501.listClientWidth)
  assert(arenaAt501.documentWidth <= 501)
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  await clickPrimaryNavigation('Trophies')
  const trophyState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      text: document.body.innerText,
      unlocked: document.querySelectorAll('.trophy-card.unlocked').length,
    }))()`,
    (value) => value?.heading === 'Trophy case',
    'Trophies navigation',
  )
  assert.equal(trophyState.unlocked, 0, 'Synthetic fixture unlocked a local achievement.')
  assert(trophyState.text.includes('Achievement preview'), 'Synthetic trophy state was not labelled as a preview.')
  assert(!trophyState.text.includes('Local achievement'), 'Synthetic fixture displayed a local achievement label.')
  const lockedTrophyStyle = await evaluate(`(() => {
    const card = document.querySelector('.trophy-card.locked');
    const copy = card?.querySelector('p');
    const statuses = [...document.querySelectorAll('.trophy-status')];
    return {
      copyFontSize: copy ? Number.parseFloat(getComputedStyle(copy).fontSize) : 0,
      copyOpacity: copy ? Number.parseFloat(getComputedStyle(copy).opacity) : 0,
      opacity: card ? Number.parseFloat(getComputedStyle(card).opacity) : 0,
      statusFontSize: Math.min(...statuses.map((status) => Number.parseFloat(getComputedStyle(status).fontSize))),
    };
  })()`)
  assert.equal(lockedTrophyStyle.opacity, 1, 'Locked trophy text was dimmed with whole-card opacity.')
  assert.equal(lockedTrophyStyle.copyOpacity, 1, 'Locked trophy copy is not fully visible.')
  assert(lockedTrophyStyle.copyFontSize >= 10, 'Locked trophy copy is too small to read.')
  assert(lockedTrophyStyle.statusFontSize >= 10, 'Trophy status text is too small to read.')

  await cdp.send('Page.reload', { ignoreCache: true })
  const refreshState = await waitForPageValue(
    `(async () => ({
      cacheKeys: typeof caches === 'undefined' ? [] : await caches.keys(),
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      indexedDbNames: typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases()).map(({ name }) => name ?? '').filter(Boolean).sort()
        : [],
      seenGuide: localStorage.getItem('pnl-arena.onboarding.v1'),
      serviceWorkerScopes: 'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistrations()).map(({ scope }) => scope).sort()
        : [],
      sessionStorageKeys: Object.keys(sessionStorage).sort(),
      source: document.querySelector('.source-pill.demo')?.textContent?.trim() ?? '',
      storageKeys: Object.keys(localStorage).sort(),
      text: document.body.innerText,
    }))()`,
    (value) => value?.heading === 'Ledger' && value?.source === 'Demo data',
    'Refresh reset to Demo',
  )
  assert(!refreshState.text.includes('Fully synthetic test'), 'The imported report survived a full refresh.')
  assert.equal(refreshState.seenGuide, 'seen', 'The explicit first-use choice was not remembered after refresh.')
  assert.deepEqual(
    refreshState.storageKeys,
    ['pnl-arena.locale.v1', 'pnl-arena.onboarding.v1'],
    'The browser persisted data beyond the two approved non-financial preferences.',
  )
  assert.deepEqual(refreshState.sessionStorageKeys, [], 'The browser wrote sessionStorage data.')
  assert.deepEqual(refreshState.indexedDbNames, [], 'The browser created an IndexedDB database.')
  assert.deepEqual(refreshState.cacheKeys, [], 'The browser created a Cache Storage entry.')
  assert.deepEqual(refreshState.serviceWorkerScopes, [], 'The browser registered a service worker.')

  await clickPrimaryNavigation('Import')
  const cancelNodeId = await resolveFileInputNodeId()
  const workerCountBeforeCancel = workerTargets.length
  const cancelProbeInstalled = await evaluate(`(() => {
    if (globalThis.__capacityCancelProbe) return false;
    const probe = {
      busyObserved: false,
      clicked: false,
      clickTime: null,
      failed: false,
      scheduled: false,
      started: performance.now(),
    };
    Object.defineProperty(globalThis, '__capacityCancelProbe', {
      configurable: false,
      enumerable: false,
      value: probe,
      writable: false,
    });
    const inspect = () => {
      const zone = document.querySelector('.drop-zone');
      const button = [...document.querySelectorAll('.drop-zone button')]
        .find((candidate) => candidate.textContent?.trim() === 'Cancel import');
      if (zone?.getAttribute('aria-busy') === 'true') probe.busyObserved = true;
      if (!button || probe.scheduled) return;
      probe.scheduled = true;
      setTimeout(() => {
        const liveButton = [...document.querySelectorAll('.drop-zone button')]
          .find((candidate) => candidate.textContent?.trim() === 'Cancel import');
        if (!liveButton) {
          probe.scheduled = false;
          if (document.querySelector('main h1')?.textContent?.trim() === 'Ledger') {
            probe.failed = true;
            observer.disconnect();
          }
          return;
        }
        observer.disconnect();
        liveButton.click();
        probe.clicked = true;
        probe.clickTime = performance.now();
      }, 75);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    inspect();
    return true;
  })()`)
  assert.equal(cancelProbeInstalled, true, 'Could not install the real-browser cancel probe.')
  await cdp.send('DOM.setFileInputFiles', {
    files: [capacityFixturePath],
    nodeId: cancelNodeId,
  })
  const cancelledImportState = await waitForPageValue(
    `(() => ({
      busy: document.querySelector('.drop-zone')?.getAttribute('aria-busy'),
      fileInput: Boolean(document.querySelector('input[type="file"]')),
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      live: document.querySelector('.import-live-status')?.textContent?.trim() ?? '',
      visible: document.querySelector('.import-cancelled-message')?.textContent?.trim() ?? '',
      probe: { ...globalThis.__capacityCancelProbe },
    }))()`,
    (value) =>
      value?.probe?.clicked === true &&
      value?.fileInput === true &&
      value?.live === '' &&
      value?.visible.includes('report already open in this tab was not changed'),
    'Production Worker cancellation through the visible UI',
  )
  assert.equal(cancelledImportState.busy, 'false')
  assert.equal(cancelledImportState.probe.busyObserved, true)
  await waitForCondition(
    () => workerTargets.length > workerCountBeforeCancel,
    'Cancelled production Worker target creation',
  )
  const cancelledWorkerTarget = workerTargets.at(-1)
  const cancelledWorkerTerminated = await waitForAsyncCondition(
    async () => {
      const { targetInfos = [] } = await cdp.send('Target.getTargets')
      return !targetInfos.some(({ targetId }) => targetId === cancelledWorkerTarget.targetId)
    },
    'Cancelled production Worker target termination',
  )
  await delay(12_250)
  const noLateCancelledResult = await evaluate(`(() => ({
    fileInput: Boolean(document.querySelector('input[type="file"]')),
    heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
    live: document.querySelector('.import-live-status')?.textContent?.trim() ?? '',
  }))()`)
  assert.equal(noLateCancelledResult.fileInput, true, 'A cancelled Worker produced a late navigation.')
  assert.equal(noLateCancelledResult.live, '')

  const capacityNodeId = await resolveFileInputNodeId()
  const capacityProbeInstalled = await evaluate(`(() => {
    if (globalThis.__capacityImportProbe) return false;
    const probe = {
      busyAt: null,
      finished: false,
      ledgerReadyAt: null,
      ledgerAt: null,
      longTaskFinalized: false,
      longTaskSupported:
        PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false,
      longTasks: [],
      maxRafGap: 0,
      maxTimerGap: 0,
      rafAfterLedger: false,
      rafTicks: 0,
      started: performance.now(),
      timerAfterLedger: false,
      timerTicks: 0,
    };
    Object.defineProperty(globalThis, '__capacityImportProbe', {
      configurable: false,
      enumerable: false,
      value: probe,
      writable: false,
    });
    let lastRaf = performance.now();
    let lastTimer = performance.now();
    const finishIfReady = () => {
      if (
        probe.finished ||
        probe.ledgerReadyAt == null ||
        !probe.timerAfterLedger ||
        !probe.rafAfterLedger
      ) return;
      probe.finished = true;
      probe.ledgerAt = performance.now();
      clearInterval(interval);
      observer.disconnect();
      setTimeout(() => {
        for (const entry of longTaskObserver?.takeRecords() ?? []) {
          probe.longTasks.push(entry.duration);
        }
        longTaskObserver?.disconnect();
        probe.longTaskFinalized = true;
      }, 0);
    };
    const interval = setInterval(() => {
      const now = performance.now();
      probe.maxTimerGap = Math.max(probe.maxTimerGap, now - lastTimer);
      probe.timerTicks += 1;
      lastTimer = now;
      if (probe.ledgerReadyAt != null) probe.timerAfterLedger = true;
      finishIfReady();
    }, 16);
    const frame = (now) => {
      probe.maxRafGap = Math.max(probe.maxRafGap, now - lastRaf);
      probe.rafTicks += 1;
      lastRaf = now;
      if (probe.ledgerReadyAt != null) probe.rafAfterLedger = true;
      finishIfReady();
      if (!probe.finished) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    let longTaskObserver;
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) probe.longTasks.push(entry.duration);
      });
      longTaskObserver.observe({ type: 'longtask' });
    } catch {}
    const inspect = () => {
      if (
        probe.busyAt == null &&
        document.querySelector('.drop-zone')?.getAttribute('aria-busy') === 'true'
      ) {
        probe.busyAt = performance.now();
      }
      if (
        probe.ledgerReadyAt == null &&
        probe.busyAt != null &&
        document.querySelector('main h1')?.textContent?.trim() === 'Ledger' &&
        document.querySelectorAll('.data-table tbody tr').length === ${SYNTHETIC_CAPACITY_SYMBOLS}
      ) {
        probe.ledgerReadyAt = performance.now();
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    inspect();
    return true;
  })()`)
  assert.equal(capacityProbeInstalled, true, 'Could not install the capacity responsiveness probe.')
  await cdp.send('DOM.setFileInputFiles', {
    files: [capacityFixturePath],
    nodeId: capacityNodeId,
  })
  await waitForPageValue(
    `document.querySelector('.drop-zone')?.getAttribute('aria-busy')`,
    (value) => value === 'true',
    'Exact-capacity busy state before invalid replacement probe',
  )
  await cdp.send('DOM.setFileInputFiles', {
    files: [invalidExtensionFixturePath],
    nodeId: capacityNodeId,
  })
  await delay(50)
  const ignoredInvalidReplacement = await evaluate(`(() => ({
    busy: document.querySelector('.drop-zone')?.getAttribute('aria-busy'),
    error: document.querySelector('.error-message')?.textContent?.trim() ?? '',
    recovery: Boolean(document.querySelector('.import-recovery-panel')),
  }))()`)
  assert.equal(ignoredInvalidReplacement.busy, 'true')
  assert.equal(ignoredInvalidReplacement.error, '')
  assert.equal(ignoredInvalidReplacement.recovery, false)
  const capacityLedgerState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      quality: document.querySelector('.quality-badge')?.textContent?.trim() ?? '',
      rows: document.querySelectorAll('.data-table tbody tr').length,
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
      probe: { ...globalThis.__capacityImportProbe },
    }))()`,
    (value) =>
      value?.heading === 'Ledger' &&
      value?.rows === SYNTHETIC_CAPACITY_SYMBOLS &&
      value?.probe?.finished === true &&
      value?.probe?.longTaskFinalized === true,
    'Exact-capacity production Worker import and render',
    20_000,
  )
  const capacityProbe = capacityLedgerState.probe
  const capacityDurationMs = capacityProbe.ledgerAt - capacityProbe.started
  const maxLongTaskMs = Math.max(0, ...capacityProbe.longTasks)
  console.log('Exact-capacity responsiveness:', {
    durationMs: Number(capacityDurationMs.toFixed(1)),
    maxLongTaskMs: Number(maxLongTaskMs.toFixed(1)),
    maxRafGapMs: Number(capacityProbe.maxRafGap.toFixed(1)),
    maxTimerGapMs: Number(capacityProbe.maxTimerGap.toFixed(1)),
    rafTicks: capacityProbe.rafTicks,
    timerTicks: capacityProbe.timerTicks,
  })
  assert.equal(capacityLedgerState.source, 'Self-reported · not broker-verified')
  assert.equal(capacityLedgerState.quality, 'Review internal checks')
  assert.notEqual(capacityProbe.busyAt, null, 'The capacity import never exposed its busy state.')
  assert.equal(
    capacityProbe.longTaskSupported,
    true,
    'Chrome did not expose the Long Tasks API used by the responsiveness gate.',
  )
  assert(capacityProbe.timerTicks > 0, 'No main-thread timer ran during the capacity import.')
  assert(capacityProbe.rafTicks > 0, 'No animation frame ran during the capacity import.')
  assert(
    capacityDurationMs < 10_000,
    `Exact-capacity end-to-end import and render took ${capacityDurationMs.toFixed(1)} ms, exceeding the 10 s regression gate.`,
  )
  assert(
    capacityProbe.maxTimerGap < 250,
    `Exact-capacity import blocked a timer for ${capacityProbe.maxTimerGap.toFixed(1)} ms.`,
  )
  assert(
    capacityProbe.maxRafGap < 250,
    `Exact-capacity import blocked animation frames for ${capacityProbe.maxRafGap.toFixed(1)} ms.`,
  )
  assert(
    maxLongTaskMs < 250,
    `Exact-capacity import produced a ${maxLongTaskMs.toFixed(1)} ms long task.`,
  )

  const searchStartedAt = await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Search symbols"]');
    if (!input) return null;
    const startedAt = performance.now();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'CAP499');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return startedAt;
  })()`)
  assert.notEqual(searchStartedAt, null, 'Could not find the capacity Ledger search input.')
  const capacitySearchState = await waitForPageValue(
    `(() => ({
      finishedAt: performance.now(),
      rowText: document.querySelector('.data-table tbody tr')?.textContent ?? '',
      rows: document.querySelectorAll('.data-table tbody tr').length,
    }))()`,
    (value) => value?.rows === 1 && value?.rowText.includes('CAP499'),
    'Capacity Ledger search response',
  )
  const searchDurationMs = capacitySearchState.finishedAt - searchStartedAt
  assert(
    searchDurationMs < 500,
    `Capacity Ledger search took ${searchDurationMs.toFixed(1)} ms to update.`,
  )
  const capacityRowOpened = await evaluate(`(() => {
    const button = document.querySelector('.data-table tbody tr .row-arrow');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  assert.equal(capacityRowOpened, true, 'Could not open a capacity Ledger row.')
  const capacityDrawer = await waitForPageValue(
    `(() => ({
      counts: [...document.querySelectorAll('.event-summary strong')]
        .map((element) => element.textContent?.trim()),
      events: document.querySelectorAll('.event-list > article').length,
      title: document.querySelector('#symbol-drawer-title')?.textContent?.trim() ?? '',
    }))()`,
    (value) => value?.title === 'CAP499',
    'Capacity option lifecycle drawer',
  )
  assert.deepEqual(capacityDrawer.counts, ['1', '0', '1'])
  assert.equal(capacityDrawer.events, 2)

  const drawerClosed = await evaluate(`(() => {
    const button = document.querySelector('.symbol-drawer .close-button');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  assert.equal(drawerClosed, true)
  await waitForPageValue(
    `!document.querySelector('.symbol-drawer')`,
    Boolean,
    'Capacity drawer close',
  )

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 812,
    width: 812,
  })
  await clickPrimaryNavigation('Arena')
  const compactLocalArenaState = await waitForPageValue(
    `(() => {
      const panel = document.querySelector('.local-snapshot-panel');
      const grid = document.querySelector('.local-snapshot-grid');
      const list = document.querySelector('.leaderboard-list');
      const panelRect = panel?.getBoundingClientRect();
      const listRect = list?.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        listClientWidth: list?.clientWidth ?? 0,
        listOverflowX: list ? getComputedStyle(list).overflowX : '',
        listRight: listRect?.right ?? 0,
        listScrollWidth: list?.scrollWidth ?? 0,
        panelColumns: panel ? getComputedStyle(panel).gridTemplateColumns.trim().split(/\\s+/).length : 0,
        panelRight: panelRect?.right ?? 0,
        snapshotColumns: grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length : 0,
        snapshotItems: grid?.children.length ?? 0,
        viewportWidth: window.innerWidth,
      };
    })()`,
    (value) => value?.snapshotItems === 6,
    '812 px local Arena layout',
  )
  assert.equal(compactLocalArenaState.panelColumns, 1)
  assert.equal(compactLocalArenaState.snapshotColumns, 3)
  assert.equal(compactLocalArenaState.listOverflowX, 'auto')
  assert(compactLocalArenaState.listScrollWidth > compactLocalArenaState.listClientWidth)
  assert(compactLocalArenaState.panelRight <= compactLocalArenaState.viewportWidth)
  assert(compactLocalArenaState.listRight <= compactLocalArenaState.viewportWidth)
  assert(compactLocalArenaState.documentWidth <= compactLocalArenaState.viewportWidth)

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    screenHeight: 900,
    screenWidth: 500,
    width: 500,
  })
  const narrowLocalSnapshotState = await evaluate(`(() => {
    const grid = document.querySelector('.local-snapshot-grid');
    return {
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length : 0,
      documentWidth: document.documentElement.scrollWidth,
      items: grid?.children.length ?? 0,
      viewportWidth: window.innerWidth,
    };
  })()`)
  assert.equal(narrowLocalSnapshotState.items, 6)
  assert.equal(narrowLocalSnapshotState.columns, 1)
  assert(narrowLocalSnapshotState.documentWidth <= narrowLocalSnapshotState.viewportWidth)
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  const overSymbolFailureMs = await assertProductionWorkerCapacityFailure(
    overSymbolFixturePath,
    '501-symbol production Worker rejection',
  )
  const overEventFailureMs = await assertProductionWorkerCapacityFailure(
    overEventFixturePath,
    '1,001-event production Worker rejection',
  )

  await clickPrimaryNavigation('Import')
  const oversizedNodeId = await resolveFileInputNodeId()
  const workerCountBeforeOversized = workerTargets.length
  await cdp.send('DOM.setFileInputFiles', {
    files: [oversizedFixturePath],
    nodeId: oversizedNodeId,
  })
  const oversizedState = await waitForPageValue(
    `(() => ({
      busy: document.querySelector('.drop-zone')?.getAttribute('aria-busy'),
      error: document.querySelector('.error-message')?.textContent?.trim() ?? '',
    }))()`,
    (value) => value?.error.includes('larger than the 5 MB safety limit'),
    'Oversized file browser preflight',
  )
  assert.equal(oversizedState.busy, 'false')
  await delay(250)
  assert.equal(
    workerTargets.length,
    workerCountBeforeOversized,
    'The browser created a Worker for an oversized file that should fail preflight.',
  )

  const importRecovery = await testImportRecovery({
    cdp,
    evaluate,
    waitForPageValue,
    waitForAsyncCondition,
    clickPrimaryNavigation,
    resolveFileInputNodeId,
    holdNextWorker,
    releaseWorkerHold,
    getWorkerTargets: () => workerTargets,
    fixturePath,
    invalidExtensionFixturePath,
  })

  await delay(250)

  const expectedDownloadGuids = [expectedDownloadGuid, pngSaveGuidance.namedDownload.guid]
  assert.equal(new Set(expectedDownloadGuids).size, 2, 'The two explicit PNG downloads must have distinct GUIDs.')
  assert.equal(downloadStarts.length, 2, 'An unrequested browser download was observed.')
  assert.deepEqual(downloadStarts.map(({ guid }) => guid), expectedDownloadGuids)
  assert(
    downloadProgress.every(({ guid }) => expectedDownloadGuids.includes(guid)),
    `Download progress included an unexpected GUID: ${JSON.stringify(downloadProgress)}`,
  )

  const externalRequests = requests.filter(({ url }) => {
    if (!url || /^(about|blob|data):/.test(url)) return false
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return true
    }
    return parsed.protocol !== 'http:'
      || parsed.hostname !== '127.0.0.1'
      || parsed.port !== String(previewPort)
  })
  const nonGetRequests = requests.filter(({ method }) => method?.toUpperCase() !== 'GET')
  const allowedLocalPathPatterns = [
    /^\/$/,
    /^\/index\.html$/,
    /^\/favicon\.svg$/,
    /^\/sample-ibkr-ytd\.csv$/,
    /^\/assets\/index-[A-Za-z0-9_-]+\.js$/,
    /^\/assets\/index-[A-Za-z0-9_-]+\.css$/,
    /^\/assets\/ibkrParser\.worker-[A-Za-z0-9_-]+\.js$/,
  ]
  const unexpectedLocalRequests = requests.filter(({ method, url }) => {
    if (!url || /^(about|blob|data):/.test(url)) return false
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    if (
      parsed.protocol !== 'http:' ||
      parsed.hostname !== '127.0.0.1' ||
      parsed.port !== String(previewPort)
    ) return false
    return method?.toUpperCase() !== 'GET'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
      || !allowedLocalPathPatterns.some((pattern) => pattern.test(parsed.pathname))
  })

  assert.deepEqual(externalRequests, [], `External page requests were observed: ${JSON.stringify(externalRequests)}`)
  assert.deepEqual(nonGetRequests, [], `Non-GET page requests were observed: ${JSON.stringify(nonGetRequests)}`)
  assert.deepEqual(
    unexpectedLocalRequests,
    [],
    `Unexpected same-origin request paths or query payloads were observed: ${JSON.stringify(unexpectedLocalRequests)}`,
  )
  assert.deepEqual(webSockets, [], `Page WebSocket connections were observed: ${JSON.stringify(webSockets)}`)
  assert.deepEqual(responseErrors, [], `HTTP error responses were observed: ${JSON.stringify(responseErrors)}`)
  assert.deepEqual(runtimeErrors, [], `Runtime exceptions were observed: ${JSON.stringify(runtimeErrors)}`)
  assert.deepEqual(consoleErrors, [], `Console errors/warnings were observed: ${JSON.stringify(consoleErrors)}`)
  assert.deepEqual(logErrors, [], `Browser log errors/warnings were observed: ${JSON.stringify(logErrors)}`)
  assert.deepEqual(
    asynchronousProtocolErrors,
    [],
    `Worker DevTools setup errors were observed: ${JSON.stringify(asynchronousProtocolErrors)}`,
  )
  assert(
    workerTargets.some(({ url }) => url.includes('ibkrParser.worker')),
    `The dedicated parser Worker target was not observed: ${JSON.stringify(workerTargets)}`,
  )
  assert(
    workerFixedTimes.some(
      ({ url, value }) => url.includes('ibkrParser.worker') && value === fixedNowMs,
    ),
    `The parser Worker did not receive the fixed clock: ${JSON.stringify(workerFixedTimes)}`,
  )
  assert(
    requests.some(({ url }) => url?.includes('ibkrParser.worker')),
    'The production parser Worker chunk was not requested.',
  )

  console.log('Browser import, cancellation, capacity, and PNG download regression passed.')
  console.log({
    cancelledWorkerTerminated,
    capacityBytes: capacityStatement.byteLength,
    capacityDurationMs: Number(capacityDurationMs.toFixed(1)),
    capacityEvents: SYNTHETIC_CAPACITY_EVENTS,
    capacityMaxLongTaskMs: Number(maxLongTaskMs.toFixed(1)),
    capacityMaxRafGapMs: Number(capacityProbe.maxRafGap.toFixed(1)),
    capacityMaxTimerGapMs: Number(capacityProbe.maxTimerGap.toFixed(1)),
    capacityRows: SYNTHETIC_CAPACITY_ROWS,
    capacitySearchMs: Number(searchDurationMs.toFixed(1)),
    capacitySha256: createHash('sha256').update(capacityStatement.text).digest('hex'),
    capacitySymbols: SYNTHETIC_CAPACITY_SYMBOLS,
    overCapBytes: SYNTHETIC_CAPACITY_TARGET_BYTES,
    overCapEventFailureMs: Number(overEventFailureMs.toFixed(1)),
    overCapEventsRejected: SYNTHETIC_OVER_CAP_EVENTS,
    overCapRows: SYNTHETIC_CAPACITY_ROWS,
    overCapSymbolFailureMs: Number(overSymbolFailureMs.toFixed(1)),
    overCapSymbolsRejected: SYNTHETIC_OVER_CAP_SYMBOLS,
    chrome: basename(chromePath),
    downloadedPngBytes: downloadedPng.length,
    downloadedPngDimensions: pngDimensions,
    exactChecks: ledgerDetails.exactChecks,
    fixture: fixturePath.slice(projectRoot.length + 1),
    fixedNow: new Date(fixedNowMs).toISOString(),
    requests: requests.length,
    rows: ledgerDetails.rows,
    seasonPnl,
    shareInteractions,
    pngSaveGuidance,
    importRecovery,
    workerFixedTime: workerFixedTimes.find(({ url }) => url.includes('ibkrParser.worker'))?.value,
    workerTargets: workerTargets.length,
  })
} catch (error) {
  if (previewOutput) console.error(`Preview output:\n${tail(previewOutput)}`)
  if (chromeOutput) console.error(`Chrome output:\n${tail(chromeOutput)}`)
  throw error
} finally {
  await cleanup()
}
