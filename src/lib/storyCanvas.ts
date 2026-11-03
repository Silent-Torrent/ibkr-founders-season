import { advice } from '../data/medals'
import type { Locale } from '../types'
import type { Story } from './seasonStories'

export function paintStory(canvas:HTMLCanvasElement,page:Story,l:Locale,source:string,position:string,height=1920){
  canvas.width=1080
  canvas.height=height
  const ctx=canvas.getContext('2d')
  if(!ctx)return
  ctx.fillStyle='#112b34'
  ctx.fillRect(0,0,1080,height)
  function text(line:string,y:number,size:number,color='#faf5df'){
    ctx!.fillStyle=color
    ctx!.font='bold '+size+'px ArenaSeason, system-ui'
    ctx!.fillText(line,72,y,936)
  }
  text('P&L ARENA   /   '+position,128,38,'#7bdcc2')
  text(page.title,height*0.24,79)
  const step=Math.min(155,height*0.49/Math.max(1,page.lines.length))
  const largest=Math.max(1,...(page.bars??[]).map(Math.abs))
  page.lines.forEach((line,i)=>{
    const y=height*0.36+i*step
    text(line,y,Math.min(66,step*.65))
    if(page.bars){
      const value=page.bars[i]
      ctx!.fillStyle=value<0?'#d89692':'#81c7bc'
      const width=400*Math.abs(value)/largest
      ctx!.fillRect(value<0?540-width:540,y+8,width,10)
    }
  })
  text(source,height-155,36,'#b5c6c7')
  text(advice(l),height-78,42)
}
