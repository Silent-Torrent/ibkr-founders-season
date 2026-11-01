import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
})
try {
  const { medalIndex, validMedalValues } = await vite.ssrLoadModule(
    '/src/lib/medalRules.ts',
  )
  const { parseCsvRows } = await vite.ssrLoadModule('/src/lib/csv.ts')
  const rows = parseCsvRows(
    readFileSync(
      new URL('../tests/fixtures/season-medals-fictional.csv', import.meta.url),
      'utf8',
    ),
  )
  let current,
    idx,
    count = 0
  const counts = new Map()
  function check() {
    if (!current) return
    const [, , id, scenario, expected, end] = current
    const result = idx.finish(end, 'USD')
    assert(validMedalValues(result))
    assert.equal(
      result[Number(id) - 1],
      Number(expected),
      id + ' / ' + scenario,
    )
    counts.set(id, (counts.get(id) ?? 0) + 1)
    count++
  }
  for (const row of rows) {
    if (row[0] === 'Scenario') {
      check()
      current = row
      idx = medalIndex()
    } else idx?.visit(row)
  }
  check()
  assert.equal(counts.size, 18)
  assert([...counts.values()].every((n) => n >= 3))
  assert.equal(medalIndex().finish('2026-10-01', 'USD')[7], null)
  console.log(count + ' fictional medal cases passed across all 18 rules.')
} finally {
  await vite.close()
}
