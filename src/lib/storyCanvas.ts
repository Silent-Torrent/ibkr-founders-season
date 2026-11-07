import type { Preferences } from './cardOptions'
import { advice } from '../data/medals'
import type { Locale } from '../types'
import type { Story } from './seasonStories'

export function paintStory(canvas:HTMLCanvasElement,page:Story,l:Locale,source:string,position:string,height=1920,colors:Preferences['colors']='auto'){
  canvas.width=1080
  canvas.height=height
  const ctx=canvas.getContext('2d')
  if(!ctx)return
  ctx.fillStyle='#0b0b0b'
  ctx.fillRect(0,0,1080,height)
  ctx.fillStyle='#ff2b2b'
  ctx.fillRect(0,0,1080,22)
  function text(line:string,y:number,size:number,color='#faf5df'){
    ctx!.fillStyle=color
    ctx!.font='bold '+size+'px "Space Grotesk", ArenaSeason, sans-serif'
    ctx!.fillText(line,72,y,936)
  }
  text('P&L ARENA   /   '+position,128,38,'#f4efe6')
  text(page.title,height*0.24,79)
  const step=Math.min(155,height*0.49/Math.max(1,page.lines.length))
  const largest=Math.max(1,...(page.bars??[]).map(Math.abs))
  page.lines.forEach((line,i)=>{
    const y=height*0.36+i*step
    text(line,y,Math.min(66,step*.65))
    if(page.bars){
      const value=page.bars[i]
      const redGains=colors==='red'||(colors==='auto'&&l==='zh-CN')
      ctx!.fillStyle=(value>0)===redGains?'#ff858d':'#68e3ad'
      const width=400*Math.abs(value)/largest
      ctx!.fillRect(value<0?540-width:540,y+8,width,10)
    }
  })
  text(source,height-155,36,'#b5c6c7')
  text(advice(l),height-78,42)
}
