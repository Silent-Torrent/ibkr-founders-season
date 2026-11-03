// 虚构数据. CI's disposable loopback Redis only; no Marketplace credentials.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mutate, moderate, rate} from '../leaderboard/store.js'
const container = process.env.FICTIONAL_REDIS_CONTAINER
assert.match(container ?? '', /^[a-f0-9]{12,64}$/)
const redis = (...args) => execFileSync('docker',['exec',container,'redis-cli','--raw',...args.map(String)],{encoding:'utf8'}).trim()
const expiry=Math.floor(Date.now()/1000)+3600
const run=(id,state,json='{}')=>redis('EVAL',mutate,2,'lb:fictional','lb:fictional-stop',id,state,json,expiry)
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
console.log('Redis atomic idempotency, conflict, manual approval, stop, withdrawal and expiry passed.')
