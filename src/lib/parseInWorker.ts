import type { ParseResult } from '../types'
import {
  isIbkrParserWorkerResponse,
  type IbkrParserWorkerRequest,
} from './ibkrParserWorkerProtocol'

export const IBKR_PARSER_TIMEOUT_MS = 12_000

const WORKER_UNAVAILABLE_ERROR =
  'Secure background parsing is unavailable in this browser.'
const WORKER_TIMEOUT_ERROR =
  'The statement took too long to parse and was stopped safely.'
const WORKER_FAILURE_ERROR =
  'The statement could not be parsed safely in the background.'
const WORKER_CANCELLED_ERROR = 'The statement import was cancelled.'

interface ParseInWorkerOptions {
  signal?: AbortSignal
  timeoutMs?: number
  workerFactory?: () => Worker
}

function errorResult(message: string): ParseResult {
  return { errors: [message], warnings: [] }
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
    signal,
    timeoutMs = IBKR_PARSER_TIMEOUT_MS,
    workerFactory,
  } = options

  if (signal?.aborted) {
    return Promise.resolve(errorResult(WORKER_CANCELLED_ERROR))
  }

  if (!workerFactory && typeof Worker === 'undefined') {
    return Promise.resolve(errorResult(WORKER_UNAVAILABLE_ERROR))
  }

  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = workerFactory ? workerFactory() : createParserWorker()
    } catch {
      resolve(errorResult(WORKER_UNAVAILABLE_ERROR))
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

    const handleAbort = () => finish(errorResult(WORKER_CANCELLED_ERROR))

    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isIbkrParserWorkerResponse(event.data)) {
        finish(errorResult(WORKER_FAILURE_ERROR))
        return
      }
      finish(event.data.result)
    })

    worker.addEventListener('messageerror', () => {
      finish(errorResult(WORKER_FAILURE_ERROR))
    })

    worker.addEventListener('error', (event) => {
      event.preventDefault()
      finish(errorResult(WORKER_FAILURE_ERROR))
    })

    signal?.addEventListener('abort', handleAbort, { once: true })
    timeoutId = globalThis.setTimeout(
      () => finish(errorResult(WORKER_TIMEOUT_ERROR)),
      timeoutMs,
    )

    const request: IbkrParserWorkerRequest = { type: 'parse', statement }
    try {
      worker.postMessage(request)
    } catch {
      finish(errorResult(WORKER_FAILURE_ERROR))
    }
  })
}
