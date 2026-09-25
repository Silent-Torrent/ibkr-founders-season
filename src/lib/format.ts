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
  return formatPreciseCurrency(value, currency, locale, true)
}

// Reconciliation operands must keep their accepted decimal precision: the
// ordinary portfolio formatter rounds values above one currency unit.
export function formatReconciliationValue(
  value: number | undefined,
  currency: string,
  locale: Locale,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return formatPreciseCurrency(value, currency, locale, false)
}

function decimalFractionDigits(value: number): number {
  const [mantissa, exponentText = '0'] = Math.abs(value).toString().split('e')
  const mantissaFractionDigits = mantissa.split('.')[1]?.length ?? 0
  return Math.max(0, mantissaFractionDigits - Number(exponentText))
}

function formatPreciseCurrency(
  value: number,
  currency: string,
  locale: Locale,
  showPositiveSign: boolean,
): string {
  try {
    // Intl's standard currency display allows at most 20 fractional digits.
    // Use sufficient significant digits in scientific notation only when the
    // accepted Number needs more, so two distinct CSV values stay distinct.
    const useScientificNotation = decimalFractionDigits(value) > 20
    return new Intl.NumberFormat(localeMap[locale], {
      style: 'currency',
      currency,
      ...(useScientificNotation
        ? { notation: 'scientific' as const, maximumSignificantDigits: 21 }
        : { notation: 'standard' as const, maximumFractionDigits: 20 }),
      ...(showPositiveSign && !useScientificNotation ? { minimumFractionDigits: 2 } : {}),
      signDisplay: showPositiveSign ? 'exceptZero' : 'auto',
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
