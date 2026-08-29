import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const statementPath = process.argv[2]
if (!statementPath) {
  console.error('Usage: npm run verify:private-statement -- /absolute/path/to/statement.csv')
  process.exit(2)
}

const projectRoot = resolve(import.meta.dirname, '..')
const output = mkdtempSync(join(tmpdir(), 'pnl-arena-private-parser-'))
const localTsc = resolve(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
)
const tsc = existsSync(localTsc) ? localTsc : 'tsc'

try {
  execFileSync(
    tsc,
    [
      '--ignoreConfig',
      '--ignoreDeprecations', '6.0',
      '--target', 'ES2022',
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--strict',
      '--esModuleInterop',
      '--outDir', output,
      resolve(projectRoot, 'src/types.ts'),
      resolve(projectRoot, 'src/lib/csv.ts'),
      resolve(projectRoot, 'src/lib/ibkr.ts'),
    ],
    { stdio: 'inherit' },
  )

  writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}\n')
  const require = createRequire(import.meta.url)
  const { parseIbkrActivityStatement } = require(join(output, 'lib/ibkr.js'))
  const statement = readFileSync(resolve(statementPath), 'utf8')
  const result = parseIbkrActivityStatement(statement)

  if (!result.report || result.errors.length > 0) {
    console.error({ errors: result.errors, warningCount: result.warnings.length })
    process.exitCode = 1
  } else {
    const eventCounts = result.report.events.reduce(
      (counts, event) => {
        counts[event.type] += 1
        return counts
      },
      { assignment: 0, exercise: 0, expiration: 0 },
    )

    console.log({
      seasonYear: result.report.seasonYear,
      period: `${result.report.startDate}..${result.report.endDate}`,
      baseCurrency: result.report.baseCurrency,
      canonicalSeasonPnlFound: Number.isFinite(result.report.seasonPnl),
      seasonReturnFound: result.report.seasonReturn != null,
      statementPeriodPnlFound: result.report.statementPeriodTotalPnl != null,
      navEndpointsFound:
        result.report.beginningNav != null && result.report.endingNav != null,
      reconciliations: result.report.reconciliations.map((check) => ({
        id: check.id,
        status: check.status,
        differenceIsZero: check.difference === 0,
        sourceRefCount: check.sourceRefs.length,
      })),
      metricSourceRefCount: Object.values(result.report.metricSourceRefs).reduce(
        (count, refs) => count + refs.length,
        0,
      ),
      underlyingCount: result.report.symbols.length,
      eventCounts,
      sectionCount: result.report.sections.length,
      warningCount: result.warnings.length,
      dataQuality: result.report.dataQuality,
    })
  }
} finally {
  rmSync(output, { recursive: true, force: true })
}
