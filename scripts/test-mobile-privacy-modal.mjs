import assert from 'node:assert/strict'

// Production Chrome geometry/pointer evidence only. This is not iPhone Safari,
// VoiceOver, or large-text acceptance.
export async function testMobilePrivacyModal({ cdp, evaluate, waitForPageValue }) {
  const initial = await evaluate(`(() => ({
    locale: document.documentElement.lang,
    width: innerWidth,
    height: innerHeight,
    guide: Boolean(document.querySelector('#getting-started-main')),
    seen: localStorage.getItem('pnl-arena.onboarding.v1'),
  }))()`)
  assert(initial.guide, 'Mobile privacy regression must start on the first-use guide.')
  const expectedSourceWarnings = {
    en: 'This does not delete the original CSV from Files, Downloads, or cloud storage',
    'zh-CN': '这不会删除“文件”、下载目录或云端存储里的原始 CSV',
    'zh-TW': '這不會刪除「檔案」、下載資料夾或雲端儲存中的原始 CSV',
  }
  const cases = []

  async function settle() {
    await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  }

  async function viewport(width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1, mobile: false, screenHeight: height, screenWidth: width, height, width,
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
    await waitForPageValue('document.documentElement.lang', (current) => current === value,
      `Mobile privacy locale ${value}`)
  }

  async function pointerClick(selector) {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x, y, width: rect.width, height: rect.height,
        inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        hit: Boolean(hit && (element === hit || element.contains(hit))),
        enabled: !element.disabled && getComputedStyle(element).visibility === 'visible',
      };
    })()`)
    assert(point?.width > 0 && point.height > 0 && point.inside && point.hit && point.enabled,
      `Mobile privacy control is not pointer-reachable: ${selector}: ${JSON.stringify(point)}`)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1,
    })
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1,
    })
  }

  async function openDialog() {
    await pointerClick('.welcome-privacy-button')
    await waitForPageValue(`(() => {
      const dialog = document.querySelector('.privacy-modal[role="dialog"]');
      return Boolean(dialog && document.activeElement === dialog.querySelector('.close-button'));
    })()`, Boolean, 'Mobile privacy dialog opens with Close focused')
    await settle()
  }

  async function closeDialog(selector) {
    await pointerClick(selector)
    await waitForPageValue(`(() => ({
      closed: !document.querySelector('.privacy-modal'),
      restored: document.activeElement === document.querySelector('.welcome-privacy-button'),
    }))()`, (state) => state?.closed && state.restored,
    `Mobile privacy ${selector} closes and restores opener focus`)
  }

  try {
    for (const language of ['en', 'zh-CN', 'zh-TW']) {
      await locale(language)
      for (const [width, height] of [[320, 568], [375, 667]]) {
        await viewport(width, height)
        await openDialog()
        const before = await evaluate(`(() => {
          const modal = document.querySelector('.privacy-modal');
          const clear = document.querySelector('.privacy-modal-clear-section');
          const paragraph = clear?.querySelector('p');
          return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            modalWidth: modal?.getBoundingClientRect().width ?? 0,
            modalClientWidth: modal?.clientWidth ?? 0,
            modalScrollWidth: modal?.scrollWidth ?? 0,
            modalScrollHeight: modal?.scrollHeight ?? 0,
            modalClientHeight: modal?.clientHeight ?? 0,
            clearClientWidth: clear?.clientWidth ?? 0,
            clearScrollWidth: clear?.scrollWidth ?? 0,
            clearClientHeight: clear?.clientHeight ?? 0,
            clearScrollHeight: clear?.scrollHeight ?? 0,
            clearText: paragraph?.textContent ?? '',
            clearFontSize: paragraph ? Number.parseFloat(getComputedStyle(paragraph).fontSize) : 0,
          };
        })()`)
        assert.equal(before.viewportWidth, width)
        assert(before.clearText.includes(expectedSourceWarnings[language]),
          `Original-CSV cleanup warning is missing for ${language}.`)
        assert(before.documentWidth <= width && before.modalWidth <= width &&
          before.modalScrollWidth <= before.modalClientWidth + 1 &&
          before.clearScrollWidth <= before.clearClientWidth + 1 &&
          before.clearScrollHeight <= before.clearClientHeight + 1,
        `Mobile privacy copy escaped the ${width}px viewport: ${JSON.stringify(before)}`)
        assert(before.modalScrollHeight > before.modalClientHeight,
          'The long privacy notice did not exercise its scrolling container.')

        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: width / 2, y: height / 2, deltaX: 0, deltaY: 10_000,
        })
        const scrollGeometry = `(() => {
          const modal = document.querySelector('.privacy-modal');
          const header = document.querySelector('.privacy-modal-header').getBoundingClientRect();
          const footer = document.querySelector('.privacy-modal-footer').getBoundingClientRect();
          const clear = document.querySelector('.privacy-modal-clear-section').getBoundingClientRect();
          return {
            scrollTop: modal.scrollTop,
            maxScroll: modal.scrollHeight - modal.clientHeight,
            clearTop: clear.top, clearBottom: clear.bottom,
            headerBottom: header.bottom, footerTop: footer.top,
          };
        })()`
        const bottom = await waitForPageValue(scrollGeometry,
          (state) => state?.maxScroll > 0 && state.scrollTop >= state.maxScroll - 1,
        'Mobile privacy modal reaches its bottom by wheel scrolling')
        assert(bottom.clearBottom <= bottom.footerTop && bottom.clearBottom > bottom.headerBottom,
          `The end of the cleanup paragraph is hidden by the footer: ${JSON.stringify(bottom)}`)
        let start = bottom
        for (let attempt = 0; start.clearTop < start.headerBottom && attempt < 6; attempt += 1) {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel', x: width / 2, y: height / 2, deltaX: 0,
            deltaY: -Math.ceil(start.headerBottom - start.clearTop + 24),
          })
          await settle()
          start = await evaluate(scrollGeometry)
        }
        assert(start.clearTop >= start.headerBottom && start.clearTop < start.footerTop,
          `The start of the cleanup paragraph cannot be scrolled below the sticky header: ${JSON.stringify(start)}`)
        assert(before.clearFontSize >= 13,
          `Mobile privacy body text is too small at ${width}px in ${language}: ${before.clearFontSize}px.`)

        // Both sticky actions must be real pointer targets, not just DOM nodes.
        await closeDialog('.privacy-modal .close-button')
        await openDialog()
        await closeDialog('.privacy-modal-footer .primary-button')
        cases.push({ locale: language, width, height, bodyFontSize: before.clearFontSize,
          maxScroll: bottom.maxScroll, topClose: true, bottomClose: true })
      }
    }
  } finally {
    if (await evaluate('Boolean(document.querySelector(".privacy-modal"))')) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await waitForPageValue('Boolean(document.querySelector(".privacy-modal"))', (value) => !value,
        'Mobile privacy cleanup closes dialog')
    }
    await locale(initial.locale)
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await settle()
    assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight })'),
      { width: initial.width, height: initial.height }, 'Mobile privacy viewport was not restored.')
    assert.equal(await evaluate('localStorage.getItem("pnl-arena.onboarding.v1")'), initial.seen,
      'Mobile privacy regression changed the first-use choice.')
  }
  console.log('Mobile privacy notice three-locale pointer, scroll and text-size regression passed; not iPhone evidence.')
  return cases
}
