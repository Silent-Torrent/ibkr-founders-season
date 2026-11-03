import { thresholds as k, personalities } from '../data/personas'
import { local, insufficient } from '../data/medals'
import type { PortfolioReport, Locale } from '../types'
import { getDivision } from './season'

interface Signals {
  holdDays?: number
  ordersPerWeek?: number
  optionShare?: number
  dividendShare?: number
  shortExpiry?: boolean
  premiumExpiry?: boolean
  recurringMonths?: number
  averageExposure?: number
}
// Highest score wins. Equal scores use the published array order.
export function classify(s: Signals): number|undefined {
  const scores = [
    (s.holdDays ?? 0)>=k.holdDays ? 2+Number((s.averageExposure ?? 0)>=k.concentratedExposure) : 0,
    (s.ordersPerWeek ?? 0)>=k.fastOrdersPerWeek ? 2 : 0,
    s.premiumExpiry && (s.optionShare ?? 0)>=k.optionsShare ? 3 : 0,
    s.shortExpiry && (s.optionShare ?? 0)>=k.optionsShare ? 3 : 0,
    (s.dividendShare ?? 0)>=k.dividendShare ? 2 : 0,
    (s.recurringMonths ?? 0)>=k.recurringMonths ? 2 : 0,
  ]
  const best=Math.max(...scores)
  return best ? scores.indexOf(best) : undefined
}
export function personaCopy(r: PortfolioReport,l: Locale,roast: boolean) {
  const p=r.persona==null?undefined:personalities[r.persona]
  const lowCash = r.netLiquidationValue!=null && r.netLiquidationValue>0 && r.cashValue!=null && r.cashValue>=0 && r.cashValue/r.netLiquidationValue<=0.1
  const tags=roast ? [
    lowCash ? local('梭哈之王|梭哈之王|All-In Royalty',l) : '',
    r.medalValues?.[2] && (r.medalValues?.[1] ?? 0)<0 ? local('抄底抄在半山腰|抄底抄在半山腰|Dip Before the Dip',l) : '',
  ].filter(Boolean) : []
  return {name:p?local(p[0],l):insufficient(l),line:p?local(p[roast?1:2],l):'',tags}
}
const divisions=['rookieLeague','retailLeague','sixFigureLeague','capitalLeague','whaleLeague']
export const mascotPaths=[
 'M10 38Q8 18 4 12Q17 17 19 34Q16 13 23 4Q27 21 23 35Q31 14 39 12Q32 25 29 38Z',
 'M6 7L16 14L29 14L40 7L35 21L32 35L21 39L10 32L9 21Z',
 'M5 14Q0 2 13 6L17 10H28L33 5Q46 4 39 17L38 30Q24 45 8 32Z',
 'M4 16L2 3L15 12L26 12L42 2L39 17L33 22L32 34L23 40L12 34L11 22Z',
 'M5 14L10 9L20 6L35 8L39 15L35 20L34 32L22 41L10 32L9 20Z',
]
export function mascot(r: PortfolioReport) {
  const division=getDivision(r.netLiquidationValue,r.baseCurrency)
  return division ? mascotPaths[divisions.indexOf(division)] : undefined
}
