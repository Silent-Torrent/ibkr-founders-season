import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit, self-process calibration. No browser/phone/other-PID attachment,
// installation, permissions, GC, app parsing or production-bundle changes.
assert.equal(process.platform, 'darwin')
const source = fileURLToPath(new URL('./native-footprint-pulse.c', import.meta.url))
const output = process.argv[2]
assert(process.argv.length <= 3, 'Optional argument is one new absolute JSON path')
function checkOutput() {
  if (output === undefined) return
  assert(isAbsolute(output) && resolve(output) === output && output.endsWith('.json'))
  let parent = dirname(output)
  while (true) {
    const info = lstatSync(parent)
    assert(info.isDirectory() && !info.isSymbolicLink(), 'Output ancestors must be real directories')
    const next = dirname(parent)
    if (parent === next) break
    parent = next
  }
  try { lstatSync(output); assert.fail('Refusing to overwrite existing evidence') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
checkOutput()
const hash = (data) => createHash('sha256').update(data).digest('hex')
function run(file, args, timeout = 10_000) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 256 * 1024 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, `${file} failed: ${result.stderr}`)
  assert.equal(result.signal, null)
  return result.stdout.trim()
}
const root = mkdtempSync(join(realpathSync(tmpdir()), 'ibkr-native-footprint-pulse-'))
let evidence
try {
  const compiler = '/Library/Developer/CommandLineTools/usr/bin/clang'
  assert(existsSync(compiler), 'Use installed Command Line Tools; do not install automatically')
  const sdk = run('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-path'])
  assert(isAbsolute(sdk) && existsSync(sdk), 'An existing SDK is required')
  const inputs = { source, runner: fileURLToPath(import.meta.url), resourceHeader: join(sdk, 'usr/include/sys/resource.h'), libprocHeader: join(sdk, 'usr/include/libproc.h') }
  const inputBytes = Object.fromEntries(Object.entries(inputs).map(([name, file]) => [name, readFileSync(file)]))
  const inputHashes = Object.fromEntries(Object.entries(inputBytes).map(([name, bytes]) => [`${name}Sha256`, hash(bytes)]))
  const capturedSource = join(root, 'captured-self-pulse.c')
  writeFileSync(capturedSource, inputBytes.source, { flag: 'wx', mode: 0o600 })
  const binary = join(root, 'self-pulse')
  const args = ['-O2', '-std=c11', '-D_DARWIN_C_SOURCE', '-Wall', '-Wextra', '-Werror', '-isysroot', sdk, capturedSource, '-o', binary]
  run(compiler, args, 20_000)
  const caseOrder = [['0', '32', '64'], ['64', '0', '32'], ['32', '64', '0']]
  const cases = caseOrder.flat().map((size, index) => {
    const sample = JSON.parse(run(binary, [size]))
    sample.round = Math.floor(index / 3) + 1
    for (const [name, value] of Object.entries(sample)) if (name.endsWith('Bytes') || ['pid', 'touchedPages', 'checksum', 'pulseDurationNs'].includes(name)) assert(Number.isSafeInteger(value) && value >= 0, `${name}: invalid numeric value`)
    assert.equal(sample.scope, 'self-process-physical-footprint-ledger')
    assert(/^[0-9]+$/.test(sample.processStartAbstime))
    assert.equal(sample.requestedBytes, Number(size) * 1024 * 1024)
    assert(sample.pageBytes > 0)
    assert.equal(sample.touchedPages * sample.pageBytes, sample.requestedBytes)
    assert.equal(sample.checksum, sample.touchedPages * 90)
    for (const flag of ['queriedDuringPulse', 'workerAttributionProven', 'javascriptHeapPeakMeasured', 'deviceThresholdEstablished']) assert.equal(sample[flag], false)
    const endpointsMax = Math.max(sample.beforeCurrentBytes, sample.afterCurrentBytes)
    sample.peakAboveObservedEndpointsBytes = sample.afterLifetimePeakBytes - endpointsMax
    sample.peakAboveBaselineLifetimeBytes = sample.afterLifetimePeakBytes - sample.beforeLifetimePeakBytes
    if (size !== '0') {
      assert(sample.peakAboveObservedEndpointsBytes > 0, 'Kernel peak did not preserve the transient above observed endpoint values')
      assert(sample.peakAboveBaselineLifetimeBytes > 0, 'Historical startup peak dominated this control; cannot qualify the pulse')
    }
    return sample
  })
  assert.equal(new Set(cases.map((item) => `${item.pid}:${item.processStartAbstime}`)).size, 9)
  const invalid = spawnSync(binary, ['999999'], { encoding: 'utf8', timeout: 2_000 })
  assert.equal(invalid.status, 2)
  assert.equal(invalid.stdout, '')
  for (const [name, file] of Object.entries(inputs)) assert.equal(hash(readFileSync(file)), inputHashes[`${name}Sha256`], `${name} changed during the experiment`)
  evidence = {
    schemaVersion: 1, kind: 'native-self-footprint-pulse-calibration',
    environment: { os: run('/usr/bin/sw_vers', []), architecture: run('/usr/bin/uname', ['-m']), compiler: run(compiler, ['--version']), sdk, sdkVersion: run('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-version']), nodeVersion: process.version },
    provenance: { ...inputHashes, binarySha256: hash(readFileSync(binary)), compiledCapturedSource: true, originalInputsUnchangedAtEnd: true },
    method: 'proc_pid_rusage(getpid(), RUSAGE_INFO_V4): before and after mmap/touch/munmap; no query during pulse',
    caseOrder, cases, unsupportedSizeRejected: true,
    successScope: 'Execution, known pulse contents and endpoint invariants only. Quantitative sensitivity must be assessed against the no-pulse controls; a positive delta alone is not sufficient.',
    limitations: { browserWorkerMeasured: false, javascriptAllocationPeakMeasured: false, physicalLedgerEqualsAllMemory: false, iPhoneThresholdEstablished: false },
    temporaryBinaryRemoved: false,
  }
} finally {
  assert.equal(dirname(root), realpathSync(tmpdir()))
  assert(!lstatSync(root).isSymbolicLink())
  rmSync(root, { recursive: true })
  assert.equal(existsSync(root), false)
}
evidence.temporaryBinaryRemoved = true
checkOutput()
const serialized = `${JSON.stringify(evidence, null, 2)}\n`
if (output !== undefined) writeFileSync(output, serialized, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode: 0o600 })
process.stdout.write(serialized)
