import assert from 'node:assert/strict'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import {
  assertIphoneStressPackRepositoryPolicy,
  generateIphoneStressPack,
} from './generate-iphone-stress-pack.mjs'
import {
  isPathInsideDirectory,
  verifyIphoneStressPack,
} from './verify-iphone-stress-pack.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const temporaryParent = mkdtempSync(join(tmpdir(), 'ibkr-iphone-stress-pack-test-'))
const packDirectory = join(temporaryParent, 'iphone-stress-pack-test')
const existingDirectory = join(temporaryParent, 'already-exists')
const danglingTarget = join(temporaryParent, 'dangling-output')
const linkedPackDirectory = join(temporaryParent, 'linked-pack')
const racedDirectory = join(temporaryParent, 'raced-output')
let vite

function parseCodes(result) {
  return result.errors.map(({ code }) => code)
}

try {
  assert.equal(
    isPathInsideDirectory(projectRoot, join(projectRoot, '..packs', 'iphone-pack')),
    true,
    'A repository child whose name starts with two dots was mistaken for an external path.',
  )
  assert.equal(
    isPathInsideDirectory(projectRoot, resolve(projectRoot, '..', 'repository-sibling')),
    false,
    'A repository sibling was mistaken for a repository child.',
  )
  assert.throws(
    () => assertIphoneStressPackRepositoryPolicy('dirty'),
    /Repository must be clean/,
    'The default user-facing repository policy accepted a dirty worktree.',
  )
  assert.doesNotThrow(() => assertIphoneStressPackRepositoryPolicy('dirty', true))
  assert.doesNotThrow(() => assertIphoneStressPackRepositoryPolicy('clean'))

  assert.throws(
    () => generateIphoneStressPack('relative-output'),
    /explicit absolute path/,
    'The generator accepted a relative output path.',
  )
  assert.throws(
    () => generateIphoneStressPack(join(projectRoot, 'forbidden-stress-pack-output')),
    /outside the repository/,
    'The generator accepted an output directory inside the repository.',
  )
  mkdirSync(existingDirectory)
  assert.throws(
    () => generateIphoneStressPack(existingDirectory),
    /already exists/,
    'The generator accepted an existing output directory.',
  )

  symlinkSync(join(temporaryParent, 'missing-dangling-target'), danglingTarget, 'dir')
  assert.throws(
    () => generateIphoneStressPack(danglingTarget, { allowDirtyRepositoryForTests: true }),
    /already exists/,
    'The generator treated a dangling output symlink as an unused path entry.',
  )
  assert(lstatSync(danglingTarget).isSymbolicLink(), 'The dangling output symlink was replaced.')

  const generated = generateIphoneStressPack(packDirectory, {
    allowDirtyRepositoryForTests: true,
  })
  assert.equal(generated.status, 'NOT_RUN')
  assert.equal(generated.files.length, 5)
  assert.deepEqual(
    readdirSync(temporaryParent)
      .filter((name) => name.startsWith('.iphone-stress-pack-staging-')),
    [],
    'A staging directory remained after atomic publication.',
  )

  const independentlyVerified = verifyIphoneStressPack(packDirectory)
  assert.equal(independentlyVerified.packId, 'ibkr-iphone-stress-pack-v1')
  assert.equal(independentlyVerified.status, 'NOT_RUN')

  symlinkSync(packDirectory, linkedPackDirectory, 'dir')
  assert.throws(
    () => verifyIphoneStressPack(linkedPackDirectory),
    /must not be a symbolic link/,
    'The verifier accepted a symbolic link as the pack root.',
  )
  assert.throws(
    () => verifyIphoneStressPack('relative-output'),
    /explicit absolute path/,
    'The verifier accepted a relative pack path.',
  )
  assert.throws(
    () => generateIphoneStressPack(packDirectory, { allowDirtyRepositoryForTests: true }),
    /already exists/,
    'The generator overwrote an existing published pack.',
  )

  let racedDirectoryIdentity
  assert.throws(
    () => generateIphoneStressPack(racedDirectory, {
      allowDirtyRepositoryForTests: true,
      beforePublishForTests: ({ canonicalTarget }) => {
        mkdirSync(canonicalTarget)
        racedDirectoryIdentity = {
          dev: lstatSync(canonicalTarget).dev,
          ino: lstatSync(canonicalTarget).ino,
        }
      },
    }),
    /EEXIST|file already exists/i,
    'The generator replaced an empty directory that appeared immediately before publication.',
  )
  const racedDirectoryAfter = lstatSync(racedDirectory)
  assert.equal(racedDirectoryAfter.dev, racedDirectoryIdentity.dev)
  assert.equal(racedDirectoryAfter.ino, racedDirectoryIdentity.ino)
  assert.deepEqual(readdirSync(racedDirectory), [], 'The generator wrote into the raced directory.')
  assert.deepEqual(
    readdirSync(temporaryParent).filter((name) => name.startsWith('.iphone-stress-pack-staging-')),
    [],
    'A staging directory remained after a no-clobber publication failure.',
  )

  const manifestPath = join(packDirectory, 'MANIFEST.json')
  const originalManifest = readFileSync(manifestPath, 'utf8')
  const parsedManifest = JSON.parse(originalManifest)
  assert(
    parsedManifest.repository.state === 'clean' || parsedManifest.repository.state === 'dirty',
    'The manifest did not record repository cleanliness.',
  )
  assert.equal(parsedManifest.generator.verifier, 'scripts/verify-iphone-stress-pack.mjs')

  const readmePath = join(packDirectory, 'README_先读.md')
  const originalReadme = readFileSync(readmePath, 'utf8')
  writeFileSync(readmePath, `!${originalReadme.slice(1)}`)
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /certified safety instructions/,
    'The verifier accepted same-size tampering of the safety README.',
  )
  writeFileSync(readmePath, originalReadme)

  const resultsPath = join(packDirectory, 'RESULTS_NOT_RUN.md')
  const originalResults = readFileSync(resultsPath, 'utf8')
  writeFileSync(resultsPath, `!${originalResults.slice(1)}`)
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /certified NOT_RUN template/,
    'The verifier accepted same-size tampering of the results template.',
  )
  writeFileSync(resultsPath, originalResults)

  parsedManifest.generator.scriptSha256 = '0'.repeat(64)
  writeFileSync(manifestPath, `${JSON.stringify(parsedManifest, null, 2)}\n`)
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /does not match/,
    'The verifier accepted a fabricated generator SHA-256.',
  )
  writeFileSync(manifestPath, originalManifest)

  const unknownHeadManifest = JSON.parse(originalManifest)
  unknownHeadManifest.repository.head = '0'.repeat(40)
  writeFileSync(manifestPath, `${JSON.stringify(unknownHeadManifest, null, 2)}\n`)
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /head is not available/,
    'The verifier accepted a fabricated repository HEAD.',
  )
  writeFileSync(manifestPath, originalManifest)

  writeFileSync(manifestPath, Buffer.alloc(64 * 1024 + 1, 0x20))
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /safe pre-read limit/,
    'The verifier read an oversized manifest before rejecting its size.',
  )
  writeFileSync(manifestPath, originalManifest)

  vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  const { parseIbkrActivityStatementBlob } = await vite.ssrLoadModule('/src/lib/ibkr.ts')
  const parsePackFile = (name) => parseIbkrActivityStatementBlob(
    new Blob([readFileSync(join(packDirectory, name))], { type: 'text/csv' }),
    {
      accountComparisonSalt: 'iphone-stress-pack-test',
      currentDate: new Date('2026-09-02T00:00:00+08:00'),
    },
  )

  const control = await parsePackFile('00-control-small.csv')
  assert.deepEqual(control.errors, [])
  assert.equal(control.report?.source, 'synthetic')
  assert.equal(control.report?.seasonPnl, 740.123456)
  assert.equal(control.report?.symbols.length, 3)
  assert.equal(control.report?.events.length, 2)

  const capacity = await parsePackFile('01-accepted-exact-capacity.csv')
  assert.deepEqual(capacity.errors, [])
  assert.equal(capacity.report?.source, 'local')
  assert.equal(capacity.report?.seasonPnl, 500)
  assert.equal(capacity.report?.symbols.length, 500)
  assert.equal(capacity.report?.events.length, 1_000)
  assert.equal(capacity.report?.symbols.at(-1)?.symbol, 'CAP499')

  const cancelTimeoutProbe = await parsePackFile('02-cancel-timeout-probe.csv')
  assert.deepEqual(cancelTimeoutProbe.errors, [])
  assert.equal(cancelTimeoutProbe.report?.source, 'local')
  assert.equal(cancelTimeoutProbe.report?.seasonPnl, 7)
  assert.equal(cancelTimeoutProbe.report?.symbols.length, 1)
  assert.equal(cancelTimeoutProbe.report?.symbols[0]?.symbol, 'CORE')
  assert.deepEqual(cancelTimeoutProbe.report?.events.map(({ type }) => type), ['assignment'])

  const overSymbol = await parsePackFile('03-reject-501-symbols.csv')
  assert.deepEqual(parseCodes(overSymbol), ['report_capacity_exceeded'])
  assert.equal(overSymbol.report, undefined)

  const overEvent = await parsePackFile('04-reject-1001-events.csv')
  assert.deepEqual(parseCodes(overEvent), ['report_capacity_exceeded'])
  assert.equal(overEvent.report, undefined)

  const capacityPath = join(packDirectory, '01-accepted-exact-capacity.csv')
  const originalCapacity = readFileSync(capacityPath)
  const rowTamperedCapacity = Buffer.from(originalCapacity)
  const firstNewline = rowTamperedCapacity.indexOf(0x0a)
  assert(firstNewline >= 0)
  rowTamperedCapacity[firstNewline] = 0x20
  writeFileSync(capacityPath, rowTamperedCapacity)
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /row count changed/,
    'The independent verifier accepted a same-size CSV with a changed physical row count.',
  )

  const digestTamperedCapacity = Buffer.from(originalCapacity)
  digestTamperedCapacity[digestTamperedCapacity.length - 1] =
    digestTamperedCapacity.at(-1) === 0x58 ? 0x59 : 0x58
  writeFileSync(capacityPath, digestTamperedCapacity)
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /SHA-256 changed/,
    'The independent verifier accepted same-size CSV content tampering.',
  )

  writeFileSync(capacityPath, Buffer.concat([originalCapacity, Buffer.from('X')]))
  assert.throws(
    () => verifyIphoneStressPack(packDirectory),
    /size changed before reading/,
    'The independent verifier did not reject a changed CSV size before reading.',
  )

  console.log('iPhone fictional stress-pack generation, verification, and parser outcomes passed.')
} finally {
  await vite?.close()
  rmSync(temporaryParent, { force: true, recursive: true })
}
