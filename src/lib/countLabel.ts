import type { Locale } from '../types'
import { t } from '../i18n'

const english = new Intl.PluralRules('en')

// All current count labels use regular English plurals. The number itself
// stays in its original representation, including exact bigint bowl counts.
export function englishNoun(count: number | bigint, singular: string): string {
  return english.select(Number(count)) === 'one' ? singular : singular + 's'
}

export function sourceRowCount(locale: Locale, count: number): string {
  return locale === 'en' ? count + ' ' + englishNoun(count, 'source row')
    : t(locale, 'sourceRowCount').replace('{count}', String(count))
}
