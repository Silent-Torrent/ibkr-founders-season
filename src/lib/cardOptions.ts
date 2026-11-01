import { hotTickers } from './medalRules'
import { formatCurrency } from './format'
import type { Locale, PortfolioReport } from '../types'
import { medals, lines, local, tr, insufficient } from '../data/medals'
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
    `Your fees this season = ${n} ${n === 1n ? 'bowl' : 'bowls'} of ramen. Your broker says thanks.`,
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
export function medalOutcome(
  index: number,
  report: PortfolioReport,
  locale: Locale,
  prefs: Preferences,
) {
  const value = report.medalValues?.[index] ?? null
  const earned = value !== null && value !== 0
  let tier: number | null = null,
    detail = ''
  if (earned && value !== null) {
    switch (index) {
      case 0:
        tier = value >= 270 ? 2 : value >= 180 ? 1 : 0
        detail = value + tr(locale, ' 天', ' 天', ' days')
        break
      case 1:
        if (prefs.amount)
          detail = formatCurrency(value, report.baseCurrency, locale)
        break
      case 6:
        tier = value >= 10 ? 2 : value >= 5 ? 1 : 0
        detail = value + tr(locale, ' 个派息标的', ' 檔配息標的', ' payers')
        break
      case 7:
        detail = ramen(report, locale, prefs)
        break
      case 11:
      case 12:
        detail = String(value).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3')
        break
      case 13:
        detail = report.source === 'local' ? prefs.firstMonth ?? '' : ''
        break
      default:
        if (index >= 14 && !prefs.hideTickers)
          detail =
            hotTickers[report.seasonYear]?.[index - 14]
              ?.filter((_, j) => value & (1 << j))
              .join(', ') ?? ''
    }
  }
  return { value, earned, tier, detail }
}
export function cardMedals(
  report: PortfolioReport,
  locale: Locale,
  prefs: Preferences,
) {
  return medals
    .flatMap((m, i) => {
      const badge = medalOutcome(i, report, locale, prefs)
      if (!badge.earned) return []
      return [
        {
          id: i,
          label:
            local(m[0], locale) +
            (i >= 14 && badge.detail ? ' · ' + badge.detail : ''),
        },
      ]
    })
    .slice(0, 3)
}

export function cardBadges(r: PortfolioReport, l: Locale, p: Preferences) {
  return cardMedals(r, l, p).map((b) => b.label)
}
