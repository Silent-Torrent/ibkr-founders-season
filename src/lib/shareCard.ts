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
  { signal }: { signal?: AbortSignal } = {},
): Promise<SeasonCardDelivery | null> {
  const filename = `pnl-arena-${report.seasonYear}-season.png`
  if (signal?.aborted) return { filename, kind: 'cancelled' }
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1500
  const context = canvas.getContext('2d')
  if (!context) return null

  const currency = report.baseCurrency
  const divisionKey = getDivision(report.netLiquidationValue, report.baseCurrency)
  const division = divisionKey ? t(locale, divisionKey) : t(locale, 'divisionUnavailable')
  const sourceLabel = getShareSourceLabel(report, locale)
  const qualityLabel = getShareQualityLabel(report, locale)

  const background = context.createLinearGradient(0, 0, 1200, 1500)
  background.addColorStop(0, '#070a0f')
  background.addColorStop(0.55, '#101722')
  background.addColorStop(1, '#07110f')
  context.fillStyle = background
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.strokeStyle = 'rgba(255,255,255,0.08)'
  context.lineWidth = 2
  roundedRect(context, 72, 72, 1056, 1356, 44)
  context.stroke()

  context.fillStyle = '#8aa0b5'
  context.font = '600 30px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(`${report.seasonYear} ${t(locale, 'seasonLabel').toUpperCase()}`, 120, 150)

  context.fillStyle = '#f3f7fb'
  context.font = '700 72px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(t(locale, 'seasonPnl'), 120, 270)

  context.fillStyle = report.seasonPnl >= 0 ? '#62e6ac' : '#ff7d86'
  context.font = '800 126px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(formatCurrency(report.seasonPnl, currency, locale), 120, 410)

  context.fillStyle = '#a8b6c5'
  context.font = '600 38px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(`${t(locale, 'seasonReturn')}: ${formatShareSeasonReturn(report.seasonReturn, locale)}`, 120, 485)
  context.fillText(`${t(locale, 'division')}: ${division}`, 120, 545)

  const cards = [
    {
      label: t(locale, 'stocks'),
      value: formatCurrency(report.stockPnl, currency, locale),
      pnl: report.stockPnl,
    },
    {
      label: t(locale, 'options'),
      value: formatCurrency(report.optionPnl, currency, locale),
      pnl: report.optionPnl,
    },
  ]

  cards.forEach((card, index) => {
    const x = 120 + index * 500
    roundedRect(context, x, 630, 460, 190, 28)
    context.fillStyle = 'rgba(255,255,255,0.045)'
    context.fill()
    context.fillStyle = '#91a2b3'
    context.font = '600 30px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(card.label, x + 36, 690)
    context.fillStyle = card.pnl >= 0 ? '#62e6ac' : '#ff7d86'
    context.font = '750 58px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(card.value, x + 36, 775)
  })

  const rows = [
    { label: t(locale, 'dataThrough'), value: formatDate(report.endDate, locale) },
    { label: t(locale, 'sourceType'), value: sourceLabel },
    { label: t(locale, 'trustCalculationCheck'), value: qualityLabel },
  ]

  rows.forEach((row, index) => {
    const y = 885 + index * 120
    context.fillStyle = '#718397'
    context.font = '650 25px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(row.label, 120, y)
    context.fillStyle = '#f3f7fb'
    context.font = '750 48px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(row.value, 120, y + 52)
  })

  context.fillStyle = '#6f8193'
  context.font = '500 25px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(t(locale, 'shareNoHoldings'), 120, 1285)

  drawArenaMark(context, 842, 1329, 2.25)
  context.textAlign = 'right'
  context.fillStyle = '#f3f7fb'
  context.font = '700 30px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText('P&L ARENA', 1080, 1367)
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

export function buildSeasonSummary(report: PortfolioReport, locale: Locale): string {
  return [
    `${report.seasonYear} ${t(locale, 'seasonLabel')}`,
    `${t(locale, 'seasonPnl')}: ${formatCurrency(report.seasonPnl, report.baseCurrency, locale)}`,
    `${t(locale, 'seasonReturn')}: ${formatShareSeasonReturn(report.seasonReturn, locale)}`,
    `${t(locale, 'optionsPnl')}: ${formatCurrency(report.optionPnl, report.baseCurrency, locale)}`,
    `${t(locale, 'dataThrough')}: ${report.endDate}`,
    `${t(locale, 'sourceType')}: ${getShareSourceLabel(report, locale)}`,
    `${t(locale, 'trustCalculationCheck')}: ${getShareQualityLabel(report, locale)}`,
    t(locale, 'shareNoHoldings'),
  ]
    .filter(Boolean)
    .join('\n')
}
