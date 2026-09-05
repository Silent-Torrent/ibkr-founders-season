import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// A fast red/green contract gate; browser assertions below check actual rendering.
export function checkPngSaveSourceContract() {
  const component = readFileSync(new URL('../src/components/ShareCardPreview.tsx', import.meta.url), 'utf8')
  for (const marker of [
    'data-action="download-preview"',
    'data-png-filename="full"',
    'data-png-filename="stem"',
    'className="png-save-steps"',
    'className="png-saved-copy-hint"',
  ]) assert(component.includes(marker), `PNG save guidance source contract missing: ${marker}`)
  assert.match(component, /\.filename\.replace\(\s*\/\\\.png\$\/i,\s*['"]['"]\s*\)/,
    'The suggested basename must remove only the terminal PNG extension from the preview filename.')
  console.log('PNG save guidance source contract passed.')
}

// The production canvas, Blob, anchors and Chrome download remain real. Only
// capability detection is controlled; this does not prove iOS naming behavior.
export async function testPngSaveGuidance({
  cdp, evaluate, waitForPageValue, waitForAsyncCondition, downloadDirectory, inspectPng,
}) {
  checkPngSaveSourceContract()
  const filename = 'pnl-arena-2026-season.png'
  const stem = 'pnl-arena-2026-season'
  const namedDirectory = join(downloadDirectory, 'named-preview')
  mkdirSync(namedDirectory)
  const qaDirectory = process.env.PNG_SAVE_QA_DIR
  if (qaDirectory) {
    assert(isAbsolute(qaDirectory), 'PNG_SAVE_QA_DIR must be an explicit absolute directory.')
    const qaStat = lstatSync(qaDirectory)
    assert(qaStat.isDirectory() && !qaStat.isSymbolicLink(), 'PNG_SAVE_QA_DIR must be an existing real directory.')
  }
  const starts = []
  const progress = []
  const unlistenStart = cdp.on('Browser.downloadWillBegin', (event) => starts.push(event))
  const unlistenProgress = cdp.on('Browser.downloadProgress', (event) => progress.push(event))
  const initialReport = await evaluate(`document.querySelector('.data-table tbody')?.textContent ?? ''`)
  const locales = [
    { locale: 'en', label: 'Try named download', files: /Save to Files/i, share: /Share/i,
      noRepeat: /Do not add \.png again/i, sync: /sync/i, reopen: /reopen.*Files/i, single: /only one \.png/i,
      notSaved: /preview is not a saved file/i, cannotConfirm: /cannot confirm/i, noDelete: /does not delete/i },
    { locale: 'zh-CN', label: '尝试按名称下载', files: /文件/, share: /分享/,
      noRepeat: /不要重复输入/, sync: /同步/, reopen: /文件.*重新打开/, single: /只有一个 \.png/,
      notSaved: /预览不代表.*保存/, cannotConfirm: /无法确认/, noDelete: /不会删除/ },
    { locale: 'zh-TW', label: '嘗試依檔名下載', files: /檔案/, share: /分享/,
      noRepeat: /不要重複輸入/, sync: /同步/, reopen: /檔案.*重新開啟/, single: /只有一個 \.png/,
      notSaved: /預覽不代表.*儲存/, cannotConfirm: /無法確認/, noDelete: /不會刪除/ },
  ]
  const checkedLocales = []
  let namedDownload
  let installed = false

  async function setLocale(locale) {
    assert.equal(await evaluate(`(() => {
      const select = document.querySelector('select.language-select');
      if (!select) return false;
      select.value = ${JSON.stringify(locale)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`), true)
    await waitForPageValue('document.documentElement.lang', (value) => value === locale, `PNG guidance locale ${locale}`)
  }

  try {
    await evaluate(`(() => {
      const keys = ['canShare', 'maxTouchPoints', 'platform', 'share', 'userAgent'];
      const state = {
        keys, descriptors: Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(navigator, key)])),
        create: URL.createObjectURL, revoke: URL.revokeObjectURL, created: [], revoked: [],
      };
      globalThis.__pnlPngSaveGuidance = state;
      Object.defineProperties(navigator, {
        canShare: { configurable: true, value: undefined },
        share: { configurable: true, value: undefined },
        maxTouchPoints: { configurable: true, value: 5 },
        platform: { configurable: true, value: 'iPhone' },
        userAgent: { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)' },
      });
      URL.createObjectURL = function (blob) {
        const url = Reflect.apply(state.create, URL, [blob]);
        state.created.push({ url, type: blob.type, size: blob.size, isBlob: blob instanceof Blob });
        return url;
      };
      URL.revokeObjectURL = function (url) {
        state.revoked.push(url);
        return Reflect.apply(state.revoke, URL, [url]);
      };
    })()`)
    installed = true
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: namedDirectory, eventsEnabled: true })
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1, height: 900, mobile: false, screenHeight: 900, screenWidth: 320, width: 320,
    })

    for (const { locale, label, files, share, noRepeat, sync, reopen, single, notSaved, cannotConfirm, noDelete } of locales) {
      await setLocale(locale)
      const localeReport = await evaluate(`document.querySelector('.data-table tbody')?.textContent ?? ''`)
      const downloadCountBeforePreview = starts.length
      assert.equal(await evaluate(`(() => {
        const button = document.querySelector('[data-action="download-card"]');
        if (!button || button.disabled) return false;
        button.focus(); button.click(); return true;
      })()`), true)
      const view = await waitForPageValue(`(() => {
        const panel = document.querySelector('.png-fallback-panel');
        const img = panel?.querySelector('img');
        const named = panel?.querySelector('[data-action="download-preview"]');
        const open = panel?.querySelector('a.png-open-link');
        const topbar = document.querySelector('.topbar');
        const bottomNav = document.querySelector('.bottom-nav');
        const visibleRect = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return {
            top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            unobscured: Boolean(hit && (hit === element || element.contains(hit))),
          };
        };
        const anchor = (link) => link ? ({
          href: link.href, target: link.target, rel: [...link.relList], download: link.getAttribute('download'), text: link.textContent.trim(),
        }) : null;
        return {
          ready: Boolean(img?.complete && img.naturalWidth && document.activeElement === panel),
          img: img ? { url: img.src, width: img.naturalWidth, height: img.naturalHeight } : null,
          named: anchor(named), open: anchor(open),
          full: panel?.querySelector('[data-png-filename="full"]')?.textContent?.trim() ?? '',
          stem: panel?.querySelector('[data-png-filename="stem"]')?.textContent?.trim() ?? '',
          stepsTag: panel?.querySelector('.png-save-steps')?.tagName ?? '',
          steps: [...(panel?.querySelectorAll('.png-save-steps > li') ?? [])].map((item) => item.textContent.trim()),
          savedHint: panel?.querySelector('.png-saved-copy-hint')?.textContent?.trim() ?? '',
          paragraphs: [...(panel?.querySelectorAll(':scope > p') ?? [])].map((item) => item.textContent.trim()).join(' '),
          width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
          initialFocusVisibility: {
            topbarBottom: topbar?.getBoundingClientRect().bottom ?? 0,
            safeBottom: bottomNav && getComputedStyle(bottomNav).display !== 'none'
              ? bottomNav.getBoundingClientRect().top : window.innerHeight,
            heading: visibleRect(panel?.querySelector('.png-fallback-heading strong')),
            close: visibleRect(panel?.querySelector('.png-fallback-heading button')),
          },
          bounds: [...(panel?.querySelectorAll('p,li,code,a,img') ?? []), ...(panel ? [panel] : [])].map((item) => {
            const rect = item.getBoundingClientRect(); return { left: rect.left, right: rect.right };
          }),
          report: document.querySelector('.data-table tbody')?.textContent ?? '',
        };
      })()`, (value) => value?.ready, `${locale} real Blob PNG preview`)
      assert(view.named, 'PNG preview is missing the explicit named-download link.')
      assert(view.open, 'PNG preview lost the Safari-open fallback.')
      assert.equal(view.full, filename)
      assert.equal(view.stem, stem)
      assert.equal(view.named.download, filename)
      assert.equal(view.named.text, label)
      assert.equal(view.open.download, null)
      assert.equal(view.named.href, view.img.url)
      assert.equal(view.open.href, view.img.url)
      assert.match(view.img.url, /^blob:http:\/\/127\.0\.0\.1:/)
      assert.equal(view.img.width, 1200)
      assert.equal(view.img.height, 1500)
      for (const link of [view.named, view.open]) {
        assert.equal(link.target, '_blank')
        assert.deepEqual([...link.rel].sort(), ['noopener', 'noreferrer'])
      }
      assert.equal(view.stepsTag, 'OL')
      assert.equal(view.steps.length, 3)
      assert.match(view.steps[0], /Safari/)
      assert.match(view.steps[0], files)
      assert.match(view.steps[0], share)
      assert.match(view.steps[1], /Unknown/)
      assert.match(view.steps[1], /\.png/)
      assert.match(view.steps[1], noRepeat)
      assert(view.steps[1].includes(stem))
      assert.match(view.steps[2], /iCloud/)
      assert.match(view.steps[2], /iPhone/)
      assert.match(view.steps[2], sync)
      assert.match(view.steps[2], reopen)
      assert.match(view.steps[2], single)
      assert.match(view.paragraphs, notSaved)
      assert.match(view.paragraphs, cannotConfirm)
      assert.match(view.savedHint, noDelete)
      assert.equal(view.documentWidth, 320)
      assert(view.bounds.every(({ left, right }) => left >= -1 && right <= 321),
        `${locale} PNG save guidance overflows the 320 px viewport: ${JSON.stringify(view.bounds)}`)
      assert.equal(view.report, localeReport, 'Opening PNG guidance changed the imported report.')
      assert.equal(starts.length, downloadCountBeforePreview, 'Opening a local preview automatically started a download.')

      // Measure the real automatic focus scroll before any screenshot scroll.
      // Focus alone is not sufficient if sticky/fixed navigation covers the control.
      const visibility = view.initialFocusVisibility
      console.log(`PNG initial focus visibility (${locale}):`, visibility)
      for (const [label, rect] of [['heading', visibility.heading], ['close control', visibility.close]]) {
        assert(rect && rect.top >= visibility.topbarBottom - 1 && rect.bottom <= visibility.safeBottom + 1,
          `${locale} PNG ${label} is outside the unobscured viewport after automatic focus: ${JSON.stringify(visibility)}`)
        assert(rect.unobscured, `${locale} PNG ${label} is covered after automatic focus.`)
      }

      if (qaDirectory) {
        // Keep the actual navigation visible in two ordinary viewport captures.
        const top = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        writeFileSync(join(qaDirectory, `${locale}-top.png`), Buffer.from(top.data, 'base64'), { flag: 'wx' })
        await evaluate(`(() => {
          const hint = document.querySelector('.png-saved-copy-hint');
          const nav = document.querySelector('.bottom-nav');
          const safeBottom = nav && getComputedStyle(nav).display !== 'none'
            ? nav.getBoundingClientRect().top : window.innerHeight;
          window.scrollBy({ top: hint.getBoundingClientRect().bottom - safeBottom + 12, behavior: 'instant' });
        })()`)
        await waitForPageValue(`(() => {
          const hint = document.querySelector('.png-saved-copy-hint');
          const rect = hint.getBoundingClientRect();
          const topbar = document.querySelector('.topbar');
          const nav = document.querySelector('.bottom-nav');
          const safeBottom = nav && getComputedStyle(nav).display !== 'none'
            ? nav.getBoundingClientRect().top : window.innerHeight;
          return rect.top >= (topbar?.getBoundingClientRect().bottom ?? 0) && rect.bottom <= safeBottom - 10;
        })()`, Boolean, `${locale} save-guidance end is visible above the fixed navigation`)
        const bottom = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        writeFileSync(join(qaDirectory, `${locale}-bottom.png`), Buffer.from(bottom.data, 'base64'), { flag: 'wx' })
      }

      if (locale === 'en') {
        assert.deepEqual(readdirSync(namedDirectory), [])
        await evaluate(`document.querySelector('[data-action="download-preview"]').click()`)
        await waitForAsyncCondition(async () => starts.length === 1, 'Explicit named-preview download start')
        const start = starts[0]
        assert.equal(start.suggestedFilename, filename)
        assert.equal(start.url, view.img.url)
        await waitForAsyncCondition(async () => {
          const events = progress.filter(({ guid }) => guid === start.guid)
          assert(!events.some(({ state }) => state === 'canceled'), 'Explicit named-preview download was canceled.')
          return events.some(({ state }) => state === 'completed')
        }, 'Explicit named-preview download completion')
        await waitForAsyncCondition(async () => readdirSync(namedDirectory).includes(filename)
          && readdirSync(namedDirectory).every((name) => !name.endsWith('.crdownload')), 'Named-preview PNG file flush')
        assert.deepEqual(readdirSync(namedDirectory), [filename])
        const bytes = readFileSync(join(namedDirectory, filename))
        assert.equal(statSync(join(namedDirectory, filename)).size, bytes.length)
        assert.deepEqual(inspectPng(bytes), { width: 1200, height: 1500 })
        const decoded = await evaluate(`(async () => {
          const bytes = Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const result = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return result;
        })()`)
        assert.deepEqual(decoded, { width: 1200, height: 1500 })
        assert.equal(await evaluate(`document.querySelector('.png-fallback-panel img')?.src`), view.img.url,
          'Named download removed the usable Safari fallback preview.')
        assert.equal(await evaluate(`document.querySelector('.data-table tbody')?.textContent ?? ''`), localeReport)
        namedDownload = { guid: start.guid, filename, bytes: bytes.length, ...decoded }
      }

      await evaluate(`document.querySelector('.png-fallback-panel button').click()`)
      await waitForPageValue(`(() => ({
        closed: !document.querySelector('.png-fallback-panel'),
        revoked: globalThis.__pnlPngSaveGuidance.revoked.includes(${JSON.stringify(view.img.url)}),
        focus: document.activeElement?.getAttribute('data-action'),
      }))()`, (value) => value?.closed && value?.revoked && value?.focus === 'download-card', `${locale} preview close, revoke and focus return`)
      checkedLocales.push(locale)
    }
    const blobs = await evaluate(`globalThis.__pnlPngSaveGuidance.created`)
    assert.equal(blobs.length, 3)
    assert(blobs.every(({ isBlob, type, size }) => isBlob && type === 'image/png' && size > 1000))
    assert.equal(starts.length, 1, 'PNG guidance started an extra unrequested download.')
    assert(progress.every(({ guid }) => guid === namedDownload.guid))
    await setLocale('en')
    assert.equal(await evaluate(`document.querySelector('.data-table tbody')?.textContent ?? ''`), initialReport)
    return { locales: checkedLocales, width: 320, realLocalPreviews: blobs.length, namedDownload }
  } finally {
    unlistenStart()
    unlistenProgress()
    try {
      if (installed) await evaluate(`(() => {
        document.querySelector('.png-fallback-panel button')?.click();
        const state = globalThis.__pnlPngSaveGuidance;
        URL.createObjectURL = state.create; URL.revokeObjectURL = state.revoke;
        for (const { url } of state.created) {
          if (!state.revoked.includes(url)) Reflect.apply(state.revoke, URL, [url]);
        }
        for (const key of state.keys) {
          const descriptor = state.descriptors[key];
          if (descriptor) Object.defineProperty(navigator, key, descriptor); else delete navigator[key];
        }
        delete globalThis.__pnlPngSaveGuidance;
      })()`)
    } finally {
      await cdp.send('Emulation.clearDeviceMetricsOverride')
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory, eventsEnabled: true })
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--check-source-contract', 'Use --check-source-contract, or invoke the browser harness.')
  checkPngSaveSourceContract()
}
