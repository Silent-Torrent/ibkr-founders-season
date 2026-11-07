import assert from 'node:assert/strict'
import {mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {createWorkerHeapSampler} from './worker-heap-sampling.mjs'

export async function runReleaseGateEvidence({directory,cdp,evaluate,waitForPageValue,navigateAndWait,previewUrl,resolveFileInputNodeId,accessibleNodeForSelector,armNextWorkerHeap,holdNextWorker,downloadStarts,downloadProgress,inspectPng,full,capacity,empty}) {
  mkdirSync(directory,{recursive:true})
  const browser=(await cdp.send('Browser.getVersion')).product
  const report={browser,commit:process.env.GITHUB_SHA,prHead:process.env.RELEASE_GATE_PR_HEAD_SHA,run:process.env.GITHUB_RUN_ID,mode:'Linux Chrome touch emulation, loopback HTTP, fictional statements',checks:[]}
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const wait=(expr,label)=>waitForPageValue('Boolean('+expr+')',Boolean,label)
  const shot=async name=>{
    const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    writeFileSync(join(directory,name+'.png'),Buffer.from(data,'base64'))
  }
  function save(){
    writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n')
    const lines=['# 手机门禁模拟证据', '', browser+' · '+report.commit, '',
      '虚构数据，非 root Chrome，回环 HTTP。逐项数据见 report.json。全部门禁仍 OPEN。', '',
      '| 检查 | 结果 |','|---|---|',...report.checks.map(c=>'| '+c.name+' | '+c.result+' |')]
    writeFileSync(join(directory,'README.md'),lines.join('\n')+'\n')
  }
  save()
  async function check(name,fn){
    try {const evidence=await fn();report.checks.push({name,result:'PASS',evidence});console.log('Release evidence PASS:',name,JSON.stringify(evidence))}
    catch(e){report.checks.push({name,result:'FAIL',error:e.message});await shot('failure-'+name.replace(/\W/g,'-'));throw e}
    finally{save()}
  }
  async function viewport(width,height){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:true,
      screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}})
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
    await settle()
    assert.deepEqual(await evaluate('[innerWidth,innerHeight,navigator.maxTouchPoints]'),[width,height,1])
  }
  const phone=()=>viewport(393,852)
  async function fresh(){
    await navigateAndWait(previewUrl)
    await wait("document.querySelector('.source-pill.demo,[data-action=welcome-primary]')",'loaded demo or welcome')
    if(await evaluate("Boolean(document.querySelector('[data-action=welcome-primary]'))"))await tap('[data-action=welcome-primary]')
    await wait("document.querySelector('.source-pill.demo')",'fresh demo')
  }
  async function point(selector){
    const hit=await evaluate(`(async()=>{
      const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length)
      if(!el)return null
      el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
      const b=el.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2
      return {x,y,w:b.width,h:b.height,hit:el.contains(document.elementFromPoint(x,y))}
    })()`)
    assert(hit?.hit && hit.w>=43.99 && hit.h>=43.99,selector+' unreachable or undersized '+JSON.stringify(hit))
    return hit
  }
  async function tap(selector){
    // Distinct gestures must not coalesce into a synthetic double tap.
    await new Promise(r=>setTimeout(r,350))
    const {x,y}=await point(selector)
    await evaluate(`(()=>{window.gateTapped=false;const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);el.addEventListener('click',e=>window.gateTapped=e.isTrusted,{once:true,capture:true})})()`)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await wait('window.gateTapped','trusted tap '+selector)
    await settle()
  }
  const action=k=>'[data-action="'+k+'"]'
  const nav=k=>tap('nav button[data-page="'+k+'"]')
  async function file(path){await cdp.send('DOM.setFileInputFiles',{nodeId:await resolveFileInputNodeId(),files:[path]})}
  async function language(l){
    await evaluate(`(()=>{const el=document.querySelector('.language-select');el.value=${JSON.stringify(l)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await wait('document.documentElement.lang==='+JSON.stringify(l),'language '+l)
  }
  async function key(name,shift=false){
    const code={Tab:9,Escape:27}[name]
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:name,code:name,windowsVirtualKeyCode:code,modifiers:shift?8:0})
    await settle()
  }
  async function names(){
    const {nodes}=await cdp.send('Accessibility.getFullAXTree')
    const controls=nodes.filter(n=>!n.ignored&&['button','combobox','textbox','checkbox','link','searchbox','DisclosureTriangle'].includes(n.role?.value))
    assert(controls.length>0)
    for(const n of controls)assert(n.name?.value?.trim(),'Unnamed '+n.role.value+' AX node '+n.backendDOMNodeId)
    return controls.map(n=>[n.role.value,n.name.value])
  }
  async function measure(label,path,rows){
    await fresh();await nav('import')
    const input=await resolveFileInputNodeId()
    const ticket=armNextWorkerHeap(label)
    const main=createWorkerHeapSampler({send:(method,params)=>cdp.send(method,params),intervalMs:50})
    await main.start()
    try {
      await evaluate(`(()=>{
        const probe=window.releaseProbe={tasks:[]}
        const observer=new PerformanceObserver(list=>probe.tasks.push(...list.getEntries().map(e=>[e.startTime,e.duration])))
        observer.observe({type:'longtask'})
        document.querySelector('input[type=file]').addEventListener('change',()=>{
          probe.start=performance.now()
          function frame(){
            if(document.querySelectorAll('.data-table tbody tr').length===${rows})probe.end=performance.now()
            else requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
        },{once:true})
      })()`)
      main.markExecutionReleased()
      await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[path]})
      await wait('window.releaseProbe.end','import '+label)
      await settle()
      const p=await evaluate('window.releaseProbe')
      assert(ticket.ready&&!ticket.error)
      const pageHeap=await main.stop('ledger-rendered'),workerHeap=await ticket.sampler.stop('ledger-rendered')
      const tasks=p.tasks.filter(([start,ms])=>start<p.end&&start+ms>p.start&&ms>50).map(([,ms])=>ms)
      const millis=p.end-p.start,longest=Math.max(0,...tasks)
      writeFileSync(join(directory,label+'-samples.json'),JSON.stringify({pageHeap,workerHeap,longTasksMs:tasks},null,2))
      await shot(label)
      assert(pageHeap.sampleCount&&workerHeap.sampleCount)
      const measured={bytes:statSync(path).size,renderedRows:rows,importMs:millis,longTasksOver50ms:tasks.length,longestMs:longest,
        mainSamples:pageHeap.sampleCount,mainMaxBytes:pageHeap.observedSampledMaxima.usedSize,workerSamples:workerHeap.sampleCount,
        workerRuntimeSamples:workerHeap.runtimeSampleCount,workerMaxBytes:workerHeap.observedSampledMaxima.usedSize,
        workerCoverage:workerHeap.coverage,trackerMemoryLimit:'unspecified; sampled JS heap only, not a true peak',
        regressionLimits:'import <10000 ms, longest main task <250 ms'}
      assert(millis<10000&&longest<250,JSON.stringify(measured))
      return measured
    }finally{await main.stop('cleanup');if(ticket.sampler)await ticket.sampler.stop('cleanup')}
  }
  await navigateAndWait(previewUrl)
  await wait("document.querySelector('meta[name=viewport]')",'production viewport')
  await phone()
  await check('D01 full fictional',()=>measure('full',full,4))
  await check('D01 maximum fictional 100000 rows 1000 events',()=>measure('maximum',capacity,500))
  await fresh();await nav('import');await file(full)
  const rows="Array.from(document.querySelectorAll('.data-table tbody tr td:first-child strong'),e=>e.textContent)"
  await check('D02 import search filter sort detail',async()=>{
    await wait(rows+'.length===4','full ledger')
    await tap('.private-ledger > summary')
    const search='.table-toolbar input'
    await tap(search)
    await cdp.send('Input.insertText',{text:'FICTLOSS'})
    await wait(rows+'.length===1','search')
    assert.deepEqual(await evaluate(rows),['FICTLOSS'])
    await evaluate(`(()=>{const el=document.querySelector('${search}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));el.blur()})()`)
    await tap('.segmented-control button:last-child');assert.deepEqual(await evaluate(rows),['FICTLOSS'])
    await tap('.segmented-control button:first-child')
    await evaluate("(()=>{const el=document.querySelector('.sort-select');el.value='symbol';el.dispatchEvent(new Event('change',{bubbles:true}))})()");await settle()
    const sorted=await evaluate(rows)
    assert.equal(sorted.length,4);assert.deepEqual(sorted,[...sorted].sort())
    await tap('.row-arrow');await wait("document.querySelector('.symbol-drawer')",'open detail');await tap('.symbol-drawer .close-button');await wait("!document.querySelector('.symbol-drawer')",'drawer closed')
    return sorted
  })
  await check('D02 trophies PNG and clear',async()=>{
    await nav('trophies');assert.equal(await evaluate("document.querySelectorAll('.medal.earned').length"),14);await shot('trophies')
    await nav('ledger')
    await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory,eventsEnabled:true})
    const files=[]
    for(const [size,w,h] of [['portrait',1200,1500],['story',1080,1920],['3x4',1080,1440]]){
      await tap('[data-card-size="'+size+'"]')
      const before=downloadStarts.length
      await tap(action('download-card'))
      const name='pnl-arena-2026-season'+(size==='portrait'?'':'-'+size)+'.png'
      for(let i=0;i<100&&!downloadProgress.some(e=>e.guid===downloadStarts[before]?.guid&&e.state==='completed');i++)await new Promise(r=>setTimeout(r,100))
      assert.equal(downloadStarts[before]?.suggestedFilename,name)
      assert(downloadProgress.some(e=>e.guid===downloadStarts[before].guid&&e.state==='completed'))
      assert.deepEqual(inspectPng(readFileSync(join(directory,name))),{width:w,height:h})
      files.push([name,w,h])
    }
    await point(action('clear-report'));await shot('mobile-clear')
    const off=cdp.on('Page.javascriptDialogOpening',async e=>{if(e.type==='confirm')await cdp.send('Page.handleJavaScriptDialog',{accept:true})})
    try{await tap(action('clear-report'));await wait("document.querySelector('.source-pill.demo')&&!document.querySelector('[data-action=clear-report]')",'cleared')}
    finally{off()}
    return files
  })
  const phrases={
    en:['Statement imported locally','CSV file is empty','Import cancelled','Select all'],
    'zh-CN':['报表已在本机导入','CSV 文件为空','已取消导入','全选文字'],
    'zh-TW':['報表已在本機匯入','CSV 檔案為空','已取消匯入','全選文字']
  }
  for(const [locale,expected] of Object.entries(phrases)){
    await check('D07 AX live regions '+locale,async()=>{
      await fresh();await language(locale);await nav('import')
      const events=[]
      async function capture(sel,role,needle){
        await wait(`document.querySelector(${JSON.stringify(sel)})?.textContent.includes(${JSON.stringify(needle)})`,'live '+needle)
        const n=await accessibleNodeForSelector(sel,needle);assert.equal(n.role,role);assert(n.text.includes(needle));events.push([role,n.text])
      }
      await file(empty);await capture('.import-messages [role=alert]','alert',expected[1])
      // Hold only this fixture's real Worker before execution to hit the cancel path deterministically.
      holdNextWorker();await file(capacity);await tap(action('cancel-import'));await capture('.import-cancelled-message','status',expected[2])
      await file(full);await capture('.app-notice.success','status',expected[0])
      await tap(action('manual-summary'));await capture('.manual-copy-panel [role=status]','status',expected[3])
      assert(await evaluate("document.activeElement.matches('.manual-copy-text') && document.activeElement.selectionEnd===document.activeElement.value.length"))
      return {events,controls:await names()}
    })
  }
  await language('en');await nav('ledger')
  for (const page of ['ledger','arena','trophies','import']) {
    await check('D07 page keyboard order '+page,async()=>{
      await nav(page)
      const controls = await names()
      const expected = await evaluate(`(() => {
        const main = document.querySelector('main')
        main.focus()
        const nodes = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')]
          .filter(el => main.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
          .filter(el => !el.disabled && (el.tabIndex >= 0 || el.matches('summary:not([tabindex])'))
            && el.checkVisibility() && !el.closest('[inert]'))
        return nodes.map((el,i) => {
          el.dataset.gateTab = String(i)
          return el.getAttribute('aria-label') || el.textContent.trim().slice(0,70) || el.tagName
        })
      })()`)
      assert(expected.length >= 4)
      for(let i=0;i<expected.length;i++){
        await key('Tab')
        const actual = await evaluate("({index: document.activeElement.dataset.gateTab, label:document.activeElement.outerHTML.slice(0,180)})")
        assert.equal(actual.index,String(i),page+' Tab '+i+' expected '+expected[i]+' reached '+actual.label)
      }
      await evaluate("document.querySelectorAll('[data-gate-tab]').forEach(el=>delete el.dataset.gateTab)")
      return {order:expected,accessibleControlCount:controls.length}
    })
  }
  await nav('ledger')
  const sizes=[[390,844],[844,390],[667,375],[390,844]]
  async function rotate(panel,selector,targetSelector,modal){
    const cases=[]
    for(const [w,h] of sizes){
      await viewport(w,h)
      const geometry=await evaluate(`(()=>{
        const el=document.querySelector(${JSON.stringify(selector)}),b=el.getBoundingClientRect()
        return {width:innerWidth,doc:document.documentElement.scrollWidth,panelWidth:b.width,scroll:el.scrollWidth,client:el.clientWidth}
      })()`)
      assert(geometry.panelWidth>0&&geometry.doc<=w&&geometry.scroll<=geometry.client+1,JSON.stringify(geometry))
      const count=await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(targetSelector)})).filter(el=>el.getBoundingClientRect().height>0).length`)
      assert(count>0)
      // Tag each rendered control only within the QA document; scrolling a long panel is intentional.
      let selectors=await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(targetSelector)})).filter(el=>el.getBoundingClientRect().height>0).map((el,i)=>{el.dataset.qaHit=String(i);return '[data-qa-hit="'+i+'"]'})`)
      for(const sel of selectors)await point(sel)
      await evaluate("document.querySelectorAll('[data-qa-hit]').forEach(el=>delete el.dataset.qaHit)")
      if(modal)assert(await evaluate("document.querySelector('.app-shell').inert"))
      await point(targetSelector);await shot(panel+'-'+w+'x'+h)
      cases.push({w,h,targets:count,...geometry})
    }
    return cases
  }
  async function dialog(panel,opener,selector){
    await viewport(...sizes[0]);await tap(opener)
    await wait("document.activeElement.matches('[role=dialog] .close-button')",'initial dialog focus')
    await check('D07 focus and names '+panel,async()=>{
      const ax=await names()
      const focus=()=>evaluate(`(()=>{const el=document.querySelector('${selector}'),targets=Array.from(el.querySelectorAll('button,a[href],summary,input,select,textarea,[tabindex="0"]')).filter(e=>e.getBoundingClientRect().height>0);return [targets.indexOf(document.activeElement),targets.length]})()`)
      const [start,n]=await focus();assert.equal(start,0);assert(n>0)
      for(let i=1;i<=n;i++){await key('Tab');assert.deepEqual(await focus(),[i%n,n])}
      await key('Tab',true);assert.deepEqual(await focus(),[n-1,n]);await key('Tab')
      return {tabStops:n,forwardWrap:true,reverseWrap:true,controls:ax}
    })
    await check('D08 rotate '+panel,()=>rotate(panel,selector,selector+' :is(button,summary,a[href])',true))
    await check('D07 return '+panel,async()=>{
      await key('Escape')
      assert(await evaluate(`!document.querySelector('${selector}')&&document.activeElement===document.querySelector('${opener}')`))
      return opener
    })
  }
  await dialog('privacy','.site-footer button:last-child','.privacy-modal')
  if(!await evaluate("document.querySelector('.private-ledger').open")) await tap('.private-ledger > summary')
  await dialog('details','.row-arrow','.symbol-drawer')
  await check('D08 navigation',async()=>{
    const results=[]
    for(const [w,h] of sizes){
      await viewport(w,h)
      for(const page of ['ledger','arena','trophies','import'])await point('nav button[data-page="'+page+'"]')
      results.push([w,h,4])
    }
    return results
  })
  await check('D08 rotate open PNG preview',async()=>{
    // Select the existing Apple-mobile fallback branch only for this panel; rendering engine remains Chrome.
    await evaluate("Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'})")
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2})
    await tap(action('download-card'))
    await wait("document.querySelector('.png-fallback-panel img')?.naturalWidth",'local preview')
    const result=await rotate('preview','.png-fallback-panel','.png-fallback-panel :is(button,a[href])',false)
    await tap('.png-fallback-panel button')
    return result
  })
  return report
}
