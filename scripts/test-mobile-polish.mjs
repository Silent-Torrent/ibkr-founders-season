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
      const poster = await evaluate(`(async()=>{
        const medal=document.querySelector('.medal.earned')
        medal.open=true
        const buttons=medal.querySelectorAll('.medal-tools button')
        const rect=buttons[1].getBoundingClientRect()
        let file, url
        const original=HTMLAnchorElement.prototype.click
        try {
          HTMLAnchorElement.prototype.click=function(){ file=this.download; url=this.href }
          buttons[1].click()
        } finally { HTMLAnchorElement.prototype.click=original; medal.open=false }
        const image=new Image()
        image.src=url
        await image.decode()
        return {file,w:image.naturalWidth,h:image.naturalHeight,button:[rect.width,rect.height],
          name:buttons[1].textContent, badges:document.querySelectorAll('.identity-strip svg[aria-label]').length}
      })()`)
      assert.match(poster.file,/^pnl-arena-2026-medal-\d+\.png$/)
      assert.deepEqual([poster.w,poster.h],[1080,1080])
      assert(poster.name && poster.button.every(n=>n>=44))
      assert.equal(poster.badges,3)
      if(width>=393){
        await evaluate("document.querySelector('.wrapped-launch').click()")
        await settle()
        const heading=await evaluate("document.querySelector('.wrapped-panel h2').textContent")
        const pages=Number(heading.split('/')[1].split('·')[0])
        assert(pages>=8 && pages<=10)
        for(let page=1;page<=pages;page++){
          const saved=await evaluate(`(async()=>{
            const panel=document.querySelector('.wrapped-panel')
            const btns=[...panel.querySelectorAll('button')]
            const original=HTMLAnchorElement.prototype.click
            let filename,url
            try { HTMLAnchorElement.prototype.click=function(){filename=this.download;url=this.href};btns[3].click() }
            finally {HTMLAnchorElement.prototype.click=original}
            const img=new Image();img.src=url;await img.decode()
            return [filename,img.naturalWidth,img.naturalHeight,panel.querySelector('canvas').getAttribute('aria-label'),...btns.map(b=>b.getBoundingClientRect().height)]
          })()`)
          assert.equal(saved[0],'pnl-arena-2026-wrapped-'+String(page).padStart(2,'0')+'.png')
          assert.deepEqual(saved.slice(1,3),[1080,1920]);assert(saved[3]);assert(saved.slice(4).every(h=>h>=44))
          if(page===1 && width===393)await screenshot(locale+'-wrapped')
          if(page<pages){await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight'});await settle()}
        }
        await evaluate("document.querySelector('.wrapped-panel button:last-child').click()")
        await settle()
        assert(await evaluate("document.activeElement===document.querySelector('.wrapped-launch')"))
      }
      if(width===393){await evaluate('window.scrollTo(0,0)');await settle();await screenshot(locale+'-trophies')}
    }
    assert(Math.min(...gaps)>=12 && Math.max(...gaps)-Math.min(...gaps)<=2,`eyebrow gaps at ${width}: ${gaps}`)
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true})
}
