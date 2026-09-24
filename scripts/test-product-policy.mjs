import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function readFunctionalSourceTree(directoryUrl) {
  return readdirSync(directoryUrl, { withFileTypes: true }).flatMap((entry) => {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl)
    if (entry.isDirectory()) return readFunctionalSourceTree(childUrl)
    if (!/\.[cm]?[jt]sx?$/.test(entry.name)) return []
    return [{ name: childUrl.pathname, source: readFileSync(childUrl, 'utf8') }]
  })
}

try {
  const [
    { ArenaPage },
    { LedgerPage },
    { ShareCardPreview },
    { TrophiesPage },
    { demoReport },
    { formatCurrency, formatPercent, formatReconciliationDifference },
    { hasCurrentUnrealizedExplanation, hasRealizedExplanation },
    { getDivision, getTrophies },
    { parseIbkrActivityStatement },
    { formatParserDiagnostic },
    { buildSeasonSummary, downloadSeasonCard, formatShareSeasonReturn },
    { decideSnapshotImport },
    { sha256Hex },
    { createSessionComparisonSalt },
    { importRecoveryKey },
    { PARSER_DIAGNOSTIC_CODES },
    { t },
  ] = await Promise.all([
    vite.ssrLoadModule('/src/pages/ArenaPage.tsx'),
    vite.ssrLoadModule('/src/pages/LedgerPage.tsx'),
    vite.ssrLoadModule('/src/components/ShareCardPreview.tsx'),
    vite.ssrLoadModule('/src/pages/TrophiesPage.tsx'),
    vite.ssrLoadModule('/src/data/demo.ts'),
    vite.ssrLoadModule('/src/lib/format.ts'),
    vite.ssrLoadModule('/src/lib/explanationAvailability.ts'),
    vite.ssrLoadModule('/src/lib/season.ts'),
    vite.ssrLoadModule('/src/lib/ibkr.ts'),
    vite.ssrLoadModule('/src/lib/parserDiagnostics.ts'),
    vite.ssrLoadModule('/src/lib/shareCard.ts'),
    vite.ssrLoadModule('/src/lib/snapshot.ts'),
    vite.ssrLoadModule('/src/lib/sha256.ts'),
    vite.ssrLoadModule('/src/lib/sessionIdentity.ts'),
    vite.ssrLoadModule('/src/lib/importRecovery.ts'),
    vite.ssrLoadModule('/src/lib/parserDiagnostics.ts'),
    vite.ssrLoadModule('/src/i18n.ts'),
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
  for (const [locale, symbol] of [['en', '$'], ['zh-CN', 'US$'], ['zh-TW', 'US$']]) {
    assert.equal(formatCurrency(0, 'USD', locale), `${symbol}0`)
    assert.equal(formatCurrency(0.4, 'USD', locale), `+${symbol}0.40`)
    assert.equal(formatCurrency(-0.4, 'USD', locale), `-${symbol}0.40`)
    assert.equal(formatCurrency(0.000001, 'USD', locale), `+${symbol}0.000001`)
    assert.equal(formatCurrency(-0.000001, 'USD', locale), `-${symbol}0.000001`)
    assert.equal(formatCurrency(0.4, 'USD', locale, true), `+${symbol}0.40`)
    assert.equal(formatPercent(0, locale), '0%')
    assert.equal(formatPercent(0.0004, locale), '+0.04%')
    assert.equal(formatPercent(-0.0004, locale), '-0.04%')
    assert.equal(formatPercent(0.000001, locale), '+0.0001%')
    assert.equal(formatPercent(-0.000001, locale), '-0.0001%')
    assert.equal(formatPercent(0.000499999999999, locale), '+0.05%')
    assert.equal(formatPercent(0.0005, locale), '+0.05%')
    assert.equal(formatPercent(-0.0005, locale), '-0.05%')
    assert.equal(formatPercent(0.001, locale), '+0.1%')
    assert.equal(formatPercent(0.00123, locale), '+0.1%')
  }
  assert.equal(formatCurrency(0.4, 'JPY', 'en'), '+¥0.40')
  assert.equal(formatCurrency(0.4, '<img>', 'en'), '—')
  assert.equal(formatCurrency(Number.NaN, 'USD', 'en'), '—')
  assert.equal(formatCurrency(Number.POSITIVE_INFINITY, 'USD', 'en'), '—')
  assert.equal(formatPercent(Number.NEGATIVE_INFINITY, 'en'), '—')
  assert.equal(formatPercent(1e-23, 'en'), '+1E-21%')
  assert.equal(formatReconciliationDifference(0, 'USD', 'en'), '$0')
  assert.equal(formatReconciliationDifference(0.4, 'USD', 'en'), '+$0.40')
  assert.equal(formatReconciliationDifference(-0.4, 'USD', 'en'), '-$0.40')
  assert.equal(formatReconciliationDifference(0.000001, 'USD', 'en'), '+$0.000001')
  assert.equal(formatReconciliationDifference(0.0000004, 'USD', 'en'), '+$0.0000004')
  assert.match(formatReconciliationDifference(1e-21, 'USD', 'en'), /\+\$1E-21/)
  assert.equal(formatReconciliationDifference(1, '<img>', 'en'), '—')

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
  assert.match(
    syntheticTrophiesMarkup,
    /data-status="preview" data-trophy="bagholder"/,
    'Synthetic achievements are not clearly labelled as previews.',
  )
  assert.match(syntheticTrophiesMarkup, /data-status="unsupported" data-trophy="reverse"/)
  assert.match(syntheticTrophiesMarkup, /data-status="unsupported" data-trophy="iv"/)

  const arenaLocalMarkup = renderToStaticMarkup(
    createElement(ArenaPage, { locale: 'en', report: localReport }),
  )
  assert.ok(arenaLocalMarkup.includes('Your local snapshot'), 'A local report lacks its local snapshot panel.')
  assert.ok(arenaLocalMarkup.includes('Not ranked'), 'A local report is not explicitly labelled unranked.')
  assert.ok(
    arenaLocalMarkup.includes('Self-reported · not broker-verified'),
    'A local report lacks the explicit non-broker-verified boundary.',
  )
  assert.ok(!arenaLocalMarkup.includes('#17'), 'A local report received a fictional leaderboard placement.')

  const localLedgerMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: localReport }),
  )
  for (const required of [
    'Data source',
    'Internal calculation check',
    'Self-reported · not broker-verified',
    'do not prove that a file was issued by IBKR',
    'reported All Asset Classes YTD mark-to-market total',
  ]) {
    assert.ok(localLedgerMarkup.includes(required), `The Ledger trust boundary is missing: ${required}`)
  }

  const precisionReport = cloneReport()
  precisionReport.source = 'local'
  precisionReport.mtmReconciliationDifference = 0.4
  const precisionMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: precisionReport }),
  )
  assert.ok(
    precisionMarkup.includes('+$0.40'),
    'A non-zero sub-dollar reconciliation difference was rounded to zero in the Ledger.',
  )

  const smallValueReport = cloneReport()
  smallValueReport.source = 'local'
  smallValueReport.seasonPnl = -0.4
  smallValueReport.optionPnl = 0.4
  smallValueReport.seasonReturn = 0.0004
  const smallValueLedger = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: smallValueReport }),
  )
  assert.ok(smallValueLedger.includes('-$0.40'), 'The Ledger hid a small loss.')
  assert.ok(smallValueLedger.includes('+0.04%'), 'The Ledger hid a small positive return.')
  const smallValueSummary = buildSeasonSummary(smallValueReport, 'en')
  assert.ok(smallValueSummary.includes('-$0.40'), 'The share summary hid a small loss.')
  assert.ok(smallValueSummary.includes('+$0.40'), 'The share summary hid a small gain.')
  assert.ok(smallValueSummary.includes('+0.04%'), 'The share summary hid a small return.')

  const missingExplanationReport = cloneReport()
  missingExplanationReport.source = 'local'
  missingExplanationReport.parserFacts.realizedSectionMissing = true
  const firstMissingSymbol = missingExplanationReport.symbols[0]
  assert.equal(hasRealizedExplanation(missingExplanationReport, firstMissingSymbol), false)
  assert.equal(hasCurrentUnrealizedExplanation(missingExplanationReport), false)
  const missingExplanationMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: missingExplanationReport }),
  )
  const missingNvdaRow = missingExplanationMarkup.match(
    /<tr><td><strong>NVDA<\/strong>[\s\S]*?<\/tr>/,
  )?.[0]
  assert.ok(missingNvdaRow, 'Could not inspect the missing-explanation NVDA row.')
  assert.equal(
    (missingNvdaRow.match(/Unavailable/g) ?? []).length,
    2,
    'Missing realized/current-unrealized explanations were rendered as numeric zero.',
  )

  const fallbackRealizedReport = cloneReport()
  fallbackRealizedReport.source = 'local'
  fallbackRealizedReport.parserFacts.realizedSectionMissing = true
  fallbackRealizedReport.symbols[0].totalRealizedYtd = 0
  fallbackRealizedReport.symbols[0].sourceRefs.totalRealizedYtd = [
    {
      field: 'YTD Realized Total',
      recordType: 'Data',
      rowNumber: 1,
      section: 'Month & Year to Date Performance Summary',
    },
  ]
  assert.equal(hasRealizedExplanation(fallbackRealizedReport, fallbackRealizedReport.symbols[0]), true)
  const fallbackMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: fallbackRealizedReport }),
  )
  const fallbackNvdaRow = fallbackMarkup.match(/<tr><td><strong>NVDA<\/strong>[\s\S]*?<\/tr>/)?.[0]
  assert.ok(fallbackNvdaRow?.includes('$0'), 'A sourced zero realized value was hidden as missing.')
  assert.equal(
    (fallbackNvdaRow?.match(/Unavailable/g) ?? []).length,
    1,
    'The missing current-unrealized value was not kept separate from sourced realized zero.',
  )

  const trophiesBeforeMissingFact = getTrophies(localReport).map(({ id, unlocked }) => ({ id, unlocked }))
  const trophiesAfterMissingFact = getTrophies(missingExplanationReport).map(({ id, unlocked }) => ({ id, unlocked }))
  assert.deepEqual(
    trophiesAfterMissingFact,
    trophiesBeforeMissingFact,
    'A presentation-only missing-data flag changed trophy unlock calculations.',
  )
  const missingTrophiesMarkup = renderToStaticMarkup(
    createElement(TrophiesPage, { locale: 'en', report: missingExplanationReport }),
  )
  assert.match(missingTrophiesMarkup, /data-status="unavailable" data-trophy="bagholder"/)
  assert.match(missingTrophiesMarkup, /data-status="unsupported" data-trophy="reverse"/)
  assert.ok(missingTrophiesMarkup.includes('does not include the supported current-unrealized P&amp;L section'))
  const presentationUnlockedCount = (missingTrophiesMarkup.match(/data-status="unlocked"/g) ?? []).length
  assert.match(
    missingTrophiesMarkup,
    new RegExp(`<div class="trophy-counter"><strong>${presentationUnlockedCount}</strong>`),
    'The trophy header counted an unavailable achievement as unlocked.',
  )
  const nonUsdTrophiesMarkup = renderToStaticMarkup(
    createElement(TrophiesPage, { locale: 'en', report: nonUsdTrophyReport }),
  )
  assert.match(nonUsdTrophiesMarkup, /data-status="notApplicable" data-trophy="theta"/)
  assert.match(nonUsdTrophiesMarkup, /data-status="notApplicable" data-trophy="bagholder"/)
  for (const [locale, sourceBoundary, checkBoundary] of [
    ['en', 'Self-reported · not broker-verified', 'Internal calculation check'],
    ['zh-CN', '用户自报 · 非券商验证', '内部算术检查'],
    ['zh-TW', '使用者自報 · 非券商驗證', '內部算術檢查'],
  ]) {
    const markup = renderToStaticMarkup(
      createElement(LedgerPage, { locale, report: localReport }),
    )
    assert.ok(markup.includes(sourceBoundary), `${locale} lost the self-reported boundary.`)
    assert.ok(markup.includes(checkBoundary), `${locale} lost the separate calculation-check label.`)
  }

  assert.equal(PARSER_DIAGNOSTIC_CODES.length, 45)
  for (const code of PARSER_DIAGNOSTIC_CODES) {
    const recoveryKey = importRecoveryKey(code)
    assert.equal(typeof recoveryKey, 'string', `No recovery category exists for ${code}.`)
    for (const locale of ['en', 'zh-CN', 'zh-TW']) {
      assert.ok(t(locale, recoveryKey).trim(), `${locale} recovery copy is empty for ${code}.`)
    }
  }
  assert.equal(importRecoveryKey('option_event_date_invalid'), 'recoveryEventDate')
  assert.equal(importRecoveryKey('option_event_type_conflict'), 'recoveryEventIdentity')
  assert.equal(importRecoveryKey('option_event_identity_conflict'), 'recoveryEventIdentity')
  for (const [locale, expected] of [
    ['en', 'missing, invalid or out-of-period date'],
    ['zh-CN', '日期缺失、无效或不在报表期间内'],
    ['zh-TW', '日期缺失、無效或不在報表期間內'],
  ]) {
    assert.ok(
      formatParserDiagnostic({ code: 'option_event_date_invalid' }, locale).includes(expected),
      `${locale} option-event date diagnostic is missing or misleading.`,
    )
  }
  for (const [locale, expected] of [
    ['en', 'conflicting or unsupported event codes'],
    ['zh-CN', '相互冲突或尚未支持的类型代码'],
    ['zh-TW', '相互衝突或尚未支援的類型代碼'],
  ]) {
    assert.ok(
      formatParserDiagnostic({ code: 'option_event_type_conflict' }, locale).includes(expected),
      `${locale} option-event type diagnostic is missing or misleading.`,
    )
  }
  for (const [locale, expected] of [
    ['en', 'cannot distinguish them safely'],
    ['zh-CN', '无法安全区分'],
    ['zh-TW', '無法安全區分'],
  ]) {
    assert.ok(
      formatParserDiagnostic({ code: 'option_event_identity_conflict' }, locale).includes(expected),
      `${locale} option-event identity diagnostic is missing or misleading.`,
    )
  }
  for (const [locale, refreshBoundary] of [
    ['en', 'refresh the page, which clears the current report'],
    ['zh-CN', '刷新会清除当前报表'],
    ['zh-TW', '重新整理會清除目前報表'],
  ]) {
    assert.ok(
      t(locale, 'recoveryBrowser').includes(refreshBoundary),
      `${locale} browser recovery contradicts the refresh-clears-report boundary.`,
    )
  }
  for (const [locale, sharedCopyBoundary] of [
    ['en', 'shared a PNG to another app'],
    ['zh-CN', 'PNG 已分享到其他应用'],
    ['zh-TW', 'PNG 已分享到其他應用'],
  ]) {
    assert.ok(
      t(locale, 'privacyClearBody').includes(sharedCopyBoundary),
      `${locale} clearing copy omits the separately shared PNG boundary.`,
    )
  }

  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const functionalSourceFiles = readFunctionalSourceTree(new URL('../src/', import.meta.url))
  const functionalSource = functionalSourceFiles.map(({ source }) => source).join('\n')
  const preferenceKeys = [...new Set(functionalSource.match(/pnl-arena\.[a-z.-]+\.v1/g) ?? [])].sort()
  assert.deepEqual(
    preferenceKeys,
    ['pnl-arena.locale.v1', 'pnl-arena.onboarding.v1'],
    'App persistence expanded beyond the two approved non-financial preferences.',
  )
  for (const [label, pattern] of [
    ['sessionStorage API', /\b(?:window\s*\.\s*|globalThis\s*\.\s*)?sessionStorage\s*(?:\.|\[)/],
    ['IndexedDB API', /\b(?:window\s*\.\s*|globalThis\s*\.\s*)?indexedDB\s*(?:\.|\[)/],
    ['Cache Storage API', /\b(?:window\s*\.\s*|globalThis\s*\.\s*)?caches\s*(?:\.|\[)/],
    ['cookie persistence', /\bdocument\s*\.\s*cookie\b/],
    ['origin-private file storage', /\bnavigator\s*\.\s*storage\s*\.\s*getDirectory\s*\(/],
    ['service worker registration', /\bnavigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(/],
    ['fetch network API', /\bfetch\s*\(/],
    ['XMLHttpRequest network API', /\bXMLHttpRequest\b/],
    ['sendBeacon network API', /\bnavigator\s*\.\s*sendBeacon\s*\(/],
    ['WebSocket network API', /\bnew\s+WebSocket\s*\(/],
    ['EventSource network API', /\bnew\s+EventSource\s*\(/],
  ]) {
    assert.ok(!pattern.test(functionalSource), `Source tree introduced ${label}.`)
  }
  for (const forbidden of ['JSON.stringify(report)', 'JSON.stringify(nextReport)']) {
    assert.ok(!functionalSource.includes(forbidden), `Source tree introduced forbidden report persistence: ${forbidden}`)
  }
  const localStorageCalls = functionalSourceFiles.flatMap(({ name, source }) =>
    [...source.matchAll(/\blocalStorage\s*\.\s*(getItem|setItem|removeItem|clear|key)\s*\(/g)]
      .map((match) => ({ method: match[1], name })))
  assert.equal(localStorageCalls.length, 4, 'The approved localStorage call surface changed.')
  assert.ok(
    localStorageCalls.every(({ method, name }) =>
      name.endsWith('/src/App.tsx') && (method === 'getItem' || method === 'setItem')),
    `localStorage access escaped the preference-only App boundary: ${JSON.stringify(localStorageCalls)}`,
  )
  assert.ok(!/\blocalStorage\s*\[/.test(functionalSource), 'Dynamic localStorage access was introduced.')

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
  const missingArenaMarkup = renderToStaticMarkup(
    createElement(ArenaPage, { locale: 'en', report: missingValuesReport }),
  )
  const missingCashTrophiesMarkup = renderToStaticMarkup(
    createElement(TrophiesPage, { locale: 'en', report: missingValuesReport }),
  )
  assert.ok(missingArenaMarkup.includes('TWR unavailable'))
  assert.match(missingCashTrophiesMarkup, /data-status="unavailable" data-trophy="cash"/)
  assert.ok(missingCashTrophiesMarkup.includes('cash value or a non-zero net liquidation value is unavailable'))
  assert.equal(formatShareSeasonReturn(undefined, 'en'), 'Unavailable')
  assert.ok(buildSeasonSummary(missingValuesReport, 'en').includes('Season return: Unavailable'))
  assert.ok(
    renderToStaticMarkup(
      createElement(ShareCardPreview, { locale: 'en', report: missingValuesReport }),
    ).includes('<strong class="neutral">Unavailable</strong>'),
  )
  assert.ok(missingArenaMarkup.includes('Internal checks passed'))
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
  assert.ok(summary.includes('Self-reported · not broker-verified'))
  assert.ok(previewMarkup.includes('Self-reported · not broker-verified'))
  assert.ok(summary.includes('Internal calculation check: Review internal checks'))
  assert.ok(previewMarkup.includes('Review internal checks'))

  const drawnText = []
  const gradient = { addColorStop() {} }
  const context = {
    arc() {},
    beginPath() {},
    createLinearGradient() { return gradient },
    fill() {},
    fillRect() {},
    fillText(value) { drawnText.push(String(value)) },
    lineTo() {},
    moveTo() {},
    restore() {},
    roundRect() {},
    save() {},
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

    assert.equal(fallbackResult.kind, 'downloadStarted')
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

    // A late system-share result must not create a second output for an invalidated request.
    const originalCreateObjectURL = URL.createObjectURL
    let previewAttempts = 0
    let nativeShareCalls = 0
    try {
      for (const outcome of ['resolve', 'reject', 'abort']) {
        for (const invalidate of [false, true]) {
          let settleShare
          const controller = new AbortController()
          const previousDownloads = downloadClickCount
          const previousPreviews = previewAttempts
          URL.createObjectURL = (value) => {
            previewAttempts += 1
            if (invalidate) throw new Error('An invalidated request must not attempt a preview.')
            return originalCreateObjectURL(value)
          }
          Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
              canShare: () => true,
              maxTouchPoints: 5,
              platform: 'iPhone',
              userAgent: 'iPhone',
              share: () => {
                nativeShareCalls += 1
                return new Promise((resolveShare, rejectShare) => {
                  settleShare = () => outcome === 'resolve'
                    ? resolveShare()
                    : rejectShare(new DOMException('Test share outcome', outcome === 'abort' ? 'AbortError' : 'NotAllowedError'))
                })
              },
            },
          })
          const pendingShare = downloadSeasonCard(canaryReport, 'en', { signal: controller.signal })
          assert.equal(typeof settleShare, 'function')
          if (invalidate) controller.abort()
          settleShare()
          const delivered = await pendingShare
          const expectedKind = invalidate || outcome === 'abort'
            ? 'cancelled'
            : outcome === 'resolve' ? 'shared' : 'preview'
          assert.equal(delivered?.kind, expectedKind, `${outcome}, invalidated=${invalidate}`)
          assert.equal(downloadClickCount, previousDownloads, 'A delayed share triggered an unexpected download.')
          assert.equal(previewAttempts - previousPreviews, expectedKind === 'preview' ? 1 : 0)
          if (delivered?.kind === 'preview') URL.revokeObjectURL(delivered.previewUrl)
        }
      }
      const controller = new AbortController()
      controller.abort()
      const previousShares = nativeShareCalls
      const previousDraws = drawnText.length
      const alreadyCancelled = await downloadSeasonCard(canaryReport, 'en', { signal: controller.signal })
      assert.equal(alreadyCancelled?.kind, 'cancelled')
      assert.equal(nativeShareCalls, previousShares, 'An already invalidated request invoked system sharing.')
      assert.equal(drawnText.length, previousDraws, 'An already invalidated request rendered a card.')
    } finally {
      URL.createObjectURL = originalCreateObjectURL
    }

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
  assert.ok(pngText.includes('Self-reported · not broker-verified'))
  assert.ok(pngText.includes('Internal calculation check'))
  assert.ok(pngText.includes('Review internal checks'))

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
