// Runs inside the already-open production Chrome page; every external delivery is stubbed.
export async function testShareInteractions(evaluate) {
  return evaluate(`(${runShareInteractions.toString()})()`)
}

async function runShareInteractions() {
  const expect = (condition, message) => { if (!condition) throw new Error(message) }
  const pause = (milliseconds = 25) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  const wait = async (predicate, label) => {
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) {
      if (predicate()) return
      await pause()
    }
    throw new Error(`Share interaction timed out: ${label}`)
  }
  const button = (action) => document.querySelector(`[data-action="${action}"]`)
  const copyLabel = () => button('copy-summary')?.textContent?.trim()
  const delivery = () => document.querySelector('.share-delivery-status')?.textContent?.trim() ?? ''
  const preview = () => document.querySelector('.png-fallback-panel')
  const signature = () => document.querySelector('.share-card-preview')?.textContent
  const initialSignature = signature()
  expect(initialSignature && document.documentElement.lang === 'en', 'Expected initial English Ledger.')
  const navigatorKeys = ['clipboard', 'canShare', 'maxTouchPoints', 'platform', 'share', 'userAgent']
  const descriptors = Object.fromEntries(navigatorKeys.map((key) => [key, Object.getOwnPropertyDescriptor(navigator, key)]))
  const nativeCreate = URL.createObjectURL
  const nativeRevoke = URL.revokeObjectURL
  const nativeClick = HTMLAnchorElement.prototype.click
  const copies = []
  const shares = []
  const created = []
  const revoked = new Set()
  const downloads = []
  let failOutput = false
  const deferred = (list, value) => {
    let resolvePromise, rejectPromise
    const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject })
    const entry = {
      value, settled: false,
      resolve() { entry.settled = true; resolvePromise() },
      reject(name = 'NotAllowedError') { entry.settled = true; rejectPromise(new DOMException('Controlled test outcome', name)) },
    }
    list.push(entry)
    return promise
  }
  const setLocale = async (locale) => {
    const select = document.querySelector('select.language-select')
    expect(select, 'Language selector missing.')
    select.value = locale
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(() => document.documentElement.lang === locale, `locale ${locale}`)
    await pause()
  }
  const roundTripLocale = async () => { await setLocale('zh-CN'); await setLocale('en') }
  const navigate = async (label) => {
    const target = [...document.querySelectorAll('nav.side-nav button')].find((candidate) =>
      [...candidate.querySelectorAll('span')].some((part) => part.textContent?.trim() === label))
    expect(target, `Navigation missing: ${label}`)
    target.click()
    await wait(() => label === 'Ledger' ? Boolean(button('copy-summary')) : !button('copy-summary'), label)
    await pause()
  }
  const start = async (action, list, doubleClick = false) => {
    const count = list.length
    const target = button(action)
    expect(target && !target.disabled, `${action} is not ready for retry.`)
    target.click()
    if (doubleClick) target.click()
    await wait(() => list.length > count, `${action} API call`)
    await pause()
    expect(list.length === count + 1, `${action} repeated clicks created duplicate requests.`)
    expect(button(action)?.disabled, `${action} pending request is not disabled.`)
    return list[count]
  }
  const settleCopy = async (entry, success) => {
    success ? entry.resolve() : entry.reject()
    await wait(() => copyLabel() === (success ? 'Copied' : 'Copy failed. Please try again.'), 'copy outcome')
    expect(!button('copy-summary').disabled, 'Settled copy did not enable retry.')
  }
  const settleShare = async (entry, outcome, status) => {
    outcome === 'resolve' ? entry.resolve() : entry.reject(outcome)
    await wait(() => delivery() === status, `PNG ${status}`)
    expect(!button('download-card').disabled, 'Settled PNG request did not enable retry.')
  }
  const noStaleOutput = (urlCount, downloadCount) => {
    expect(created.length === urlCount && downloads.length === downloadCount, 'Stale share created a preview or download.')
    expect(!preview() && delivery() === '', 'Stale share restored an obsolete preview/status.')
    expect(!button('download-card').disabled, 'Stale share left download blocked.')
  }
  try {
    Object.defineProperties(navigator, {
      clipboard: { configurable: true, value: { writeText: (text) => deferred(copies, text) } },
      canShare: { configurable: true, value: () => true },
      maxTouchPoints: { configurable: true, value: 5 },
      platform: { configurable: true, value: 'iPhone' },
      share: { configurable: true, value: (data) => deferred(shares, data) },
      userAgent: { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)' },
    })
    URL.createObjectURL = (value) => {
      if (failOutput) throw new Error('Controlled Blob URL failure')
      const url = Reflect.apply(nativeCreate, URL, [value])
      created.push(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      revoked.add(url)
      return Reflect.apply(nativeRevoke, URL, [url])
    }
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) return Reflect.apply(nativeClick, this, [])
      downloads.push(this.download)
      if (failOutput) throw new Error('Controlled browser download failure')
    }

    // A clipboard denial must be recoverable, and same-turn repeated taps must do one write.
    await settleCopy(await start('copy-summary', copies, true), true)
    await wait(() => copyLabel() === 'Copy summary', 'successful copy feedback reset')
    await settleCopy(await start('copy-summary', copies), true)
    const pendingPastOldTimer = await start('copy-summary', copies)
    await pause(1500)
    expect(button('copy-summary').disabled && copyLabel() === 'Copying…', 'Old feedback timer cleared a newer pending copy.')
    await settleCopy(pendingPastOldTimer, false)
    await settleCopy(await start('copy-summary', copies), true)
    await pause(750)
    await settleCopy(await start('copy-summary', copies), true)
    await pause(800)
    expect(copyLabel() === 'Copied', 'Old feedback timer cleared newer success feedback.')
    await roundTripLocale()
    expect(copyLabel() === 'Copy summary', 'Locale change retained old copy feedback.')

    const localeCopy = await start('copy-summary', copies)
    await roundTripLocale()
    expect(copyLabel() === 'Copy summary' && !button('copy-summary').disabled, 'Locale change did not reset pending copy.')
    localeCopy.resolve()
    await pause()
    expect(copyLabel() === 'Copy summary', 'Old copy result reappeared after locale A-B-A.')

    // Settling an invalidated request must not unlock or overwrite the newer request.
    const oldCopy = await start('copy-summary', copies)
    await roundTripLocale()
    const newCopy = await start('copy-summary', copies)
    oldCopy.reject()
    await pause()
    expect(button('copy-summary').disabled && copyLabel() !== 'Copy failed. Please try again.', 'Old copy changed the newer pending request.')
    await settleCopy(newCopy, true)
    await roundTripLocale()

    const shared = await start('download-card', shares, true)
    expect(delivery() === 'Preparing card…', 'PNG preparing feedback missing.')
    expect(shared.value.files?.length === 1 && shared.value.files[0].type === 'image/png', 'Native share did not receive one PNG.')
    expect(shared.value.files[0].name === 'pnl-arena-2026-season.png', 'Native share filename changed.')
    await settleShare(shared, 'resolve', 'Card shared.')
    await settleShare(await start('download-card', shares), 'AbortError', 'Share cancelled.')
    expect(created.length === 0 && downloads.length === 0 && !preview(), 'Shared/cancelled result unexpectedly created a fallback.')

    await settleShare(await start('download-card', shares), 'NotAllowedError', 'PNG preview ready.')
    await wait(() => preview()?.querySelector('img'), 'rejected-share preview')
    const previewUrl = preview().querySelector('img').src
    expect(created.includes(previewUrl), 'Fallback does not use the captured local Blob URL.')
    preview().querySelector('button').click()
    await wait(() => !preview() && revoked.has(previewUrl) && delivery() === '', 'preview close and revoke')
    expect(document.activeElement === button('download-card'), 'Preview close did not restore download focus.')

    failOutput = true
    await settleShare(await start('download-card', shares), 'NotAllowedError', 'Could not create or share the card. Please try again.')
    failOutput = false
    await settleShare(await start('download-card', shares), 'resolve', 'Card shared.')

    const localeShare = await start('download-card', shares)
    const beforeLocale = [created.length, downloads.length]
    await roundTripLocale()
    expect(delivery() === '', 'Locale change retained PNG feedback.')
    localeShare.reject()
    await pause()
    noStaleOutput(...beforeLocale)

    // The old rejection must not disturb a new request started after the locale round trip.
    const oldShare = await start('download-card', shares)
    await roundTripLocale()
    const newShare = await start('download-card', shares)
    const beforeNew = [created.length, downloads.length]
    oldShare.reject()
    await pause()
    expect(created.length === beforeNew[0] && downloads.length === beforeNew[1], 'Old share emitted output during a new request.')
    expect(delivery() === 'Preparing card…' && button('download-card').disabled, 'Old share overwrote the new pending request.')
    await settleShare(newShare, 'resolve', 'Card shared.')

    const unmountedShare = await start('download-card', shares)
    const unmountedCopy = await start('copy-summary', copies)
    const beforeUnmount = [created.length, downloads.length]
    await navigate('Import')
    await navigate('Ledger')
    unmountedShare.reject()
    unmountedCopy.reject()
    await pause()
    noStaleOutput(...beforeUnmount)
    expect(copyLabel() === 'Copy summary' && !button('copy-summary').disabled, 'Unmounted copy restored obsolete feedback.')
    await settleCopy(await start('copy-summary', copies), true)
    await roundTripLocale()
    expect(signature() === initialSignature, 'Share tests changed the imported report.')
    expect(copies.every((entry) => entry.settled) && shares.every((entry) => entry.settled), 'A controlled API request was left pending.')
    return {
      copyCalls: copies.length, shareCalls: shares.length, previewUrls: created.length,
      suppressedDownloadAttempts: downloads.length, localeAndUnmountRaces: 'passed',
      recoverableOutcomes: ['copied', 'copy-failed', 'shared', 'cancelled', 'preview', 'failed'],
    }
  } finally {
    // Unmount before resolving unfinished deferred work, including assertion-failure cleanup.
    try {
      await setLocale('en')
      await navigate('Import')
    } finally {
      for (const entry of [...copies, ...shares]) if (!entry.settled) entry.reject('AbortError')
      await pause()
      failOutput = false
      URL.createObjectURL = nativeCreate
      URL.revokeObjectURL = nativeRevoke
      HTMLAnchorElement.prototype.click = nativeClick
      for (const url of created) if (!revoked.has(url)) Reflect.apply(nativeRevoke, URL, [url])
      for (const key of navigatorKeys) {
        if (descriptors[key]) Object.defineProperty(navigator, key, descriptors[key])
        else delete navigator[key]
      }
      await navigate('Ledger')
      expect(signature() === initialSignature && document.documentElement.lang === 'en', 'Share test cleanup did not restore English Ledger/report.')
    }
  }
}
