import {useContext,useState} from 'react'
import {Settings} from './Preferences'
import {local,medals} from '../data/medals'
import {getDivision,type DivisionKey} from '../lib/season'
import {displayedMedals} from '../lib/medalCollection'
import {decodeBattle,encodeBattle,rankRows} from '../lib/battleCode'
import {getShareSourceLabel} from '../lib/shareCard'
import {paintStory} from '../lib/storyCanvas'
import {formatPercent,formatCurrency} from '../lib/format'
import {t} from '../i18n'
import type {PortfolioReport,Locale} from '../types'

interface Player {handle:string;division:DivisionKey;returnValue:number}
export function LocalArena({report:r,locale:l,players}:{report:PortfolioReport;locale:Locale;players:Player[]}){
  const {prefs:p,update}=useContext(Settings)
  const [tab,setTab]=useState('symbols')
  const [ascending,setAscending]=useState(false)
  const [group,setGroup]=useState('')
  const [opponent,setOpponent]=useState('')
  const [feedback,setFeedback]=useState('')
  const [benchmark,setBenchmark]=useState(p.benchmark==null?'':String(p.benchmark))
  const tr=(s:string)=>local(s,l)
  const div=getDivision(r.netLiquidationValue,r.baseCurrency)
  const worn=displayedMedals(r.medalValues??[],p.worn??[])
  const mine=r.seasonReturn!=null && Number.isSafeInteger(Math.round(r.seasonReturn*10000)) && div ? {percent:r.seasonReturn*100,division:div,medals:worn}:null
  const fieldList=mine?[formatPercent(mine.percent/100,l),t(l,mine.division),mine.medals.map(i=>i+' · '+local(medals[i][0],l)).join(', ')]:[]
  const league=players.filter(row=>!group || row.division===group)
  const alias=(i:number)=>tr('标的|標的|Symbol')+' '+String.fromCharCode(65+i%26)+(i>=26?String(1+Math.floor(i/26)):'')
  const data=tab==='league'?league.map(row=>({label:row.handle,value:row.returnValue})):
    tab==='months'?(r.storyFacts?.months??[]).flatMap((value,i)=>value==null?[]:[{label:r.seasonYear+'-'+String(i+1).padStart(2,'0'),value}]):
    r.symbols.map((s,i)=>({label:p.hideTickers?alias(i):s.symbol,value:s.totalYtdMtm}))
  const rows=rankRows(data,ascending)
  const title=tr(tab==='league'?'虚构选手|虛構選手|Fictional players':tab==='months'?'月度已实现，非市值|月度已實現，非市值|Monthly realized P&L, not market value':'个股赛季盈亏|個股賽季損益|Season P&L by symbol')
  const display=(n:number)=>tab==='league'?formatPercent(n,l):p.amount?formatCurrency(n,r.baseCurrency,l):tr('金额隐藏|金額隱藏|Amount hidden')
  const podium=rows.slice(0,3)
  const badge=(rank:number)=>rank===1
    ? tr(ascending?'逆风档案|逆風檔案|Headwind file':'榜首席位|榜首席位|First chair')
    : rank===2 ? tr('次席聚光灯|次席聚光燈|Second spotlight') : tr('登台留影|登台留影|Podium portrait')

  function save(){
    const canvas=document.createElement('canvas')
    paintStory(canvas,{title,lines:podium.map(row=>'#'+row.rank+'   '+row.label+'   '+display(row.value))},l,tab==='league'?tr('虚构选手|虛構選手|Fictional players'):getShareSourceLabel(r,l),'ARENA',1440)
    const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='pnl-arena-'+r.seasonYear+'-arena.png';a.click()
  }
  let other
  if(opponent)try{other=decodeBattle(opponent.trim())}catch{ /* user-visible error below */ }
  const myRank=r.seasonReturn==null?null:1+league.filter(row=>row.returnValue>r.seasonReturn!).length
  return <section className="panel local-arena">
    <h2>{title}</h2>
    <div className="arena-controls">
      <label>{tr('赛季|賽季|Season')} <select value={r.seasonYear} disabled><option>{r.seasonYear}</option></select></label>
      <label>{tr('榜单|榜單|Board')} <select value={tab} onChange={e=>setTab(e.target.value)}>
        <option value="symbols">{tr('个股|個股|Symbols')}</option><option value="months">{tr('月份|月份|Months')}</option><option value="league">{tr('示例联赛|示範聯賽|Demo league')}</option></select></label>
      {tab==='league'&&<label>{t(l,'division')} <select value={group} onChange={e=>setGroup(e.target.value)}><option value="">{tr('全部|全部|All')}</option>{[...new Set(players.map(x=>x.division))].map(d=><option value={d} key={d}>{t(l,d)}</option>)}</select></label>}
      <label>{tr('排序|排序|Sort')} <select value={ascending?'asc':'desc'} onChange={e=>setAscending(e.target.value==='asc')}><option value="desc">{tr('从高到低|由高到低|Highest first')}</option><option value="asc">{tr('从低到高|由低到高|Lowest first')}</option></select></label>
    </div>
    <ol className="podium">{podium.map(row=><li key={row.label}><span>#{row.rank}</span><strong>{row.label}</strong><small>{badge(row.rank)}</small><b>{display(row.value)}</b></li>)}</ol>
    {!rows.length&&<p>{tr('本季无可比数据。|本季無可比資料。|No comparable data this season.')}</p>}
    {tab==='symbols'&&<p>{tr('报表缺少逐标的收益率分母，按盈亏排序。|報表缺少逐標的報酬率分母，依損益排序。|Per-symbol return denominators are unavailable. Ranked by P&L.')}</p>}
    {rows.length>3&&<ol start={4}>{rows.slice(3).map(row=><li key={row.label}>{row.label} · {display(row.value)}</li>)}</ol>}
    {tab==='league' && myRank!=null && (!group||group===div) && <p className="league-standing">{tr('与虚构选手对比，仅供娱乐|與虛構選手比較，僅供娛樂|Against fictional players, for fun')} · #{myRank}</p>}
    <button onClick={save} data-arena-export>{tr('导出榜单|匯出榜單|Save leaderboard PNG')}</button>
    <h3>{tr('你与基准|你與基準|You vs benchmark')}</h3>
    <label>{tr('自定义基准收益率（%）|自訂基準報酬率（%）|Custom benchmark (%)')} <input type="number" step="any" value={benchmark} onChange={e=>setBenchmark(e.target.value)} onBlur={()=>{
      const n=Number(benchmark);update({...p,benchmark:benchmark.trim() && Number.isFinite(n)?n:undefined})
    }}/></label>
    {r.seasonReturn!=null && p.benchmark!=null && <p>{formatPercent(r.seasonReturn,l)} vs {formatPercent(p.benchmark/100,l)}</p>}
    <h3>{tr('本地对战码|本機對戰碼|Local battle code')}</h3>
    <p>{tr('校验和只检查输入错误，任何人都可以伪造成绩。|校驗和只檢查輸入錯誤，任何人都可以偽造成績。|The checksum detects typing errors. Anyone can forge a result.')}</p>
    {mine&&<><p>{tr('复制内容：收益率、段位、勋章 ID|複製內容：報酬率、段位、勳章 ID|Included: return, division and medal IDs')} · {fieldList.join(' / ')}</p>
    <button onClick={async()=>{try{await navigator.clipboard.writeText(encodeBattle(mine));setFeedback(tr('已复制。|已複製。|Copied.'))}catch{setFeedback(encodeBattle(mine))}}}>{tr('复制对战码|複製對戰碼|Copy battle code')}</button><output>{feedback}</output></>}
    <label>{tr('粘贴对手的码|貼上對手的碼|Paste opponent code')} <input maxLength={100} value={opponent} onChange={e=>setOpponent(e.target.value)}/></label>
    <output aria-live="polite">{opponent && (other?[formatPercent(r.seasonReturn,l),'vs',formatPercent(other.percent/100,l),t(l,other.division),...other.medals.map(id=>local(medals[id][0],l))].join(' · '):tr('对战码无效。|對戰碼無效。|Invalid battle code.'))}</output>
  </section>
}
