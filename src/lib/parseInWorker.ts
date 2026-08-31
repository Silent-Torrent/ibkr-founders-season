import type { ParseResult } from '../types'
import {
  IBKR_PARSER_WORKER_PROTOCOL_VERSION,
  isIbkrParserWorkerRequest,
  isIbkrParserWorkerResponse,
  isValidAccountComparisonSalt,
  type IbkrParserWorkerRequest,
} from './ibkrParserWorkerProtocol'
import {
  isValidWorkerReferenceTime,
  MAX_IBKR_WORKER_STATEMENT_BYTES,
} from './workerOutputLimits'

export const IBKR_PARSER_TIMEOUT_MS = 12_000

export interface ParseInWorkerOptions {
  accountComparisonSalt?: string
  referenceTimeMs?: number
  signal?: AbortSignal
  timeoutMs?: number
  workerFactory?: () => Worker
}

type WorkerBoundaryDiagnosticCode =
  | 'file_empty'
  | 'file_too_large'
  | 'worker_unavailable'
  | 'worker_timeout'
  | 'worker_failure'
  | 'worker_cancelled'

function errorResult(code: WorkerBoundaryDiagnosticCode): ParseResult {
  return { errors: [{ code }], warnings: [] }
}

function createParserWorker(): Worker {
  return new Worker(new URL('../workers/ibkrParser.worker.ts', import.meta.url), {
    type: 'module',
    name: 'ibkr-statement-parser',
  })
}

export function parseIbkrActivityStatementInWorker(
  statement: Blob,
  options: ParseInWorkerOptions = {},
): Promise<ParseResult> {
  const {
    accountComparisonSalt = 'standalone-worker-v1',
    referenceTimeMs = Date.now(),
    signal,
    timeoutMs: requestedTimeoutMs = IBKR_PARSER_TIMEOUT_MS,
    workerFactory,
  } = options
  const timeoutMs =
    Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
      ? Math.min(Math.floor(requestedTimeoutMs), IBKR_PARSER_TIMEOUT_MS)
      : IBKR_PARSER_TIMEOUT_MS

  if (signal?.aborted) {
    return Promise.resolve(errorResult('worker_cancelled'))
  }

  if (typeof Blob === 'undefined' || !(statement instanceof Blob)) {
    return Promise.resolve(errorResult('worker_failure'))
  }

  if (statement.size === 0) {
    return Promise.resolve(errorResult('file_empty'))
  }

  if (statement.size > MAX_IBKR_WORKER_STATEMENT_BYTES) {
    return Promise.resolve(errorResult('file_too_large'))
  }

  if (
    !isValidAccountComparisonSalt(accountComparisonSalt) ||
    !isValidWorkerReferenceTime(referenceTimeMs)
  ) {
    return Promise.resolve(errorResult('worker_failure'))
  }

  if (!workerFactory && typeof Worker === 'undefined') {
    return Promise.resolve(errorResult('worker_unavailable'))
  }

  let filenameFreeStatement: Blob
  try {
    // Always cross the worker boundary as a plain Blob. This strips File.name
    // even when a caller bypasses the UI's filename-free clone.
    filenameFreeStatement = Blob.prototype.slice.call(
      statement,
      0,
      statement.size,
      statement.type,
    ) as Blob
  } catch {
    return Promise.resolve(errorResult('worker_failure'))
  }

  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = workerFactory ? workerFactory() : createParserWorker()
    } catch {
      resolve(errorResult('worker_unavailable'))
      return
    }

    let settled = false
    let timeoutId: number | undefined

    const finish = (result: ParseResult) => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
      resolve(result)
    }

    const handleAbort = () => finish(errorResult('worker_cancelled'))

    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isIbkrParserWorkerResponse(event.data, referenceTimeMs)) {
        finish(errorResult('worker_failure'))
        return
      }
      finish(event.data.result)
    })

    worker.addEventListener('messageerror', () => {
      finish(errorResult('worker_failure'))
    })

    worker.addEventListener('error', (event) => {
      event.preventDefault()
      finish(errorResult('worker_failure'))
    })

    signal?.addEventListener('abort', handleAbort, { once: true })
    timeoutId = globalThis.setTimeout(
      () => finish(errorResult('worker_timeout')),
      timeoutMs,
    )

    const request: IbkrParserWorkerRequest = {
      protocolVersion: IBKR_PARSER_WORKER_PROTOCOL_VERSION,
      type: 'parse',
      accountComparisonSalt,
      referenceTimeMs,
      statement: filenameFreeStatement,
    }
    if (!isIbkrParserWorkerRequest(request)) {
      finish(errorResult('worker_failure'))
      return
    }
    try {
      worker.postMessage(request)
    } catch {
      finish(errorResult('worker_failure'))
    }
  })
}
