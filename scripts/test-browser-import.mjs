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

async function evaluate(expression) {
  const response = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
    userGesture: true,
  })
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
      value?.error.includes('could not be parsed safely in the background') &&
      value?.fileInput === true,
    label,
  )
  assert.equal(failureState.busy, 'false')
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
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
    }))()`,
    (value) =>
      value?.heading === 'Ledger' &&
      value?.rows === SYNTHETIC_CAPACITY_SYMBOLS &&
      value?.source === 'Self-reported',
    `${label} preserved prior Ledger`,
  )
  assert.equal(preservedLedger.rows, SYNTHETIC_CAPACITY_SYMBOLS)
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
const responseErrors = []
const workerTargets = []
const workerFixedTimes = []
const asynchronousProtocolErrors = []
const downloadStarts = []
const downloadProgress = []

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
  const capacityStatement = generateSyntheticCapacityStatement()
  const overEventStatement = generateSyntheticOverEventStatement()
  const overSymbolStatement = generateSyntheticOverSymbolStatement()
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
      }
      await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId)
    } catch (error) {
      asynchronousProtocolErrors.push(error instanceof Error ? error.message : String(error))
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

  await clickPrimaryNavigation('Import')
  const nodeId = await resolveFileInputNodeId()

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
      if (!message) return null;
      const style = getComputedStyle(message);
      const rect = message.getBoundingClientRect();
      return {
        clientWidth: message.clientWidth,
        display: style.display,
        documentWidth: document.documentElement.scrollWidth,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        messageHeight: rect.height,
        messageLeft: rect.left,
        messageRight: rect.right,
        messageWidth: rect.width,
        opacity: Number.parseFloat(style.opacity),
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
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  console.log(`Selecting ${fixturePath.slice(projectRoot.length + 1)} through DevTools...`)
  await cdp.send('DOM.setFileInputFiles', {
    files: [fixturePath],
    nodeId,
  })

  const ledgerState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      quality: document.querySelector('.quality-badge')?.textContent?.trim() ?? '',
      source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
      text: document.body.innerText,
    }))()`,
    (value) => value?.heading === 'Ledger' && value?.source === 'Fully synthetic test',
    'Synthetic Worker-backed import',
    20_000,
  )
  assert.equal(ledgerState.quality, 'Internal checks passed')
  assert(!ledgerState.text.includes('Self-reported'), 'The known synthetic fixture was labelled Self-reported.')

  const ledgerDetails = await evaluate(`(() => {
    const metrics = [...document.querySelectorAll('.metric-card')].map((card) => ({
      label: card.querySelector('.metric-card-head span')?.textContent?.trim() ?? '',
      value: card.querySelector('.metric-value')?.textContent?.trim() ?? '',
    }));
    return {
      exactChecks: document.querySelectorAll('.reconciliation-status.pass-exact').length,
      metrics,
      rows: document.querySelectorAll('.data-table tbody tr').length,
    };
  })()`)
  assert.equal(ledgerDetails.rows, 3, 'The synthetic fixture did not render exactly three underlying rows.')
  assert.equal(ledgerDetails.exactChecks, 3, 'Not all three reconciliation checks rendered Exact match.')
  const seasonPnl = ledgerDetails.metrics.find((metric) => metric.label === 'Season P&L')?.value
  assert.match(
    seasonPnl ?? '',
    /^\+(?:US)?\$740$/,
    `Unexpected rounded Season P&L display: ${seasonPnl}`,
  )

  const canvasCaptureInstalled = await evaluate(`(() => {
    if (globalThis.__pnlArenaCanvasCapture) return false;
    const captured = { drawImage: 0, fillText: [], putImageData: 0, strokeText: [] };
    const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
    const nativeStrokeText = CanvasRenderingContext2D.prototype.strokeText;
    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    const nativePutImageData = CanvasRenderingContext2D.prototype.putImageData;
    Object.defineProperty(globalThis, '__pnlArenaCanvasCapture', {
      configurable: false,
      enumerable: false,
      value: captured,
      writable: false,
    });
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      captured.fillText.push(String(text));
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
    drawImage: globalThis.__pnlArenaCanvasCapture.drawImage,
    fillText: [...globalThis.__pnlArenaCanvasCapture.fillText],
    putImageData: globalThis.__pnlArenaCanvasCapture.putImageData,
    strokeText: [...globalThis.__pnlArenaCanvasCapture.strokeText],
  })`)
  assert.equal(canvasCapture.drawImage, 0, 'PNG generation introduced an unreviewed image source.')
  assert.equal(canvasCapture.putImageData, 0, 'PNG generation introduced unreviewed raw pixel data.')
  assert.deepEqual(canvasCapture.strokeText, [], 'PNG generation introduced unreviewed stroked text.')
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
    'Data through: 2026-08-15',
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

  await cdp.send('Page.reload', { ignoreCache: true })
  const refreshState = await waitForPageValue(
    `(() => ({
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
      source: document.querySelector('.source-pill.demo')?.textContent?.trim() ?? '',
      text: document.body.innerText,
    }))()`,
    (value) => value?.heading === 'Ledger' && value?.source === 'Demo data',
    'Refresh reset to Demo',
  )
  assert(!refreshState.text.includes('Fully synthetic test'), 'The imported report survived a full refresh.')

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
      probe: { ...globalThis.__capacityCancelProbe },
    }))()`,
    (value) =>
      value?.probe?.clicked === true &&
      value?.fileInput === true &&
      value?.live === 'Import cancelled.',
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
  assert.equal(noLateCancelledResult.live, 'Import cancelled.')

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
  assert.equal(capacityLedgerState.source, 'Self-reported')
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

  await assertProductionWorkerCapacityFailure(
    overSymbolFixturePath,
    '501-symbol production Worker rejection',
  )
  await assertProductionWorkerCapacityFailure(
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

  await delay(250)

  assert.equal(downloadStarts.length, 1, 'A delayed second browser download was observed.')
  assert(
    downloadProgress.every(({ guid }) => guid === expectedDownloadGuid),
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
  const postRequests = requests.filter(({ method }) => method?.toUpperCase() === 'POST')

  assert.deepEqual(externalRequests, [], `External page requests were observed: ${JSON.stringify(externalRequests)}`)
  assert.deepEqual(postRequests, [], `POST requests were observed: ${JSON.stringify(postRequests)}`)
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
    overCapEventsRejected: SYNTHETIC_OVER_CAP_EVENTS,
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
