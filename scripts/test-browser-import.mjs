import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  if (profileDirectory) {
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
  profileDirectory = mkdtempSync(join(tmpdir(), 'pnl-arena-chrome-'))
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

  cdp.on('Target.attachedToTarget', async (params) => {
    const { sessionId, targetInfo } = params
    try {
      if (targetInfo?.type === 'worker') {
        workerTargets.push({ title: targetInfo.title, url: targetInfo.url })
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
  assert.notEqual(nodeId, 0, 'The Import page file input could not be resolved through DOM.setFileInputFiles.')

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

  await delay(250)

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

  console.log('Browser import regression passed.')
  console.log({
    chrome: basename(chromePath),
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
