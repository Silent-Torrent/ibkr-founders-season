// Built-in demo and repository-owned fictional CSV only, served on loopback. No credentials.
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
    // Record overflow in the audit instead of losing later page evidence.
    const {data} = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    await writeFile(join(destination, name+'.png'),Buffer.from(data,'base64'))
  }
  const findings=[]
  async function inspect(name,selector){
    await capture(name,selector)
    const result=await evaluate(`(()=>{
      const color=s=>(s.match(/[\\d.]+/g)||[]).map(Number)
      const over=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)))
      const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
      const rows=[], clipped=[], gradients=[]
      const label=e=>e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):'')
      for(const e of document.querySelectorAll('body *')){
        if(!(e instanceof HTMLElement)||!e.checkVisibility()||e.closest('[inert],.sr-only,script,style,svg')||e.matches(':disabled'))continue
        const text=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()
        if(!text)continue
        const s=getComputedStyle(e), b=e.getBoundingClientRect()
        if(!b.width||!b.height)continue
        if(e.scrollWidth>e.clientWidth+2 && ['hidden','clip'].includes(s.overflowX))clipped.push({element:label(e),text,width:e.clientWidth,scroll:e.scrollWidth})
        let parents=[],p=e,gradient=false
        while(p){parents.unshift(p);p=p.parentElement}
        let bg=[11,11,11]
        for(const a of parents){const st=getComputedStyle(a);if(st.backgroundImage!=='none')gradient=true;bg=over(color(st.backgroundColor),bg)}
        if(gradient){gradients.push(label(e));continue}
        const fg=over(color(s.color),bg),a=luminance(fg),bgl=luminance(bg),ratio=(Math.max(a,bgl)+.05)/(Math.min(a,bgl)+.05)
        const minimum=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700)?3:4.5
        if(ratio+.01<minimum)rows.push({element:label(e),text:text.slice(0,100),ratio:+ratio.toFixed(2),minimum,color:s.color,background:bg,fontSize:s.fontSize})
      }
      return {overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,contrast:rows,clipped,gradientReview:[...new Set(gradients)]}
    })()`)
    findings.push({name,...result})
    await writeFile(join(destination,'poster-audit.json'),JSON.stringify(findings,null,2))
  }
  const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  for (const [phase,server] of [['before',servers[1]],['after',servers[0]]]) {
    for (const [size,width,height] of [['390',390,844],['393',393,852],['1440',1440,900]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,mobile:width<500,deviceScaleFactor:1})
      await send('Emulation.setTouchEmulationEnabled',{enabled:width<500,maxTouchPoints:1})
      for(const locale of ['zh-CN','zh-TW','en']) {
        const name=phase+'-'+size+'-'+locale
        await send('Page.navigate',{url:server.resolvedUrls.local[0]})
        await waitFor('main');await evaluate('localStorage.clear()')
        await send('Page.navigate',{url:server.resolvedUrls.local[0]})
        await waitFor('[data-action=welcome-primary]')
        await evaluate(`(()=>{const s=document.querySelector('.language-select');s.value=${JSON.stringify(locale)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
        await settle();await inspect(name+'-welcome','main')
        if(phase==='after'){
          assert(await evaluate(`(()=>{
            const score=document.querySelector('.welcome-hero .poster-score')
            const range=document.createRange();range.selectNodeContents(score)
            return range.getClientRects().length===1
          })()`),name+' wraps the welcome score')
        }
        await evaluate("document.querySelector('[data-action=welcome-primary]').click()")
        await waitFor('.season-poster');await inspect(name+'-report','.season-poster')
        await evaluate("document.querySelector('[data-card-template=feast]').click()")
        await settle();await inspect(name+'-share','.share-card-preview')
        await inspect(name+'-share-options','.card-options')
        await evaluate("document.querySelector('.private-ledger').open=true")
        await inspect(name+'-ledger','.data-table')
        await evaluate("document.querySelector('.private-ledger').open=false;document.querySelector('.batch-settings').open=true")
        await inspect(name+'-settings','.batch-settings')
        await evaluate("document.querySelector('.batch-settings').open=false")
        for(const page of ['import','trophies','arena']){
          await evaluate(`document.querySelector('.side-nav [data-page="${page}"]').click()`)
          await waitFor('.page-content[data-page="'+page+'"]')
          await inspect(name+'-'+page,page==='trophies'?'.medal-wall':'main')
        }
        await evaluate("(()=>{const s=document.querySelector('option[value=league]').parentElement;s.value='league';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
        await settle();await inspect(name+'-leaderboard','.leaderboard-list')
        await inspect(name+'-battle','.battle-code')
        await evaluate("document.querySelector('.footer-privacy-button:not([data-action])').click()")
        await waitFor('.privacy-modal');await inspect(name+'-privacy','.privacy-modal')
        await evaluate("document.querySelector('.privacy-modal .close-button').click();document.querySelector('.side-nav [data-page=import]').click()")
        await waitFor('input[type=file]')
        const {root}=await send('DOM.getDocument')
        const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file]'})
        await send('DOM.setFileInputFiles',{nodeId,files:[resolve('tests/fixtures/full-season-medals-fictional.csv')]})
        await waitFor('.page-content[data-page=ledger] [data-card-template]')
        await evaluate("document.querySelector('.side-nav [data-page=trophies]').click()")
        await waitFor('.wrapped-launch')
        await evaluate("document.querySelector('.wrapped-launch').click()")
        await waitFor('.wrapped-panel');await inspect(name+'-wrapped','.wrapped-panel')
        await inspect(name+'-wrapped-controls','.story-controls')
      }
    }
  }
  assert.equal(findings.length,2*3*3*14,'Every surface must be captured for both builds')
  const regressions=findings.filter(f=>f.name.startsWith('after-')&&(f.overflow||f.clipped.length||f.contrast.length))
  assert.deepEqual(regressions.map(f=>f.name),[],'Check viewport overflow, clipped labels and solid-background contrast')
  console.log('Poster matrix:',findings.length,'views; contrast/clipping candidates require visual review.')
} finally {
  socket?.close()
  if (browser.exitCode===null && browser.signalCode===null) {
    const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await exited
  }
  await Promise.all(servers.map(server=>new Promise(resolve=>server.httpServer.close(resolve))))
  await rm(profile,{recursive:true,force:true,maxRetries:3})
}
