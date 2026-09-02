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
