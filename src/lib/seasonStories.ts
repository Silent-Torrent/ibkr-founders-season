import type { PortfolioReport,Locale } from '../types'
import { local, medals } from '../data/medals'
import { formatCurrency } from './format'
import { displayedMedals } from './medalCollection'
import { type Preferences, priceFor } from './cardOptions'
import { personaCopy } from './persona'
import { getDivision } from './season'
import { t } from '../i18n'

export interface Story { title:string; lines:string[]; bars?:number[] }
export function stories(r:PortfolioReport,l:Locale,p:Preferences):Story[]{
  if(r.source==='demo')return []
  const data=r.storyFacts
  const pages:Story[]=[]
  const add=(title:string,lines:string[],bars?:number[])=>pages.push({title:local(title,l),lines,bars})
  const opening=getDivision(r.beginningNav,r.baseCurrency)
  if(opening)add('开局段位|開局段位|Opening division',[t(l,opening)])
  if(data?.top.length)add('交易足迹 Top 5|交易足跡 Top 5|Most traded',data.top.map((s,i)=>p.hideTickers?local('标的|標的|Symbol',l)+' '+String.fromCharCode(65+i):s))
  const price=priceFor(p,l,r.baseCurrency)
  const result=(n:number)=>p.amount?formatCurrency(n,r.baseCurrency,l):price?(n/price).toLocaleString(l,{maximumFractionDigits:1})+' '+local('碗|碗|bowls',l):''
  if(data && (p.amount || price)) {
    if(data.best!=null)add('最赚一笔|獲利最高一筆|Best close',[result(data.best)])
    if(data.worst!=null)add('最亏一笔|虧損最大一筆|Toughest close',[result(data.worst)])
  }
  const days=r.medalValues?.[0]
  if(days)add('最长可确认持仓|最長可確認持有|Longest documented hold',[days+' '+local('天|天|days',l)])
  if(data && data.months.some(n=>n!=null)){
    const entries=data.months.flatMap((n,i)=>n==null?[]:[{month:r.seasonYear+'-'+String(i+1).padStart(2,'0'),value:n}])
    add('月度已实现，非市值|月度已實現，非市值|Monthly realized P&L, not market value',entries.map(({month,value})=>month+'   '+result(value)),entries.map(e=>e.value))
  }
  if(r.persona!=null){const copy=personaCopy(r,l,p.roast);add('交易人格|交易人格|Trading persona',[copy.name,copy.line])}
  const equipped=displayedMedals(r.medalValues??[],p.worn??[])
  if(equipped.length)add('佩戴勋章|佩戴勳章|Pinned medals',equipped.map(id=>local(medals[id][0],l)))
  add('赛季落幕|賽季落幕|Season finale',[String(r.seasonYear),'P&L ARENA'])
  return pages
}
