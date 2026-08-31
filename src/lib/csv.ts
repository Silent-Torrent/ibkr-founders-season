import type { ParserDiagnosticCode } from '../types'

const MAX_FIELD_CHARACTERS = 250_000
export const MAX_CSV_FIELDS_PER_ROW = 4_096

type CsvParseFailureCode = Extract<
  ParserDiagnosticCode,
  | 'csv_too_large'
  | 'csv_too_many_rows'
  | 'csv_too_many_fields'
  | 'csv_field_too_large'
  | 'csv_unterminated_quote'
>

export class CsvParseFailure extends Error {
  readonly code: CsvParseFailureCode

  constructor(code: CsvParseFailureCode) {
    super(code)
    this.name = 'CsvParseFailure'
    this.code = code
  }
}

export class CsvRowTokenizer {
  private row: string[] = []
  private field = ''
  private inQuotes = false
  private pendingQuote = false
  private rowCount = 0
  private atStart = true
  private finished = false

  constructor(
    private readonly visitor: (row: string[], rowNumber: number) => void,
    private readonly maxRows?: number,
  ) {}

  private appendCharacter(char: string): void {
    this.field += char
    if (this.field.length > MAX_FIELD_CHARACTERS) {
      throw new CsvParseFailure('csv_field_too_large')
    }
  }

  private appendField(): void {
    this.row.push(this.field.trim())
    this.field = ''
    if (this.row.length > MAX_CSV_FIELDS_PER_ROW) {
      throw new CsvParseFailure('csv_too_many_fields')
    }
  }

  private appendNonEmptyRow(): void {
    if (!this.row.some((value) => value !== '')) return
    this.rowCount += 1
    if (this.maxRows !== undefined && this.rowCount > this.maxRows) {
      throw new CsvParseFailure('csv_too_many_rows')
    }
    this.visitor(this.row, this.rowCount)
  }

  write(chunk: string): void {
    if (this.finished) throw new Error('CSV tokenizer is already finished')
    if (chunk.length === 0) return

    let index = 0
    if (this.atStart) {
      this.atStart = false
      if (chunk[0] === '\uFEFF') index = 1
    }

    if (this.pendingQuote) {
      if (chunk[index] === '"') {
        this.appendCharacter('"')
        index += 1
      } else {
        this.inQuotes = false
      }
      this.pendingQuote = false
    }

    for (; index < chunk.length; index += 1) {
      const char = chunk[index]

      if (this.inQuotes) {
        if (char === '"') {
          if (index + 1 >= chunk.length) {
            this.pendingQuote = true
          } else if (chunk[index + 1] === '"') {
            this.appendCharacter('"')
            index += 1
          } else {
            this.inQuotes = false
          }
        } else {
          this.appendCharacter(char)
        }
        continue
      }

      if (char === '"') {
        this.inQuotes = true
      } else if (char === ',') {
        this.appendField()
      } else if (char === '\n') {
        this.appendField()
        this.appendNonEmptyRow()
        this.row = []
      } else if (char !== '\r') {
        this.appendCharacter(char)
      }
    }
  }

  finish(): number {
    if (this.finished) return this.rowCount
    this.finished = true

    if (this.pendingQuote) {
      this.pendingQuote = false
      this.inQuotes = false
    }
    if (this.inQuotes) {
      throw new CsvParseFailure('csv_unterminated_quote')
    }
    if (this.field !== '' || this.row.length > 0) {
      this.appendField()
      this.appendNonEmptyRow()
    }
    return this.rowCount
  }
}

export function visitCsvRows(
  input: string,
  visitor: (row: string[], rowNumber: number) => void,
  maxRows?: number,
): number {
  const tokenizer = new CsvRowTokenizer(visitor, maxRows)
  tokenizer.write(input)
  return tokenizer.finish()
}

/**
 * Decode a Blob incrementally with the same UTF-8 replacement behavior used
 * by Blob.text(). Decoded chunks stay transient and are never joined here.
 */
export async function visitBlobTextChunks(
  blob: Blob,
  visitor: (chunk: string) => void,
): Promise<number> {
  const maximumDecodeChunkBytes = 64 * 1_024
  const reader = blob.stream().getReader()
  const decoder = new TextDecoder()
  let characterCount = 0
  let completed = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        completed = true
        break
      }
      for (let offset = 0; offset < value.length; offset += maximumDecodeChunkBytes) {
        const bytes = value.subarray(offset, offset + maximumDecodeChunkBytes)
        const chunk = decoder.decode(bytes, { stream: true })
        characterCount += chunk.length
        if (chunk) visitor(chunk)
      }
    }
    const finalChunk = decoder.decode()
    characterCount += finalChunk.length
    if (finalChunk) visitor(finalChunk)
    return characterCount
  } catch (error) {
    if (!completed) {
      try {
        await reader.cancel(error)
      } catch {
        // Preserve the parser failure; stream cancellation is best-effort.
      }
    }
    throw error
  } finally {
    reader.releaseLock()
  }
}

export function parseCsvRows(input: string, maxRows?: number): string[][] {
  const rows: string[][] = []
  visitCsvRows(input, (row) => rows.push(row), maxRows)
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

  const startsWithParenthesis = trimmed.startsWith('(')
  const endsWithParenthesis = trimmed.endsWith(')')
  if (startsWithParenthesis !== endsWithParenthesis) return undefined

  const negativeByParentheses = startsWithParenthesis && endsWithParenthesis
  const parenthesizedText = negativeByParentheses ? trimmed.slice(1, -1) : trimmed
  if (parenthesizedText !== parenthesizedText.trim()) return undefined
  const numericText = parenthesizedText
  if (!numericText || (negativeByParentheses && /^[+-]/.test(numericText))) {
    return undefined
  }

  // IBKR English CSV numeric cells use a decimal point and optional grouped
  // thousands; currency is carried by separate fields. Reject unit wrappers,
  // percent signs, embedded text, exponent notation, loose whitespace, and
  // malformed grouping instead of deleting characters that could change value.
  if (!/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(numericText)) {
    return undefined
  }

  const normalizedText = numericText.replace(/,/g, '')
  const parsed = Number(normalizedText)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) {
    return undefined
  }
  if (parsed === 0 && /[1-9]/.test(numericText)) return undefined

  const signedParsed =
    parsed === 0 ? 0 : negativeByParentheses ? -Math.abs(parsed) : parsed
  const unsignedText = normalizedText.replace(/^[+-]/, '')
  const [rawInteger, fraction = ''] = unsignedText.split('.')
  if (fraction.length > 100) return undefined
  const canonicalInteger = rawInteger.replace(/^0+(?=\d)/, '')
  const canonicalSign = signedParsed < 0 ? '-' : ''
  const canonicalText = `${canonicalSign}${canonicalInteger}${
    fraction ? `.${fraction}` : ''
  }`
  if (signedParsed.toFixed(fraction.length) !== canonicalText) return undefined
  return signedParsed
}

interface DecimalParts {
  coefficient: bigint
  scale: number
}

function decimalPartsForNumber(value: number): DecimalParts | undefined {
  if (!Number.isFinite(value)) return undefined
  if (Object.is(value, -0) || value === 0) return { coefficient: 0n, scale: 0 }

  const match = value
    .toString()
    .match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) return undefined

  const negative = match[1] === '-'
  const integer = match[2]
  const fraction = match[3] ?? ''
  const exponent = Number(match[4] ?? '0')
  if (!Number.isSafeInteger(exponent)) return undefined

  let coefficient = BigInt(`${integer}${fraction}`)
  let scale = fraction.length - exponent
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale)
    scale = 0
  }
  if (negative) coefficient = -coefficient
  return { coefficient, scale }
}

function fixedDecimalText(coefficient: bigint, scale: number): string {
  const negative = coefficient < 0n
  const digits = (negative ? -coefficient : coefficient).toString()
  if (scale === 0) return `${negative ? '-' : ''}${digits}`

  const padded = digits.padStart(scale + 1, '0')
  const split = padded.length - scale
  return `${negative ? '-' : ''}${padded.slice(0, split)}.${padded.slice(split)}`
}

/**
 * Adds already-validated decimal values without binary floating-point
 * cancellation. Returns undefined when the exact decimal result cannot be
 * represented by the report's Number-based output contract at the same scale.
 */
export function sumExactNumbers(values: number[]): number | undefined {
  const parts = values.map(decimalPartsForNumber)
  if (parts.some((part) => part == null)) return undefined

  const resolved = parts as DecimalParts[]
  const scale = resolved.reduce((maximum, part) => Math.max(maximum, part.scale), 0)
  if (scale > 100) return undefined

  const coefficient = resolved.reduce(
    (sum, part) =>
      sum + part.coefficient * 10n ** BigInt(scale - part.scale),
    0n,
  )
  const exactText = fixedDecimalText(coefficient, scale)
  const result = Number(exactText)
  if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) {
    return undefined
  }
  if (result.toFixed(scale) !== exactText) return undefined
  return result === 0 ? 0 : result
}

export function parsePercent(value: string | undefined): number | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const numericText = trimmed.endsWith('%') ? trimmed.slice(0, -1).trim() : trimmed
  if (!numericText || numericText.includes('%') || /[()]/.test(numericText)) {
    return undefined
  }
  const parsed = parseNumber(numericText)
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

export class TextFingerprintAccumulator {
  private hash = 0x811c9dc5

  update(value: string): this {
    for (let index = 0; index < value.length; index += 1) {
      this.hash ^= value.charCodeAt(index)
      this.hash = Math.imul(this.hash, 0x01000193)
    }
    return this
  }

  digestHex(): string {
    return (this.hash >>> 0).toString(16).padStart(8, '0')
  }
}

export function fingerprintText(value: string): string {
  return new TextFingerprintAccumulator().update(value).digestHex()
}
