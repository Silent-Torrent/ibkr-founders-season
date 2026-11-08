// Only the built-in fictional demo, served on loopback. No file import or credentials.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { preview } from 'vite'

const destination = process.env.CARD_LAYOUT_QA_DIR
assert(destination, 'Set CARD_LAYOUT_QA_DIR for poster screenshots')
await mkdir(destination, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'poster-demo-'))
assert(process.argv[2], 'Provide the immutable main baseline dist directory')
const servers = await Promise.all(['dist',process.argv[2]].map(outDir=>preview({build:{outDir:resolve(outDir)},preview:{host:'127.0.0.1',port:0}})))
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
      else if (${JSON.stringify(selector)}==='.medal-wall') {
        const y=document.querySelector('.medal-grid').getBoundingClientRect().top+scrollY
        window.scrollTo({top:y-(document.querySelector('.topbar')?.getBoundingClientRect().height??0)-20,behavior:'instant'})
      } else document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
    })()`)
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), name+' overflows')
    const {data} = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    await writeFile(join(destination, name+'.png'),Buffer.from(data,'base64'))
  }
  const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  for (const [phase,server] of [['before',servers[1]],['after',servers[0]]]) {
    for (const [size,width,height] of [['mobile',390,844],['desktop',1440,900]]) {
      const name=phase+'-'+size
      await send('Emulation.setDeviceMetricsOverride',{width,height,mobile:size==='mobile',deviceScaleFactor:1})
      await send('Page.navigate',{url:server.resolvedUrls.local[0]})
      await waitFor('main')
      await evaluate('localStorage.clear()')
      await send('Page.navigate',{url:server.resolvedUrls.local[0]})
      await waitFor('[data-action="welcome-primary"]')
      await evaluate("(()=>{const s=document.querySelector('.language-select');s.value='zh-CN';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
      await settle()
      await evaluate("document.querySelector('[data-action=welcome-primary]').click()")
      await waitFor('.share-card-preview')
      await evaluate("document.querySelector('[data-card-template=feast]').click()")
      await settle()
      await capture(name+'-share','.share-card-preview')
      // Intercept only the synthetic browser download, not production delivery code.
      const png=await evaluate(`(async()=>{
        const original=HTMLAnchorElement.prototype.click
        try {
          const data=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error('Missing demo PNG')),10000)
            HTMLAnchorElement.prototype.click=function(){clearTimeout(timer);resolve(this.href)}
            document.querySelector('[data-action=download-card]').click()
          })
          const img=new Image();img.src=data;await img.decode()
          const c=document.createElement('canvas');c.width=img.width;c.height=img.height
          const ctx=c.getContext('2d');ctx.drawImage(img,0,0)
          const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data].slice(0,3)
          return {data,left:pixel(c.width*.1,c.height*.02),right:pixel(c.width*.9,c.height*.02)}
        } finally {HTMLAnchorElement.prototype.click=original}
      })()`)
      await writeFile(join(destination,name+'-export.png'),Buffer.from(png.data.split(',')[1],'base64'))
      if(phase==='after') {
        assert.deepEqual(png.left,[255,43,43],'PNG diagonal must extend lower on the left')
        assert.notDeepEqual(png.right,[255,43,43],'PNG diagonal must taper on the right')
        assert(await evaluate(`(()=>{
          const score=document.querySelector('.share-pnl'), s=getComputedStyle(score)
          const settings=document.querySelectorAll('.batch-settings input[type=checkbox]')
          const pill=getComputedStyle(document.querySelector('.source-pill.demo'))
          return score.textContent.trim()==='+21.3%' && s.letterSpacing==='normal' && settings[0].checked && !settings[1].checked && !document.querySelector('.private-ledger').open && pill.borderTopColor==='rgb(244, 239, 230)'
        })()`),'Decimal spacing, poster badge or preference defaults regressed')
      }
      await evaluate("document.querySelector('.side-nav [data-page=arena]').click()")
      await waitFor('.local-arena')
      await evaluate("(()=>{const s=document.querySelector('option[value=league]').parentElement;s.value='league';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
      await settle()
      await capture(name+'-arena','.league-standing')
      await capture(name+'-leaderboard','.leaderboard-list')
      await capture(name+'-battle','.local-arena input[maxlength]')
      if(phase==='after') {
        assert(await evaluate(`(()=>{
          const self=document.querySelector('.current-player-row'), s=getComputedStyle(self)
          return document.querySelector('.standing-rank').textContent==='—' && self.querySelector('.rank-number').textContent==='—' && document.querySelectorAll('.current-player-row').length===1 && s.backgroundColor==='rgb(244, 239, 230)' && s.color==='rgb(11, 11, 11)'
        })()`),'Self comparison must be unranked and highlighted')
        for(const locale of ['zh-CN','zh-TW','en']) {
          await evaluate(`(()=>{const s=document.querySelector('.language-select');s.value=${JSON.stringify(locale)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
          await settle()
          const details=await evaluate(`(()=>{
            const block=document.querySelector('.battle-code'),input=block.querySelector('input'),label=input.parentElement
            const own=document.querySelector('.current-player-row .positive')
            return {overflow:document.documentElement.scrollWidth>innerWidth,gap:parseFloat(getComputedStyle(block).gap),inputWidth:input.getBoundingClientRect().width,labelWidth:label.getBoundingClientRect().width,gain:getComputedStyle(own).color}
          })()`)
          assert(!details.overflow && details.gap>=16 && details.inputWidth<=details.labelWidth+1,'Battle layout overflows '+locale)
          assert.equal(details.gain,locale==='zh-CN'?'rgb(255, 133, 141)':'rgb(104, 227, 173)')
        }
      }
    }
  }

} finally {
  socket?.close()
  if (browser.exitCode===null && browser.signalCode===null) {
    const exited=new Promise(resolve=>browser.once('exit',resolve))
    browser.kill(); await exited
  }
  await Promise.all(servers.map(server=>new Promise(resolve=>server.httpServer.close(resolve))))
  await rm(profile,{recursive:true,force:true,maxRetries:3})
}
