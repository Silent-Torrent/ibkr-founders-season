import { advice, local, medals, tr } from '../data/medals'
import type { Locale, PortfolioReport } from '../types'
import { medalOutcome, tierName, type Preferences } from './cardOptions'
import { rarity, rarityLabels } from './medalCollection'
import { ribbon, seal, sealLines } from './medalArt'
import { getShareSourceLabel } from './shareCard'

export function medalPoster(report: PortfolioReport, id: number, l: Locale, p: Preferences) {
  const badge = medalOutcome(id,report,l,p)
  if (!badge.earned) return
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1080
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#111e27'
  ctx.fillRect(0,0,1080,1080)
  ctx.textAlign = 'center'
  function line(text: string, y: number, size: number, color = '#edf8f4') {
    ctx!.fillStyle = color
    ctx!.font = 'bold '+size+'px system-ui'
    ctx!.fillText(text,540,y,950)
  }
  line('P&L ARENA   /   '+report.seasonYear,104,40)
  ctx.save()
  ctx.translate(380,195)
  ctx.scale(5,5)
  ctx.fillStyle = ['#cf956a','#c1cdd6','#ffd070','#a4edef'][badge.tier ?? 0]
  ctx.fill(new Path2D(ribbon))
  ctx.fill(new Path2D(seal))
  ctx.strokeStyle = '#23353c'
  ctx.lineWidth = 2
  ctx.stroke(new Path2D(sealLines(id)))
  ctx.restore()
  line(local(medals[id][0],l),665,76)
  line([local(rarityLabels[rarity[id]],l),tierName(badge.tier,l)].filter(Boolean).join(' · '),750,44)
  if (id>=14) line([tr(l,'只表示交易过','只代表交易過','Records a trade only'),badge.detail].filter(Boolean).join(' · '),835,36)
  line(getShareSourceLabel(report,l),927,34)
  line(advice(l),1004,34)
  return {url:canvas.toDataURL('image/png'),filename:'pnl-arena-'+report.seasonYear+'-medal-'+id+'.png'}
}
