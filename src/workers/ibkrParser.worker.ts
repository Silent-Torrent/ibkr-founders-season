import { parseIbkrActivityStatement } from '../lib/ibkr'
import type {
  IbkrParserWorkerRequest,
  IbkrParserWorkerResponse,
} from '../lib/ibkrParserWorkerProtocol'
import { isWorkerReportWithinLimits } from '../lib/workerOutputLimits'
import type { ParseResult } from '../types'

interface ParserWorkerScope {
  onmessage: ((event: MessageEvent<IbkrParserWorkerRequest>) => void) | null
  postMessage(message: IbkrParserWorkerResponse): void
}

const workerScope = globalThis as unknown as ParserWorkerScope

function safeFailure(): ParseResult {
  return {
    errors: ['The statement could not be parsed safely in the background.'],
    warnings: [],
  }
}

workerScope.onmessage = async (event) => {
  if (
    event.data.type !== 'parse' ||
    typeof event.data.accountComparisonSalt !== 'string' ||
    event.data.accountComparisonSalt.length < 16 ||
    !(event.data.statement instanceof Blob)
  ) {
    workerScope.postMessage({ type: 'result', result: safeFailure() })
    return
  }

  let result: ParseResult
  try {
    const text = await event.data.statement.text()
    result = parseIbkrActivityStatement(text, {
      accountComparisonSalt: event.data.accountComparisonSalt,
    })
    if (result.report && !isWorkerReportWithinLimits(result.report)) {
      result = safeFailure()
    }
  } catch {
    result = safeFailure()
  }

  workerScope.postMessage({ type: 'result', result })
}
