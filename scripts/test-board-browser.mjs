// 虚构数据. Test the real panel and transport against a loopback-only double.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {setTimeout as delay} from 'node:timers/promises'
import {build} from 'vite'
import react from '@vitejs/plugin-react'
import {accepts} from '../leaderboard/contract.js'
const chrome=process.env.CHROME_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome')
const temp=await mkdtemp(join(tmpdir(),'fictional-board-'))
const calls=[]
const server=createServer(async(req,res)=>{
  try {
    if(req.url.startsWith('/api/leaderboard')){
      const body=[]
      for await(const part of req)body.push(part)
      calls.push({method:req.method,body:Buffer.concat(body).toString(),url:req.url,auth:req.headers.authorization})
      res.setHeader('Content-Type','application/json')
      res.end(JSON.stringify(req.method==='GET'?{rows:[]}:{status:req.method==='DELETE'?'withdrawn':'listed'}));return
    }
    if(req.url.startsWith('/board.js') || req.url.startsWith('/board.css')){
      const css=req.url.startsWith('/board.css')
      res.setHeader('Content-Type',css?'text/css':'application/javascript')
      res.end(await readFile(join(temp,css?'board.css':'board.js')));return
    }
    res.setHeader('Content-Type','text/html')
    res.end('<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/board.css"><main id="root"></main><script type="module" src="/board.js"></script>')
  } catch {res.writeHead(500);res.end()}
})
let browser, socket
try {
  await build({configFile:false,plugins:[react()],logLevel:'warn',define:{'process.env.NODE_ENV':'"production"'},
    build:{outDir:temp,emptyOutDir:false,lib:{entry:'tests/fixtures/leaderboard-fictional.tsx',formats:['es'],fileName:()=> 'board.js',cssFileName:'board'}}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin='http://127.0.0.1:'+server.address().port
  const profile=join(temp,'profile')
  browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
  let port
  for(let i=0;i<120 && !port;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]}catch{await delay(100)}}
  assert(port,'Chrome failed to start')
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  let sequence=0
  const pending=new Map()
  socket.onmessage=({data})=>{const msg=JSON.parse(data);if(!pending.has(msg.id))return
    const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(Error(msg.error.message)):resolve(msg.result)}
  function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
  async function ev(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true});assert(!result.exceptionDetails,result.exceptionDetails?.exception?.description);return result.result.value}
  async function wait(expression){for(let i=0;i<100;i++){if(await ev(`Boolean(${expression})`))return;await delay(50)}throw Error('Missing: '+expression)}
  for(const [width,height] of [[393,852],[844,390]])for(const locale of ['zh-CN','zh-TW','en']){
    const initial=calls.length
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile:true,deviceScaleFactor:1})
    await send('Page.navigate',{url:origin+'/?locale='+locale})
    await wait("document.querySelector('[aria-expanded=false]')")
    await ev("document.querySelector('[aria-expanded=false]').click()")
    await wait("document.querySelector('pre')")
    assert.equal(calls.length,initial)
    assert(await ev("!document.querySelector('[type=checkbox]').checked && document.querySelectorAll('.closed-board button')[1].disabled"))
    assert(await ev("document.documentElement.scrollWidth <= innerWidth"))
    assert(await ev("[...document.querySelectorAll('.closed-board button')].every(b=>b.innerText.trim() && b.getBoundingClientRect().height>=44 && b.getBoundingClientRect().width>=44)"))
    if(width===393 && process.env.CARD_LAYOUT_QA_DIR){await mkdir(process.env.CARD_LAYOUT_QA_DIR,{recursive:true})
      const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(process.env.CARD_LAYOUT_QA_DIR,locale+'-self-reported.png'),Buffer.from(data,'base64'))}
    await ev("document.querySelector('a[download]').addEventListener('click',e=>e.preventDefault(),{once:true});document.querySelector('a[download]').click()")
    assert(await ev("document.querySelectorAll('.closed-board button')[1].disabled"))
    const receipt=await ev("decodeURIComponent(document.querySelector('a[download]').href.split(',')[1])")
    await ev("document.querySelector('[type=checkbox]').click()")
    await wait("!document.querySelectorAll('.closed-board button')[1].disabled")
    await ev("const submit=document.querySelectorAll('.closed-board button')[1];submit.click();submit.click()")
    await wait("document.querySelector('[role=status]').innerText.trim()")
    assert.equal(calls.length,initial+1)
    const post=calls.at(-1)
    assert.equal(post.method,'POST');assert.equal(post.url,'/api/leaderboard')
    assert(accepts(JSON.parse(post.body),new Date()));assert(!post.body.includes('FICTIONAL-NEVER-SEND'))
    assert(!post.body.includes(receipt.split('.')[1]));assert.equal(post.auth,undefined)
    await ev("document.querySelectorAll('.closed-board button')[2].click()")
    await wait("!document.querySelectorAll('.closed-board button')[2].disabled")
    assert.equal(calls.at(-1).method,'GET')
    await ev(`const field=document.querySelector('input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(receipt)});field.dispatchEvent(new Event('input',{bubbles:true}))`)
    await wait("!document.querySelectorAll('.closed-board button')[3].disabled")
    await ev("document.querySelectorAll('.closed-board button')[3].click()")
    await wait("document.querySelector('input[type=password]').value===''")
    assert.equal(calls.at(-1).method,'DELETE')
    assert.equal(calls.at(-1).auth,'Bearer '+receipt.split('.')[1])
  }
  console.log('Three languages, two viewports, opt-in, one POST, group read and withdrawal passed.')
} finally {
  socket?.close()
  if(browser && browser.exitCode===null){const ended=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await ended}
  server.closeAllConnections();server.close();await rm(temp,{recursive:true,force:true,maxRetries:3})
}
