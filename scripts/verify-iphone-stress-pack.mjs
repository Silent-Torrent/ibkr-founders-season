import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))))
const generatorPath = join(projectRoot, 'scripts/generate-iphone-stress-pack.mjs')
const syntheticGeneratorPath = join(projectRoot, 'scripts/synthetic-capacity-statement.mjs')
const verifierPath = fileURLToPath(import.meta.url)
const manifestMaximumBytes = 64 * 1024

export const IPHONE_STRESS_PACK_ID = 'ibkr-iphone-stress-pack-v1'

export const IPHONE_STRESS_PACK_CSV_EXPECTATIONS = Object.freeze([
  Object.freeze({
    bytes: 12_664,
    devicePurpose: '小文件基准导入，先确认页面、文件选择和全虚构标签正常',
    expectedOutcome: 'accepted_fully_synthetic_control',
    name: '00-control-small.csv',
    rows: 133,
    sha256: '80831483527003e501aa63f1691a2f155a37b8279f68e2e3e31cb244a219d7ff',
    uiSourceExpectation: 'Fully Synthetic Test',
  }),
  Object.freeze({
    bytes: 5_242_880,
    devicePurpose: '精确 5 MiB/100,000 行/500 标的/1,000 事件成功导入',
    expectedOutcome: 'accepted_exact_capacity',
    name: '01-accepted-exact-capacity.csv',
    rows: 100_000,
    sha256: '83bcab1e6fa5a86c299c1fa9c75044c7f0b9238d915c04612e7bc86e70ff97b2',
    uiSourceExpectation: 'Self-Reported (fully fictional digest is intentionally not registered)',
  }),
  Object.freeze({
    bytes: 5_242_880,
    devicePurpose: '使取消按钮更易出现，并观察生产超时是否自然触发',
    expectedOutcome: 'accepted_if_not_cancelled_or_timed_out',
    name: '02-cancel-timeout-probe.csv',
    rows: 100_000,
    sha256: 'a8dfae74f3c711007cca463018dd75c18ebbdb86b9710e7fa7984932181b514b',
    uiSourceExpectation: 'Self-Reported (fully fictional digest is intentionally not registered)',
  }),
  Object.freeze({
    bytes: 5_242_880,
    devicePurpose: '验证第 501 个保留标的固定容量拒绝且不覆盖旧报表',
    expectedOutcome: 'report_capacity_exceeded',
    name: '03-reject-501-symbols.csv',
    rows: 100_000,
    sha256: '25a433d68a0ec0cbac1de15145aff57c7171a1af4146334c1ae4e5bf6106265e',
    uiSourceExpectation: 'No report should be accepted',
  }),
  Object.freeze({
    bytes: 5_242_880,
    devicePurpose: '验证第 1,001 个事件的固定容量拒绝且不覆盖旧报表',
    expectedOutcome: 'report_capacity_exceeded',
    name: '04-reject-1001-events.csv',
    rows: 100_000,
    sha256: '4a390ab8406187139a772f6c11919d681c525f06d63b3784d60d92b819c50602',
    uiSourceExpectation: 'No report should be accepted',
  }),
])

export const IPHONE_STRESS_PACK_README = `# iPhone Safari 全虚构压力测试包（先读）

## 安全边界

- 本目录的全部 CSV 都是全虚构数据，由项目生成器确定性生成。
- 不要使用真实 IBKR 报表、PDF、账户号、持仓截图或登录凭证替代任何文件。
- 先在 Mac 上运行独立校验，校验通过后再用 AirDrop 或 iCloud Drive 传到 iPhone。
- 本包的初始状态是 \`NOT_RUN\`。生成包和哈希匹配不是真机通过证明。

## 为什么大文件显示 Self-Reported

\`00-control-small.csv\` 是项目已登记哈希的固定虚构 fixture，因此界面应显示“全虚构测试 / Fully Synthetic Test”。其余大文件虽然也是全虚构数据，但它们的哈希没有加入应用的特殊识别名单，所以成功导入时界面会保守地显示 \`Self-Reported\`。这不代表文件来自真实账户。

## 文件顺序

1. \`00-control-small.csv\`：先确认小文件和“全虚构测试”标签。
2. \`01-accepted-exact-capacity.csv\`：精确 5 MiB、100,000 行、500 标的和 1,000 事件。
3. \`02-cancel-timeout-probe.csv\`：选择后立即点“取消导入”。如果成功取消，继续等待至少 12.25 秒，确认没有迟到的新报表。
4. 在新标签页再次选择 \`02\`，这次不取消。若它正常完成，只记录“超时未触发”；只有生产页面自然显示 12 秒超时时，才能记录超时路径已观察。
5. 保留 \`01\` 的已接受报表，再分别导入 \`03\` 和 \`04\`：两者都应显示容量拒绝，并且不覆盖先前的 500 行报表。

## 诚实的记录口径

- 看不到取消按钮：记为 \`NOT_EXERCISED\`，不是通过。
- \`02\` 在 12 秒内完成：记录完成时间，但超时路径仍是 \`NOT_TRIGGERED\`。
- 没有 Safari Web Inspector 证据时，只能记录“取消提示与无迟到结果”，不能声称直接观察到 Worker 终止。
- 未崩溃、未空白、未重载只证明该设备在该次负载下存活，不是峰值内存测量。
- iOS 27.0 的结果不能证明 iOS/Safari 16.4 最低版本。

## 测试后清理

1. 删除 iPhone“文件”App 中的整个测试包目录。
2. 删除测试期间保存的全虚构 PNG。
3. 删除 Mac 上仓库外的这个临时包目录；不要删除仓库内的原始 fixture。
4. 确认 Git 工作树中没有压力包文件。
`

export const IPHONE_STRESS_PACK_RESULTS_TEMPLATE = `# iPhone Safari 压力测试结果（待执行）

整体状态：\`NOT_RUN\`

> 只能在真实 iPhone Safari 完成对应操作后修改。生成成功、SHA-256 匹配、Mac Chrome 通过都不会自动改变下表。

| 项目 | 结果 | 设备/版本 | 耗时或观察 | 证据文件 |
| --- | --- | --- | --- | --- |
| 00 小文件基准 | NOT_RUN | | | |
| 01 精确容量导入 | NOT_RUN | | | |
| 02 取消与无迟到结果 | NOT_RUN | | | |
| 02 自然超时路径 | NOT_RUN | | | |
| 03 超 1 标的容量拒绝 | NOT_RUN | | | |
| 04 超 1 事件的容量拒绝 | NOT_RUN | | | |

可用结果词：\`PASS_OBSERVED\`、\`FAIL\`、\`NOT_EXERCISED\`、\`NOT_TRIGGERED\`、\`NOT_AVAILABLE\`。

额外记录：

- 测试日期：
- iPhone 型号：
- iOS 精确版本：
- Safari 是否为系统 Safari：
- 页面地址与 HTTP/HTTPS 边界：
- 是否观察到标签页崩溃、重载、空白或系统内存警告：
`

const supportingFiles = [
  'MANIFEST.json',
  'README_先读.md',
  'RESULTS_NOT_RUN.md',
  'SHA256SUMS.txt',
]

export const IPHONE_STRESS_PACK_SHA256SUMS = `${IPHONE_STRESS_PACK_CSV_EXPECTATIONS
  .map(({ name, sha256: digest }) => `${digest}  ${name}`)
  .join('\n')}\n`

export const IPHONE_STRESS_PACK_ENTRY_NAMES = Object.freeze([
  ...IPHONE_STRESS_PACK_CSV_EXPECTATIONS.map(({ name }) => name),
  ...supportingFiles,
].sort())

const exactSupportingContents = new Map([
  ['README_先读.md', IPHONE_STRESS_PACK_README],
  ['RESULTS_NOT_RUN.md', IPHONE_STRESS_PACK_RESULTS_TEMPLATE],
  ['SHA256SUMS.txt', IPHONE_STRESS_PACK_SHA256SUMS],
])

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function countPhysicalRows(buffer) {
  if (buffer.length === 0) return 0
  let newlineCount = 0
  for (const byte of buffer) {
    if (byte === 0x0a) newlineCount += 1
  }
  return newlineCount + (buffer.at(-1) === 0x0a ? 0 : 1)
}

function assertExactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} has unexpected fields.`)
}

export function isPathInsideDirectory(parent, candidate) {
  const pathFromParent = relative(parent, candidate)
  return pathFromParent === '' || (
    pathFromParent !== '..' &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  )
}

function resolveExistingExternalDirectory(directory) {
  assert.equal(typeof directory, 'string', 'Pack directory must be a string.')
  assert(isAbsolute(directory), 'Pack directory must be an explicit absolute path.')
  assert(existsSync(directory), `Pack directory does not exist: ${directory}`)
  const requestedStatBeforeResolution = lstatSync(directory)
  assert(
    !requestedStatBeforeResolution.isSymbolicLink(),
    'Pack directory must not be a symbolic link.',
  )
  assert(requestedStatBeforeResolution.isDirectory(), 'Pack path must be a directory.')
  const canonicalDirectory = realpathSync(directory)
  assert(
    !isPathInsideDirectory(projectRoot, canonicalDirectory),
    'Pack directory must remain outside the repository.',
  )
  const canonicalStat = lstatSync(canonicalDirectory)
  const requestedStatAfterResolution = lstatSync(directory)
  assert(!requestedStatAfterResolution.isSymbolicLink(), 'Pack directory changed to a symbolic link.')
  assert(requestedStatAfterResolution.isDirectory(), 'Pack path changed from a directory.')
  for (const field of ['dev', 'ino']) {
    assert.equal(
      requestedStatBeforeResolution[field],
      requestedStatAfterResolution[field],
      'Pack directory changed while its path was being resolved.',
    )
    assert.equal(
      requestedStatAfterResolution[field],
      canonicalStat[field],
      'Pack directory path did not resolve to the inspected directory.',
    )
  }
  return canonicalDirectory
}

function assertRegularFile(directory, name, { expectedBytes, maximumBytes } = {}) {
  const filePath = resolve(directory, name)
  assert.equal(dirname(filePath), directory, `Unsafe pack filename: ${name}`)
  const fileStat = lstatSync(filePath)
  assert(fileStat.isFile(), `${name} must be a regular file.`)
  assert(!fileStat.isSymbolicLink(), `${name} must not be a symbolic link.`)
  if (expectedBytes !== undefined) {
    assert.equal(
      fileStat.size,
      expectedBytes,
      `${name} size changed before reading.`,
    )
  }
  if (maximumBytes !== undefined) {
    assert(
      fileStat.size <= maximumBytes,
      `${name} exceeds the ${maximumBytes}-byte safe pre-read limit.`,
    )
  }
  return { filePath, fileStat }
}

function readRegularFile(directory, name, constraints) {
  const { filePath } = assertRegularFile(directory, name, constraints)
  const buffer = readFileSync(filePath)
  if (constraints?.expectedBytes !== undefined) {
    assert.equal(buffer.length, constraints.expectedBytes, `${name} size changed while reading.`)
  }
  if (constraints?.maximumBytes !== undefined) {
    assert(
      buffer.length <= constraints.maximumBytes,
      `${name} exceeded the safe limit while reading.`,
    )
  }
  return buffer
}

function constraintsForEntry(name) {
  if (name === 'MANIFEST.json') return { maximumBytes: manifestMaximumBytes }
  const csvExpectation = IPHONE_STRESS_PACK_CSV_EXPECTATIONS.find((entry) => entry.name === name)
  if (csvExpectation) return { expectedBytes: csvExpectation.bytes }
  const exactContents = exactSupportingContents.get(name)
  assert.notEqual(exactContents, undefined, `No size policy is defined for ${name}.`)
  return { expectedBytes: Buffer.byteLength(exactContents, 'utf8') }
}

function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function assertGitCommitAvailable(head) {
  try {
    execFileSync('git', ['cat-file', '-e', `${head}^{commit}`], {
      cwd: projectRoot,
      stdio: 'ignore',
    })
  } catch {
    assert.fail(`MANIFEST.json repository head is not available in this repository: ${head}`)
  }
}

function readGitBlob(head, repositoryPath) {
  try {
    return execFileSync('git', ['show', `${head}:${repositoryPath}`], {
      cwd: projectRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    assert.fail(`${repositoryPath} is not available from recorded clean HEAD ${head}.`)
  }
}

function assertGeneratorProvenance(manifest) {
  const sources = [
    {
      manifestDigest: manifest.generator.scriptSha256,
      path: generatorPath,
      repositoryPath: manifest.generator.script,
    },
    {
      manifestDigest: manifest.generator.syntheticSourceSha256,
      path: syntheticGeneratorPath,
      repositoryPath: manifest.generator.syntheticSource,
    },
    {
      manifestDigest: manifest.generator.verifierSha256,
      path: verifierPath,
      repositoryPath: manifest.generator.verifier,
    },
  ]
  assertGitCommitAvailable(manifest.repository.head)

  if (manifest.repository.state === 'clean') {
    for (const source of sources) {
      assert.equal(
        source.manifestDigest,
        sha256(readGitBlob(manifest.repository.head, source.repositoryPath)),
        `${source.repositoryPath} does not match the recorded clean HEAD.`,
      )
    }
    return
  }

  assert.equal(
    manifest.repository.head,
    gitHead(),
    'A dirty-pack manifest must be verified from its recorded working-tree HEAD.',
  )
  for (const source of sources) {
    assert.equal(
      source.manifestDigest,
      sha256(readFileSync(source.path)),
      `${source.repositoryPath} does not match the recorded dirty working tree.`,
    )
  }
}

function assertManifest(manifest) {
  assertExactKeys(
    manifest,
    [
      'allCsvData',
      'files',
      'generatedAt',
      'generator',
      'limits',
      'packId',
      'repository',
      'season',
      'status',
    ],
    'MANIFEST.json',
  )
  assert.equal(manifest.packId, IPHONE_STRESS_PACK_ID)
  assert.equal(manifest.status, 'NOT_RUN')
  assert.equal(manifest.allCsvData, 'FULLY_FICTIONAL')
  assert.equal(manifest.season, 2026)
  assert.equal(new Date(manifest.generatedAt).toISOString(), manifest.generatedAt)
  assertExactKeys(manifest.repository, ['head', 'state'], 'MANIFEST.json repository')
  assert.match(manifest.repository.head, /^[0-9a-f]{40}$/)
  assert(
    manifest.repository.state === 'clean' || manifest.repository.state === 'dirty',
    'MANIFEST.json repository state must be clean or dirty.',
  )
  assertExactKeys(
    manifest.generator,
    [
      'script',
      'scriptSha256',
      'syntheticSource',
      'syntheticSourceSha256',
      'verifier',
      'verifierSha256',
    ],
    'MANIFEST.json generator',
  )
  assert.equal(manifest.generator.script, 'scripts/generate-iphone-stress-pack.mjs')
  assert.equal(manifest.generator.syntheticSource, 'scripts/synthetic-capacity-statement.mjs')
  assert.equal(manifest.generator.verifier, 'scripts/verify-iphone-stress-pack.mjs')
  assert.match(manifest.generator.scriptSha256, /^[0-9a-f]{64}$/)
  assert.match(manifest.generator.syntheticSourceSha256, /^[0-9a-f]{64}$/)
  assert.match(manifest.generator.verifierSha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(manifest.limits, {
    maxBytes: 5_242_880,
    maxEvents: 1_000,
    maxRows: 100_000,
    maxSymbols: 500,
    workerTimeoutMs: 12_000,
  })
  assert(Array.isArray(manifest.files), 'MANIFEST.json files must be an array.')
  assert.equal(manifest.files.length, IPHONE_STRESS_PACK_CSV_EXPECTATIONS.length)
  assertGeneratorProvenance(manifest)
}

export function verifyIphoneStressPack(directory) {
  const canonicalDirectory = resolveExistingExternalDirectory(directory)
  const entries = readdirSync(canonicalDirectory).sort()
  assert.deepEqual(
    entries,
    IPHONE_STRESS_PACK_ENTRY_NAMES,
    'Pack directory has missing or unexpected entries.',
  )

  for (const entry of entries) {
    assertRegularFile(canonicalDirectory, entry, constraintsForEntry(entry))
  }

  const manifest = JSON.parse(
    readRegularFile(canonicalDirectory, 'MANIFEST.json', {
      maximumBytes: manifestMaximumBytes,
    }).toString('utf8'),
  )
  assertManifest(manifest)

  const verifiedFiles = []
  for (let index = 0; index < IPHONE_STRESS_PACK_CSV_EXPECTATIONS.length; index += 1) {
    const expected = IPHONE_STRESS_PACK_CSV_EXPECTATIONS[index]
    const recorded = manifest.files[index]
    assertExactKeys(
      recorded,
      [
        'allData',
        'bytes',
        'devicePurpose',
        'expectedOutcome',
        'name',
        'rows',
        'sha256',
        'uiSourceExpectation',
      ],
      `MANIFEST.json files[${index}]`,
    )
    assert.equal(recorded.allData, 'FULLY_FICTIONAL')
    assert.equal(recorded.name, expected.name)
    assert.equal(recorded.bytes, expected.bytes)
    assert.equal(recorded.rows, expected.rows)
    assert.equal(recorded.sha256, expected.sha256)
    assert.equal(recorded.expectedOutcome, expected.expectedOutcome)
    assert.equal(recorded.devicePurpose, expected.devicePurpose)
    assert.equal(recorded.uiSourceExpectation, expected.uiSourceExpectation)

    const buffer = readRegularFile(canonicalDirectory, expected.name, {
      expectedBytes: expected.bytes,
    })
    assert(
      buffer.every((byte) => byte <= 0x7f),
      `${expected.name} must remain ASCII-only fictional test data.`,
    )
    const csvText = buffer.toString('ascii')
    assert(
      csvText.includes('SYNTHETIC_'),
      `${expected.name} is missing its explicit synthetic account marker.`,
    )
    assert(
      !/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\|\bU\d{6,}\b)/.test(csvText),
      `${expected.name} contains a forbidden local path or real-account-shaped identifier.`,
    )
    assert.equal(countPhysicalRows(buffer), expected.rows, `${expected.name} row count changed.`)
    assert.equal(sha256(buffer), expected.sha256, `${expected.name} SHA-256 changed.`)
    verifiedFiles.push({ ...expected })
  }

  assert.equal(
    readRegularFile(canonicalDirectory, 'SHA256SUMS.txt', {
      expectedBytes: Buffer.byteLength(IPHONE_STRESS_PACK_SHA256SUMS, 'utf8'),
    }).toString('utf8'),
    IPHONE_STRESS_PACK_SHA256SUMS,
    'SHA256SUMS.txt does not match the certified CSV set.',
  )

  assert.equal(
    readRegularFile(canonicalDirectory, 'README_先读.md', {
      expectedBytes: Buffer.byteLength(IPHONE_STRESS_PACK_README, 'utf8'),
    }).toString('utf8'),
    IPHONE_STRESS_PACK_README,
    'README_先读.md does not match the certified safety instructions.',
  )
  assert.equal(
    readRegularFile(canonicalDirectory, 'RESULTS_NOT_RUN.md', {
      expectedBytes: Buffer.byteLength(IPHONE_STRESS_PACK_RESULTS_TEMPLATE, 'utf8'),
    }).toString('utf8'),
    IPHONE_STRESS_PACK_RESULTS_TEMPLATE,
    'RESULTS_NOT_RUN.md does not match the certified NOT_RUN template.',
  )

  return {
    directory: canonicalDirectory,
    files: verifiedFiles,
    generatedAt: manifest.generatedAt,
    packId: manifest.packId,
    status: manifest.status,
  }
}

function isDirectExecution() {
  return process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isDirectExecution()) {
  assert.equal(
    process.argv.length,
    3,
    'Usage: npm run verify:iphone-stress-pack -- /absolute/path/to/pack',
  )
  const result = verifyIphoneStressPack(process.argv[2])
  console.log('iPhone fictional stress pack verification passed.')
  console.log(result)
}
