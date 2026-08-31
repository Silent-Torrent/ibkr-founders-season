import assert from 'node:assert/strict'
import { createServer } from 'vite'
import {
  generateSyntheticDuplicateTradesStatement,
  generateSyntheticCapacityStatement,
  generateSyntheticFiiMaterializationStatement,
  generateSyntheticFiiCandidateMappingsStatement,
  SYNTHETIC_CAPACITY_EVENTS,
  SYNTHETIC_CAPACITY_SYMBOLS,
} from './synthetic-capacity-statement.mjs'

if (typeof global.gc !== 'function') {
  throw new Error('Run this diagnostic with node --expose-gc.')
}

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const fixtureName = process.argv[2] ?? 'capacity'
const fixtures = {
  capacity: {
    events: SYNTHETIC_CAPACITY_EVENTS,
    generate: () => generateSyntheticCapacityStatement(),
    symbols: SYNTHETIC_CAPACITY_SYMBOLS,
  },
  'duplicate-trades': {
    events: 1,
    generate: () => generateSyntheticDuplicateTradesStatement(),
    symbols: 1,
  },
  'fii-after': {
    events: 1,
    generate: () => generateSyntheticFiiMaterializationStatement({
      noiseOrder: 'after',
    }),
    symbols: 1,
  },
  'fii-before': {
    events: 1,
    generate: () => generateSyntheticFiiMaterializationStatement({
      noiseOrder: 'before',
    }),
    symbols: 1,
  },
  'candidate-fii': {
    events: 0,
    generate: () => generateSyntheticFiiCandidateMappingsStatement(),
    symbols: 1,
  },
}
const fixture = fixtures[fixtureName]
assert(fixture, `Unknown memory fixture: ${fixtureName}`)

try {
  const { parseIbkrActivityStatement } = await vite.ssrLoadModule(
    '/src/lib/ibkr.ts',
  )
  const { events, symbols } = fixture
  const statement = fixture.generate()
  global.gc()
  const before = process.memoryUsage()
  const maxRssBefore = process.resourceUsage().maxRSS
  const startedAt = performance.now()
  const result = parseIbkrActivityStatement(statement.text, {
    accountComparisonSalt: 'parser-memory-diagnostic',
    currentDate: new Date(Date.UTC(2026, 7, 30, 12)),
  })
  const durationMs = performance.now() - startedAt
  const after = process.memoryUsage()
  const maxRssAfter = process.resourceUsage().maxRSS
  global.gc()
  const afterGc = process.memoryUsage()

  assert.deepEqual(result.errors, [])
  assert.equal(result.report?.symbols.length, symbols)
  assert.equal(result.report?.events.length, events)

  const mib = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10
  console.log({
    fixture: fixtureName,
    durationMs: Math.round(durationMs * 10) / 10,
    heapBeforeMiB: mib(before.heapUsed),
    heapAfterMiB: mib(after.heapUsed),
    heapDeltaMiB: mib(after.heapUsed - before.heapUsed),
    heapAfterGcMiB: mib(afterGc.heapUsed),
    liveHeapDeltaMiB: mib(afterGc.heapUsed - before.heapUsed),
    maxRssBefore,
    maxRssAfter,
    maxRssDelta: maxRssAfter - maxRssBefore,
    rows: statement.rowCount,
    bytes: statement.byteLength,
    symbols: result.report.symbols.length,
    events: result.report.events.length,
  })
} finally {
  await vite.close()
}
