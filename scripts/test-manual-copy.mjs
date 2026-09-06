import assert from 'node:assert/strict'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function checkManualCopySourceContract() {
  const source = readFileSync(new URL('../src/components/ShareCardPreview.tsx', import.meta.url), 'utf8')
  for (const marker of [
    'data-action="manual-summary"', 'className="manual-copy-panel"', 'data-manual-summary',
    'data-action="select-manual-summary"', 'data-action="close-manual-summary"',
    'className="share-copy-feedback"', 'className="share-copy-status"', 'data-copy-status={copyStatus}',
  ]) assert(source.includes(marker), `Manual copy source contract missing: ${marker}`)
  assert.match(source, /readOnly/)
  assert.match(source, /spellCheck=\{false\}/)
  assert.match(source, /data-action="copy-summary"[\s\S]*?>\s*\{t\(locale, 'copySummary'\)\}\s*<\/button>/,
    'Copy action name must not change with feedback.')
  assert.equal((source.match(/copyStatus === 'copying'\s*\?/g) ?? []).length, 1,
    'Copy feedback must have one announcement source, separate from the action label.')
  console.log('Manual copy source contract passed.')
}

// Every clipboard operation is controlled. This is DOM/selection evidence, not
// a real OS clipboard permission or iPhone editing-menu test.
export async function testManualCopy({ cdp, evaluate, waitForPageValue }) {
  checkManualCopySourceContract()
  const qaDirectory = process.env.MANUAL_COPY_QA_DIR
  if (qaDirectory) {
    assert(isAbsolute(qaDirectory), 'MANUAL_COPY_QA_DIR must be an explicit absolute path.')
    const metadata = lstatSync(qaDirectory)
    assert(metadata.isDirectory() && !metadata.isSymbolicLink(), 'MANUAL_COPY_QA_DIR must be an existing real directory.')
  }
  const locales = [
    ['en', 'Select text manually', 'Copy failed. Use manual selection.', 'Copied', 'Copy summary', 'Copying…'],
    ['zh-CN', '手动选择文字', '复制失败，可手动选择文字。', '已复制', '复制摘要', '正在复制…'],
    ['zh-TW', '手動選取文字', '複製失敗，可手動選取文字。', '已複製', '複製摘要', '正在複製…'],
  ]
  const readState = `(() => {
    const panel = document.querySelector('.manual-copy-panel');
    const field = panel?.querySelector('textarea[data-manual-summary]');
    const rect = field?.getBoundingClientRect();
    const topbar = document.querySelector('.topbar');
    const nav = document.querySelector('.bottom-nav');
    const labelledIds = (field?.getAttribute('aria-labelledby') ?? '').split(/\\s+/).filter(Boolean);
    const describedIds = (field?.getAttribute('aria-describedby') ?? '').split(/\\s+/).filter(Boolean);
    const label = field?.labels?.length ? [...field.labels].map((item) => item.textContent.trim()).join(' ')
      : labelledIds.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
    const hit = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    const geometry = (element) => {
      const bounds = element?.getBoundingClientRect();
      return bounds ? { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right } : null;
    };
    return {
      panel: Boolean(panel), value: field?.value ?? '', readonly: field?.readOnly,
      spellcheck: field?.spellcheck, selected: field ? [field.selectionStart, field.selectionEnd] : [],
      focused: document.activeElement === field, focusAction: document.activeElement?.getAttribute('data-action') ?? '',
      copyLabel: document.querySelector('[data-action="copy-summary"]')?.textContent?.trim() ?? '',
      copyFeedback: document.querySelector('[data-copy-status]')?.textContent?.trim() ?? '',
      copyStatus: document.querySelector('[data-copy-status]')?.getAttribute('data-copy-status') ?? '',
      copyDisabled: document.querySelector('[data-action="copy-summary"]')?.disabled ?? false,
      manualLabel: document.querySelector('[data-action="manual-summary"]')?.textContent?.trim() ?? '',
      calls: globalThis.__manualCopyProbe.copies.length, legacyCalls: globalThis.__manualCopyProbe.legacyCalls,
      label, described: describedIds.length > 0 && describedIds.every((id) => Boolean(document.getElementById(id)?.textContent?.trim())),
      documentWidth: document.documentElement.scrollWidth,
      bounds: [...(panel?.querySelectorAll('textarea,button,label,p') ?? []), ...(panel ? [panel] : [])].map((item) => {
        const bounds = item.getBoundingClientRect(); return { left: bounds.left, right: bounds.right };
      }),
      fieldRect: rect ? { top: rect.top, bottom: rect.bottom } : null,
      scrollY, panelRect: geometry(panel),
      closeRect: geometry(panel?.querySelector('[data-action="close-manual-summary"]')),
      selectRect: geometry(panel?.querySelector('[data-action="select-manual-summary"]')),
      topbarBottom: topbar?.getBoundingClientRect().bottom ?? 0,
      safeBottom: nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : innerHeight,
      unobscured: Boolean(field && hit && (hit === field || field.contains(hit))),
    };
  })()`
  const initialReport = await evaluate(`document.querySelector('.data-table tbody')?.textContent ?? ''`)
  const summaries = {}
  const stableActionLayouts = []
  let installed = false

  async function click(action) {
    assert.equal(await evaluate(`(() => {
      const button = document.querySelector('[data-action="${action}"]');
      if (!button || button.disabled) return false;
      button.focus();
      if (['select-manual-summary', 'close-manual-summary'].includes(${JSON.stringify(action)})) {
        const rect = button.getBoundingClientRect();
        const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
        const nav = document.querySelector('.bottom-nav');
        const bottom = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : innerHeight;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (rect.top < top - 1 || rect.bottom > bottom + 1 || !hit || !(hit === button || button.contains(hit))) {
          throw new Error('Manual control is obscured after keyboard focus: ${action} ' + JSON.stringify({ top: rect.top, bottom: rect.bottom, safeTop: top, safeBottom: bottom }));
        }
      }
      button.click(); return true;
    })()`), true, `Manual-copy control unavailable: ${action}`)
  }
  async function setLocale(locale) {
    await evaluate(`(() => {
      const select = document.querySelector('select.language-select');
      select.value = ${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`)
    await waitForPageValue('document.documentElement.lang', (value) => value === locale, `Manual-copy locale ${locale}`)
  }
  async function navigate(label) {
    assert.equal(await evaluate(`(() => {
      const button = [...document.querySelectorAll('nav.side-nav button')].find((candidate) =>
        [...candidate.querySelectorAll('span')].some((part) => part.textContent?.trim() === ${JSON.stringify(label)}));
      if (!button) return false; button.click(); return true;
    })()`), true)
    await waitForPageValue(`Boolean(document.querySelector('[data-action="manual-summary"]'))`,
      (value) => value === (label === 'Ledger'), `Manual-copy navigation ${label}`)
  }
  async function beginCopy() {
    const before = await evaluate('globalThis.__manualCopyProbe.copies.length')
    await click('copy-summary')
    await waitForPageValue('globalThis.__manualCopyProbe.copies.length', (value) => value === before + 1, 'Controlled clipboard call')
    return before
  }
  async function settle(index, success = false) {
    await evaluate(`globalThis.__manualCopyProbe.copies[${index}].${success ? 'resolve' : 'reject'}()`)
    await evaluate('new Promise((resolve) => setTimeout(resolve, 30))')
  }
  async function openSelected(focusOpener = true) {
    const calls = await evaluate('globalThis.__manualCopyProbe.copies.length')
    if (focusOpener) await click('manual-summary')
    else assert.equal(await evaluate(`(() => {
      const button = document.querySelector('[data-action="manual-summary"]');
      if (!button || button.disabled) return false;
      button.click(); return true;
    })()`), true)
    await waitForPageValue(readState, (value) => value?.panel && value?.focused, 'Explicit manual selection')
    // Let native focus/selection scrolling settle without moving the viewport ourselves.
    await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const state = await evaluate(readState)
    assert.equal(state.calls, calls, 'Manual selection wrote to the clipboard.')
    assert.equal(state.readonly, true)
    assert.equal(state.spellcheck, false)
    assert(state.value.length > 100, 'Manual summary is unexpectedly empty or truncated.')
    assert.deepEqual(state.selected, [0, state.value.length])
    assert(state.label && state.described, 'Textarea label/hint relationship is missing.')
    assert.equal(state.documentWidth, 320)
    assert(state.bounds.every(({ left, right }) => left >= -1 && right <= 321), 'Manual-copy panel overflows 320 px.')
    const visible = state.fieldRect.top >= state.topbarBottom - 1 && state.fieldRect.bottom <= state.safeBottom + 1 && state.unobscured
    if (!visible) {
      console.log('Manual-copy initial focus geometry:', {
        scrollY: state.scrollY, panel: state.panelRect, textarea: state.fieldRect, close: state.closeRect,
        select: state.selectRect, topbarBottom: state.topbarBottom, safeBottom: state.safeBottom, unobscured: state.unobscured,
      })
      if (qaDirectory) {
        const locale = await evaluate('document.documentElement.lang')
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        writeFileSync(join(qaDirectory, `${locale}-focus-failure.png`), Buffer.from(screenshot.data, 'base64'), { flag: 'wx' })
      }
    }
    assert(visible,
      `Selected textarea is covered by navigation: ${JSON.stringify(state.fieldRect)}; visible ${state.topbarBottom}-${state.safeBottom}.`)
    return state
  }
  async function close() {
    await click('close-manual-summary')
    await waitForPageValue(readState, (value) => !value?.panel && value?.focusAction === 'manual-summary', 'Close manual selection and restore opener focus')
  }
  async function noStalePanel(label) {
    const state = await evaluate(readState)
    assert.equal(state.panel, false, `${label} resurrected manual text.`)
    assert.equal(state.copyDisabled, false)
    assert.equal(state.copyLabel, 'Copy summary', `${label} restored stale copy feedback.`)
    assert.equal(state.copyFeedback, '', `${label} restored stale copy feedback.`)
    assert.equal(state.copyStatus, 'idle', `${label} restored stale copy state.`)
  }

  try {
    await evaluate(`(() => {
      const keys = ['clipboard', 'canShare', 'maxTouchPoints', 'platform', 'share', 'userAgent'];
      const state = {
        keys, descriptors: Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(navigator, key)])),
        legacy: document.execCommand, copies: [], shares: [], legacyCalls: 0,
      };
      state.clipboard = { writeText: (text) => new Promise((resolve, reject) => {
        const entry = { text, settled: false,
          resolve() { entry.settled = true; resolve(); },
          reject() { entry.settled = true; reject(new DOMException('Controlled clipboard denial', 'NotAllowedError')); },
        };
        state.copies.push(entry);
      }) };
      globalThis.__manualCopyProbe = state;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: state.clipboard });
      Object.defineProperties(navigator, {
        canShare: { configurable: true, value: () => true },
        share: { configurable: true, value: () => new Promise((resolve, reject) => {
          const entry = { settled: false, reject() {
            entry.settled = true; reject(new DOMException('Controlled share denial', 'NotAllowedError'));
          } }; state.shares.push(entry);
        }) },
        maxTouchPoints: { configurable: true, value: 5 },
        platform: { configurable: true, value: 'iPhone' },
        userAgent: { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)' },
      });
      document.execCommand = function () { state.legacyCalls += 1; throw new Error('Unexpected legacy clipboard fallback'); };
    })()`)
    installed = true
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1, height: 900, mobile: false, screenHeight: 900, screenWidth: 320, width: 320,
    })
    for (const [locale, manualLabel, failedLabel, copiedLabel, copyLabel, copyingLabel] of locales) {
      await setLocale(locale)
      await evaluate(`document.querySelector('select.language-select').focus()`)
      const manual = await openSelected(false)
      assert.equal(manual.manualLabel, manualLabel)
      assert.equal(manual.copyLabel, copyLabel)
      assert.notEqual(manual.copyFeedback, copiedLabel, 'Selecting text falsely reported a successful copy.')
      summaries[locale] = manual.value
      if (qaDirectory) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        writeFileSync(join(qaDirectory, `${locale}.png`), Buffer.from(screenshot.data, 'base64'), { flag: 'wx' })
      }
      const scrolled = await evaluate(`(() => {
        const field = document.querySelector('[data-manual-summary]');
        field.scrollTop = field.scrollHeight;
        return { value: field.value, selected: [field.selectionStart, field.selectionEnd],
          calls: globalThis.__manualCopyProbe.copies.length,
          scrollTop: field.scrollTop, scrollHeight: field.scrollHeight, clientHeight: field.clientHeight };
      })()`)
      assert(scrolled.scrollTop + scrolled.clientHeight >= scrolled.scrollHeight - 1,
        `${locale} manual summary cannot scroll to its final line.`)
      assert.equal(scrolled.value, manual.value, 'Scrolling changed the manual summary.')
      assert.deepEqual(scrolled.selected, manual.selected, 'Scrolling changed the full-text selection.')
      assert.equal(scrolled.calls, manual.calls, 'Scrolling wrote to the clipboard.')
      for (const privateCanary of ['ZZFICTA', 'ZZFICTB', 'ZZFICTC', 'SYNTHETIC_ACCOUNT_2026_A', '33,750', '33750']) {
        assert(!manual.value.includes(privateCanary), `Manual summary exposed private canary ${privateCanary}.`)
      }
      await evaluate(`document.querySelector('[data-manual-summary]').setSelectionRange(1, 2)`)
      const repeatedOpen = await openSelected()
      assert.equal(repeatedOpen.value, manual.value)
      assert.equal(repeatedOpen.calls, manual.calls)
      await evaluate(`document.querySelector('[data-manual-summary]').setSelectionRange(1, 2)`)
      await click('select-manual-summary')
      const reselected = await evaluate(readState)
      assert.equal(reselected.focused, true)
      assert.deepEqual(reselected.selected, [0, manual.value.length])
      assert.equal(reselected.calls, manual.calls)
      await close()

      const pending = await beginCopy()
      await evaluate(`document.querySelector('select.language-select').focus()`)
      await settle(pending)
      const denied = await waitForPageValue(readState, (value) => value?.panel && value?.copyFeedback === failedLabel, `${locale} automatic denial exposes manual text`)
      assert.equal(denied.copyLabel, copyLabel)
      assert.equal(denied.focused, false, 'Automatic denial stole focus into the textarea.')
      assert.equal(await evaluate(`document.activeElement === document.querySelector('select.language-select')`), true)
      assert.equal(denied.value, manual.value)
      assert.equal(await evaluate(`globalThis.__manualCopyProbe.copies[${pending}].text`), manual.value)
      if (locale === 'en') {
        await openSelected()
        await evaluate('new Promise((resolve) => setTimeout(resolve, 3100))')
        const afterFailureTimer = await evaluate(readState)
        assert.equal(afterFailureTimer.copyLabel, 'Copy summary')
        assert.equal(afterFailureTimer.copyFeedback, '')
        assert.equal(afterFailureTimer.panel, true, 'Failure feedback reset removed the manual fallback.')
        assert.equal(afterFailureTimer.focused, true)
        assert.equal(afterFailureTimer.value, manual.value)
        assert.deepEqual(afterFailureTimer.selected, [0, manual.value.length])
      }
      await close()

      // Keep the same real pointer target through natural feedback transitions.
      // Element .click() alone would silently follow a relocated Manual button.
      await evaluate(`document.querySelector('.share-section > .section-heading .button-row').scrollIntoView({ block: 'center', behavior: 'auto' })`)
      // Clear a previous locale's pointer hover and its 150 ms transform transition;
      // this is harness setup, not a wait that skips any product feedback state.
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
      await evaluate('new Promise((resolve) => setTimeout(resolve, 200))')
      await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      const readActionLayout = `(() => {
        const geometry = (element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        };
        const actions = ['copy-summary', 'manual-summary', 'download-card'];
        return {
          scrollY, width: document.documentElement.scrollWidth,
          controls: Object.fromEntries(actions.map((action) => {
            const element = document.querySelector('[data-action="' + action + '"]');
            return [action, { ...geometry(element), label: element.textContent.trim() }];
          })),
          feedback: geometry(document.querySelector('.share-copy-feedback')),
          statuses: document.querySelectorAll('.share-copy-feedback [role="status"]').length,
          sizingHidden: [...document.querySelectorAll('.share-copy-feedback-size')].every((element) =>
            element.getAttribute('aria-hidden') === 'true' && getComputedStyle(element).visibility === 'hidden'),
        };
      })()`
      const idleLayout = await evaluate(readActionLayout)
      assert.equal(idleLayout.width, 320)
      assert.equal(idleLayout.statuses, 1)
      assert.equal(idleLayout.sizingHidden, true)
      const assertStableLayout = async (phase) => {
        await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        const layout = await evaluate(readActionLayout)
        assert.equal(layout.width, 320, `${locale} ${phase} introduced horizontal overflow.`)
        assert(Math.abs(layout.scrollY - idleLayout.scrollY) <= 0.5, `${locale} ${phase} moved the viewport.`)
        for (const action of Object.keys(idleLayout.controls)) {
          assert.equal(layout.controls[action].label, idleLayout.controls[action].label,
            `${locale} ${phase} changed the ${action} action name.`)
          for (const edge of ['left', 'top', 'right', 'bottom']) {
            assert(Math.abs(layout.controls[action][edge] - idleLayout.controls[action][edge]) <= 0.5,
              `${locale} ${phase} moved ${action} ${edge}: ${JSON.stringify({ before: idleLayout, after: layout })}`)
          }
        }
        assert.deepEqual(layout.feedback, idleLayout.feedback, `${locale} ${phase} resized the reserved feedback space.`)
        return layout
      }
      const layoutCopy = await beginCopy()
      assert.equal((await evaluate(readState)).copyFeedback, copyingLabel)
      await assertStableLayout('pending')
      await settle(layoutCopy)
      await waitForPageValue(readState, (value) => value?.copyFeedback === failedLabel, `${locale} layout denial`)
      const failedLayout = await assertStableLayout('failed')
      const oldManualPoint = {
        x: (failedLayout.controls['manual-summary'].left + failedLayout.controls['manual-summary'].right) / 2,
        y: (failedLayout.controls['manual-summary'].top + failedLayout.controls['manual-summary'].bottom) / 2,
      }
      const hitAtOldPoint = `document.elementFromPoint(${oldManualPoint.x}, ${oldManualPoint.y})?.closest('[data-action]')?.getAttribute('data-action')`
      assert.equal(await evaluate(hitAtOldPoint), 'manual-summary', `${locale} failed Manual target is obscured.`)
      await waitForPageValue(readState, (value) => value?.copyStatus === 'idle', `${locale} natural failure reset`)
      await assertStableLayout('failure reset')
      assert.equal(await evaluate(hitAtOldPoint), 'manual-summary', `${locale} old Manual point now hits another action.`)
      const sharesBeforeOldPoint = await evaluate('globalThis.__manualCopyProbe.shares.length')
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...oldManualPoint })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...oldManualPoint })
      const oldPointSelection = await waitForPageValue(readState, (value) => value?.focused, `${locale} original Manual coordinate selects text`)
      assert.deepEqual(oldPointSelection.selected, [0, oldPointSelection.value.length])
      assert.equal(await evaluate('globalThis.__manualCopyProbe.shares.length'), sharesBeforeOldPoint,
        `${locale} original Manual coordinate unexpectedly requested PNG sharing.`)
      assert.equal(await evaluate(`Boolean(document.querySelector('.png-fallback-panel'))`), false)
      await close()

      await evaluate(`document.querySelector('.share-section > .section-heading .button-row').scrollIntoView({ block: 'center', behavior: 'auto' })`)
      // The preceding real pointer click must not leave a hovered action at this baseline.
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
      await evaluate('new Promise((resolve) => setTimeout(resolve, 200))')
      const successCopy = await beginCopy()
      await settle(successCopy, true)
      await waitForPageValue(readState, (value) => value?.copyFeedback === copiedLabel, `${locale} layout success`)
      // Closing the panel can change the absolute scroll limit; compare this independent success run.
      const copiedLayout = await evaluate(readActionLayout)
      await waitForPageValue(readState, (value) => value?.copyStatus === 'idle', `${locale} natural success reset`)
      assert.deepEqual(await evaluate(readActionLayout), copiedLayout, `${locale} success reset moved action targets.`)
      stableActionLayouts.push({ locale, width: 320, pendingFailureReset: true, successReset: true, oldManualPointHit: 'manual-summary' })
    }
    assert.notEqual(summaries.en, summaries['zh-CN'])
    assert.notEqual(summaries['zh-CN'], summaries['zh-TW'])
    await setLocale('en')

    const beforeMissing = await evaluate('globalThis.__manualCopyProbe.copies.length')
    await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })`)
    await click('copy-summary')
    const missing = await waitForPageValue(readState, (value) => value?.panel && value?.copyFeedback === locales[0][2], 'Missing clipboard API exposes manual text')
    assert.equal(missing.calls, beforeMissing)
    assert.equal(missing.focusAction, 'copy-summary')
    assert.equal(missing.value, summaries.en)
    await close()
    await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: globalThis.__manualCopyProbe.clipboard })`)

    for (const success of [false, true]) {
      const pending = await beginCopy()
      await openSelected()
      await close()
      await settle(pending, success)
      await noStalePanel(`Closed pending-copy ${success ? 'success' : 'failure'}`)
    }
    const localePending = await beginCopy()
    await openSelected()
    await setLocale('zh-CN')
    assert.equal(await evaluate(`Boolean(document.querySelector('.manual-copy-panel'))`), false)
    await setLocale('en')
    await settle(localePending)
    await noStalePanel('Locale A-B-A callback')

    const unmounted = await beginCopy()
    await openSelected()
    await navigate('Import')
    await navigate('Ledger')
    await settle(unmounted)
    await noStalePanel('Unmounted callback')

    const successful = await beginCopy()
    await openSelected()
    await settle(successful, true)
    assert.equal((await evaluate(readState)).copyFeedback, 'Copied')
    await close()
    const newer = await beginCopy()
    await openSelected()
    await evaluate('new Promise((resolve) => setTimeout(resolve, 1500))')
    const afterOldTimer = await evaluate(readState)
    assert.equal(afterOldTimer.panel, true)
    assert.equal(afterOldTimer.copyDisabled, true)
    assert.equal(afterOldTimer.copyFeedback, 'Copying…', 'A closed-panel feedback timer changed a newer pending copy.')
    await close()
    await settle(newer)
    await noStalePanel('Closed timer and newer callback')

    // A delayed PNG fallback must not pull focus away while the user selects text.
    await click('download-card')
    await waitForPageValue('globalThis.__manualCopyProbe.shares.length', (value) => value === 1, 'Controlled pending PNG share')
    const whilePngPending = await openSelected()
    await evaluate('globalThis.__manualCopyProbe.shares[0].reject()')
    await waitForPageValue(`Boolean(document.querySelector('.png-fallback-panel img')?.complete)`, Boolean, 'Delayed PNG fallback while selecting manual text')
    const afterPng = await evaluate(readState)
    assert.equal(afterPng.focused, true, 'Delayed PNG preview stole focus from manual text selection.')
    assert.deepEqual(afterPng.selected, [0, afterPng.value.length])
    assert.equal(afterPng.value, whilePngPending.value)
    assert.equal(afterPng.calls, whilePngPending.calls)
    await evaluate(`document.querySelector('.png-fallback-panel button').click()`)
    await close()
    assert.equal(await evaluate('globalThis.__manualCopyProbe.legacyCalls'), 0)
    assert.equal(await evaluate(`document.querySelector('.data-table tbody')?.textContent ?? ''`), initialReport)
    return { locales: locales.map(([locale]) => locale), controlledCopyCalls: await evaluate('globalThis.__manualCopyProbe.copies.length'),
      missingApiFallback: true, fullReadonlySelection: true, scrollToFinalLine: true, manualClipboardWrites: 0, staleCloseLocaleUnmount: 'passed',
      delayedPngKeptManualFocus: true, stableActionLayouts, width: 320 }
  } finally {
    try {
      if (installed) {
        await setLocale('en')
        await navigate('Import')
        await evaluate(`(() => {
          const state = globalThis.__manualCopyProbe;
          for (const entry of state.copies) if (!entry.settled) entry.reject();
          for (const entry of state.shares) if (!entry.settled) entry.reject();
          document.execCommand = state.legacy;
          for (const key of state.keys) {
            if (state.descriptors[key]) Object.defineProperty(navigator, key, state.descriptors[key]); else delete navigator[key];
          }
          delete globalThis.__manualCopyProbe;
        })()`)
        await navigate('Ledger')
      }
    } finally { await cdp.send('Emulation.clearDeviceMetricsOverride') }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--check-source-contract', 'Use --check-source-contract, or invoke the browser harness.')
  checkManualCopySourceContract()
}
