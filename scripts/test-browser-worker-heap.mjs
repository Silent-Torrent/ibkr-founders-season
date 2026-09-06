import assert from 'node:assert/strict'
import { isAbsolute } from 'node:path'

// An opt-in diagnostic against the production file-input/Worker path. The
// sampler owns measurement semantics: sampled maxima are not true peaks, an
// iPhone budget, or a release pass. No report values are read by this stage.
export async function runBrowserWorkerHeapDiagnostic({
  cdp,
  evaluate,
  waitForPageValue,
  waitForAsyncCondition,
  clickPrimaryNavigation,
  resolveFileInputNodeId,
  navigateAndWait,
  previewUrl,
  armNextWorkerHeap,
  fixtures,
}) {
  assert(Array.isArray(fixtures) && fixtures.length > 0, 'Worker heap fixtures are required.')
  for (const fixture of fixtures) {
    assert(typeof fixture.label === 'string' && fixture.label.trim(), 'Each heap fixture needs a label.')
    assert(typeof fixture.path === 'string' && isAbsolute(fixture.path), 'Heap fixture paths must be absolute.')
    assert(Number.isSafeInteger(fixture.bytes) && fixture.bytes > 0, 'Heap fixture bytes must be a positive integer.')
    assert(typeof fixture.sha256 === 'string' && /^[a-f0-9]{64}$/.test(fixture.sha256), 'Heap fixture SHA-256 is invalid.')
    assert(Number.isSafeInteger(fixture.expectedRows) && fixture.expectedRows > 0, 'Expected Ledger rows must be a positive integer.')
  }

  const readState = `(() => ({
    heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
    rows: document.querySelectorAll('.data-table tbody tr').length,
    demo: Boolean(document.querySelector('.source-pill.demo')),
    errors: [...document.querySelectorAll('.error-message')]
      .map((element) => element.textContent?.trim() ?? '').filter(Boolean),
    cancelled: Boolean(document.querySelector('.import-cancelled-message')),
  }))()`
  const tickets = []
  const stoppedSamplers = new Set()
  const results = []
  let primaryError

  function assertReadyOrHealthy(ticket, state, label) {
    if (ticket.error) {
      throw ticket.error instanceof Error ? ticket.error : new Error(String(ticket.error))
    }
    assert.equal(state?.errors?.length, 0,
      `${label} import failed: ${JSON.stringify(state?.errors ?? [])}`)
    assert.equal(state.cancelled, false, `${label} import was cancelled before Ledger acceptance.`)
  }

  try {
    for (const { label, path, bytes, sha256, expectedRows } of fixtures) {
      // A full navigation releases the previous report. Do not let duplicate or
      // same-date snapshot rejection masquerade as this fixture's acceptance.
      await navigateAndWait(previewUrl)
      await waitForPageValue(readState, (state) => state?.demo === true,
        `${label} fresh Demo before heap diagnostic`)
      await clickPrimaryNavigation('Import')
      const nodeId = await resolveFileInputNodeId()
      const ticket = armNextWorkerHeap(label)
      assert(ticket && typeof ticket === 'object', `${label} did not receive a Worker heap ticket.`)
      tickets.push(ticket)
      await cdp.send('DOM.setFileInputFiles', { files: [path], nodeId })

      await waitForAsyncCondition(async () => {
        const state = await evaluate(readState)
        assertReadyOrHealthy(ticket, state, label)
        return ticket.ready === true
      }, `${label} production Worker heap sampler startup`)
      assert(typeof ticket.sampler?.stop === 'function', `${label} has no stoppable Worker sampler.`)
      assert(typeof ticket.targetId === 'string' && ticket.targetId, `${label} has no Worker target identity.`)
      assert(typeof ticket.sessionId === 'string' && ticket.sessionId, `${label} has no Worker session identity.`)
      assert(typeof ticket.isolateId === 'string' && ticket.isolateId, `${label} has no Worker isolate identity.`)

      // The shared page waiter tolerates transient evaluation errors. Return an
      // observed failure from its predicate, then throw outside the waiter so a
      // fixed parser error is not swallowed and reduced to a generic timeout.
      const ledger = await waitForPageValue(readState,
        (state) => Boolean(ticket.error) || Boolean(state?.errors?.length) || state?.cancelled === true ||
          (state?.heading === 'Ledger' && state?.rows === expectedRows),
        `${label} real Ledger with ${expectedRows} rows`)
      assertReadyOrHealthy(ticket, ledger, label)
      assert.equal(ledger.heading, 'Ledger', `${label} did not reach Ledger.`)
      assert.equal(ledger.rows, expectedRows, `${label} rendered an unexpected row count.`)
      assert.equal(ledger.demo, false, `${label} remained on Demo instead of accepting the fixture.`)

      await waitForAsyncCondition(async () => {
        const { targetInfos = [] } = await cdp.send('Target.getTargets')
        return !targetInfos.some(({ targetId }) => targetId === ticket.targetId)
      }, `${label} production Worker target termination`)
      const heap = await ticket.sampler.stop('worker-target-terminated')
      stoppedSamplers.add(ticket.sampler)
      results.push({
        label,
        bytes,
        sha256,
        expectedRows,
        observedRows: ledger.rows,
        targetId: ticket.targetId,
        sessionId: ticket.sessionId,
        isolateId: ticket.isolateId,
        workerTerminated: true,
        // Preserve insufficient/partial coverage exactly as the sampler reports
        // it. There is deliberately no numerical acceptance threshold here.
        heap,
      })
    }
    return results
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanupErrors = []
    for (const ticket of tickets) {
      if (!ticket.sampler || stoppedSamplers.has(ticket.sampler)) continue
      try {
        await ticket.sampler.stop('diagnostic-aborted')
        stoppedSamplers.add(ticket.sampler)
      } catch (error) {
        if (error !== primaryError) cleanupErrors.push(error)
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        primaryError === undefined ? cleanupErrors : [primaryError, ...cleanupErrors],
        'Worker heap diagnostic cleanup failed.',
        primaryError === undefined ? undefined : { cause: primaryError },
      )
    }
  }
}
