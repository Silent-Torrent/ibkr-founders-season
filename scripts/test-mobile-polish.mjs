import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'

export async function testMobilePolish({cdp,evaluate,accessibleNodeForSelector,outputDirectory}) {
  if (outputDirectory) mkdirSync(outputDirectory,{recursive:true})
  async function screenshot(file) {
    if (!outputDirectory) return
    const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    writeFileSync(join(outputDirectory,file+'.png'),Buffer.from(data,'base64'))
  }
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  for(const width of [360,393,844]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:width===844?390:852,deviceScaleFactor:1,mobile:true})
    const gaps=[]
    for(const locale of ['zh-CN','zh-TW','en']){
      await evaluate(`(()=>{
        const select=document.querySelector('.language-select')
        select.value=${JSON.stringify(locale)}
        select.dispatchEvent(new Event('change',{bubbles:true}))
        document.querySelector('.side-nav [data-page="ledger"]').click()
      })()`)
      await settle()
      const m=await evaluate(`(()=>{
        const tag=document.querySelector('.topbar .mobile-source')
        const settings=document.querySelector('.batch-settings').getBoundingClientRect()
        const peer=document.querySelector('.page-content .hero-row').getBoundingClientRect()
        const gain=getComputedStyle(document.querySelector('.data-table td.positive')).color
        const loss=getComputedStyle(document.querySelector('.data-table td.negative')).color
        return {tag:tag.innerText,tagWidth:tag.clientWidth,textWidth:tag.scrollWidth,
          left:Math.abs(settings.left-peer.left),right:Math.abs(settings.right-peer.right),
          doc:document.documentElement.scrollWidth,gain,loss}
      })()`)
      assert(m.tagWidth>0 && m.textWidth<=m.tagWidth && m.tag.trim(),`${width}/${locale} clipped source: ${JSON.stringify(m)}`)
      assert(m.left<=1 && m.right<=1 && m.doc<=width,`${width}/${locale} settings alignment: ${JSON.stringify(m)}`)
      const rgb=s=>s.match(/\d+/g).map(Number)
      const [gr,gg]=rgb(m.gain),[lr,lg]=rgb(m.loss)
      assert(locale==='zh-CN'?gr>gg&&lr<lg:gr<gg&&lr>lg,locale+' default P&L colors')
      if(width===393){
        await evaluate("document.querySelector('.batch-settings').scrollIntoView({block:'center',behavior:'instant'})")
        await settle();await screenshot(locale+'-settings')
      }
      await evaluate("document.querySelector('.side-nav [data-page=trophies]').click()")
      await settle()
      const gap=await evaluate(`(()=>{
        const hero=document.querySelector('.trophy-hero')
        return hero.querySelector('h1').getBoundingClientRect().top-hero.querySelector('.eyebrow').getBoundingClientRect().bottom
      })()`)
      gaps.push(gap)
      if(locale==='en'){
        assert.equal(await evaluate("document.querySelector('.trophy-hero').innerText.split('14/18').length-1"),1)
        const ax=await accessibleNodeForSelector('.trophy-hero','trophy count')
        const count=await evaluate("document.querySelector('.trophy-hero .sr-only').textContent")
        assert.equal(count,'14 of 18 medals earned')
        assert(ax.text.includes(count))
        const {nodes}=await cdp.send('Accessibility.getFullAXTree')
        const spoken=nodes.filter(n=>!n.ignored && n.role.value==='StaticText')
        assert.equal(spoken.filter(n=>n.name.value===count).length,1)
        assert(!spoken.some(n=>n.name.value.includes('14/18')))
      }
      if(width===393){await evaluate('window.scrollTo(0,0)');await settle();await screenshot(locale+'-trophies')}
    }
    assert(Math.min(...gaps)>=12 && Math.max(...gaps)-Math.min(...gaps)<=2,`eyebrow gaps at ${width}: ${gaps}`)
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true})
}
