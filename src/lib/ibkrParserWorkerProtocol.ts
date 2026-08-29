import type { ParseResult } from '../types'

export interface IbkrParserWorkerRequest {
  type: 'parse'
  statement: Blob
}

export interface IbkrParserWorkerResponse {
  type: 'result'
  result: ParseResult
}

export function isIbkrParserWorkerResponse(
  value: unknown,
): value is IbkrParserWorkerResponse {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as {
    type?: unknown
    result?: {
      report?: unknown
      errors?: unknown
      warnings?: unknown
    }
  }

  return (
    candidate.type === 'result' &&
    typeof candidate.result === 'object' &&
    candidate.result !== null &&
    Array.isArray(candidate.result.errors) &&
    candidate.result.errors.every((item) => typeof item === 'string') &&
    Array.isArray(candidate.result.warnings) &&
    candidate.result.warnings.every((item) => typeof item === 'string') &&
    (candidate.result.report === undefined ||
      (typeof candidate.result.report === 'object' &&
        candidate.result.report !== null))
  )
}
