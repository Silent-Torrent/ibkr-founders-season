import type { ParserDiagnosticCode } from '../types'

const MAX_FIELD_CHARACTERS = 250_000

type CsvParseFailureCode = Extract<
  ParserDiagnosticCode,
  'csv_too_many_rows' | 'csv_field_too_large' | 'csv_unterminated_quote'
>

export class CsvParseFailure extends Error {
  readonly code: CsvParseFailureCode

  constructor(code: CsvParseFailureCode) {
    super(code)
    this.name = 'CsvParseFailure'
    this.code = code
  }
}

export function parseCsvRows(input: string, maxRows?: number): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const appendNonEmptyRow = () => {
    if (!row.some((value) => value !== '')) return
    rows.push(row)
    if (maxRows !== undefined && rows.length > maxRows) {
      throw new CsvParseFailure('csv_too_many_rows')
    }
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          if (field.length > MAX_FIELD_CHARACTERS) {
            throw new CsvParseFailure('csv_field_too_large')
          }
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
        if (field.length > MAX_FIELD_CHARACTERS) {
          throw new CsvParseFailure('csv_field_too_large')
        }
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field.trim())
      field = ''
    } else if (char === '\n') {
      row.push(field.trim())
      appendNonEmptyRow()
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
      if (field.length > MAX_FIELD_CHARACTERS) {
        throw new CsvParseFailure('csv_field_too_large')
      }
    }
  }

  if (inQuotes) {
    throw new CsvParseFailure('csv_unterminated_quote')
  }

  if (field !== '' || row.length > 0) {
    row.push(field.trim())
    appendNonEmptyRow()
  }

  return rows
}

export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/p\s*\/\s*l/g, 'pnl')
    .replace(/[^a-z0-9]/g, '')
}

export function parseNumber(value: string | undefined): number | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-' || trimmed === '--') return undefined

  const negativeByParentheses = /^\(.*\)$/.test(trimmed)
  const normalized = trimmed
    .replace(/[()%$€£¥HKDUSDCNY\s]/gi, '')
    .replace(/,/g, '')

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return undefined
  return negativeByParentheses ? -Math.abs(parsed) : parsed
}

export function parsePercent(value: string | undefined): number | undefined {
  const parsed = parseNumber(value)
  if (parsed == null) return undefined
  return parsed / 100
}

const ENGLISH_MONTHS = new Map<string, number>([
  ['jan', 0], ['january', 0],
  ['feb', 1], ['february', 1],
  ['mar', 2], ['march', 2],
  ['apr', 3], ['april', 3],
  ['may', 4],
  ['jun', 5], ['june', 5],
  ['jul', 6], ['july', 6],
  ['aug', 7], ['august', 7],
  ['sep', 8], ['sept', 8], ['september', 8],
  ['oct', 9], ['october', 9],
  ['nov', 10], ['november', 10],
  ['dec', 11], ['december', 11],
])

function validLocalDate(year: number, monthIndex: number, day: number): Date | undefined {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return undefined
  }

  const date = new Date(year, monthIndex, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return undefined
  }
  return date
}

export function parseDateFlexible(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const clean = value.trim()

  const compact = clean.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) {
    return validLocalDate(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]))
  }

  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? clean.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (iso) {
    return validLocalDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  }

  const monthFirst = clean.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/)
  if (monthFirst) {
    const monthIndex = ENGLISH_MONTHS.get(monthFirst[1].toLowerCase())
    if (monthIndex == null) return undefined
    return validLocalDate(Number(monthFirst[3]), monthIndex, Number(monthFirst[2]))
  }

  const dayFirst = clean.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (dayFirst) {
    const monthIndex = ENGLISH_MONTHS.get(dayFirst[2].toLowerCase())
    if (monthIndex == null) return undefined
    return validLocalDate(Number(dayFirst[3]), monthIndex, Number(dayFirst[1]))
  }

  return undefined
}

export function toIsoDate(date: Date | undefined): string | undefined {
  if (!date) return undefined
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateRange(value: string | undefined): { start?: Date; end?: Date } {
  if (!value) return {}

  const separators = [' - ', ' to ', ' through ', ' – ', ' — ']
  for (const separator of separators) {
    const parts = value.split(separator)
    if (parts.length === 2) {
      return {
        start: parseDateFlexible(parts[0]),
        end: parseDateFlexible(parts[1]),
      }
    }
  }

  const matches = value.match(
    /([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{8})/g,
  )
  if (matches && matches.length >= 2) {
    return {
      start: parseDateFlexible(matches[0]),
      end: parseDateFlexible(matches[1]),
    }
  }

  return {}
}

export function fingerprintText(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
