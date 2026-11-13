// Only the built-in fictional demo, served on loopback. No file import or credentials.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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
      // Use the actual PNG fallback to inspect the export with a Demo persona.
      await evaluate(`(() => {
        Object.defineProperties(navigator, {
          userAgent: { configurable: true, value: 'iPhone' },
          canShare: { configurable: true, value: undefined },
        });
        const draw = CanvasRenderingContext2D.prototype.fillText;
        const lines = [];
        window.__seasonExport = { draw, lines };
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
          const metrics = this.measureText(text);
          lines.push({ text, top: y - metrics.actualBoundingBoxAscent,
            bottom: y + metrics.actualBoundingBoxDescent });
          return draw.call(this, text, x, y, ...rest);
        };
        document.querySelector('[data-card-size="3x4"]').click();
      })()`)
      try {
        const allVariants = phase === 'after' && size === 'mobile'
        for (const locale of allVariants ? ['en', 'zh-CN', 'zh-TW'] : ['en']) {
          await evaluate(`(() => {
            const language = document.querySelector('.language-select');
            language.value = ${JSON.stringify(locale)};
            language.dispatchEvent(new Event('change', { bubbles: true }));
          })()`)
          for (const template of allVariants ? ['feast', 'noodles'] : ['feast']) {
            await evaluate(`document.querySelector('[data-card-template="${template}"]').click()`)
            await settle()
            await evaluate(`(() => {
              window.__seasonExport.lines.length = 0;
              document.querySelector('[data-action=download-card]').click();
            })()`)
            await waitFor('.png-fallback-panel img')
            const exported = await evaluate(`(async () => {
              const img = document.querySelector('.png-fallback-panel img');
              await img.decode();
              const card = document.querySelector('.share-card-preview');
              const boxes = ['.persona-identity > span', '.face-title', '.share-pnl', '.face-caption']
                .map(selector => window.__seasonExport.lines.find(
                  line => line.text === card.querySelector(selector).textContent.trim()));
              return { dimensions: [img.naturalWidth, img.naturalHeight], boxes };
            })()`)
            assert.deepEqual(exported.dimensions, [1080, 1440])
            assert(exported.boxes.every(Boolean), name+' '+locale+' '+template+' missing PNG text')
            const [persona, title, score, caption] = exported.boxes
            const titleGap = title.top - persona.bottom
            const captionGap = caption.top - Math.max(title.bottom, score.bottom)
            console.log(name, locale, template, '3:4 PNG title/caption gap:', titleGap, captionGap, 'px')
            if (phase === 'after') {
              assert(titleGap >= 8 && captionGap >= 8, locale+' '+template+' 3:4 PNG rows overlap')
            }
            if (locale === 'en' && template === 'feast') {
              await capture(name+'-3x4-preview', '.png-fallback-panel img')
            }
            await evaluate("document.querySelector('.png-fallback-heading button').click()")
          }
        }
      } finally {
        await evaluate(`(() => {
          document.querySelector('.png-fallback-heading button')?.click();
          CanvasRenderingContext2D.prototype.fillText = window.__seasonExport.draw;
          delete window.__seasonExport;
          delete navigator.userAgent;
          delete navigator.canShare;
          const language = document.querySelector('.language-select');
          language.value = 'zh-CN';
          language.dispatchEvent(new Event('change', { bubbles: true }));
        })()`)
        await settle()
      }
      await evaluate("document.querySelector('.side-nav [data-page=arena]').click()")
      await waitFor('.local-arena')
      await evaluate("(()=>{const s=document.querySelector('option[value=league]').parentElement;s.value='league';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
      await settle()
      await capture(name+'-arena','.league-standing')
      await capture(name+'-leaderboard','.leaderboard-list')
      await capture(name+'-battle','.local-arena input[maxlength]')
      // Exercise the existing code format with a fully fictional opponent.
      const payload='PL1~-825~1~1,4'
      const code=payload+'~'+createHash('sha256').update(payload).digest('hex').slice(0,12)
      async function enterOpponent(value) {
        await evaluate(`(()=>{
          const input=document.querySelector('.local-arena input[maxlength]')
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)})
          input.dispatchEvent(new Event('input',{bubbles:true}))
        })()`)
        await settle()
      }
      await enterOpponent(code)
      const comparison=await evaluate("Boolean(document.querySelector('.battle-comparison'))")
      await capture(name+'-battle-result',comparison?'.battle-poster':'.battle-code')
      if(phase==='after') {
        assert(comparison,'Valid fictional opponent must open the comparison')
        for(const locale of ['zh-CN','zh-TW','en']) {
          await evaluate(`(()=>{const s=document.querySelector('.language-select');s.value=${JSON.stringify(locale)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
          await settle()
          const details=await evaluate(`(()=>{
            const sides=[...document.querySelectorAll('.battle-side')]
            return {scores:sides.map(s=>s.querySelector('.battle-return').textContent.trim()),
              colors:sides.map(s=>getComputedStyle(s.querySelector('.battle-return')).color),
              medals:sides[1].querySelectorAll('li').length,
              overflow:document.documentElement.scrollWidth>innerWidth,
              wide:sides.every(s=>s.scrollWidth<=s.clientWidth+1),
              text:document.querySelector('.battle-poster').textContent}
          })()`)
          assert.deepEqual(details.scores,['+21.3%','-8.25%'])
          assert.deepEqual(details.colors,locale==='zh-CN'?['rgb(255, 133, 141)','rgb(104, 227, 173)']:['rgb(104, 227, 173)','rgb(255, 126, 136)'])
          assert.equal(details.medals,2)
          assert(details.wide&&!details.overflow,locale+' comparison overflow')
          assert.doesNotMatch(details.text,/PL1~|US\\$|FICTLOSS/)
        }
        await evaluate("(()=>{const s=document.querySelector('.language-select');s.value='zh-CN';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
        await waitFor('[data-battle-export]:not(:disabled)')
        const battle=await evaluate(`(async()=>{
          const originalClick=HTMLAnchorElement.prototype.click
          const originalText=CanvasRenderingContext2D.prototype.fillText
          const lines=[]
          let download
          try {
            HTMLAnchorElement.prototype.click=function(){download={name:this.download,data:this.href}}
          CanvasRenderingContext2D.prototype.fillText=function(text,...args){lines.push({text,color:this.fillStyle});return originalText.call(this,text,...args)}
            document.querySelector('[data-battle-export]').click()
            if(!download)throw Error('No battle download')
            const img=new Image();img.src=download.data;await img.decode()
            return {...download,width:img.naturalWidth,height:img.naturalHeight,lines}
          } finally {
            HTMLAnchorElement.prototype.click=originalClick
            CanvasRenderingContext2D.prototype.fillText=originalText
          }
        })()`)
        assert.deepEqual([battle.name,battle.width,battle.height],['pnl-arena-battle.png',1080,1440])
        for(const line of ['+21.3%','-8.25%','用户自报 · 非券商验证','非投资建议'])assert(battle.lines.some(x=>x.text===line),line)
        assert.equal(battle.lines.find(x=>x.text==='+21.3%').color,'#ff858d')
        assert.equal(battle.lines.find(x=>x.text==='-8.25%').color,'#68e3ad')
        assert.doesNotMatch(battle.lines.map(x=>x.text).join(' '),/PL1~|US\$|FICTLOSS/)
        await writeFile(join(destination,name+'-battle-export.png'),Buffer.from(battle.data.split(',')[1],'base64'))
        await enterOpponent(code+'!')
        assert(await evaluate("!document.querySelector('.battle-comparison') && document.querySelector('.battle-code output[aria-live]').textContent.includes('无效')"))
        await enterOpponent('')
        assert(await evaluate("!document.querySelector('.battle-comparison')"))
      }

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
