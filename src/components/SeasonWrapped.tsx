import {useContext,useEffect,useRef,useState} from 'react'
import {Settings} from './Preferences'
import {stories} from '../lib/seasonStories'
import {paintStory} from '../lib/storyCanvas'
import {getShareSourceLabel} from '../lib/shareCard'
import {local} from '../data/medals'
import type {Locale,PortfolioReport} from '../types'

export function SeasonWrapped({report,locale}:{report:PortfolioReport,locale:Locale}){
  const {prefs}=useContext(Settings)
  const [open,setOpen]=useState(false)
  const [index,setIndex]=useState(0)
  const [playing,setPlaying]=useState(false)
  const canvas=useRef<HTMLCanvasElement>(null)
  const panel=useRef<HTMLElement>(null)
  const launch=useRef<HTMLButtonElement>(null)
  const start=useRef<number|null>(null)
  const pages=stories(report,locale,prefs)
  const i=Math.min(index,pages.length-1)
  const page=pages[i]
  useEffect(()=>{
    if(open && page && canvas.current)paintStory(canvas.current,page,locale,getShareSourceLabel(report,locale),(i+1)+' / '+pages.length)
  },[open,page,locale,report,i,pages.length])
  useEffect(()=>{if(open)panel.current?.focus()},[open])
  useEffect(()=>{
    if(!playing || !open || i>=pages.length-1)return
    const timer=window.setTimeout(()=>setIndex(i+1),6000)
    return ()=>clearTimeout(timer)
  },[playing,open,i,pages.length])
  if(!page)return null
  const move=(n:number)=>{setPlaying(false);setIndex(Math.max(0,Math.min(pages.length-1,i+n)))}
  const label=(s:string)=>local(s,locale)
  if(!open)return <button className="wrapped-launch" ref={launch} onClick={()=>{setOpen(true);setIndex(0)}}>{label('打开赛季回顾|開啟賽季回顧|Open Season Wrapped')}</button>
  return <section className="wrapped-panel panel" ref={panel} tabIndex={-1} aria-label="Season Wrapped"
    onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1)}}}>
    <h2 aria-live="polite">{i+1} / {pages.length} · {page.title}</h2>
    <canvas ref={canvas} role="img" aria-label={[page.title,...page.lines].join(' · ')}
      onTouchStart={e=>{start.current=e.touches[0].clientX}}
      onTouchEnd={e=>{if(start.current!=null){const delta=e.changedTouches[0].clientX-start.current;if(Math.abs(delta)>40)move(delta<0?1:-1)}start.current=null}}/>
    <div className="story-controls">
      <button disabled={!i} onClick={()=>move(-1)}>{label('上一页|上一頁|Previous')}</button>
      <button disabled={i===pages.length-1} onClick={()=>move(1)}>{label('下一页|下一頁|Next')}</button>
      <button disabled={i===pages.length-1} onClick={()=>setPlaying(!playing)}>{playing?label('暂停|暫停|Pause'):label('播放|播放|Play')}</button>
      <button onClick={()=>{if(canvas.current){const a=document.createElement('a');a.download='pnl-arena-'+report.seasonYear+'-wrapped-'+String(i+1).padStart(2,'0')+'.png';a.href=canvas.current.toDataURL('image/png');a.click()}}}>{label('导出本页|匯出本頁|Save this page')}</button>
      <button onClick={()=>{setPlaying(false);setOpen(false);requestAnimationFrame(()=>launch.current?.focus())}}>{label('结束回顾|結束回顧|Close recap')}</button>
    </div>
  </section>
}
