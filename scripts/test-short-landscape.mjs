import assert from 'node:assert/strict'

// Desktop Chromium viewport/pointer evidence only, not real iPhone rotation.
// Locale changes and final restoration are setup; every tested action uses CDP
// pointer input after viewport clipping and elementFromPoint hit checks.
export async function testShortLandscape({ cdp, evaluate, waitForPageValue }) {
  const pages = ['arena', 'trophies', 'import', 'ledger']
  const markers = {
    ledger: '.data-table', arena: '.arena-hero', trophies: '.trophy-grid', import: '.import-layout',
  }
  const initial = await evaluate(`(() => ({
    locale: document.documentElement.lang,
    page: document.querySelector('.side-nav [aria-current="page"]')?.dataset.page,
    width: innerWidth, height: innerHeight, scrollX, scrollY,
    sidebarScroll: document.querySelector('.sidebar')?.scrollTop ?? 0,
    report: document.querySelector('.data-table tbody')?.textContent ?? '',
  }))()`)
  assert.equal(initial.page, 'ledger', 'Short-landscape regression must start on Ledger.')
  assert(initial.report, 'Short-landscape regression needs the existing synthetic report.')
  const cases = []

  async function settle() {
    await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  }

  async function viewport(width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1, width, height, mobile: false, screenWidth: width, screenHeight: height,
    })
    await settle()
    assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight })'), { width, height })
  }

  async function locale(value) {
    assert.equal(await evaluate(`(() => {
      const select = document.querySelector('select.language-select');
      if (!select) return false;
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`), true)
    await waitForPageValue('document.documentElement.lang', (current) => current === value, `Short landscape locale ${value}`)
  }

  function geometryExpression(selector, container = '') {
    return `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const clip = ${container ? `document.querySelector(${JSON.stringify(container)})` : 'null'};
      if (!element || (${Boolean(container)} && !clip)) return null;
      const rect = element.getBoundingClientRect();
      const clipRect = clip?.getBoundingClientRect();
      const left = Math.max(0, clipRect?.left ?? 0);
      const right = Math.min(innerWidth, clipRect?.right ?? innerWidth);
      const top = Math.max(0, clipRect?.top ?? 0);
      const bottom = Math.min(innerHeight, clipRect?.bottom ?? innerHeight);
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const style = getComputedStyle(element);
      return {
        x, y, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
        safeTop: top, safeBottom: bottom,
        fullyVisible: rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom,
        hit: Boolean(hit && (hit === element || element.contains(hit))),
        enabled: !element.disabled && style.visibility === 'visible' && Number(style.opacity) > 0,
        scrollTop: clip?.scrollTop ?? scrollY,
        scrollHeight: clip?.scrollHeight ?? document.documentElement.scrollHeight,
        clientHeight: clip?.clientHeight ?? innerHeight,
        wheelX: (left + right) / 2, wheelY: (top + bottom) / 2,
      };
    })()`
  }

  async function wheel(x, y, deltaY) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY })
    // Wheel scrolling is asynchronous; do not inspect the pre-scroll frame.
    await evaluate('new Promise((resolve) => setTimeout(resolve, 80))')
    await settle()
  }

  async function reachable(selector, container = '') {
    const expression = geometryExpression(selector, container)
    let state
    for (let attempt = 0; attempt < 12; attempt += 1) {
      state = await evaluate(expression)
      assert(state && state.width > 0 && state.height > 0, `Missing control: ${selector}`)
      if (state.fullyVisible && state.hit && state.enabled) return state
      assert(state.enabled, `Disabled or invisible control: ${selector}`)
      const delta = state.top < state.safeTop
        ? -Math.max(80, state.safeTop - state.top + 24)
        : Math.max(80, state.bottom - state.safeBottom + 24)
      await wheel(state.wheelX, state.wheelY, delta)
    }
    assert.fail(`Control is not fully reachable after real wheel input: ${selector}: ${JSON.stringify(state)}`)
  }

  async function pointerClick(selector, container = '') {
    const point = await reachable(selector, container)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1,
    })
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1,
    })
    return point
  }

  async function navigate(page, container = '.sidebar') {
    await pointerClick(`${container} [data-page="${page}"]`, container)
    await waitForPageValue(`(() => ({
      page: document.querySelector(${JSON.stringify(`${container} [aria-current="page"]`)})?.dataset.page,
      content: Boolean(document.querySelector(${JSON.stringify(markers[page])})),
    }))()`, (state) => state?.page === page && state.content, `Real ${container} navigation to ${page}`)
  }

  async function escape() {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  }

  try {
    for (const language of ['en', 'zh-CN', 'zh-TW']) {
      await locale(language)
      for (const [width, height] of [[812, 300], [812, 375], [932, 375]]) {
        await viewport(width, height)
        const sidebar = await evaluate(`(() => {
          const element = document.querySelector('.sidebar');
          return {
            display: getComputedStyle(element).display,
            clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
            bottomDisplay: getComputedStyle(document.querySelector('.bottom-nav')).display,
          };
        })()`)
        assert.notEqual(sidebar.display, 'none')
        assert.equal(sidebar.clientHeight, height)
        assert(sidebar.scrollHeight > sidebar.clientHeight, 'Short-height case must exercise overflowing sidebar content.')
        assert.equal(sidebar.bottomDisplay, 'none', 'Desktop sidebar and mobile navigation should not overlap.')

        // Start at the top using wheel input, then require a real sidebar scroll
        // to the last help action. DOM presence or a footer duplicate cannot pass.
        await wheel(120, height / 2, -10_000)
        await waitForPageValue('document.querySelector(".sidebar").scrollTop', (value) => value === 0, 'Sidebar wheel reset')
        const pageScrollBefore = await evaluate('scrollY')
        const privacySelector = '.sidebar .sidebar-help-actions button:not([data-action])'
        const privacyPoint = await reachable(privacySelector, '.sidebar')
        assert(privacyPoint.scrollTop > 0, 'Help reachability did not exercise the sidebar scroll container.')
        assert.equal(await evaluate('scrollY'), pageScrollBefore, 'Sidebar wheel input scrolled the page instead.')
        await pointerClick(privacySelector, '.sidebar')
        await waitForPageValue(`(() => {
          const dialog = document.querySelector('.privacy-modal[role="dialog"]');
          return Boolean(dialog && dialog.contains(document.activeElement));
        })()`, Boolean, 'Sidebar privacy pointer opens and focuses the dialog')
        // Wait out the opening transform before choosing a hit-tested point.
        await evaluate('new Promise((resolve) => setTimeout(resolve, 200))')
        await pointerClick('.privacy-modal .close-button', '.privacy-modal')
        await waitForPageValue(`({
          closed: !document.querySelector('.privacy-modal'),
          restored: document.activeElement === document.querySelector(${JSON.stringify(privacySelector)}),
        })`, (state) => state?.closed && state.restored, 'Privacy close restores the sidebar opener')

        // Every transition changes the page; checking the selected navigation
        // plus unique page content detects clicks that never reached the button.
        for (const page of pages) await navigate(page)
        const reportBeforeGuide = await evaluate('document.querySelector(".data-table tbody")?.textContent ?? ""')
        await pointerClick('.sidebar [data-action="open-guide"]', '.sidebar')
        await waitForPageValue(`Boolean(document.querySelector('#getting-started-main') &&
          document.activeElement?.id === 'getting-started-main')`, Boolean, 'Sidebar guide opens')
        await pointerClick('[data-action="welcome-primary"]')
        await waitForPageValue(`({
          page: document.querySelector('.side-nav [aria-current="page"]')?.dataset.page,
          report: document.querySelector('.data-table tbody')?.textContent ?? '',
        })`, (state) => state?.page === 'ledger' && state.report === reportBeforeGuide, 'Guide returns without replacing the report')
        cases.push({ locale: language, width, height, sidebarWheelScroll: privacyPoint.scrollTop, navigation: pages, privacy: true, guide: true })
      }

      await viewport(375, 812)
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".sidebar")).display'), 'none')
      assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".bottom-nav")).display'), 'none')
      for (const page of pages) await navigate(page, '.bottom-nav')
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Returning to portrait left horizontal page overflow.')
    }
  } finally {
    // Restoration is not acceptance evidence. Keep the caller's report and
    // locale, and restore its unoverridden viewport before later regressions.
    await viewport(1024, 900)
    if (await evaluate('Boolean(document.querySelector(".privacy-modal"))')) {
      await escape()
      await waitForPageValue('Boolean(document.querySelector(".privacy-modal"))', (value) => !value, 'Short landscape cleanup closes dialog')
    }
    if (await evaluate('Boolean(document.querySelector("#getting-started-main"))')) {
      await pointerClick('[data-action="welcome-primary"]')
      await waitForPageValue('Boolean(document.querySelector(".sidebar"))', Boolean, 'Short landscape cleanup returns from guide')
    }
    await navigate(initial.page)
    await locale(initial.locale)
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await settle()
    await evaluate(`(() => {
      document.querySelector('.sidebar').scrollTop = ${initial.sidebarScroll};
      window.scrollTo(${initial.scrollX}, ${initial.scrollY});
    })()`)
    assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight })'), { width: initial.width, height: initial.height },
      'Short-landscape caller must enter with device metrics cleared.')
    assert.equal(await evaluate('document.querySelector(".data-table tbody")?.textContent ?? ""'), initial.report,
      'Short-landscape regression changed the current report.')
  }
  console.log('Short landscape real wheel/pointer navigation passed; this is not real-device rotation evidence.')
  return { landscape: cases, portrait: { width: 375, height: 812, locales: ['en', 'zh-CN', 'zh-TW'], navigation: pages } }
}
