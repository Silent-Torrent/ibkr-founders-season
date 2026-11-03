// 虚构数据. No credentials or external service.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createServer} from 'vite'
import {accepts, expiresAt, fields, medalCount} from '../leaderboard/contract.js'
import {handle} from '../api/leaderboard.js'
import {rate, mutate, publicRows} from '../leaderboard/store.js'

const vite = await createServer({server:{middlewareMode:true}, appType:'custom',logLevel:'silent'})
try {
  const {project} = await vite.ssrLoadModule('/leaderboard/projection.ts')
  const {demoReport} = await vite.ssrLoadModule('/src/data/demo.ts')
  const {medals} = await vite.ssrLoadModule('/src/data/medals.ts')
  assert.equal(medalCount, medals.length)
  const secret = 'ab'.repeat(32)
  const today = new Date('2026-11-03T00:00:00Z')
  const report = {...demoReport, source:'local', isYtd:true, endDate:'2026-11-01',
    netLiquidationValue:24000, seasonReturn:.123456, dataQuality:'good',
    accountIdMasked:'FICTIONAL_PRIVATE_ACCOUNT', symbols:[{symbol:'FICTIONAL_PRIVATE_SYMBOL'}]}
  const entry = project(report,[1,3],secret,today)
  const whitelist = ['asOf','division','id','medals','nickname','returnBps','source','year']
  assert.deepEqual(Object.keys(entry).sort(), whitelist)
  assert.deepEqual([...fields].sort(),whitelist)
  assert.equal(entry.returnBps,1235)
  assert(!/24000|FICTIONAL_PRIVATE|amount|account|symbol|trades/i.test(JSON.stringify(entry)))
  assert.equal(entry.id,createHash('sha256').update(secret).digest('hex').slice(0,32))
  for(const source of ['demo','synthetic']) assert.equal(project({...report,source},[],secret,today),undefined)
  for(const invalid of [{asOf:'2026-02-30'},{asOf:'2026-11-04'},{year:2025},{returnBps:.5},{source:'verified'},
    {medals:[1,2,3,4]},{medals:[1,1]},{medals:[18]},{account:'fictional'},{amount:0},{symbol:'fictional'},{nickname:'free text'}])
    assert(!accepts({...entry,...invalid},today))
  for(const key of fields){const missing={...entry};delete missing[key];assert(!accepts(missing,today))}
  assert.equal(expiresAt(2026), Date.parse('2027-04-01T00:00:00Z')/1000)
  const commands=[]
  let attempts=1
  const cmd=async args=>{
    commands.push(args)
    if(args[1]===rate)return attempts
    if(args[1]===mutate)return args[6]==='withdraw'?'withdrawn':args[6]
    return []
  }
  const env={LEADERBOARD_BETA:'enabled',LEADERBOARD_WRITES:'enabled',LEADERBOARD_ORIGIN:'https://beta.example',
    LEADERBOARD_RATE_SECRET:'fictional rate limiter for tests only'}
  const headers={host:'beta.example',origin:env.LEADERBOARD_ORIGIN,'x-vercel-forwarded-for':'192.0.2.5','content-type':'application/json'}
  async function call(method,body,query='',additional={}){
    const res={status(n){this.code=n;return this},json(value){this.value=value},setHeader(){}}
    await handle(cmd,env,()=>today)({method,body,url:'/api/leaderboard'+query,headers:{...headers,...additional}},res)
    return [res.code,res.value]
  }
  assert.deepEqual(await call('POST',entry),[200,{status:'listed'}])
  assert.deepEqual(JSON.parse(commands.at(-1)[7]),entry)
  assert.deepEqual(await call('POST',{...entry,returnBps:10001}),[200,{status:'pending'}])
  assert.deepEqual(await call('POST',{...entry,returnBps:-10000}),[200,{status:'listed'}])
  assert.equal((await call('POST',{...entry,amount:1}))[0],400)
  assert.equal((await call('POST',entry,'',{origin:'https://foreign.example'}))[0],403)
  attempts=6;assert.equal((await call('POST',entry))[0],429);attempts=1
  env.LEADERBOARD_WRITES='off';assert.equal((await call('POST',entry))[0],503)
  assert.equal((await call('DELETE',null,'?year=2026',{authorization:'Bearer '+secret}))[0],200)
  assert.equal(commands.at(-1)[5],entry.id)
  const hash=Array.from({length:10},(_,i)=>['a:'+i,JSON.stringify({...entry,id:String(i),returnBps:i<2?5:2})]).flat()
  assert.equal(publicRows(hash.slice(2),entry.division).length,0)
  assert.equal(publicRows(['p:abc',hash[1],...hash.slice(2)],entry.division).length,0)
  assert.equal(publicRows(hash,'capitalLeague').length,0)
  assert.deepEqual(publicRows(hash,entry.division).map(r=>r.rank),[1,1,3,3,3,3,3,3,3,3])
  const rules=JSON.parse(readFileSync('vercel.json','utf8')).rewrites
  assert(!new RegExp('^'+rules[0].source+'$').test('/api/leaderboard'))
  assert.equal(new RegExp('^'+rules[0].source+'$').test('/arena'),true)
  console.log('Self-reported payload, suppression, withdrawal, moderation and rate contracts passed.')
} finally {await vite.close()}
