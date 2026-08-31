import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

export const SYNTHETIC_CAPACITY_MAX_BYTES = 5 * 1024 * 1024
export const SYNTHETIC_CAPACITY_TARGET_BYTES =
  SYNTHETIC_CAPACITY_MAX_BYTES
export const SYNTHETIC_CAPACITY_ROWS = 100_000
export const SYNTHETIC_CAPACITY_SYMBOLS = 500
export const SYNTHETIC_CAPACITY_EVENTS = 1_000
export const SYNTHETIC_OVER_CAP_SYMBOLS = SYNTHETIC_CAPACITY_SYMBOLS + 1
export const SYNTHETIC_OVER_CAP_EVENTS = SYNTHETIC_CAPACITY_EVENTS + 1

export function padSyntheticStatementToCapacity(
  statement,
  {
    targetBytes = SYNTHETIC_CAPACITY_TARGET_BYTES,
    targetRows = SYNTHETIC_CAPACITY_ROWS,
  } = {},
) {
  assert(Number.isSafeInteger(targetBytes) && targetBytes > 0)
  assert(Number.isSafeInteger(targetRows) && targetRows > 0)
  assert(targetBytes <= SYNTHETIC_CAPACITY_MAX_BYTES)

  const rows = statement.split('\n')
  rows.push('Capacity Padding,Header,Sequence,Payload')
  const paddingRowCount = targetRows - rows.length
  assert(paddingRowCount > 0, 'The requested row count leaves no room for padding rows.')

  const paddingPrefixes = Array.from(
    { length: paddingRowCount },
    (_, index) => `Capacity Padding,Data,${String(index).padStart(6, '0')},`,
  )
  const bytesBeforePayload =
    rows.reduce((sum, row) => sum + Buffer.byteLength(row, 'utf8'), 0) +
    paddingPrefixes.reduce((sum, prefix) => sum + Buffer.byteLength(prefix, 'utf8'), 0) +
    targetRows - 1
  const payloadBytes = targetBytes - bytesBeforePayload
  assert(
    payloadBytes >= paddingRowCount,
    `Target byte size is too small for ${targetRows} non-empty rows.`,
  )

  const payloadLength = Math.floor(payloadBytes / paddingRowCount)
  const longerPayloadRows = payloadBytes % paddingRowCount
  for (let index = 0; index < paddingRowCount; index += 1) {
    rows.push(
      `${paddingPrefixes[index]}${'X'.repeat(payloadLength + (index < longerPayloadRows ? 1 : 0))}`,
    )
  }

  const text = rows.join('\n')
  const byteLength = Buffer.byteLength(text, 'utf8')
  assert.equal(rows.length, targetRows)
  assert.equal(byteLength, targetBytes)
  assert.equal(text.length, byteLength, 'The padded statement must stay ASCII-only.')
  return { byteLength, rowCount: rows.length, text }
}

function optionContract(underlying, index, kind) {
  const strike = index + 1
  const expiry = kind === 'assignment' ? '19JUN26' : '17JUL26'
  const right = kind === 'assignment' ? 'C' : 'P'
  return `${underlying} ${expiry} ${strike} ${right}`
}

/**
 * Builds a fully fictional, ASCII-only IBKR-shaped statement at the combined
 * supported boundary. The result is generated at runtime so a multi-megabyte
 * fixture never becomes a repository or browser-shipped asset.
 */
export function generateSyntheticCapacityStatement({
  targetBytes = SYNTHETIC_CAPACITY_TARGET_BYTES,
  targetRows = SYNTHETIC_CAPACITY_ROWS,
} = {}) {
  assert(Number.isSafeInteger(targetBytes) && targetBytes > 0)
  assert(Number.isSafeInteger(targetRows) && targetRows > 0)
  assert(targetBytes <= SYNTHETIC_CAPACITY_MAX_BYTES)

  const rows = [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Title,Activity Statement',
    'Statement,Data,Period,"January 1, 2026 - August 28, 2026"',
    'Account Information,Header,Field Name,Field Value',
    'Account Information,Data,Account,SYNTHETIC_CAPACITY_ACCOUNT',
    'Account Information,Data,Base Currency,USD',
    'Month & Year to Date Performance Summary,Header,Asset Class,Symbol,Description,Mark-to-Market MTD,Mark-to-Market YTD,Realized S/T MTD,Reazlied S/T YTD,Realized L/T MTD,Realized L/T YTD,Total',
  ]
  const instrumentRows = []
  const eventRows = []

  for (let index = 0; index < SYNTHETIC_CAPACITY_SYMBOLS; index += 1) {
    const underlying = `CAP${String(index).padStart(3, '0')}`
    const assignmentContract = optionContract(underlying, index, 'assignment')
    const expirationContract = optionContract(underlying, index, 'expiration')
    const strike = index + 1

    rows.push(
      `Month & Year to Date Performance Summary,Data,Equity and Index Options,${underlying},Fictional capacity underlying,0,1,0,0,0,0,1`,
    )
    instrumentRows.push(
      `Financial Instrument Information,Data,Equity and Index Options,${underlying},${assignmentContract},SYNTH-CAP-${String(index).padStart(3, '0')}-A,${underlying},100,2026-06-19,C,${strike},`,
      `Financial Instrument Information,Data,Equity and Index Options,${underlying},${expirationContract},SYNTH-CAP-${String(index).padStart(3, '0')}-E,${underlying},100,2026-07-17,P,${strike},`,
    )
    eventRows.push(
      `"Options Exercises, Assignments and Expirations",Data,OPT,${assignmentContract},${underlying},2026-06-20,Assignment`,
      `"Options Exercises, Assignments and Expirations",Data,OPT,${expirationContract},${underlying},2026-07-18,Expiration`,
    )
  }

  rows.push(
    `Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,${SYNTHETIC_CAPACITY_SYMBOLS},0,0,0,0,${SYNTHETIC_CAPACITY_SYMBOLS}`,
    'Financial Instrument Information,Header,Asset Class,Symbol,Description,Conid,Underlying,Multiplier,Expiry,Type,Strike,Code',
    ...instrumentRows,
    '"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Underlying Symbol,Date,Transaction Type',
    ...eventRows,
    'Capacity Padding,Header,Sequence,Payload',
  )

  const paddingRowCount = targetRows - rows.length
  assert(paddingRowCount > 0, 'The requested row count leaves no room for padding rows.')

  const paddingPrefixes = Array.from(
    { length: paddingRowCount },
    (_, index) => `Capacity Padding,Data,${String(index).padStart(6, '0')},`,
  )
  const bytesBeforePayload =
    rows.reduce((sum, row) => sum + Buffer.byteLength(row, 'utf8'), 0) +
    paddingPrefixes.reduce((sum, prefix) => sum + Buffer.byteLength(prefix, 'utf8'), 0) +
    targetRows - 1
  const payloadBytes = targetBytes - bytesBeforePayload
  assert(
    payloadBytes >= paddingRowCount,
    `Target byte size is too small for ${targetRows} non-empty rows.`,
  )

  const payloadLength = Math.floor(payloadBytes / paddingRowCount)
  const longerPayloadRows = payloadBytes % paddingRowCount
  for (let index = 0; index < paddingRowCount; index += 1) {
    rows.push(
      `${paddingPrefixes[index]}${'X'.repeat(payloadLength + (index < longerPayloadRows ? 1 : 0))}`,
    )
  }

  const text = rows.join('\n')
  const byteLength = Buffer.byteLength(text, 'utf8')
  assert.equal(rows.length, targetRows)
  assert.equal(byteLength, targetBytes)
  assert.equal(text.length, byteLength, 'The capacity statement must stay ASCII-only.')

  return {
    byteLength,
    eventCount: SYNTHETIC_CAPACITY_EVENTS,
    rowCount: rows.length,
    symbolCount: SYNTHETIC_CAPACITY_SYMBOLS,
    text,
  }
}

export function generateSyntheticOverSymbolStatement() {
  const rows = [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Title,Activity Statement',
    'Statement,Data,Period,"January 1, 2026 - August 28, 2026"',
    'Account Information,Header,Field Name,Field Value',
    'Account Information,Data,Account,SYNTHETIC_OVER_SYMBOL_ACCOUNT',
    'Account Information,Data,Base Currency,USD',
    'Month & Year to Date Performance Summary,Header,Asset Class,Symbol,Description,Mark-to-Market MTD,Mark-to-Market YTD,Realized S/T MTD,Reazlied S/T YTD,Realized L/T MTD,Realized L/T YTD,Total',
  ]
  for (let index = 0; index < SYNTHETIC_OVER_CAP_SYMBOLS; index += 1) {
    const symbol = `OVR${String(index).padStart(3, '0')}`
    rows.push(
      `Month & Year to Date Performance Summary,Data,Stocks,${symbol},Fictional over-cap symbol,0,1,0,0,0,0,1`,
    )
  }
  rows.push(
    `Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,${SYNTHETIC_OVER_CAP_SYMBOLS},0,0,0,0,${SYNTHETIC_OVER_CAP_SYMBOLS}`,
  )
  return {
    rowCount: rows.length,
    symbolCount: SYNTHETIC_OVER_CAP_SYMBOLS,
    text: rows.join('\n'),
  }
}

export function generateSyntheticOverEventStatement() {
  const rows = [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Title,Activity Statement',
    'Statement,Data,Period,"January 1, 2026 - August 28, 2026"',
    'Account Information,Header,Field Name,Field Value',
    'Account Information,Data,Account,SYNTHETIC_OVER_EVENT_ACCOUNT',
    'Account Information,Data,Base Currency,USD',
    'Month & Year to Date Performance Summary,Header,Asset Class,Symbol,Description,Mark-to-Market MTD,Mark-to-Market YTD,Realized S/T MTD,Reazlied S/T YTD,Realized L/T MTD,Realized L/T YTD,Total',
    'Month & Year to Date Performance Summary,Data,Equity and Index Options,EVCAP,Fictional over-cap event underlying,0,1,0,0,0,0,1',
    'Month & Year to Date Performance Summary,Data,Total (All Assets),,,0,1,0,0,0,0,1',
    '"Options Exercises, Assignments and Expirations",Header,Asset Class,Symbol,Underlying Symbol,Date,Transaction Type',
  ]
  for (let index = 0; index < SYNTHETIC_OVER_CAP_EVENTS; index += 1) {
    const eventType = index % 2 === 0 ? 'Assignment' : 'Expiration'
    const right = index % 2 === 0 ? 'C' : 'P'
    rows.push(
      `"Options Exercises, Assignments and Expirations",Data,OPT,EVCAP 19JUN26 ${index + 1} ${right},EVCAP,2026-06-20,${eventType}`,
    )
  }
  return {
    eventCount: SYNTHETIC_OVER_CAP_EVENTS,
    rowCount: rows.length,
    text: rows.join('\n'),
  }
}
