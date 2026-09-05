import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

// The parser and its 12-second timer are real production code. Only the native
// chooser is intercepted and selected Worker startups are held by the CDP host.
export async function testImportRecovery({
  cdp,
  evaluate,
  waitForPageValue,
  waitForAsyncCondition,
  clickPrimaryNavigation,
  resolveFileInputNodeId,
  holdNextWorker,
  releaseWorkerHold,
  getWorkerTargets,
  fixturePath,
  invalidExtensionFixturePath,
}) {
  const stateExpression = `(() => ({
    heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
    busy: document.querySelector('.drop-zone')?.getAttribute('aria-busy'),
    focus: document.activeElement?.getAttribute('data-action') ?? '',
    inputValue: document.querySelector('input[type="file"]')?.value ?? null,
    fileCount: document.querySelector('input[type="file"]')?.files?.length ?? null,
    error: document.querySelector('.error-message')?.textContent?.trim() ?? '',
    cancelled: Boolean(document.querySelector('.import-cancelled-message')),
    retry: Boolean(document.querySelector('[data-action="choose-file-after-error"]')),
  }))()`
  const timeoutText = 'The statement took too long to parse and was stopped safely.'
  const holds = []
  const timeoutsMs = []
  let chooserEvents = 0
  const stopListening = cdp.on('Page.fileChooserOpened', () => { chooserEvents += 1 })

  async function selectThroughControl(action, path) {
    const chooserCountBefore = chooserEvents
    const opened = await evaluate(`(() => {
      const button = document.querySelector('[data-action="${action}"]');
      if (!button || button.disabled) return false;
      button.focus();
      button.click();
      return true;
    })()`)
    assert.equal(opened, true, `Import recovery control is unavailable: ${action}.`)
    await waitForAsyncCondition(
      async () => chooserEvents === chooserCountBefore + 1,
      `Intercepted chooser opened from ${action}`,
    )
    // No File has been selected yet: opening the intercepted chooser alone must
    // neither start work nor strand focus on a soon-to-be-removed recovery button.
    const beforeSelection = await evaluate(stateExpression)
    assert.equal(beforeSelection.busy, 'false')
    assert.equal(beforeSelection.inputValue, '')
    assert.equal(beforeSelection.fileCount, 0)
    const nodeId = await resolveFileInputNodeId()
    await cdp.send('DOM.setFileInputFiles', { files: [path], nodeId })
    return beforeSelection.focus
  }

  async function startHeldImport(action) {
    const workerCountBefore = getWorkerTargets().length
    const ticket = holdNextWorker()
    holds.push(ticket)
    const startedAt = performance.now()
    const chooserFocus = await selectThroughControl(action, fixturePath)
    await waitForAsyncCondition(async () => ticket.ready, 'Real production Worker startup hold')
    assert(ticket.targetId, 'The held import did not identify a real Worker target.')
    assert.equal(getWorkerTargets().length, workerCountBefore + 1)
    const running = await waitForPageValue(
      stateExpression,
      (value) => value?.busy === 'true',
      'Import recovery busy state',
    )
    assert.equal(running.focus, 'cancel-import', 'Starting a retry lost the main cancel-control focus.')
    assert.equal(chooserFocus, 'choose-file', `${action} did not focus the main control before opening the chooser.`)
    assert.equal(running.inputValue, '', 'The file input was not cleared for same-file reselection.')
    assert.equal(running.fileCount, 0)
    assert.equal(running.error, '')
    assert.equal(running.cancelled, false)
    return { ticket, startedAt }
  }

  async function assertWorkerTerminated(ticket, label) {
    await waitForAsyncCondition(async () => {
      const { targetInfos = [] } = await cdp.send('Target.getTargets')
      return !targetInfos.some(({ targetId }) => targetId === ticket.targetId)
    }, `${label} Worker termination`)
  }

  async function assertCapacityReportPreserved(label) {
    await clickPrimaryNavigation('Ledger')
    const ledger = await waitForPageValue(
      `(() => ({
        heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
        rows: document.querySelectorAll('.data-table tbody tr').length,
        source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
        symbols: [...document.querySelectorAll('.data-table tbody tr')]
          .map((row) => row.textContent ?? '').join(' '),
      }))()`,
      (value) => value?.heading === 'Ledger' && value?.rows === 500,
      `${label} preserves the existing 500-row report`,
    )
    assert.equal(ledger.source, 'Self-reported · not broker-verified')
    assert(ledger.symbols.includes('CAP000') && ledger.symbols.includes('CAP499'))
    await clickPrimaryNavigation('Import')
    await resolveFileInputNodeId()
  }

  async function assertRealTimeout({ ticket, startedAt }, expectedFocus) {
    const timedOut = await waitForPageValue(
      stateExpression,
      (value) => value?.busy === 'false' && value?.error.includes(timeoutText),
      'Unchanged production 12-second timeout',
      20_000,
    )
    const elapsedMs = performance.now() - startedAt
    assert(elapsedMs >= 11_500 && elapsedMs < 16_000,
      `Controlled stalled-Worker timeout took ${elapsedMs.toFixed(1)} ms.`)
    assert.equal(timedOut.heading, 'Import your current YTD statement')
    assert.equal(timedOut.focus, expectedFocus, 'Timeout unexpectedly moved or lost the current focus.')
    assert.equal(timedOut.retry, true)
    assert.equal(timedOut.cancelled, false)
    assert.equal(timedOut.inputValue, '')
    assert.equal(timedOut.fileCount, 0)
    await assertWorkerTerminated(ticket, 'Timed-out')
    await releaseWorkerHold(ticket)
    timeoutsMs.push(Number(elapsedMs.toFixed(1)))
  }

  try {
    const initial = await evaluate(stateExpression)
    assert.equal(initial.heading, 'Import your current YTD statement')
    assert.equal(initial.busy, 'false')
    assert.equal(initial.retry, true, 'Expected the prior oversized-file recovery panel.')
    assert.equal(await evaluate('document.documentElement.lang'), 'en')
    await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true })

    // Error retry -> real held Worker -> cancel -> another actual chooser entry.
    const cancelledImport = await startHeldImport('choose-file-after-error')
    const cancelClicked = await evaluate(`(() => {
      const button = document.querySelector('[data-action="cancel-import"]');
      if (!button) return false;
      button.focus();
      button.click();
      return true;
    })()`)
    assert.equal(cancelClicked, true)
    const cancelled = await waitForPageValue(
      stateExpression,
      (value) => value?.busy === 'false' && value?.cancelled === true,
      'Explicit cancellation recovery',
    )
    assert.equal(cancelled.focus, 'choose-file')
    assert.equal(cancelled.error, '')
    await assertWorkerTerminated(cancelledImport.ticket, 'Cancelled')
    await releaseWorkerHold(cancelledImport.ticket)

    const workersBeforePreflight = getWorkerTargets().length
    const preflightChooserFocus = await selectThroughControl('choose-file-after-cancel', invalidExtensionFixturePath)
    const preflight = await waitForPageValue(
      stateExpression,
      (value) => value?.error.includes('Please choose a CSV file.'),
      'Cancelled-import retry rejects a non-CSV before creating another Worker',
    )
    assert.equal(preflight.busy, 'false')
    assert.equal(preflight.focus, 'choose-file')
    assert.equal(preflightChooserFocus, 'choose-file')
    assert.equal(preflight.inputValue, '')
    assert.equal(preflight.fileCount, 0)
    assert.equal(preflight.cancelled, false)
    assert.equal(getWorkerTargets().length, workersBeforePreflight)
    await assertCapacityReportPreserved('Cancelled/preflight-rejected import')

    const mainFocusedTimeout = await startHeldImport('choose-file')
    await assertRealTimeout(mainFocusedTimeout, 'choose-file')
    await assertCapacityReportPreserved('Timed-out import')

    // A second timeout proves that a user who moved elsewhere keeps that focus.
    // The export-settings recovery link disappears while busy, so use the stable
    // Demo control without activating it or changing the retained report.
    const movedFocusTimeout = await startHeldImport('choose-file')
    const movedFocus = await evaluate(`(() => {
      const button = document.querySelector('[data-action="use-demo"]');
      button?.focus();
      return document.activeElement === button;
    })()`)
    assert.equal(movedFocus, true)
    await assertRealTimeout(movedFocusTimeout, 'use-demo')

    // No refresh or page transition between the second timeout and same-file retry.
    const workersBeforeRetry = getWorkerTargets().length
    const retryChooserFocus = await selectThroughControl('choose-file-after-error', fixturePath)
    assert.equal(retryChooserFocus, 'choose-file')
    const recovered = await waitForPageValue(
      `(() => ({
        heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
        rows: document.querySelectorAll('.data-table tbody tr').length,
        source: document.querySelector('.trust-badge')?.textContent?.trim() ?? '',
      }))()`,
      (value) => value?.heading === 'Ledger' && value?.rows === 3,
      'Same-file retry after timeout completes through a fresh production Worker',
    )
    assert.equal(getWorkerTargets().length, workersBeforeRetry + 1)
    assert.equal(recovered.source, 'Fully synthetic test')

    return {
      mode: 'production Chrome with intercepted chooser and controlled Worker startup holds',
      interceptedChooserEntries: chooserEvents,
      timeoutsMs,
      cancelledWorkerTerminated: true,
      timedOutWorkersTerminated: 2,
      cancelAndPreflightPreservedRows: 500,
      timeoutPreservedRows: 500,
      sameFileRetryRows: recovered.rows,
      recoveryFocus: 'main choose/cancel control retained; unrelated Demo-control focus not stolen',
    }
  } finally {
    stopListening()
    try {
      for (const ticket of holds) await releaseWorkerHold(ticket)
    } finally {
      await cdp.send('Page.setInterceptFileChooserDialog', { enabled: false })
    }
  }
}
