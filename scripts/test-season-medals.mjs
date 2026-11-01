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
  const { medalOutcome, defaults, ramen } = await vite.ssrLoadModule(
    '/src/lib/cardOptions.ts',
  )
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
    const i = Number(id) - 1,
      n = Number(expected)
    const report = {
      source: 'local',
      baseCurrency: 'USD',
      seasonYear: Number(end.slice(0, 4)),
      medalValues: result,
    }
    const badge = medalOutcome(i, report, 'en', defaults)
    assert.equal(badge.earned, n !== 0)
    assert.equal(
      badge.tier,
      n === 0
        ? null
        : i === 0
          ? n >= 270
            ? 2
            : n >= 180
              ? 1
              : 0
          : i === 6
            ? n >= 10
              ? 2
              : n >= 5
                ? 1
                : 0
            : null,
    )
    if (i === 1 || i >= 14) assert.equal(badge.detail, '')
    if (i === 1 && n < 0)
      assert.match(
        medalOutcome(i, report, 'en', { ...defaults, amount: true }).detail,
        /\$/,
      )
    if (i >= 14 && n)
      assert(
        medalOutcome(i, report, 'en', { ...defaults, hideTickers: false })
          .detail,
      )
    if (i === 7)
      assert(
        ramen(report, 'en', defaults).includes(
          String(Math.floor(n / 12)) + ' bowls',
        ),
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
  // Feed a fictional order block through both production parser entry points and
  // the Worker schema. Adding a medal must not change the YTD accounting result.
  const {parseIbkrActivityStatement,parseIbkrActivityStatementBlob}=await vite.ssrLoadModule('/src/lib/ibkr.ts')
  const {isWorkerParseResultWithinLimits}=await vite.ssrLoadModule('/src/lib/workerOutputLimits.ts')
  const baseline=readFileSync(new URL('../tests/fixtures/ibkr-current-schema-synthetic.csv',import.meta.url),'utf8')
  const start=rows.findIndex(row=>row[0]==='Scenario' && row[2]==='16' && row[5]==='2026-12-31')
  assert(start>=0)
  const block=rows.slice(start+1)
  const stop=block.findIndex(row=>row[0]==='Scenario')
  const extra=block.slice(0,stop).filter(row=>row[1]!=='Total').map(row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(',')).join('\n')
  const text=baseline.split('\n').filter(line=>!['Trades,','Open Positions,','Dividends,','Fees,'].some(s=>line.startsWith(s))).join('\n')+'\n'+extra
  const options={currentDate:new Date('2026-08-30T12:00:00Z')}
  const sync=parseIbkrActivityStatement(text,options)
  assert.deepEqual(sync.errors,[])
  const streamed=await parseIbkrActivityStatementBlob(new Blob([text]),options)
  assert.deepEqual(streamed,sync)
  assert(isWorkerParseResultWithinLimits(streamed,options.currentDate.getTime()))
  assert.equal(sync.report.medalValues[15],1)
  assert.equal(sync.report.seasonPnl,parseIbkrActivityStatement(baseline,options).report.seasonPnl)
  const {cardTheme,priceFor}=await vite.ssrLoadModule('/src/lib/cardOptions.ts')
  const losing={...sync.report,seasonReturn:-0.1,medalValues:[...sync.report.medalValues]}
  assert.equal(cardTheme(losing,'en',defaults,'auto').feast,false)
  losing.medalValues[7]=0.3
  assert.match(ramen(losing,'en',{...defaults,prices:{USD:0.1}}),/3 bowls/)
  assert.equal(priceFor(defaults,'zh-CN','USD'),2)
  assert.equal(priceFor(defaults,'zh-TW','USD'),3)
  assert.equal(priceFor(defaults,'en','EUR'),undefined)
  const missing=medalIndex()
  // Remove real columns from the same fictional block. Rule-specific absence
  // must not discard an independently provable ticker match.
  for(const row of block.slice(0,stop)) {
    if(row[0]==='Trades' && row[1]==='Header') missing.visit(row.map(k=>['T. Price','Comm/Fee','Date/Time'].includes(k)?'Missing '+k:k))
    else missing.visit(row)
  }
  const partial=missing.finish('2026-08-15','USD')
  assert.equal(partial[2],null)
  assert.equal(partial[7],null)
  assert.equal(partial[10],null)
  assert.equal(partial[15],1)
  const {buildSeasonSummary}=await vite.ssrLoadModule('/src/lib/shareCard.ts')
  for(const locale of ['en','zh-CN','zh-TW']){
    const text=buildSeasonSummary({...losing,seasonPnl:-9753},locale,defaults)
    assert(!text.includes('9,753')&&!text.includes('9753'))
    assert(text.includes(locale==='en'?'Not investment advice':locale==='zh-CN'?'非投资建议':'非投資建議'))
  }
  const full=readFileSync(new URL('../tests/fixtures/full-season-medals-fictional.csv',import.meta.url))
  const imported=await parseIbkrActivityStatementBlob(new Blob([full]),options)
  assert.deepEqual(imported.errors,[])
  assert.equal(imported.report.source,'synthetic')
  assert(isWorkerParseResultWithinLimits(imported,options.currentDate.getTime()))
  assert(imported.report.reconciliations.every(r=>r.status==='PASS_EXACT'))
  const lit=imported.report.medalValues.filter(Boolean).length
  assert(lit>=12)
  assert(imported.report.events.length>=2)
  const {demoReport}=await vite.ssrLoadModule('/src/data/demo.ts')
  assert.equal(demoReport.medalValues.filter(Boolean).length,7)
  assert.equal(medalOutcome(6,demoReport,'en',defaults).tier,2)
  assert.equal(medalOutcome(0,demoReport,'en',defaults).tier,1)
  assert(demoReport.medalValues[4]&&demoReport.medalValues[16])
  assert.match(ramen(demoReport,'en',defaults),/12 bowls/)
  console.log('Fictional Activity Statement: '+lit+'/18 medals. Built-in demo: 7/18.')
  for (const n of [0, 1, 2]) {
    const report = {...demoReport, medalValues: [...demoReport.medalValues]}
    report.medalValues[7] = n * 12
    assert.equal(ramen(report, 'en', defaults),
      `Your fees this season = ${n} ${n === 1 ? 'bowl' : 'bowls'} of ramen. Your broker says thanks.`)
    assert(ramen(report, 'zh-CN', defaults).includes(`${n * 6} 碗拉面`))
    assert(ramen(report, 'zh-TW', defaults).includes(`${n * 4} 碗拉麵`))
  }
  console.log(count + ' fictional medal cases passed across all 18 rules.')
} finally {
  await vite.close()
}
