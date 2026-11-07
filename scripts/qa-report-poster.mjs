// Browser checks use only the built-in fictional demo.
import assert from 'node:assert/strict'
export async function verifyReportPoster(name, evaluate) {
  if (name.endsWith('-ledger')) {
    assert(await evaluate(`(()=>{
      const hero=document.querySelector('.season-poster'), icon=hero.querySelector('svg')
      const size=parseFloat(getComputedStyle(icon).width)
      return size>=110 && size<=120 && !document.querySelector('.private-ledger').open
    })()`), 'Sticker size or default amount disclosure regressed')
    for (const locale of ['zh-CN','zh-TW','en']) {
      await evaluate(`(async()=>{const s=document.querySelector('.language-select');s.value=${JSON.stringify(locale)};s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`)
      const color=await evaluate(`getComputedStyle(document.querySelector('.poster-score')).color`)
      assert.equal(color,locale==='zh-CN'?'rgb(255, 133, 141)':'rgb(104, 227, 173)','Hero must follow gain theme')
    }
    await evaluate(`(async()=>{const s=document.querySelector('.language-select');s.value='zh-CN';s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`)
    for (const roast of [false,true]) {
      await evaluate(`(async()=>{const s=document.querySelector('.batch-settings input[type=checkbox]');if(s.checked!==${roast})s.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`)
      assert.equal(await evaluate(`(()=>{
        const hero=document.querySelector('.season-poster')
        const tag=hero.querySelector('.persona-identity small')||hero.querySelector('.persona-identity > span')
        return getComputedStyle(tag,'::before').content.includes('#')
      })()`),roast,'Hashtag sticker must follow roast switch')
    }
  }
  if (name.endsWith('-ledger-detail')) {
    for (const template of ['noodles','feast']) {
      await evaluate(`(async()=>{document.querySelector('[data-card-template=${template}]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`)
      const style=await evaluate(`(()=>{const c=document.querySelector('.share-card-preview'),s=getComputedStyle(c);return {bg:s.backgroundColor,border:s.borderTopColor,image:s.backgroundImage}})()`)
      assert.equal(style.bg,'rgb(11, 11, 11)')
      assert.equal(style.border,'rgb(244, 239, 230)')
      assert(style.image.includes('rgb(255, 43, 43)'),template+' missing decorative diagonal')
    }
  }
  if (name.endsWith('-trophies-detail')) {
    assert(await evaluate(`(()=>{
      const grid=document.querySelector('.medal-grid'), cols=getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const summary=grid.querySelector('summary'),style=getComputedStyle(summary)
      return (innerWidth<641?cols>=2&&cols<=3:cols>=4) && style.display==='flex' && style.alignItems==='center' && style.listStyleType==='none'
    })()`),'Medal grid or centered disclosure layout regressed')
  }
}
