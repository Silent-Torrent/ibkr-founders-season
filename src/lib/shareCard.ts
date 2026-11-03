import { personaCopy,mascot } from './persona'
import {ribbon,seal,sealLines} from './medalArt'
import {cardMedals,cardTheme,defaults,dimensions,ramen,type CardSize,type Template,type Preferences} from './cardOptions'
import {advice} from '../data/medals'
import type { Locale, PortfolioReport } from '../types'
import { formatCurrency, formatDate, formatPercent } from './format'
import { getDivision } from './season'
import { t } from '../i18n'
import { reportTrustLabelKey } from './reportSource'

export type SeasonCardDelivery =
  | { kind: 'cancelled' | 'downloadStarted' | 'shared'; filename: string }
  | { kind: 'preview'; filename: string; previewUrl: string }

export function getShareSourceLabel(report: PortfolioReport, locale: Locale): string {
  return t(locale, reportTrustLabelKey(report.source))
}

export function getShareQualityLabel(report: PortfolioReport, locale: Locale): string {
  if (report.dataQuality === 'good') return t(locale, 'qualityGood')
  if (report.dataQuality === 'warning') return t(locale, 'qualityWarning')
  return t(locale, 'qualityError')
}

export function formatShareSeasonReturn(value: number | undefined, locale: Locale): string {
  return value == null ? t(locale, 'valueUnavailable') : formatPercent(value, locale)
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error('Invalid PNG data URL')
  const header = dataUrl.slice(0, separator)
  const payload = dataUrl.slice(separator + 1)
  if (!header.includes(';base64')) throw new Error('PNG data URL is not base64 encoded')

  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], filename, { type: 'image/png' })
}

function triggerBrowserDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

function supportsFileShare(file: File): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function'
  ) {
    return false
  }

  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name)
    : ''
}

function needsExplicitPreviewFallback(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function createLocalPreview(file: File, filename: string): SeasonCardDelivery | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null

  try {
    return { filename, kind: 'preview', previewUrl: URL.createObjectURL(file) }
  } catch {
    return null
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function drawArenaMark(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
): void {
  context.save()
  context.strokeStyle = '#d8ff4f'
  context.globalAlpha = 0.52
  context.lineWidth = 1.5 * scale
  context.beginPath()
  context.arc(x + 12 * scale, y + 12 * scale, 9 * scale, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = '#8e9dab'
  context.globalAlpha = 0.55
  context.lineWidth = scale
  context.beginPath()
  context.moveTo(x + 5 * scale, y + 12 * scale)
  context.lineTo(x + 19 * scale, y + 12 * scale)
  context.stroke()

  context.strokeStyle = '#d8ff4f'
  context.globalAlpha = 1
  context.lineWidth = 2 * scale
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(x + 5.25 * scale, y + 15.75 * scale)
  context.lineTo(x + 8.75 * scale, y + 12.25 * scale)
  context.lineTo(x + 11.25 * scale, y + 13.75 * scale)
  context.lineTo(x + 15.25 * scale, y + 8.25 * scale)
  context.lineTo(x + 18.75 * scale, y + 10.25 * scale)
  context.stroke()
  context.restore()
}

export async function downloadSeasonCard(
  report: PortfolioReport,
  locale: Locale,
  { signal,prefs=defaults,size='portrait',template='auto' }: { signal?: AbortSignal; prefs?:Preferences; size?:CardSize; template?:Template } = {},
): Promise<SeasonCardDelivery | null> {
  const filename = `pnl-arena-${report.seasonYear}-season${size==='portrait'?'':'-'+size}.png`
  if (signal?.aborted) return { filename, kind: 'cancelled' }
  const canvas = document.createElement('canvas')
  const [width,height]=dimensions[size]
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  const currency = report.baseCurrency
  const divisionKey = getDivision(report.netLiquidationValue, report.baseCurrency)
  const division = divisionKey ? t(locale, divisionKey) : t(locale, 'divisionUnavailable')
  const sourceLabel = getShareSourceLabel(report, locale)
  const qualityLabel = getShareQualityLabel(report, locale)

  if (document.fonts && !document.fonts.check('30px ArenaSeason')) await document.fonts.load('30px ArenaSeason')
  if (signal?.aborted) return { filename, kind: 'cancelled' }
  const theme=cardTheme(report,locale,prefs,template)
  const background=context.createLinearGradient(0,0,width,height)
  background.addColorStop(0,theme.feast?'#4a2c1c':'#222637')
  background.addColorStop(1,theme.feast?'#201710':'#0c101a')
  context.fillStyle=background
  context.fillRect(0,0,width,height)
  context.strokeStyle=theme.feast?'#e6b869':'#677593'
  context.lineWidth=3
  roundedRect(context,50,50,width-100,height-100,36)
  context.stroke()
  const ink = '#f5efe6'
  const accent = theme.feast ? '#f4c780' : '#b5c9ef'
  const season = `${report.seasonYear} ${t(locale,'seasonLabel').toUpperCase()}`
  const date = t(locale,'dataThrough')+' · '+formatDate(report.endDate,locale)
  const redGains = prefs.colors==='red'||(prefs.colors==='auto'&&locale==='zh-CN')
  const returnColor = report.seasonReturn==null||report.seasonReturn===0 ? ink :
    (report.seasonReturn>0)===redGains ? '#ff989c' : '#85efb7'
  const value = formatShareSeasonReturn(report.seasonReturn,locale)
  const amount = formatCurrency(report.seasonPnl,currency,locale)
  const badges = cardMedals(report,locale,prefs)
  const cost = ramen(report,locale,prefs)
  function textAt(text:string,x:number,y:number,px:number,span=width-x-90,color=ink) {
    context!.font=`650 ${px}px ArenaSeason, sans-serif`
    context!.fillStyle=color
    context!.fillText(text,x,y,span)
  }
  function panel(x:number,y:number,w:number,h:number) {
    roundedRect(context!,x,y,w,h,26)
    context!.fillStyle=theme.feast?'#503625':'#2a3041'
    context!.fill()
  }
  function medalAt(badge:(typeof badges)[number],x:number,y:number,span:number,px=32) {
    context!.save()
    context!.translate(x,y-px)
    context!.scale(px/56,px/56)
    context!.fillStyle=accent
    context!.fill(new Path2D(ribbon))
    context!.fill(new Path2D(seal))
    context!.strokeStyle='#182023'
    context!.lineWidth=3
    context!.stroke(new Path2D(sealLines(badge.id)))
    context!.restore()
    textAt(badge.label,x+px+12,y,px,span-px-12)
  }
  const identity=personaCopy(report,locale,prefs.roast)
  const mascotPath=mascot(report)
  if(mascotPath) {
    context.save()
    context.translate(83,305)
    context.fillStyle=accent
    context.fill(new Path2D(mascotPath))
    context.restore()
  }
  if(report.persona!=null) textAt(identity.name,142,338,32,width-240)
  if(size==='portrait') {
    // A wide masthead and a single-column performance poster.
    textAt(season,100,144,40)
    textAt(division,100,220,46)
    textAt(sourceLabel,100,280,31)
    textAt(theme.title,100,440,80)
    textAt(value,100,620,144,width-200,returnColor)
    textAt(theme.line,100,713,38)
    if(prefs.amount) textAt(amount,100,787,46)
    panel(80,818,width-160,172)
    textAt(t(locale,'trustCalculationCheck'),110,867,28)
    textAt(qualityLabel,110,937,42,465)
    textAt(date,600,937,29,465)
    badges.forEach((badge,i)=>medalAt(badge,100,1055+i*48,width-200))
    textAt(cost,100,1216,34)
    textAt(t(locale,'shareNoHoldings'),100,1290,25)
    textAt(advice(locale),100,1352,29)
  } else if(size==='story') {
    // A vertical reading sequence with stacked medal rows.
    textAt(season,86,150,38)
    textAt(division,86,228,42,425,accent)
    textAt(sourceLabel,540,228,30,452)
    textAt(theme.title,86,447,85)
    textAt(value,86,663,156,908,returnColor)
    if(prefs.amount) textAt(amount,86,746,47)
    textAt(theme.line,86,865,43)
    panel(65,1000,950,180)
    textAt(t(locale,'trustCalculationCheck'),98,1064,30)
    textAt(qualityLabel,98,1140,44,440)
    textAt(date,555,1136,28,410)
    textAt(t(locale,'trophiesTitle'),86,1280,40,908,accent)
    badges.forEach((badge,i)=>medalAt(badge,89,1364+i*62,904,38))
    textAt(cost,86,badges.length>1?1620:1524,36)
    textAt(advice(locale),86,1750,38)
  } else {
    // A compact two-column scorecard; the medal and cost panels anchor its lower half.
    textAt(season,82,139,37)
    textAt(division,82,223,41,435,accent)
    textAt(sourceLabel,550,223,30,443)
    textAt(theme.title,82,394,70,480)
    textAt(value,595,395,104,403,returnColor)
    textAt(theme.line,82,505,39)
    if(prefs.amount) textAt(amount,82,580,44)
    panel(65,632,950,191)
    textAt(t(locale,'trustCalculationCheck'),98,697,29)
    textAt(qualityLabel,98,778,43,430)
    textAt(date,550,776,30,425)
    panel(65,850,950,224)
    textAt(t(locale,'trophiesTitle'),95,908,35,890,accent)
    badges.forEach((badge,i)=>medalAt(badge,95,959+i*47,890,29))
    if(!badges.length) textAt(t(locale,'trophyStatusNotMet'),95,999,31,890)
    panel(65,1090,950,116)
    context.font='650 33px ArenaSeason, sans-serif'
    // Keep the conversion and its quip intact when they need separate lines.
    const pause = locale === 'en' ? cost.indexOf('. ') : cost.indexOf('，')
    const costLines = context.measureText(cost).width > 890 && pause >= 0
      ? [cost.slice(0,pause+1), cost.slice(pause+1).trimStart()] : [cost]
    costLines.forEach((line,i)=>textAt(line,95,costLines.length===1?1160:1139+i*42,33,890))
    textAt(t(locale,'shareNoHoldings'),82,1251,25)
    textAt(advice(locale),82,1315,28)
  }

  context.textAlign = 'right'
  context.fillStyle = '#f3f7fb'
  context.font = `700 ${size==='story'?40:30}px -apple-system, BlinkMacSystemFont, sans-serif`
  const brand = 'P&L ARENA'
  const labelRight = width-100
  const metrics = context.measureText(brand)
  const labelLeft = labelRight - Math.max(metrics.width, metrics.actualBoundingBoxLeft)
  const markScale = 2.25
  // Place the entire 24-unit mark before the label, including room for its stroke.
  drawArenaMark(context, labelLeft - 24 - 24 * markScale, height*.94-27, markScale)
  context.fillText(brand, labelRight, height*.94+11)
  context.textAlign = 'left'

  const dataUrl = canvas.toDataURL('image/png')
  let file: File | null = null
  try {
    if (typeof File === 'function') file = dataUrlToFile(dataUrl, filename)
  } catch {
    file = null
  }

  const useAppleMobileDelivery = needsExplicitPreviewFallback()

  if (file && useAppleMobileDelivery && supportsFileShare(file)) {
    try {
      await navigator.share({ files: [file], title: t(locale, 'shareCard') })
      if (signal?.aborted) return { filename, kind: 'cancelled' }
      return { filename, kind: 'shared' }
    } catch (error: unknown) {
      // The system share sheet cannot be recalled; do not create another output after its owner changes.
      if (signal?.aborted) return { filename, kind: 'cancelled' }
      if (errorName(error) === 'AbortError') return { filename, kind: 'cancelled' }

      const preview = createLocalPreview(file, filename)
      if (preview) return preview
    }
  }

  if (file && useAppleMobileDelivery) {
    const preview = createLocalPreview(file, filename)
    if (preview) return preview
  }

  triggerBrowserDownload(dataUrl, filename)
  return { filename, kind: 'downloadStarted' }
}

export function buildSeasonSummary(report: PortfolioReport, locale: Locale, prefs=defaults, template:Template='auto'): string {
  const theme=cardTheme(report,locale,prefs,template)
  const division=getDivision(report.netLiquidationValue,report.baseCurrency)
  return [
    `${report.seasonYear} ${t(locale, 'seasonLabel')}`,
    theme.title, theme.line,
    t(locale,'division')+' · '+t(locale,division??'divisionUnavailable'),
    ...cardMedals(report,locale,prefs).map(b=>b.label),
    ramen(report,locale,prefs),
    prefs.amount && `${t(locale, 'seasonPnl')}: ${formatCurrency(report.seasonPnl, report.baseCurrency, locale)}`,
    `${t(locale, 'seasonReturn')}: ${formatShareSeasonReturn(report.seasonReturn, locale)}`,
    prefs.amount && `${t(locale, 'optionsPnl')}: ${formatCurrency(report.optionPnl, report.baseCurrency, locale)}`,
    `${t(locale, 'dataThrough')}: ${report.endDate}`,
    `${t(locale, 'sourceType')}: ${getShareSourceLabel(report, locale)}`,
    `${t(locale, 'trustCalculationCheck')}: ${getShareQualityLabel(report, locale)}`,
    t(locale, 'shareNoHoldings'),
    advice(locale),
  ]
    .filter(Boolean)
    .join('\n')
}
