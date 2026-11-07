// Only the built-in fictional demo, served on loopback. No file import or credentials.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { preview } from 'vite'

const destination = process.env.CARD_LAYOUT_QA_DIR
assert(destination, 'Set CARD_LAYOUT_QA_DIR for poster screenshots')
await mkdir(destination, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'poster-demo-'))
const server = await preview({preview: {host: '127.0.0.1', port: 0}})
const browser = spawn(process.env.CHROME_PATH || 'google-chrome', [
  '--headless=new', '--disable-background-networking', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
])
let socket
try {
  let port
  for (let i=0; i<100 && !port; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] }
    catch { await delay(100) }
  }
  assert(port, 'Chrome did not open DevTools')
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve,reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map()
  socket.onmessage = ({data}) => {
    const {id,result,error} = JSON.parse(data)
    const command = pending.get(id)
    if (command) { pending.delete(id); error ? command.reject(Error(error.message)) : command.resolve(result) }
  }
  function send(method, params={}) {
    return new Promise((resolve,reject) => {
      const id = ++sequence
      pending.set(id,{resolve,reject})
      socket.send(JSON.stringify({id,method,params}))
    })
  }
  async function evaluate(expression) {
    const {result,exceptionDetails} = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
    assert(!exceptionDetails,exceptionDetails?.exception?.description)
    return result.value
  }
  async function waitFor(selector) {
    for (let i=0;i<120;i++) {
      if (await evaluate('Boolean(document.querySelector('+JSON.stringify(selector)+'))')) return
      await delay(50)
    }
    throw Error('Missing demo element ' + selector)
  }
  async function capture(name, selector) {
    await waitFor(selector)
    await evaluate(`(async()=>{
      await document.fonts.ready
      if (${JSON.stringify(selector)}==='main') window.scrollTo(0,0)
      else document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
    })()`)
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), name+' overflows')
    const {data} = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    await writeFile(join(destination, name+'.png'),Buffer.from(data,'base64'))
  }
  for (const [size,width,height] of [['mobile',390,844],['desktop',1440,900]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile:size==='mobile',deviceScaleFactor:1})
    await send('Page.navigate',{url:server.resolvedUrls.local[0]})
    await waitFor('main')
    await evaluate(`localStorage.clear()`)
    await send('Page.navigate',{url:server.resolvedUrls.local[0]})
    await waitFor('[data-action="welcome-primary"]')
    await evaluate(`(()=>{const lang=document.querySelector('.language-select'); lang.value='zh-CN';lang.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await capture(size+'-00-welcome','main')
    await evaluate(`document.querySelector('[data-action="welcome-primary"]').click()`)
    await waitFor('.source-pill.demo')
    for (const [page,section] of [['ledger','.share-card-preview'],['trophies','.medal-wall'],['import',null],['arena','.podium']]) {
      await evaluate(`document.querySelector('.side-nav [data-page="${page}"]').click()`)
      await waitFor('.page-content[data-page="'+page+'"]')
      await capture(size+'-'+page,'main')
      if(section) await capture(size+'-'+page+'-detail',section)
      if(page==='arena'){
        await evaluate(`(()=>{const select=document.querySelector('option[value=league]').parentElement;select.value='league';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
        await capture(size+'-arena-controls','.arena-controls')
        assert(await evaluate(`(()=>{
          const panel=document.querySelector('.local-arena'), control=panel.querySelector('select'), s=getComputedStyle(control)
          return parseFloat(getComputedStyle(panel).paddingLeft)>=18 && s.backgroundColor==='rgb(23, 23, 23)' && s.appearance==='none' && parseFloat(s.borderRadius)>=24
        })()`),'Arena padding or capsule selector regressed')
        await capture(size+'-league-standing','.league-standing')
        assert(await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('[data-current-player]'));return s.backgroundColor==='rgb(244, 239, 230)'&&s.color==='rgb(11, 11, 11)'&&s.position==='static'})()`),'Own standing must stay highlighted in the list')
        await capture(size+'-battle-code','.local-arena input[maxlength]')
        assert(await evaluate(`(()=>{
          const input=getComputedStyle(document.querySelector('.local-arena input[maxlength]'))
          const buttons=[...document.querySelectorAll('.local-arena button')]
          return input.backgroundColor==='rgb(23, 23, 23)' && buttons.every(b=>{const s=getComputedStyle(b);return s.backgroundColor==='rgb(244, 239, 230)' && s.color==='rgb(11, 11, 11)' && parseFloat(s.borderRadius)>=24})
        })()`),'Battle actions must use paper buttons and dark inputs')
        if(width===390) assert(await evaluate("document.querySelector('.podium li strong').getBoundingClientRect().width > 120"),'Narrow podium label')
      }
    }
  }
} finally {
  socket?.close()
  if (browser.exitCode===null) {
    const exited=new Promise(resolve=>browser.once('exit',resolve))
    browser.kill(); await exited
  }
  await new Promise(resolve=>server.httpServer.close(resolve))
  await rm(profile,{recursive:true,force:true,maxRetries:3})
}
