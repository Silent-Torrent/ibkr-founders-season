import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const [
    { ArenaPage },
    { LedgerPage },
    { ShareCardPreview },
    { TrophiesPage },
    { demoReport },
    { formatCurrency },
    { getDivision, getTrophies },
    { parseIbkrActivityStatement },
    { formatParserDiagnostic },
    { buildSeasonSummary, downloadSeasonCard },
    { decideSnapshotImport },
    { sha256Hex },
    { createSessionComparisonSalt },
  ] = await Promise.all([
    vite.ssrLoadModule('/src/pages/ArenaPage.tsx'),
    vite.ssrLoadModule('/src/pages/LedgerPage.tsx'),
    vite.ssrLoadModule('/src/components/ShareCardPreview.tsx'),
    vite.ssrLoadModule('/src/pages/TrophiesPage.tsx'),
    vite.ssrLoadModule('/src/data/demo.ts'),
    vite.ssrLoadModule('/src/lib/format.ts'),
    vite.ssrLoadModule('/src/lib/season.ts'),
    vite.ssrLoadModule('/src/lib/ibkr.ts'),
    vite.ssrLoadModule('/src/lib/parserDiagnostics.ts'),
    vite.ssrLoadModule('/src/lib/shareCard.ts'),
    vite.ssrLoadModule('/src/lib/snapshot.ts'),
    vite.ssrLoadModule('/src/lib/sha256.ts'),
    vite.ssrLoadModule('/src/lib/sessionIdentity.ts'),
  ])

  const cloneReport = () => JSON.parse(JSON.stringify(demoReport))
  const localReport = cloneReport()
  localReport.source = 'local'
  localReport.fingerprint = 'current-file'
  localReport.accountComparisonKey = 'account-a'

  assert.equal(
    sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
  for (const value of ['中文与 emoji 🙂', 'a'.repeat(1_000), '\0account\0salt', '🌍'.repeat(100)]) {
    assert.equal(
      sha256Hex(value),
      createHash('sha256').update(value, 'utf8').digest('hex'),
      'The browser-safe SHA-256 implementation diverged from the platform implementation.',
    )
  }
  const firstSessionSalt = createSessionComparisonSalt()
  const secondSessionSalt = createSessionComparisonSalt()
  assert.match(firstSessionSalt, /^[a-f0-9]{64}$/)
  assert.notEqual(firstSessionSalt, secondSessionSalt)

  assert.equal(getDivision(undefined, 'USD'), undefined, 'Missing NAV was assigned to a capital division.')
  assert.equal(getDivision(Number.NaN, 'USD'), undefined, 'Invalid NAV was assigned to a capital division.')
  assert.equal(getDivision(0, 'USD'), 'rookieLeague', 'A valid zero NAV did not use the lowest capital division.')
  assert.equal(getDivision(25_000, 'USD'), 'retailLeague', 'A valid USD NAV used the wrong division.')
  assert.equal(getDivision(33_750, 'HKD'), undefined, 'A HKD NAV was compared with USD division thresholds.')
  assert.equal(getDivision(33_750, 'CNY'), undefined, 'A CNY NAV was compared with USD division thresholds.')
  assert.ok(
    getTrophies(demoReport).every((trophy) => !trophy.unlocked),
    'Synthetic demo data unlocked a local achievement.',
  )
  assert.ok(
    getTrophies(localReport).some((trophy) => trophy.unlocked),
    'A local report could not unlock any local achievement.',
  )
  const nonUsdTrophyReport = cloneReport()
  nonUsdTrophyReport.source = 'local'
  nonUsdTrophyReport.baseCurrency = 'HKD'
  nonUsdTrophyReport.optionPnl = 3_000
  nonUsdTrophyReport.symbols[0].totalCurrentUnrealized = -6_000
  const nonUsdTrophies = getTrophies(nonUsdTrophyReport)
  assert.equal(nonUsdTrophies.find((trophy) => trophy.id === 'theta')?.unlocked, false)
  assert.equal(nonUsdTrophies.find((trophy) => trophy.id === 'bagholder')?.unlocked, false)
  assert.equal(
    formatCurrency(1, '<img>', 'en'),
    '—',
    'An invalid currency escaped the formatter safety fallback.',
  )

  const arenaDemoMarkup = renderToStaticMarkup(
    createElement(ArenaPage, { locale: 'en', report: demoReport }),
  )
  assert.ok(!arenaDemoMarkup.includes('#17'), 'The demo Arena still contains a fictional personal rank.')
  assert.ok(!arenaDemoMarkup.includes('Self-reported'), 'Demo data is labelled Self-reported in the Arena.')
  assert.ok(!arenaDemoMarkup.includes('Your local snapshot'), 'Demo data created a personal local snapshot.')
  assert.ok(arenaDemoMarkup.includes('SYNTHETIC · DEMO'), 'The Arena lacks an explicit synthetic-demo label.')
  const demoLedgerMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: demoReport }),
  )
  assert.ok(demoLedgerMarkup.includes('Review internal checks'))
  assert.ok(!demoLedgerMarkup.includes('Internal checks passed'))

  const localizedWarningReport = cloneReport()
  localizedWarningReport.warnings = [{ code: 'nav_missing' }]
  const englishWarning = formatParserDiagnostic({ code: 'nav_missing' }, 'en')
  const simplifiedWarning = formatParserDiagnostic({ code: 'nav_missing' }, 'zh-CN')
  const traditionalWarning = formatParserDiagnostic({ code: 'nav_missing' }, 'zh-TW')
  assert.notEqual(englishWarning, simplifiedWarning)
  assert.notEqual(simplifiedWarning, traditionalWarning)
  assert.ok(
    renderToStaticMarkup(
      createElement(LedgerPage, { locale: 'en', report: localizedWarningReport }),
    ).includes(englishWarning),
    'The Ledger did not render a structured diagnostic in English.',
  )
  assert.ok(
    renderToStaticMarkup(
      createElement(LedgerPage, { locale: 'zh-CN', report: localizedWarningReport }),
    ).includes(simplifiedWarning),
    'The Ledger did not retranslate a stored diagnostic in Simplified Chinese.',
  )
  assert.ok(
    renderToStaticMarkup(
      createElement(LedgerPage, { locale: 'zh-TW', report: localizedWarningReport }),
    ).includes(traditionalWarning),
    'The Ledger did not retranslate a stored diagnostic in Traditional Chinese.',
  )

  const fixture = readFileSync(
    new URL('../tests/fixtures/ibkr-current-schema-synthetic.csv', import.meta.url),
    'utf8',
  )
  const syntheticResult = parseIbkrActivityStatement(fixture, {
    accountComparisonSalt: 'policy-test-session',
    currentDate: new Date(2026, 7, 30),
  })
  assert.equal(syntheticResult.errors.length, 0, JSON.stringify(syntheticResult.errors))
  assert.equal(syntheticResult.report?.source, 'synthetic', 'The known fixture was not downgraded to synthetic test data.')
  const mutatedFixture = fixture.replace('Synthetic Regression Fixture', 'Synthetic Regression Fixture modified')
  const mutatedResult = parseIbkrActivityStatement(mutatedFixture, {
    accountComparisonSalt: 'policy-test-session',
    currentDate: new Date(2026, 7, 30),
  })
  assert.equal(mutatedResult.errors.length, 0, JSON.stringify(mutatedResult.errors))
  assert.equal(mutatedResult.report?.source, 'local', 'Unknown modified content was trusted as the known synthetic fixture.')
  const crlfResult = parseIbkrActivityStatement(fixture.replace(/\n/g, '\r\n'), {
    accountComparisonSalt: 'policy-test-session',
    currentDate: new Date(2026, 7, 30),
  })
  assert.equal(crlfResult.report?.source, 'synthetic', 'Line-ending normalization changed the known fixture label.')
  const collidingSuffixResult = parseIbkrActivityStatement(
    fixture.replace('SYNTHETIC_ACCOUNT_2026_A', 'DIFFERENT_ACCOUNT_2026_A'),
    {
      accountComparisonSalt: 'policy-test-session',
      currentDate: new Date(2026, 7, 30),
    },
  )
  assert.equal(collidingSuffixResult.errors.length, 0, JSON.stringify(collidingSuffixResult.errors))
  assert.equal(collidingSuffixResult.report?.accountIdMasked, syntheticResult.report?.accountIdMasked)
  assert.notEqual(
    collidingSuffixResult.report?.accountComparisonKey,
    syntheticResult.report?.accountComparisonKey,
    'Different accounts with the same visible suffix received the same comparison key.',
  )
  const otherSessionResult = parseIbkrActivityStatement(fixture, {
    accountComparisonSalt: 'different-policy-session',
    currentDate: new Date(2026, 7, 30),
  })
  assert.notEqual(
    otherSessionResult.report?.accountComparisonKey,
    syntheticResult.report?.accountComparisonKey,
    'Account comparison keys remained linkable across session salts.',
  )

  const syntheticReport = syntheticResult.report
  assert.ok(syntheticReport)
  const syntheticLedgerMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: syntheticReport }),
  )
  const syntheticArenaMarkup = renderToStaticMarkup(
    createElement(ArenaPage, { locale: 'en', report: syntheticReport }),
  )
  const syntheticTrophiesMarkup = renderToStaticMarkup(
    createElement(TrophiesPage, { locale: 'en', report: syntheticReport }),
  )
  const syntheticShareMarkup = renderToStaticMarkup(
    createElement(ShareCardPreview, { locale: 'en', report: syntheticReport }),
  )
  for (const markup of [syntheticLedgerMarkup, syntheticArenaMarkup, syntheticTrophiesMarkup, syntheticShareMarkup]) {
    assert.ok(!markup.includes('Self-reported'), 'Synthetic fixture content was labelled Self-reported.')
    assert.ok(!markup.includes('Local achievement'), 'Synthetic fixture content unlocked or advertised a local achievement.')
  }
  assert.ok(syntheticLedgerMarkup.includes('Fully synthetic test'))
  assert.ok(!syntheticArenaMarkup.includes('Your local snapshot'))
  assert.ok(getTrophies(syntheticReport).every((trophy) => !trophy.unlocked))

  const arenaLocalMarkup = renderToStaticMarkup(
    createElement(ArenaPage, { locale: 'en', report: localReport }),
  )
  assert.ok(arenaLocalMarkup.includes('Your local snapshot'), 'A local report lacks its local snapshot panel.')
  assert.ok(arenaLocalMarkup.includes('Not ranked'), 'A local report is not explicitly labelled unranked.')
  assert.ok(arenaLocalMarkup.includes('Self-reported'), 'A local report lacks its authenticity tier.')
  assert.ok(!arenaLocalMarkup.includes('#17'), 'A local report received a fictional leaderboard placement.')

  const missingValuesReport = JSON.parse(JSON.stringify(syntheticReport))
  missingValuesReport.source = 'local'
  delete missingValuesReport.netLiquidationValue
  delete missingValuesReport.seasonReturn
  const missingLedgerMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: missingValuesReport }),
  )
  assert.ok(
    missingLedgerMarkup.includes('Division unavailable'),
    'Missing NAV is not labelled as an unavailable division.',
  )
  assert.ok(
    missingLedgerMarkup.includes('Internal checks passed'),
    'Arithmetic checks are not labelled independently from authenticity.',
  )
  assert.ok(
    !missingLedgerMarkup.includes('Reconciled'),
    'Internal CSV checks are still presented as an authenticity reconciliation tier.',
  )

  const canaryReport = cloneReport()
  canaryReport.source = 'local'
  canaryReport.accountComparisonKey = 'SECRET_COMPARISON_KEY'
  canaryReport.accountIdMasked = '••••SECRET_ACCOUNT'
  canaryReport.netLiquidationValue = 987654321
  canaryReport.symbols[0].symbol = 'DO_NOT_SHARE_BEST'
  canaryReport.symbols.at(-1).symbol = 'DO_NOT_SHARE_WORST'

  const summary = buildSeasonSummary(canaryReport, 'en')
  const previewMarkup = renderToStaticMarkup(
    createElement(ShareCardPreview, { locale: 'en', report: canaryReport }),
  )
  for (const forbidden of ['DO_NOT_SHARE', 'SECRET_ACCOUNT', 'SECRET_COMPARISON_KEY', '987654321']) {
    assert.ok(!summary.includes(forbidden), `Copied summary leaked ${forbidden}.`)
    assert.ok(!previewMarkup.includes(forbidden), `Share preview leaked ${forbidden}.`)
  }
  const privacyLine = 'Excludes holdings, account identifiers, and exact net liquidation value.'
  assert.ok(summary.includes(privacyLine))
  assert.ok(previewMarkup.includes(privacyLine))

  const drawnText = []
  const gradient = { addColorStop() {} }
  const context = {
    beginPath() {},
    createLinearGradient() { return gradient },
    fill() {},
    fillRect() {},
    fillText(value) { drawnText.push(String(value)) },
    roundRect() {},
    stroke() {},
  }
  let downloadClickCount = 0
  const downloadLink = {
    click() { downloadClickCount += 1 },
    download: '',
    href: '',
  }
  const originalDocument = globalThis.document
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  globalThis.document = {
    createElement(tagName) {
      if (tagName === 'canvas') {
        return {
          getContext() { return context },
          height: 0,
          toDataURL() { return 'data:image/png;base64,AAECAw==' },
          width: 0,
        }
      }
      if (tagName === 'a') return downloadLink
      throw new Error(`Unexpected element request: ${tagName}`)
    },
  }
  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    })
    const fallbackResult = await downloadSeasonCard(canaryReport, 'en')

    assert.equal(fallbackResult.kind, 'downloaded')
    assert.equal(downloadClickCount, 1, 'PNG download fallback did not click the download link.')
    assert.equal(downloadLink.download, 'pnl-arena-2026-season.png')
    assert.equal(downloadLink.href, 'data:image/png;base64,AAECAw==')

    let canSharePayload
    let sharePayload
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        canShare(payload) {
          canSharePayload = payload
          return true
        },
        maxTouchPoints: 5,
        platform: 'iPhone',
        share(payload) {
          sharePayload = payload
          return Promise.resolve()
        },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)',
      },
    })
    const shareResult = await downloadSeasonCard(canaryReport, 'en')

    assert.equal(shareResult.kind, 'shared')
    assert.equal(canSharePayload.files.length, 1)
    assert.equal(sharePayload.files.length, 1)
    assert.equal(sharePayload.files[0], canSharePayload.files[0])
    assert.equal(sharePayload.files[0].name, 'pnl-arena-2026-season.png')
    assert.equal(sharePayload.files[0].type, 'image/png')
    assert.deepEqual(
      new Uint8Array(await sharePayload.files[0].arrayBuffer()),
      new Uint8Array([0, 1, 2, 3]),
      'File sharing received corrupted PNG bytes.',
    )
    assert.equal(downloadClickCount, 1, 'File sharing unexpectedly also triggered a browser download.')

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        maxTouchPoints: 5,
        platform: 'iPhone',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)',
      },
    })
    const iosResult = await downloadSeasonCard(canaryReport, 'en')

    assert.equal(iosResult.kind, 'preview')
    assert.equal(iosResult.filename, 'pnl-arena-2026-season.png')
    assert.ok(iosResult.previewUrl.startsWith('blob:'), 'iOS fallback did not create a local Blob preview.')
    assert.equal(downloadClickCount, 1, 'iOS preview fallback unexpectedly triggered a hidden download.')
    URL.revokeObjectURL(iosResult.previewUrl)
  } finally {
    globalThis.document = originalDocument
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    } else {
      delete globalThis.navigator
    }
  }
  const pngText = drawnText.join('\n')
  for (const forbidden of ['DO_NOT_SHARE', 'SECRET_ACCOUNT', 'SECRET_COMPARISON_KEY', '987654321']) {
    assert.ok(!pngText.includes(forbidden), `PNG text leaked ${forbidden}.`)
  }
  assert.ok(pngText.includes(privacyLine))

  const duplicate = { ...localReport, fingerprint: 'current-file' }
  const sameDate = { ...localReport, fingerprint: 'same-date-different-file' }
  const older = { ...localReport, fingerprint: 'older', endDate: '2026-08-26' }
  const newer = { ...localReport, fingerprint: 'newer', endDate: '2026-08-28' }
  const otherAccount = {
    ...localReport,
    accountIdMasked: localReport.accountIdMasked,
    accountComparisonKey: 'account-b',
    fingerprint: 'other-account',
    endDate: '2026-01-31',
  }
  assert.equal(decideSnapshotImport(localReport, duplicate), 'duplicate')
  assert.equal(decideSnapshotImport(localReport, sameDate), 'same_date')
  assert.equal(decideSnapshotImport(localReport, older), 'older')
  assert.equal(decideSnapshotImport(localReport, newer), 'accept')
  assert.equal(decideSnapshotImport(localReport, otherAccount), 'accept')

  console.log('Product policy and privacy contracts passed.')
} finally {
  await vite.close()
}
