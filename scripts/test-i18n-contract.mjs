import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function declaredKeys(source) {
  return [...source.matchAll(/^  ([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1])
}

function placeholders(value) {
  return [...value.matchAll(/\{[A-Za-z][A-Za-z0-9]*\}/g)].map((match) => match[0]).sort()
}

try {
  const i18nSource = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8')
  const enStart = i18nSource.indexOf('const en = {')
  const zhCnStart = i18nSource.indexOf('const zhCN: typeof en = {')
  const zhTwStart = i18nSource.indexOf('const zhTW: typeof en = {')
  const dictionaryStart = i18nSource.indexOf('const dictionaries:')
  assert(enStart >= 0 && zhCnStart > enStart && zhTwStart > zhCnStart && dictionaryStart > zhTwStart)

  const enKeys = declaredKeys(i18nSource.slice(enStart, zhCnStart))
  const zhCnKeys = declaredKeys(i18nSource.slice(zhCnStart, zhTwStart))
  const zhTwKeys = declaredKeys(i18nSource.slice(zhTwStart, dictionaryStart))
  assert.deepEqual(zhCnKeys.sort(), [...enKeys].sort(), 'Simplified Chinese has missing or extra UI keys.')
  assert.deepEqual(
    zhTwKeys.sort(),
    [...enKeys].sort(),
    'Traditional Chinese must explicitly define every UI key instead of silently inheriting Simplified Chinese.',
  )

  const [
    { t },
    { GettingStartedScreen },
    { ImportPage },
    { LedgerPage },
    { ArenaPage },
    { TrophiesPage },
    { ShareCardPreview },
    { PrivacyNoticeModal },
    { demoReport },
  ] = await Promise.all([
    vite.ssrLoadModule('/src/i18n.ts'),
    vite.ssrLoadModule('/src/components/GettingStartedScreen.tsx'),
    vite.ssrLoadModule('/src/pages/ImportPage.tsx'),
    vite.ssrLoadModule('/src/pages/LedgerPage.tsx'),
    vite.ssrLoadModule('/src/pages/ArenaPage.tsx'),
    vite.ssrLoadModule('/src/pages/TrophiesPage.tsx'),
    vite.ssrLoadModule('/src/components/ShareCardPreview.tsx'),
    vite.ssrLoadModule('/src/components/PrivacyNoticeModal.tsx'),
    vite.ssrLoadModule('/src/data/demo.ts'),
  ])

  for (const key of enKeys) {
    const enValue = t('en', key)
    assert(enValue.trim(), `English UI copy is empty for ${key}.`)
    for (const locale of ['zh-CN', 'zh-TW']) {
      const value = t(locale, key)
      assert(value.trim(), `${locale} UI copy is empty for ${key}.`)
      assert.deepEqual(
        placeholders(value),
        placeholders(enValue),
        `${locale} placeholders differ for ${key}.`,
      )
    }
  }
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const status = t(locale, 'reconciliationPassExact')
    const guidance = t(locale, 'reconciliationToleranceNote')
    assert.match(status, /CSV/i, `${locale} reconciliation status omits its CSV precision scope.`)
    assert.doesNotMatch(
      status,
      /\bexact(?:ly)?\b|完全一致/i,
      `${locale} claims literal exact equality for an allowed nonzero CSV difference.`,
    )
    assert.match(guidance, /0\.000001/, `${locale} guidance omits the locked CSV tolerance.`)
    assert.match(guidance, /absolute|绝对值|絕對值/, `${locale} guidance omits absolute value.`)
    assert.match(guidance, /source|来源|來源/, `${locale} guidance omits source checks.`)
    for (const key of [
      'reconciliationReportedValue',
      'reconciliationCalculatedValue',
      'reconciliationSignedDifference',
    ]) {
      assert.equal(typeof t(locale, key), 'string', `${locale} is missing ${key}.`)
      assert(t(locale, key).trim(), `${locale} has an empty ${key}.`)
    }
  }

  const fictionalSourceRef = {
    source: 'csv', section: 'Entirely fictional test', rowNumber: 1,
    recordType: 'Data', field: 'Amount',
  }
  const localEquationReport = {
    ...demoReport,
    source: 'local',
    mtmReconciliationDifference: 0.000001,
    reconciliations: [
      {
        id: 'mtm_all_assets', status: 'PASS_EXACT', reasonCode: 'within_tolerance',
        reportedValue: 740.123457, calculatedValue: 740.123456,
        difference: 0.000001, tolerance: 0.000001, sourceRefs: [fictionalSourceRef],
      },
      {
        id: 'statement_period_pnl', status: 'PASS_EXACT', reasonCode: 'within_tolerance',
        reportedValue: 750.243454, calculatedValue: 750.243455,
        difference: -0.000001, tolerance: 0.000001, sourceRefs: [fictionalSourceRef],
      },
      {
        id: 'nav_bridge', status: 'PASS_EXACT', reasonCode: 'within_tolerance',
        reportedValue: 8750.243455, calculatedValue: 8750.243455,
        difference: 0, tolerance: 0.000001, sourceRefs: [fictionalSourceRef],
      },
    ],
  }
  const reconciliationDetails = (markup) =>
    [...markup.matchAll(/<details class="provenance-details reconciliation-item"[\s\S]*?<\/details>/g)]
      .map((match) => match[0])

  const noop = () => {}
  const renderers = {
    gettingStarted: (locale) => renderToStaticMarkup(createElement(GettingStartedScreen, {
      focusOnMount: false,
      hasCurrentReport: false,
      locale,
      onImport: noop,
      onLocaleChange: noop,
      onOpenPrivacy: noop,
      onPrimaryAction: noop,
      seasonYear: demoReport.seasonYear,
    })),
    importPage: (locale) => renderToStaticMarkup(createElement(ImportPage, {
      accountComparisonSalt: 'i18n-contract-session',
      locale,
      onImport: () => 'accept',
      onImportStart: noop,
      onUseDemo: noop,
    })),
    ledger: (locale) => renderToStaticMarkup(createElement(LedgerPage, { locale, report: demoReport })),
    arena: (locale) => renderToStaticMarkup(createElement(ArenaPage, { locale, report: demoReport })),
    trophies: (locale) => renderToStaticMarkup(createElement(TrophiesPage, { locale, report: demoReport })),
    share: (locale) => renderToStaticMarkup(createElement(ShareCardPreview, { locale, report: demoReport })),
    privacy: (locale) => renderToStaticMarkup(createElement(PrivacyNoticeModal, {
      isOpen: true,
      locale,
      onClose: noop,
    })),
  }

  const localeCanaries = {
    en: ['Start with a demo', 'Required export settings', 'Where the data came', 'Privacy &amp; data notice'],
    'zh-CN': ['先看演示', '导出设置要求', '数据从哪里来', '隐私与数据说明'],
    'zh-TW': ['先看示範', '匯出設定要求', '資料從哪裡來', '隱私與資料說明'],
  }
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const markup = Object.values(renderers).map((render) => render(locale)).join('\n')
    for (const canary of localeCanaries[locale]) {
      assert.ok(markup.includes(canary), `${locale} rendered UI is missing: ${canary}`)
    }
    const demoLedger = renderers.ledger(locale)
    assert.ok(
      demoLedger.includes(t(locale, 'reconciliationDemoMatch')),
      `${locale} Demo reconciliation does not identify fictional figures.`,
    )
    assert.ok(
      !demoLedger.includes('reconciliation-tolerance-note'),
      `${locale} Demo incorrectly claims a CSV-specific tolerance check.`,
    )
    const demoChecks = reconciliationDetails(demoLedger)
    assert.equal(demoChecks.length, 3, `${locale} Demo has an unexpected reconciliation count.`)
    for (const check of demoChecks.slice(1)) {
      assert(!check.includes('reconciliation-equation'), `${locale} Demo invented unavailable figures.`)
    }

    const localLedger = renderToStaticMarkup(createElement(LedgerPage, {
      locale, report: localEquationReport,
    }))
    assert(localLedger.includes('reconciliation-tolerance-note'), `${locale} local CSV omits its tolerance notice.`)
    const localChecks = reconciliationDetails(localLedger)
    assert.equal(localChecks.length, 3, `${locale} local CSV has an unexpected reconciliation count.`)
    for (const [index, check] of localChecks.entries()) {
      assert(check.includes('reconciliation-equation'), `${locale} check ${index} hides its numeric equation.`)
      assert.match(check, /<dl[^>]*class="reconciliation-equation"/, `${locale} check ${index} lacks a semantic equation list.`)
      assert.equal((check.match(/<dt>/g) ?? []).length >= 3, true, `${locale} check ${index} lacks dt labels.`)
      assert.equal((check.match(/<dd/g) ?? []).length >= 3, true, `${locale} check ${index} lacks dd amounts.`)
      for (const key of [
        'reconciliationReportedValue',
        'reconciliationCalculatedValue',
        'reconciliationSignedDifference',
      ]) {
        assert(check.includes(t(locale, key)), `${locale} check ${index} omits ${key}.`)
      }
    }
    for (const value of ['740.123457', '740.123456']) {
      assert(localChecks[0].includes(value), `${locale} MTM ${value} was rounded away.`)
    }
    assert.match(localChecks[0], /\+[^<]*0\.000001/, `${locale} MTM positive difference is hidden.`)
    for (const value of ['750.243454', '750.243455']) {
      assert(localChecks[1].includes(value), `${locale} statement P&L ${value} was rounded away.`)
    }
    assert.match(localChecks[1], /-[^<]*0\.000001/, `${locale} statement P&L negative difference is hidden.`)
  }

  const visibleSourceDirectories = [
    new URL('../src/components/', import.meta.url),
    new URL('../src/pages/', import.meta.url),
  ]
  const visibleSources = []
  for (const directory of visibleSourceDirectories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.tsx')) {
        visibleSources.push(await readFile(new URL(entry.name, directory), 'utf8'))
      }
    }
  }
  const joinedVisibleSources = visibleSources.join('\n')
  for (const forbidden of [
    '>LOCAL-FIRST IMPORT<',
    '>Season snapshot<',
    "'IBKR TWR not found'",
    '>UNDERLYING LEDGER<',
    '>SEASON RETURN<',
    '>FAIR MATCHING<',
    '>SHAREABLE<',
    '>PNG · LOCAL<',
    '>LOCAL-FIRST BETA<',
    '>UNDERLYING<',
  ]) {
    assert.ok(!joinedVisibleSources.includes(forbidden), `Unlocalized visible JSX remains: ${forbidden}`)
  }

  console.log('Three-locale first-user-experience contracts passed.')
} finally {
  await vite.close()
}
