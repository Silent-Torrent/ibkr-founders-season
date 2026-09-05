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
  const [
    { AppNotice },
    { AppShell },
    { GettingStartedScreen },
    { PrivacyNoticeModal },
    { LedgerPage },
    { ArenaPage },
    { TrophiesPage },
    { demoReport },
  ] =
    await Promise.all([
      vite.ssrLoadModule('/src/components/AppNotice.tsx'),
      vite.ssrLoadModule('/src/components/AppShell.tsx'),
      vite.ssrLoadModule('/src/components/GettingStartedScreen.tsx'),
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
        focusOnMount: false,
        locale: 'en',
        onClearLocal: noop,
        onLocaleChange: noop,
        onOpenGuide: noop,
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

  const gettingStartedMarkup = renderToStaticMarkup(
    createElement(GettingStartedScreen, {
      focusOnMount: false,
      hasCurrentReport: false,
      locale: 'en',
      onImport: noop,
      onLocaleChange: noop,
      onOpenPrivacy: noop,
      onPrimaryAction: noop,
      seasonYear: demoReport.seasonYear,
    }),
  )
  includesAll(
    gettingStartedMarkup,
    [
      'href="#getting-started-main"',
      'id="getting-started-main"',
      'tabindex="-1"',
      'aria-labelledby="welcome-title"',
      'aria-label="Choose how to begin"',
      'aria-label="Interface language"',
      'data-action="welcome-primary"',
      'data-action="welcome-import"',
    ],
    'Getting-started screen accessibility contract',
  )

  const [appNoticeSource, appShellSource, gettingStartedSource] = await Promise.all([
    readFile(new URL('../src/components/AppNotice.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/GettingStartedScreen.tsx', import.meta.url), 'utf8'),
  ])
  includesAll(
    `${appShellSource}\n${gettingStartedSource}`,
    ['window.scrollTo({ left: 0, top: 0 })', 'focus({ preventScroll: true })'],
    'SPA transition focus and scroll contract',
  )
  includesAll(
    appNoticeSource,
    ["closest('main')", 'requestAnimationFrame', 'focus({ preventScroll: true })'],
    'Notice dismissal focus contract',
  )

  const successNoticeMarkup = renderToStaticMarkup(
    createElement(AppNotice, {
      dismissLabel: 'Dismiss',
      message: 'Imported',
      onDismiss: noop,
      tone: 'success',
    }),
  )
  const warningNoticeMarkup = renderToStaticMarkup(
    createElement(AppNotice, {
      dismissLabel: 'Dismiss',
      message: 'Not replaced',
      onDismiss: noop,
      tone: 'warning',
    }),
  )
  includesAll(successNoticeMarkup, ['aria-atomic="true"', 'role="status"'], 'Success notice')
  includesAll(warningNoticeMarkup, ['aria-atomic="true"', 'role="alert"'], 'Warning notice')

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
      'aria-labelledby="trust-status-title"',
      '<details class="metric-help">',
      'What this means',
      'aria-label="Season P&amp;L: What this means"',
      'aria-label="Season return: What this means"',
      'aria-label="Net liquidation: What this means"',
      'aria-label="Options P&amp;L: What this means"',
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
      'setImportCancelled(announce)',
      'role="alert"',
      'role="status"',
      'aria-labelledby="import-recovery-title"',
      'data-action="choose-file-after-error"',
      'mainActionRef.current?.focus()',
    ],
    'Import announcements',
  )
  assert.equal(
    (importSource.match(/onClick=\{chooseFile\}/g) ?? []).length,
    3,
    'All three file-picker entry points must use the stable-focus handler.',
  )
  assert.equal(
    (importSource.match(/ref=\{mainActionRef\}/g) ?? []).length,
    2,
    'The main Choose and Cancel branches must share the same focus ref.',
  )
  assert.ok(
    !importSource.includes("importCancelled ? t(locale, 'importCancelled')"),
    'Import cancellation must not be announced by two live regions.',
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
    /\.share-card-bottom\s*{[\s\S]*?position:\s*relative;/,
    'The share card footer must stay in normal flow to prevent content overlap.',
  )
  assert.match(
    styles,
    /\.error-message,\s*\.warning-message\s*{[\s\S]*?font-size:\s*14px;[\s\S]*?line-height:\s*1\.5;[\s\S]*?overflow-wrap:\s*anywhere;/,
    'Import errors and warnings must remain readable and safely wrappable on narrow screens.',
  )

  console.log('Accessibility structure and keyboard contracts passed.')
} finally {
  await vite.close()
}
