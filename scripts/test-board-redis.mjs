// 虚构数据. CI's disposable loopback Redis only; no Marketplace credentials.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mutate, moderate, rate} from '../server/store.js'
const container = process.env.FICTIONAL_REDIS_CONTAINER
assert.match(container ?? '', /^[a-f0-9]{12,64}$/)
const redis = (...args) => execFileSync('docker',['exec',container,'redis-cli','--raw',...args.map(String)],{encoding:'utf8'}).trim()
const expiry=Math.floor(Date.now()/1000)+3600
const run=(id,state,json='{}', season='lb:fictional', day='lb:fictional-day')=>
  redis('EVAL',mutate,3,season,'lb:fictional-stop',day,id,state,json,expiry,expiry)
assert.equal(run('demo1','listed'),'listed')
assert.equal(run('demo1','listed'),'listed')
assert.equal(run('demo1','listed','{"fake":1}'),'conflict')
assert.equal(run('demo2','pending'),'pending')
assert.equal(redis('HEXISTS','lb:fictional','a:demo2'),'0')
assert.equal(redis('EVAL',moderate,1,'lb:fictional','demo2','approve'),'1')
assert.equal(redis('HEXISTS','lb:fictional','a:demo2'),'1')
assert.equal(redis('EXPIRETIME','lb:fictional'),String(expiry))
redis('SET','lb:fictional-stop',1)
assert.equal(run('demo3','listed'),'paused')
assert.equal(run('demo1','withdraw'),'withdrawn')
assert.equal(redis('HLEN','lb:fictional'),'1')
assert.equal(redis('EVAL',rate,1,'lb:fictional-rate'),'1')
assert.equal(redis('EVAL',rate,1,'lb:fictional-rate'),'2')
assert(Number(redis('TTL','lb:fictional-rate'))>0)
redis('DEL','lb:fictional-stop')
const daily = 'lb:fictional-day-cap'
const season = 'lb:fictional-cap'
for (let i=0;i<10;i++) assert.equal(run('daily'+i,'pending','{}',season,daily),'pending')
assert.equal(run('daily0','pending','{}',season,daily),'pending') // retry at the limit
assert.equal(run('daily10','listed','{}',season,daily),'daily')
assert.equal(run('daily0','withdraw','{}',season,daily),'withdrawn')
assert.equal(run('daily10','pending','{}',season,daily),'daily')
assert.equal(redis('GET',daily),'10')
assert.equal(redis('EXPIRETIME',daily),String(expiry))
assert.equal(run('daily10','pending','{}',season,'lb:fictional-other-ip'),'pending')

// Seed up to the boundary in one command. Releasing a pending slot never refunds a daily quota.
redis('HSET',season,...Array.from({length:190},(_,i)=>['p:seed'+i,'{}']).flat())
const nextDay = 'lb:fictional-next-day'
assert.equal(run('overflow','pending','{}',season,nextDay),'full')
assert.equal(redis('EXISTS',nextDay),'0')
assert.equal(redis('EVAL',moderate,1,season,'seed0','approve'),'1')
assert.equal(run('overflow','pending','{}',season,nextDay),'pending')
assert.equal(run('independent','listed','{}',season,nextDay),'listed')
assert.equal(run('overflow2','pending','{}',season,nextDay),'full')
assert.equal(redis('EVAL',moderate,1,season,'seed1','reject'),'1')
assert.equal(run('overflow2','pending','{}',season,nextDay),'pending')
redis('HSET',season,...Array.from({length:298},(_,i)=>['a:fill'+i,'{}']).flat())
assert.equal(redis('HLEN',season),'500')
assert.equal(run('total-overflow','listed','{}',season,nextDay),'full')
console.log('Redis atomic idempotency, conflict, manual approval, stop, withdrawal and expiry passed.')
