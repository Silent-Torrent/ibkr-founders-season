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
  const {classify,personaCopy,mascot}=await vite.ssrLoadModule('/src/lib/persona.ts')
  const {encodeBattle,decodeBattle,rankRows}=await vite.ssrLoadModule('/src/lib/battleCode.ts')
  const payload={percent:-1.25,division:'retailLeague',medals:[6,2]}
  const code=encodeBattle(payload)
  assert.deepEqual(decodeBattle(code),payload)
  assert.equal(encodeBattle({...payload,amount:987654,account:'FICTIONAL',ticker:'FICT'}),code)
  assert.throws(()=>decodeBattle(code.replace('-125','125')))
  assert.throws(()=>decodeBattle(code+'!'))
  assert.throws(()=>encodeBattle({...payload,medals:[1,2,3,4]}))
  const { battlePoster } = await vite.ssrLoadModule('/src/lib/battlePoster.ts')
  for (const locale of ['zh-CN', 'zh-TW', 'en']) {
    const mine = { percent: 0, division: undefined, medals: [], source: 'Fictional demo', amount: 987654, account: 'PRIVATE-FICTIONAL' }
    const poster = battlePoster(mine, decodeBattle(code), locale)
    assert.equal(poster.sides[0].returnLabel, '0%')
    assert.equal(poster.sides[0].sign, '')
    assert.equal(poster.sides[1].returnLabel, '-1.25%')
    assert.equal(poster.sides[1].sign, 'negative')
    assert.deepEqual(poster.sides[1].medals.map(medal => medal.id), [6, 2])
    assert.doesNotMatch(JSON.stringify(poster), /987654|PRIVATE-FICTIONAL|PL1~/)
    assert.notEqual(battlePoster({ ...mine, percent: undefined }, decodeBattle(code), locale).sides[0].returnLabel, '0%')
  }
  assert.deepEqual(rankRows([{label:'B',value:-2},{label:'A',value:-2},{label:'C',value:-3}]).map(r=>[r.label,r.rank]),[['A',1],['B',1],['C',3]])
  assert.equal(rankRows([{label:'A',value:-3}])[0].rank,1)
  const samples=readFileSync(new URL('../tests/fixtures/personas-fictional.csv',import.meta.url),'utf8').trim().split('\n').slice(1)
  for (const [id,row] of samples.entries()) {
    const [,key,v,key2,v2]=row.split(',')
    assert.equal(classify({[key]:Number(v),...(key2?{[key2]:v2==='true'}:{})}),id)
  }
  assert.equal(classify({}),undefined)
  assert.equal(classify({ordersPerWeek:4.99}),undefined)
  assert.equal(classify({holdDays:180,ordersPerWeek:5}),0)
  for(const locale of ['en','zh-CN','zh-TW']){
    const r={netLiquidationValue:100,cashValue:1,persona:3,medalValues:[0,-4,1]}
    assert.equal(personaCopy(r,locale,true).tags.length,2)
    assert.deepEqual(personaCopy(r,locale,false).tags,[])
  }
  assert.equal(new Set([24999,25000,100000,500000,1000000].map(netLiquidationValue=>mascot({baseCurrency:'USD',netLiquidationValue}))).size,5)
  const {validSelection,displayedMedals,bagholder,nextTarget}=await vite.ssrLoadModule('/src/lib/medalCollection.ts')
  const {isMedalSelection} = await vite.ssrLoadModule('/src/lib/medalCollection.ts')
  for (const invalid of [null, {}, '0', [0,1,2,3], [-1], [18], [1,1], [0,'GME'], [{amount:2}], [0.5]]) {
    assert.equal(isMedalSelection(invalid), false)
  }
  for (const allowed of [[], [0], [0,1,17]]) assert.equal(isMedalSelection(allowed), true)
  assert.deepEqual(validSelection([1,2,3,4]),[1,2,3])
  assert.deepEqual(validSelection([null,true,-1,18,1,1]),[1])
  assert.deepEqual(displayedMedals([120,-1,1], [2,1]),[2,1])
  assert.deepEqual(displayedMedals([0,0,1], [1]),[2])
  assert.deepEqual(displayedMedals([], [2]),[])
  assert.equal(bagholder([]),undefined)
  assert.equal(bagholder([179,0,0]),0)
  assert.equal(bagholder([180,0,0]),1)
  assert.equal(bagholder([270,-1,1]),4)
  assert.equal(nextTarget(0,233),270)
  assert.equal(nextTarget(0,270),365)
  assert.equal(nextTarget(0,365),undefined)
  assert.equal(nextTarget(6,0),1)
  assert.equal(nextTarget(6,10),20)
  assert.equal(nextTarget(6,20),undefined)
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
          n > 0 && n < 12 ? 'less than 1 bowl' : Math.floor(n / 12) + ' bowls',
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
  const {stories}=await vite.ssrLoadModule('/src/lib/seasonStories.ts')
  for (const l of ['zh-CN','zh-TW','en']){
    const pages=stories(imported.report,l,defaults)
    assert(pages.length>=8 && pages.length<=10)
    assert(!JSON.stringify(pages).includes('FICTLOSS'))
    assert.deepEqual(stories({...imported.report,source:'demo'},l,defaults),[])
    assert.equal(stories({source:'local',seasonYear:2026},l,defaults).length,1)
  }
  assert.equal(imported.report.source,'synthetic')
  assert(isWorkerParseResultWithinLimits(imported,options.currentDate.getTime()))
  assert(imported.report.reconciliations.every(r=>r.status==='PASS_EXACT'))
  const lossSymbol = imported.report.symbols.find(s => s.symbol === 'FICTLOSS')
  assert(lossSymbol.totalYtdMtm < 0 && lossSymbol.totalRealizedYtd < 0)
  assert.equal(medalOutcome(6, imported.report, 'zh-TW', defaults).tier, 2)
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
  const {createElement}=await import('react')
  const {renderToStaticMarkup}=await import('react-dom/server')
  const {MedalWall}=await vite.ssrLoadModule('/src/components/MedalWall.tsx')
  for(const [locale,tiers,earned] of [['en',['Bronze','Silver','Gold'],'Earned'],['zh-CN',['铜','银','金'],'已获得'],['zh-TW',['銅','銀','金'],'已獲得']]){
    for(let tier=0;tier<3;tier++){
      const values=Array(18).fill(1)
      values[0]=[120,180,270][tier]; values[6]=[1,5,10][tier]
      const html=renderToStaticMarkup(createElement(MedalWall,{report:{...demoReport,medalValues:values},locale}))
      const cards=[...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)]
      assert.equal(cards.length,18)
      for(const [i,card] of cards.entries()){
        const ranked=i===0||i===6
        assert(card[1].split('</summary>')[0].includes('<small>'+(ranked?tiers[tier]:earned)+'</small>'))
        if(ranked)assert(card[1].includes(' · '+tiers[tier]+'</p>'))
      }
    }
  }
  const {medals,local} = await vite.ssrLoadModule('/src/data/medals.ts')
  assert.equal(local(medals[4][0],'zh-CN'),'末日轮骑士')
  assert.equal(defaults.roast,true)
  assert.equal(defaults.amount,false)
  assert.equal(medalOutcome(1,imported.report,'en',defaults).detail,'')
  assert(medalOutcome(1,imported.report,'en',{...defaults,amount:true}).detail.includes('$'))
  for (const locale of ['zh-CN','zh-TW','en']) {
    for (const medal of medals) {
      for (const line of medal.slice(1)) assert.match(local(line,locale), /[。！？.!?]$/u, local(line,locale))
    }
  }
  const {Settings} = await vite.ssrLoadModule('/src/components/Preferences.tsx')
  for (const [locale, fractional] of [['en','less than 1 bowl'], ['zh-CN','不到 1 碗'], ['zh-TW','不到 1 碗']]) {
    for (const fee of [0, 0.01, 11.99, 12]) {
      const report = {...imported.report, medalValues:[...imported.report.medalValues]}
      report.medalValues[7] = fee
      const prefs = {...defaults, prices:{USD:12}}
      const badge = medalOutcome(7, report, locale, prefs)
      assert.equal(badge.earned, fee > 0)
      assert.equal(ramen(report, locale, prefs).includes(fractional), fee > 0 && fee < 12)
      assert.equal(badge.detail.includes(fractional), fee > 0 && fee < 12)
    }
    for (const roast of [true, false]) {
      const html = renderToStaticMarkup(createElement(Settings.Provider, {value:{prefs:{...defaults,roast}}},
        createElement(MedalWall,{report:imported.report,locale})))
      const cards = [...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)]
      assert.equal(cards.length, 18)
      const hotRules = new Set(), hotQuips = new Set()
      for (const [index,card] of cards.entries()) {
        const paragraphs = [...card[1].matchAll(/<p(?: [^>]*)?>(.*?)<\/p>/g)].map(m=>m[1])
        const clauses = paragraphs.flatMap(p=>p.split(/[，。！？,.!?]+/u)).map(s=>s.trim().toLowerCase()).filter(Boolean)
        clauses.forEach((s,i)=>assert.notEqual(s,clauses[i-1],locale+' duplicate in medal '+index))
        if (index >= 14) {
          hotRules.add(paragraphs[0])
          hotQuips.add(paragraphs.at(-1))
        }
      }
      assert.equal(hotRules.size, 4)
      assert.equal(hotQuips.size, 4)
    }
  }
  const {englishNoun,sourceRowCount}=await vite.ssrLoadModule('/src/lib/countLabel.ts')
  for(const n of [1,2]){
    for(const noun of ['payer','day','bowl','source row','CSV section','Assignment','Exercise','Expiration','Local achievement','Fictional sample medal','Legacy achievement'])
      assert.equal(englishNoun(n,noun),noun+(n===1?'':'s'))
    const report={...demoReport,medalValues:[...demoReport.medalValues]}
    report.medalValues[6]=n
    assert.equal(medalOutcome(6,report,'en',defaults).detail,n===1?'1 payer':'2 payers')
    assert.equal(sourceRowCount('en',n),n===1?'1 source row':'2 source rows')
  }
  console.log(count + ' fictional medal cases passed across all 18 rules.')
} finally {
  await vite.close()
}
