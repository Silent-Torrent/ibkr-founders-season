import type { Locale, PortfolioReport } from '../types'
import { formatCurrency, formatPercent } from './format'
import { getDivision } from './season'
import { t } from '../i18n'

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

export function downloadSeasonCard(report: PortfolioReport, locale: Locale): void {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1500
  const context = canvas.getContext('2d')
  if (!context) return

  const currency = report.baseCurrency
  const best = [...report.symbols].sort((a, b) => b.totalYtdMtm - a.totalYtdMtm)[0]
  const worst = [...report.symbols].sort((a, b) => a.totalYtdMtm - b.totalYtdMtm)[0]
  const division = t(locale, getDivision(report.netLiquidationValue))

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
  context.fillText(`${t(locale, 'seasonReturn')}: ${formatPercent(report.seasonReturn, locale)}`, 120, 485)
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
    { label: 'BEST UNDERLYING', symbol: best?.symbol ?? '—', value: best?.totalYtdMtm },
    { label: 'WORST UNDERLYING', symbol: worst?.symbol ?? '—', value: worst?.totalYtdMtm },
  ]

  rows.forEach((row, index) => {
    const y = 925 + index * 150
    context.fillStyle = '#718397'
    context.font = '650 25px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(row.label, 120, y)
    context.fillStyle = '#f3f7fb'
    context.font = '750 48px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(row.symbol, 120, y + 60)
    context.textAlign = 'right'
    context.fillStyle = (row.value ?? 0) >= 0 ? '#62e6ac' : '#ff7d86'
    context.fillText(formatCurrency(row.value, currency, locale), 1080, y + 60)
    context.textAlign = 'left'
  })

  context.fillStyle = '#6f8193'
  context.font = '500 25px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText(`${t(locale, 'dataThrough')}: ${report.endDate}`, 120, 1270)
  context.fillText(`${t(locale, 'selfReported')} · IBKR local statement`, 120, 1320)

  context.textAlign = 'right'
  context.fillStyle = '#f3f7fb'
  context.font = '700 30px -apple-system, BlinkMacSystemFont, sans-serif'
  context.fillText('P&L ARENA', 1080, 1320)
  context.textAlign = 'left'

  const link = document.createElement('a')
  link.download = `pnl-arena-${report.seasonYear}-season.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export function buildSeasonSummary(report: PortfolioReport, locale: Locale): string {
  const best = [...report.symbols].sort((a, b) => b.totalYtdMtm - a.totalYtdMtm)[0]
  return [
    `${report.seasonYear} ${t(locale, 'seasonLabel')}`,
    `${t(locale, 'seasonPnl')}: ${formatCurrency(report.seasonPnl, report.baseCurrency, locale)}`,
    `${t(locale, 'seasonReturn')}: ${formatPercent(report.seasonReturn, locale)}`,
    `${t(locale, 'optionsPnl')}: ${formatCurrency(report.optionPnl, report.baseCurrency, locale)}`,
    best
      ? `Best underlying: ${best.symbol} ${formatCurrency(best.totalYtdMtm, report.baseCurrency, locale)}`
      : '',
    `${t(locale, 'dataThrough')}: ${report.endDate}`,
    `${t(locale, 'selfReported')} · IBKR local statement`,
  ]
    .filter(Boolean)
    .join('\n')
}
