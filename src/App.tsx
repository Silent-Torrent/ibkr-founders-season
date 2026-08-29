import { useEffect, useState } from 'react'
import type { Locale, PageId, PortfolioReport } from './types'
import type { MessageKey } from './i18n'
import { AppShell } from './components/AppShell'
import { PrivacyNoticeModal } from './components/PrivacyNoticeModal'
import { demoReport } from './data/demo'
import { LedgerPage } from './pages/LedgerPage'
import { ArenaPage } from './pages/ArenaPage'
import { TrophiesPage } from './pages/TrophiesPage'
import { ImportPage } from './pages/ImportPage'
import { t } from './i18n'
import { decideSnapshotImport } from './lib/snapshot'
import { createSessionComparisonSalt } from './lib/sessionIdentity'

const LOCALE_STORAGE_KEY = 'pnl-arena.locale.v1'

const pageTitleKeys: Record<PageId, MessageKey> = {
  ledger: 'navLedger',
  arena: 'navArena',
  trophies: 'navTrophies',
  import: 'navImport',
}

function loadStoredLocale(): Locale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored === 'en' || stored === 'zh-CN' || stored === 'zh-TW') return stored
  const browserLanguage = navigator.language.toLowerCase()
  if (browserLanguage.startsWith('zh-tw') || browserLanguage.startsWith('zh-hk')) return 'zh-TW'
  if (browserLanguage.startsWith('zh')) return 'zh-CN'
  return 'en'
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(loadStoredLocale)
  const [page, setPage] = useState<PageId>('ledger')
  const [report, setReport] = useState<PortfolioReport>(demoReport)
  const [isPrivacyNoticeOpen, setIsPrivacyNoticeOpen] = useState(false)
  const [accountComparisonSalt] = useState(createSessionComparisonSalt)

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = `${t(locale, pageTitleKeys[page])} — ${t(locale, 'appName')}`
  }, [locale, page])

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale)
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
  }

  function importReport(nextReport: PortfolioReport) {
    const decision = decideSnapshotImport(report, nextReport)
    if (decision === 'duplicate') {
      window.alert(t(locale, 'duplicateReport'))
      return
    }
    if (decision === 'same_date') {
      window.alert(t(locale, 'sameDateReport'))
      return
    }
    if (decision === 'older') {
      window.alert(t(locale, 'olderReport'))
      return
    }

    setReport(nextReport)
    setPage('ledger')
  }

  function clearLocal() {
    if (!window.confirm(t(locale, 'clearConfirm'))) return
    setReport(demoReport)
    setPage('ledger')
  }

  function useDemo() {
    setReport(demoReport)
    setPage('ledger')
  }

  return (
    <>
      <AppShell
        locale={locale}
        onClearLocal={clearLocal}
        onLocaleChange={changeLocale}
        onOpenPrivacy={() => setIsPrivacyNoticeOpen(true)}
        onPageChange={setPage}
        page={page}
        report={report}
      >
        {page === 'ledger' && <LedgerPage locale={locale} report={report} />}
        {page === 'arena' && <ArenaPage locale={locale} report={report} />}
        {page === 'trophies' && <TrophiesPage locale={locale} report={report} />}
        {page === 'import' && (
          <ImportPage
            accountComparisonSalt={accountComparisonSalt}
            locale={locale}
            onImport={importReport}
            onUseDemo={useDemo}
          />
        )}
      </AppShell>
      <PrivacyNoticeModal
        isOpen={isPrivacyNoticeOpen}
        locale={locale}
        onClose={() => setIsPrivacyNoticeOpen(false)}
      />
    </>
  )
}
