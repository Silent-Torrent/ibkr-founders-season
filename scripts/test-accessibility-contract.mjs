import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function includesAll(markup, values, label) {
  for (const value of values) {
    assert.ok(markup.includes(value), `${label} is missing: ${value}`)
  }
}

try {
  const [{ AppShell }, { PrivacyNoticeModal }, { LedgerPage }, { ArenaPage }, { TrophiesPage }, { demoReport }] =
    await Promise.all([
      vite.ssrLoadModule('/src/components/AppShell.tsx'),
      vite.ssrLoadModule('/src/components/PrivacyNoticeModal.tsx'),
      vite.ssrLoadModule('/src/pages/LedgerPage.tsx'),
      vite.ssrLoadModule('/src/pages/ArenaPage.tsx'),
      vite.ssrLoadModule('/src/pages/TrophiesPage.tsx'),
      vite.ssrLoadModule('/src/data/demo.ts'),
    ])

  const noop = () => {}
  const shellMarkup = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        locale: 'en',
        onClearLocal: noop,
        onLocaleChange: noop,
        onOpenPrivacy: noop,
        onPageChange: noop,
        page: 'ledger',
        report: demoReport,
      },
      createElement('h1', null, 'Synthetic page'),
    ),
  )
  includesAll(
    shellMarkup,
    [
      'href="#main-content"',
      'aria-current="page"',
      'aria-label="Primary navigation"',
      'aria-label="Mobile navigation"',
      'aria-label="Interface language"',
      'id="main-content"',
      'tabindex="-1"',
      'class="sr-only report-source-status"',
    ],
    'App shell accessibility contract',
  )

  const privacyMarkup = renderToStaticMarkup(
    createElement(PrivacyNoticeModal, { isOpen: true, locale: 'en', onClose: noop }),
  )
  includesAll(
    privacyMarkup,
    [
      'role="dialog"',
      'aria-modal="true"',
      'aria-labelledby="privacy-notice-title"',
      'aria-describedby="privacy-notice-description"',
      'aria-label="Close"',
    ],
    'Privacy dialog accessibility contract',
  )

  const ledgerMarkup = renderToStaticMarkup(
    createElement(LedgerPage, { locale: 'en', report: demoReport }),
  )
  includesAll(
    ledgerMarkup,
    [
      'aria-label="Search symbols"',
      'aria-label="Filter symbols"',
      'role="group"',
      'aria-pressed="true"',
      'aria-label="Sort symbols"',
      'role="region"',
      '<caption class="sr-only">Underlying breakdown</caption>',
      'Open details for ',
    ],
    'Ledger accessibility contract',
  )

  const arenaMarkup = renderToStaticMarkup(
    createElement(ArenaPage, { locale: 'en', report: demoReport }),
  )
  includesAll(
    arenaMarkup,
    ['role="table"', 'tabindex="0"', 'role="columnheader"', 'role="row"', 'role="cell"'],
    'Arena table semantics',
  )

  const trophiesMarkup = renderToStaticMarkup(
    createElement(TrophiesPage, { locale: 'en', report: demoReport }),
  )
  includesAll(
    trophiesMarkup,
    ['role="list"', 'role="listitem"'],
    'Trophy semantics',
  )

  const [drawerSource, importSource, trophiesSource, styles] = await Promise.all([
    readFile(new URL('../src/components/SymbolDrawer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ImportPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/TrophiesPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ])
  includesAll(
    drawerSource,
    [
      'createPortal(',
      "'summary'",
      "event.key === 'Escape'",
      "event.key !== 'Tab'",
      'appShell.inert = true',
      'closeButtonRef.current?.focus()',
      'returnFocusTarget.focus()',
    ],
    'Symbol drawer keyboard contract',
  )
  includesAll(
    importSource,
    [
      'aria-busy={busy}',
      'className="sr-only import-live-status"',
      "setStatusMessage(announce ? t(locale, 'importCancelled') : '')",
      'role="alert"',
      'role="status"',
    ],
    'Import announcements',
  )
  assert.match(
    importSource,
    /<\/div>\s*<span aria-atomic="true" aria-live="polite" className="sr-only import-live-status"/,
    'Import live status must remain outside the aria-busy drop zone.',
  )
  includesAll(
    trophiesSource,
    ['role="progressbar"', 'aria-valuemin={0}', 'aria-valuemax={100}', 'aria-valuenow='],
    'Trophy progress semantics',
  )
  includesAll(
    styles,
    [
      '--muted-2: #78899a',
      '.search-field:focus-within',
      '.leaderboard-list:focus-visible',
      '.skip-link',
      '.sr-only',
    ],
    'Visible-focus and contrast contract',
  )
  assert.match(
    styles,
    /@media \(max-width: 500px\)[\s\S]*?\.share-card-bottom\s*{[\s\S]*?position:\s*static;/,
    'The narrow share card footer must stay in normal flow to prevent content overlap.',
  )

  console.log('Accessibility structure and keyboard contracts passed.')
} finally {
  await vite.close()
}
