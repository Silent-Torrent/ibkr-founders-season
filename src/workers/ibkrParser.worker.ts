import { parseIbkrActivityStatementBlob } from '../lib/ibkr'
import {
  IBKR_PARSER_WORKER_PROTOCOL_VERSION,
  isIbkrParserWorkerRequest,
  isIbkrParserWorkerResponse,
  type IbkrParserWorkerResponse,
} from '../lib/ibkrParserWorkerProtocol'
import type { ParseResult } from '../types'

interface ParserWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  postMessage(message: IbkrParserWorkerResponse): void
}

const workerScope = globalThis as unknown as ParserWorkerScope

function safeFailure(): ParseResult {
  return {
    errors: [{ code: 'worker_failure' }],
    warnings: [],
  }
}

function postValidatedResult(result: ParseResult, referenceTimeMs: number): void {
  let response: IbkrParserWorkerResponse = {
    protocolVersion: IBKR_PARSER_WORKER_PROTOCOL_VERSION,
    type: 'result',
    result,
  }
  if (!isIbkrParserWorkerResponse(response, referenceTimeMs)) {
    response = {
      protocolVersion: IBKR_PARSER_WORKER_PROTOCOL_VERSION,
      type: 'result',
      result: safeFailure(),
    }
  }
  workerScope.postMessage(response)
}

workerScope.onmessage = async (event) => {
  if (!isIbkrParserWorkerRequest(event.data)) {
    postValidatedResult(safeFailure(), Date.now())
    return
  }

  let result: ParseResult
  try {
    result = await parseIbkrActivityStatementBlob(event.data.statement, {
      accountComparisonSalt: event.data.accountComparisonSalt,
      currentDate: new Date(event.data.referenceTimeMs),
    })
  } catch {
    result = safeFailure()
  }

  postValidatedResult(result, event.data.referenceTimeMs)
}
