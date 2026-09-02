import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  generateSyntheticCapacityStatement,
  generateSyntheticDuplicateTradesStatement,
  generateSyntheticOverEventStatement,
  generateSyntheticOverSymbolStatement,
  padSyntheticStatementToCapacity,
} from './synthetic-capacity-statement.mjs'
import {
  IPHONE_STRESS_PACK_CSV_EXPECTATIONS,
  IPHONE_STRESS_PACK_ENTRY_NAMES,
  IPHONE_STRESS_PACK_ID,
  IPHONE_STRESS_PACK_README,
  IPHONE_STRESS_PACK_RESULTS_TEMPLATE,
  IPHONE_STRESS_PACK_SHA256SUMS,
  isPathInsideDirectory,
  verifyIphoneStressPack,
} from './verify-iphone-stress-pack.mjs'

const projectRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))))
const canonicalFixturePath = join(
  projectRoot,
  'tests/fixtures/ibkr-current-schema-synthetic.csv',
)
const syntheticGeneratorPath = join(projectRoot, 'scripts/synthetic-capacity-statement.mjs')
const generatorPath = fileURLToPath(import.meta.url)
const verifierPath = join(projectRoot, 'scripts/verify-iphone-stress-pack.mjs')
const incompleteMarkerName = '.IPHONE_STRESS_PACK_INCOMPLETE'

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function fileIdentity(fileStat) {
  return { dev: fileStat.dev, ino: fileStat.ino }
}

function matchesIdentity(fileStat, identity) {
  return fileStat.dev === identity.dev && fileStat.ino === identity.ino
}

function assertPathEntryAbsent(path, message) {
  assert.equal(lstatIfPresent(path), undefined, message)
}

function resolveSafeNewTarget(targetDirectory) {
  assert.equal(typeof targetDirectory, 'string', 'Output directory must be a string.')
  assert(isAbsolute(targetDirectory), 'Output directory must be an explicit absolute path.')
  const resolvedTarget = resolve(targetDirectory)
  const targetName = basename(resolvedTarget)
  assert(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(targetName),
    'Output directory name must use only letters, numbers, dots, underscores, or hyphens.',
  )
  const requestedParent = dirname(resolvedTarget)
  assert(existsSync(requestedParent), `Output parent directory does not exist: ${requestedParent}`)
  const requestedParentStat = lstatSync(requestedParent)
  assert(requestedParentStat.isDirectory(), 'Output parent must be a directory.')
  assert(!requestedParentStat.isSymbolicLink(), 'Output parent must not be a symbolic link.')
  const canonicalParent = realpathSync(requestedParent)
  const canonicalTarget = join(canonicalParent, targetName)
  assert(
    !isPathInsideDirectory(projectRoot, canonicalTarget),
    'Output directory must remain outside the repository.',
  )
  assertPathEntryAbsent(canonicalTarget, `Output directory already exists: ${canonicalTarget}`)
  return { canonicalParent, canonicalTarget, targetName }
}

function writeNewFile(directory, name, contents) {
  const path = join(directory, name)
  assert.equal(dirname(path), directory, `Unsafe output filename: ${name}`)
  writeFileSync(path, contents, { flag: 'wx', mode: 0o600 })
  return path
}

function buildCsvFiles() {
  const control = readFileSync(canonicalFixturePath)
  const capacity = generateSyntheticCapacityStatement()
  const duplicateTradesBase = generateSyntheticDuplicateTradesStatement()
  const cancelTimeoutProbe = {
    ...duplicateTradesBase,
    ...padSyntheticStatementToCapacity(duplicateTradesBase.text),
  }
  const overSymbolBase = generateSyntheticOverSymbolStatement()
  const overSymbol = {
    ...overSymbolBase,
    ...padSyntheticStatementToCapacity(overSymbolBase.text),
  }
  const overEventBase = generateSyntheticOverEventStatement()
  const overEvent = {
    ...overEventBase,
    ...padSyntheticStatementToCapacity(overEventBase.text),
  }

  return [
    {
      ...IPHONE_STRESS_PACK_CSV_EXPECTATIONS[0],
      contents: control,
    },
    {
      ...IPHONE_STRESS_PACK_CSV_EXPECTATIONS[1],
      contents: Buffer.from(capacity.text, 'utf8'),
    },
    {
      ...IPHONE_STRESS_PACK_CSV_EXPECTATIONS[2],
      contents: Buffer.from(cancelTimeoutProbe.text, 'utf8'),
    },
    {
      ...IPHONE_STRESS_PACK_CSV_EXPECTATIONS[3],
      contents: Buffer.from(overSymbol.text, 'utf8'),
    },
    {
      ...IPHONE_STRESS_PACK_CSV_EXPECTATIONS[4],
      contents: Buffer.from(overEvent.text, 'utf8'),
    },
  ]
}

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function gitRepositorySnapshot() {
  const status = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  return {
    head: gitHead(),
    state: status.trim() === '' ? 'clean' : 'dirty',
  }
}

export function assertIphoneStressPackRepositoryPolicy(
  repositoryState,
  allowDirtyRepositoryForTests = false,
) {
  assert(
    repositoryState === 'clean' || repositoryState === 'dirty',
    'Repository state must be clean or dirty.',
  )
  assert.equal(
    typeof allowDirtyRepositoryForTests,
    'boolean',
    'allowDirtyRepositoryForTests must be a boolean.',
  )
  assert(
    repositoryState === 'clean' || allowDirtyRepositoryForTests,
    'Repository must be clean before generating a user-facing iPhone stress pack.',
  )
}

function unlinkOwnedFile(entry) {
  const currentStat = lstatIfPresent(entry.path)
  if (!currentStat || !matchesIdentity(currentStat, entry.identity)) return false
  assert(currentStat.isFile(), `Created publication entry changed type: ${entry.path}`)
  assert(!currentStat.isSymbolicLink(), `Created publication entry became a symbolic link: ${entry.path}`)
  unlinkSync(entry.path)
  return true
}

function cleanupCreatedPublication(publication) {
  const currentDirectoryStat = lstatIfPresent(publication.directory)
  if (
    !currentDirectoryStat ||
    !currentDirectoryStat.isDirectory() ||
    currentDirectoryStat.isSymbolicLink() ||
    !matchesIdentity(currentDirectoryStat, publication.directoryIdentity)
  ) {
    return false
  }

  for (const entry of [...publication.createdEntries].reverse()) unlinkOwnedFile(entry)

  const finalDirectoryStat = lstatIfPresent(publication.directory)
  if (
    !finalDirectoryStat ||
    !finalDirectoryStat.isDirectory() ||
    finalDirectoryStat.isSymbolicLink() ||
    !matchesIdentity(finalDirectoryStat, publication.directoryIdentity)
  ) {
    return false
  }
  try {
    rmdirSync(publication.directory)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTEMPTY') return false
    throw error
  }
}

function publishStagedPackWithoutClobber(stagingDirectory, canonicalTarget) {
  mkdirSync(canonicalTarget, { mode: 0o700 })
  const publication = {
    createdEntries: [],
    directory: canonicalTarget,
    directoryIdentity: fileIdentity(lstatSync(canonicalTarget)),
  }

  try {
    const markerPath = writeNewFile(
      canonicalTarget,
      incompleteMarkerName,
      `${IPHONE_STRESS_PACK_ID}\n`,
    )
    const markerEntry = {
      identity: fileIdentity(lstatSync(markerPath)),
      path: markerPath,
    }
    publication.createdEntries.push(markerEntry)

    for (const name of IPHONE_STRESS_PACK_ENTRY_NAMES) {
      const sourcePath = join(stagingDirectory, name)
      const sourceStat = lstatSync(sourcePath)
      assert(sourceStat.isFile(), `${name} staging entry must be a regular file.`)
      assert(!sourceStat.isSymbolicLink(), `${name} staging entry must not be a symbolic link.`)
      const destinationPath = join(canonicalTarget, name)
      linkSync(sourcePath, destinationPath)
      const createdEntry = {
        identity: fileIdentity(sourceStat),
        path: destinationPath,
      }
      publication.createdEntries.push(createdEntry)
      assert(
        matchesIdentity(lstatSync(destinationPath), createdEntry.identity),
        `${name} publication identity changed.`,
      )
    }

    assert(unlinkOwnedFile(markerEntry), 'The incomplete publication marker changed unexpectedly.')
    return publication
  } catch (error) {
    cleanupCreatedPublication(publication)
    throw error
  }
}

function cleanupOwnedStagingDirectory(stagingDirectory, stagingIdentity) {
  const currentStat = lstatIfPresent(stagingDirectory)
  if (
    !currentStat ||
    !currentStat.isDirectory() ||
    currentStat.isSymbolicLink() ||
    !matchesIdentity(currentStat, stagingIdentity)
  ) {
    return false
  }
  rmSync(stagingDirectory, { force: true, recursive: true })
  return true
}

export function generateIphoneStressPack(targetDirectory, options = {}) {
  assert(options && typeof options === 'object' && !Array.isArray(options), 'Options must be an object.')
  assert.deepEqual(
    Object.keys(options).sort(),
    Object.keys(options)
      .filter((key) => key === 'allowDirtyRepositoryForTests' || key === 'beforePublishForTests')
      .sort(),
    'Generator options contain an unsupported field.',
  )
  const allowDirtyRepositoryForTests = options.allowDirtyRepositoryForTests ?? false
  const beforePublishForTests = options.beforePublishForTests
  assert.equal(typeof allowDirtyRepositoryForTests, 'boolean')
  assert(
    beforePublishForTests === undefined || typeof beforePublishForTests === 'function',
    'beforePublishForTests must be a function.',
  )
  assert(
    beforePublishForTests === undefined || allowDirtyRepositoryForTests,
    'beforePublishForTests is available only to explicit internal tests.',
  )

  const { canonicalParent, canonicalTarget, targetName } = resolveSafeNewTarget(targetDirectory)
  const repository = gitRepositorySnapshot()
  assertIphoneStressPackRepositoryPolicy(repository.state, allowDirtyRepositoryForTests)
  const stagingDirectory = join(
    canonicalParent,
    `.iphone-stress-pack-staging-${targetName}-${process.pid}-${randomUUID()}`,
  )
  assertPathEntryAbsent(stagingDirectory, 'Generated staging directory already exists.')
  mkdirSync(stagingDirectory, { mode: 0o700 })
  const stagingIdentity = fileIdentity(lstatSync(stagingDirectory))
  let publication
  let published = false

  try {
    const csvFiles = buildCsvFiles()
    assert.equal(csvFiles.length, IPHONE_STRESS_PACK_CSV_EXPECTATIONS.length)
    const manifestFiles = csvFiles.map((file, index) => {
      const expected = IPHONE_STRESS_PACK_CSV_EXPECTATIONS[index]
      assert.equal(file.name, expected.name)
      const digest = sha256(file.contents)
      assert.equal(file.contents.length, expected.bytes, `${file.name} byte count drifted.`)
      assert.equal(digest, expected.sha256, `${file.name} deterministic SHA-256 drifted.`)
      assert.equal(file.expectedOutcome, expected.expectedOutcome)
      writeNewFile(stagingDirectory, file.name, file.contents)
      return {
        allData: 'FULLY_FICTIONAL',
        bytes: expected.bytes,
        devicePurpose: file.devicePurpose,
        expectedOutcome: file.expectedOutcome,
        name: file.name,
        rows: expected.rows,
        sha256: digest,
        uiSourceExpectation: file.uiSourceExpectation,
      }
    })

    const manifest = {
      allCsvData: 'FULLY_FICTIONAL',
      files: manifestFiles,
      generatedAt: new Date().toISOString(),
      generator: {
        script: 'scripts/generate-iphone-stress-pack.mjs',
        scriptSha256: sha256(readFileSync(generatorPath)),
        syntheticSource: 'scripts/synthetic-capacity-statement.mjs',
        syntheticSourceSha256: sha256(readFileSync(syntheticGeneratorPath)),
        verifier: 'scripts/verify-iphone-stress-pack.mjs',
        verifierSha256: sha256(readFileSync(verifierPath)),
      },
      limits: {
        maxBytes: 5_242_880,
        maxEvents: 1_000,
        maxRows: 100_000,
        maxSymbols: 500,
        workerTimeoutMs: 12_000,
      },
      packId: IPHONE_STRESS_PACK_ID,
      repository,
      season: 2026,
      status: 'NOT_RUN',
    }
    writeNewFile(stagingDirectory, 'MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`)
    writeNewFile(stagingDirectory, 'README_先读.md', IPHONE_STRESS_PACK_README)
    writeNewFile(stagingDirectory, 'RESULTS_NOT_RUN.md', IPHONE_STRESS_PACK_RESULTS_TEMPLATE)
    writeNewFile(stagingDirectory, 'SHA256SUMS.txt', IPHONE_STRESS_PACK_SHA256SUMS)

    const stagedVerification = verifyIphoneStressPack(stagingDirectory)
    assert.equal(stagedVerification.status, 'NOT_RUN')
    assert.deepEqual(
      gitRepositorySnapshot(),
      repository,
      'Repository HEAD or clean/dirty state changed during stress-pack generation.',
    )
    beforePublishForTests?.({ canonicalTarget, stagingDirectory })
    publication = publishStagedPackWithoutClobber(stagingDirectory, canonicalTarget)
    const finalVerification = verifyIphoneStressPack(canonicalTarget)
    published = true
    return finalVerification
  } finally {
    if (!published && publication) cleanupCreatedPublication(publication)
    assert.equal(dirname(stagingDirectory), canonicalParent)
    assert(basename(stagingDirectory).startsWith('.iphone-stress-pack-staging-'))
    cleanupOwnedStagingDirectory(stagingDirectory, stagingIdentity)
  }
}

function isDirectExecution() {
  return process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isDirectExecution()) {
  assert.equal(
    process.argv.length,
    3,
    'Usage: npm run prepare:iphone-stress-pack -- /absolute/path/to/new-pack-directory',
  )
  const result = generateIphoneStressPack(process.argv[2])
  console.log('iPhone fictional stress pack generated and verified.')
  console.log(result)
}
