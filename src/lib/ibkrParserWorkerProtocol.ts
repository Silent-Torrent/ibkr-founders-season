import type { ParseResult } from '../types'
import {
  isValidWorkerReferenceTime,
  isWorkerParseResultWithinLimits,
  MAX_IBKR_WORKER_STATEMENT_BYTES,
} from './workerOutputLimits'

export const IBKR_PARSER_WORKER_PROTOCOL_VERSION = 1 as const
export const MIN_ACCOUNT_COMPARISON_SALT_CHARACTERS = 16
export const MAX_ACCOUNT_COMPARISON_SALT_CHARACTERS = 128

export interface IbkrParserWorkerRequest {
  protocolVersion: typeof IBKR_PARSER_WORKER_PROTOCOL_VERSION
  type: 'parse'
  accountComparisonSalt: string
  referenceTimeMs: number
  statement: Blob
}

export interface IbkrParserWorkerResponse {
  protocolVersion: typeof IBKR_PARSER_WORKER_PROTOCOL_VERSION
  type: 'result'
  result: ParseResult
}

type PlainRecord = Record<string, unknown>

function isExactPlainRecord(
  value: unknown,
  keys: readonly string[],
): value is PlainRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false

  const expected = new Set(keys)
  const actual = Reflect.ownKeys(value)
  if (actual.length !== expected.size) return false

  for (const key of actual) {
    if (typeof key !== 'string' || !expected.has(key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false
  }
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

export function isValidAccountComparisonSalt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MIN_ACCOUNT_COMPARISON_SALT_CHARACTERS &&
    value.length <= MAX_ACCOUNT_COMPARISON_SALT_CHARACTERS &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

export function isIbkrParserWorkerRequest(
  value: unknown,
): value is IbkrParserWorkerRequest {
  try {
    return (
      isExactPlainRecord(value, [
        'protocolVersion',
        'type',
        'accountComparisonSalt',
        'referenceTimeMs',
        'statement',
      ]) &&
      value.protocolVersion === IBKR_PARSER_WORKER_PROTOCOL_VERSION &&
      value.type === 'parse' &&
      isValidAccountComparisonSalt(value.accountComparisonSalt) &&
      isValidWorkerReferenceTime(value.referenceTimeMs) &&
      typeof Blob !== 'undefined' &&
      value.statement instanceof Blob &&
      (typeof File === 'undefined' || !(value.statement instanceof File)) &&
      value.statement.size <= MAX_IBKR_WORKER_STATEMENT_BYTES
    )
  } catch {
    return false
  }
}

export function isIbkrParserWorkerResponse(
  value: unknown,
  referenceTimeMs = Date.now(),
): value is IbkrParserWorkerResponse {
  try {
    return (
      isExactPlainRecord(value, ['protocolVersion', 'type', 'result']) &&
      value.protocolVersion === IBKR_PARSER_WORKER_PROTOCOL_VERSION &&
      value.type === 'result' &&
      isWorkerParseResultWithinLimits(value.result, referenceTimeMs)
    )
  } catch {
    return false
  }
}
