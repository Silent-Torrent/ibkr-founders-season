import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit browser-backed cancellation tests, never included in normal check.
// Each child gets an independently owned temp root; no user's profile is read.
const runner = fileURLToPath(new URL('./calibrate-worker-heap.mjs', import.meta.url))
const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const terminal = (child) => child.exitCode !== null || child.signalCode !== null

for (const stage of ['profile-created', 'endpoint-created', 'worker-running']) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ibkr-calibration-interruption-'))
  const output = join(root, 'must-not-exist.json')
  const child = spawn(process.execPath, [runner, '--output', output], {
    env: { ...process.env, TMPDIR: root }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  let stdout = ''
  let closed = false
  child.once('close', () => { closed = true })
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  try {
    let ready = false
    const until = performance.now() + 15_000
    while (!ready && performance.now() < until && !terminal(child)) {
      const profileRoot = readdirSync(root).find((name) => name.startsWith('ibkr-worker-heap-calibration-'))
      if (profileRoot) {
        const endpoint = join(root, profileRoot, 'profile', 'DevToolsActivePort')
        if (stage === 'profile-created') ready = true
        else if (existsSync(endpoint)) {
          if (stage === 'endpoint-created') ready = true
          else {
            const [portText] = readFileSync(endpoint, 'utf8').trim().split('\n')
            const port = Number(portText)
            assert(Number.isInteger(port) && port > 0 && port <= 65535)
            try {
              const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500), redirect: 'error' })
              ready = response.ok && (await response.json()).some((target) => target.type === 'worker')
            } catch { /* The endpoint may still be starting. */ }
          }
        }
      }
      if (!ready) await pause(10)
    }
    assert(ready && !terminal(child), `${stage}: required live interruption stage was not observed: ${stderr}`)
    assert(child.kill('SIGTERM'), `${stage}: could not signal the owned runner`)
    const exitDeadline = performance.now() + 12_000
    while (!closed && performance.now() < exitDeadline) await pause(20)
    assert(closed && terminal(child), `${stage}: interrupted runner did not exit and close its output in time`)
    assert.equal(child.exitCode, 1, `${stage}: runner must reject interruption, not report success`)
    assert.match(stderr, /Calibration interrupted by SIGTERM/)
    assert.equal(stdout, '', `${stage}: interrupted run emitted successful numeric evidence`)
    assert.equal(existsSync(output), false, `${stage}: interrupted run wrote successful evidence`)
    assert.deepEqual(readdirSync(root).filter((name) => name.startsWith('ibkr-worker-heap-calibration-')), [], `${stage}: calibration profile remained`)
    const ownedChrome = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
      .split('\n').filter((line) => line.includes(root) && line.includes('Google Chrome'))
    assert.deepEqual(ownedChrome, [], `${stage}: an owned Chrome process remains`)
    console.log(`PASS interrupted ${stage}: nonzero exit, no success evidence/profile/owned Chrome`)
  } finally {
    if (!terminal(child)) {
      child.kill('SIGTERM')
      const until = performance.now() + 5_000
      while (!terminal(child) && performance.now() < until) await pause(20)
    }
    // Preserve diagnostic files if a child is still alive. Only remove the
    // explicit fresh test root after terminal state and no owned Chrome.
    const remaining = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
      .split('\n').filter((line) => line.includes(root) && line.includes('Google Chrome'))
    if (terminal(child) && remaining.length === 0) {
      assert.equal(dirname(root), realpathSync(tmpdir()))
      rmSync(root, { recursive: true })
    } else process.stderr.write(`Preserved owned interruption directory for inspection: ${root}\n`)
  }
}
console.log('Calibration lifecycle tests passed (3 actual SIGTERM stages; not app, memory-peak or device acceptance).')
