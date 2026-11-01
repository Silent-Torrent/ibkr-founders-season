import type { Locale, PortfolioReport } from '../types'
import { lines, local, tr, insufficient } from '../data/medals'
export interface Preferences {
  roast: boolean
  amount: boolean
  hideTickers: boolean
  colors: 'auto' | 'red' | 'green'
  prices: Record<string, number>
  firstMonth?: string
}
export const defaults: Preferences = {
  roast: true,
  amount: false,
  hideTickers: true,
  colors: 'auto',
  prices: {},
}
export type CardSize = 'portrait' | 'story' | '3x4'
export type Template = 'auto' | 'feast' | 'noodles'
export const dimensions = {
  portrait: [1200, 1500],
  story: [1080, 1920],
  '3x4': [1080, 1440],
} as const
export function priceFor(p: Preferences, l: Locale, c: string) {
  return (
    p.prices[c] ??
    (c === 'USD' ? (l === 'en' ? 12 : l === 'zh-TW' ? 3 : 2) : undefined)
  )
}
export function ramen(r: PortfolioReport, l: Locale, p: Preferences) {
  const fee = r.medalValues?.[7],
    price = priceFor(p, l, r.baseCurrency)
  if (!price)
    return tr(
      l,
      '请填写本币拉面价格',
      '請填寫本幣拉麵價格',
      'Enter a ramen price in your account currency',
    )
  if (fee == null)
    return (
      tr(l, '手续费换算', '手續費換算', 'Fees in ramen') +
      ' · ' +
      insufficient(l)
    )
  const decimal = (v: number) => {
    const [mantissa, exp = '0'] = String(v).split('e')
    const [whole, fraction = ''] = mantissa.split('.')
    return {
      units: BigInt(whole + fraction),
      scale: fraction.length - Number(exp),
    }
  }
  const a = decimal(fee),
    b = decimal(price),
    shift = b.scale - a.scale
  const n =
    (a.units * 10n ** BigInt(Math.max(0, shift))) /
    (b.units * 10n ** BigInt(Math.max(0, -shift)))
  return tr(
    l,
    `今年手续费够吃 ${n} 碗拉面，券商年终奖有你一份。`,
    `今年手續費夠吃 ${n} 碗拉麵，券商年終獎金有你一份。`,
    `Your fees this season = ${n} bowls of ramen. Your broker says thanks.`,
  )
}
export function cardTheme(
  r: PortfolioReport,
  l: Locale,
  p: Preferences,
  template: Template,
) {
  const feast =
    template === 'auto'
      ? (r.seasonReturn ?? r.seasonPnl) >= 0
      : template === 'feast'
  const variants = lines[(feast ? 0 : 2) + (p.roast ? 0 : 1)]
  return {
    feast,
    title: feast
      ? tr(l, '吃肉', '吃肉', 'Gain Day Feast')
      : tr(l, '关灯吃面', '關燈吃麵', 'Noodles in the Dark'),
    line: local(variants[Number(r.endDate.slice(-2)) % variants.length], l),
  }
}
import { medals } from '../data/medals'
import { hotTickers } from './medalRules'
export function cardBadges(r: PortfolioReport, l: Locale, p: Preferences) {
  if (r.source !== 'local') return []
  return medals
    .flatMap((m, i) => {
      const n = r.medalValues?.[i]
      if (!n) return []
      const codes =
        !p.hideTickers && i >= 14
          ? hotTickers[r.seasonYear]?.[i - 14]
              ?.filter((_, j) => n & (1 << j))
              .join(', ')
          : ''
      return [local(m[0], l) + (codes ? ' · ' + codes : '')]
    })
    .slice(0, 3)
}
