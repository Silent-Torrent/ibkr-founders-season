import type { Locale } from '../types'

const localeMap: Record<Locale, string> = {
  en: 'en-US',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
}

export function formatCurrency(
  value: number | undefined,
  currency: string,
  locale: Locale,
  compact = false,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  // Whole-unit rounding must not turn a real gain or loss into an unsigned zero.
  if (value !== 0 && Math.abs(value) < 1) {
    return formatReconciliationDifference(value, currency, locale)
  }
  try {
    return new Intl.NumberFormat(localeMap[locale], {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
      signDisplay: 'exceptZero',
    }).format(value)
  } catch {
    return '—'
  }
}

export function formatReconciliationDifference(
  value: number | undefined,
  currency: string,
  locale: Locale,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value === 0) return formatCurrency(value, currency, locale)

  try {
    const absoluteValue = Math.abs(value)
    const useScientificNotation = absoluteValue < 1e-20
    const maximumFractionDigits = useScientificNotation
      ? 6
      : Math.max(2, Math.min(20, Math.ceil(-Math.log10(absoluteValue)) + 2))
    return new Intl.NumberFormat(localeMap[locale], {
      style: 'currency',
      currency,
      minimumFractionDigits: useScientificNotation ? 0 : 2,
      maximumFractionDigits,
      notation: useScientificNotation ? 'scientific' : 'standard',
      signDisplay: 'exceptZero',
    }).format(value)
  } catch {
    return '—'
  }
}

export function formatPercent(value: number | undefined, locale: Locale): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const absolutePercent = Math.abs(value) * 100
  const useScientificNotation = value !== 0 && absolutePercent < 1e-20
  return new Intl.NumberFormat(localeMap[locale], {
    style: 'percent',
    notation: useScientificNotation ? 'scientific' : 'standard',
    ...(value !== 0 && absolutePercent < 0.1
      ? { maximumSignificantDigits: 2 }
      : { maximumFractionDigits: 1 }),
    signDisplay: 'exceptZero',
  }).format(value)
}

export function formatDate(value: string, locale: Locale): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(localeMap[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function pnlClass(value: number | undefined): string {
  if (value == null || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}
