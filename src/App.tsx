import { useEffect, useRef, useState } from 'react'
import type { Locale, PageId, PortfolioReport } from './types'
import type { MessageKey } from './i18n'
import { AppShell } from './components/AppShell'
import { AppNotice } from './components/AppNotice'
import { GettingStartedScreen } from './components/GettingStartedScreen'
import { PrivacyNoticeModal } from './components/PrivacyNoticeModal'
import { demoReport } from './data/demo'
import { LedgerPage } from './pages/LedgerPage'
import { ArenaPage } from './pages/ArenaPage'
import { TrophiesPage } from './pages/TrophiesPage'
import { ImportPage } from './pages/ImportPage'
import { t } from './i18n'
import { decideSnapshotImport, type SnapshotImportDecision } from './lib/snapshot'
import { createSessionComparisonSalt } from './lib/sessionIdentity'
import { isImportedSource } from './lib/reportSource'

const LOCALE_STORAGE_KEY = 'pnl-arena.locale.v1'
export const ONBOARDING_STORAGE_KEY = 'pnl-arena.onboarding.v1'

interface NoticeState {
  id: number
  key: MessageKey
  tone: 'success' | 'info' | 'warning'
}

const pageTitleKeys: Record<PageId, MessageKey> = {
  ledger: 'navLedger',
  arena: 'navArena',
  trophies: 'navTrophies',
  import: 'navImport',
}

function loadStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'en' || stored === 'zh-CN' || stored === 'zh-TW') return stored
  } catch {
    // Storage can be unavailable in restricted browsing modes; the app still works in memory.
  }
  const browserLanguage = navigator.language.toLowerCase()
  if (browserLanguage.startsWith('zh-tw') || browserLanguage.startsWith('zh-hk')) return 'zh-TW'
  if (browserLanguage.startsWith('zh')) return 'zh-CN'
  return 'en'
}

function hasSeenGettingStarted(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'seen'
  } catch {
    return false
  }
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(loadStoredLocale)
  const [page, setPage] = useState<PageId>('ledger')
  const [report, setReport] = useState<PortfolioReport>(demoReport)
  const [isPrivacyNoticeOpen, setIsPrivacyNoticeOpen] = useState(false)
  const [isGettingStartedOpen, setIsGettingStartedOpen] = useState(
    () => !hasSeenGettingStarted(),
  )
  const [focusAppOnMount, setFocusAppOnMount] = useState(false)
  const [focusGuideOnMount, setFocusGuideOnMount] = useState(false)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const noticeSequenceRef = useRef(0)
  const [accountComparisonSalt] = useState(createSessionComparisonSalt)

  useEffect(() => {
    document.documentElement.lang = locale
    const title = isGettingStartedOpen
      ? t(locale, 'welcomePageTitle')
      : t(locale, pageTitleKeys[page])
    document.title = `${title} — ${t(locale, 'appName')}`
  }, [isGettingStartedOpen, locale, page])

  function showNotice(key: MessageKey, tone: NoticeState['tone']) {
    noticeSequenceRef.current += 1
    setNotice({ id: noticeSequenceRef.current, key, tone })
  }

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale)
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    } catch {
      // The in-memory language choice remains active when persistent storage is blocked.
    }
  }

  function importReport(nextReport: PortfolioReport): SnapshotImportDecision {
    const decision = decideSnapshotImport(report, nextReport)
    if (decision === 'duplicate') {
      showNotice('duplicateReport', 'warning')
      return decision
    }
    if (decision === 'same_date') {
      showNotice('sameDateReport', 'warning')
      return decision
    }
    if (decision === 'older') {
      showNotice('olderReport', 'warning')
      return decision
    }

    setReport(nextReport)
    setPage('ledger')
    showNotice('importSuccess', 'success')
    return decision
  }

  function clearLocal() {
    if (!window.confirm(t(locale, 'clearConfirm'))) return
    setReport(demoReport)
    setPage('ledger')
    showNotice('reportCleared', 'info')
  }

  function useDemo() {
    if (isImportedSource(report.source) && !window.confirm(t(locale, 'clearConfirm'))) return
    setReport(demoReport)
    setPage('ledger')
    showNotice('demoReady', 'info')
  }

  function completeGettingStarted(target: 'ledger' | 'import') {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'seen')
    } catch {
      // This non-financial preference is optional; no product data is persisted.
    }
    setNotice(null)
    setPage(target)
    setFocusAppOnMount(true)
    setFocusGuideOnMount(false)
    setIsGettingStartedOpen(false)
  }

  function changePage(nextPage: PageId) {
    setNotice(null)
    setPage(nextPage)
  }

  if (isGettingStartedOpen) {
    return (
      <>
        <GettingStartedScreen
          focusOnMount={focusGuideOnMount}
          hasCurrentReport={isImportedSource(report.source)}
          locale={locale}
          onImport={() => completeGettingStarted('import')}
          onLocaleChange={changeLocale}
          onOpenPrivacy={() => setIsPrivacyNoticeOpen(true)}
          onPrimaryAction={() => completeGettingStarted('ledger')}
          seasonYear={report.seasonYear}
        />
        <PrivacyNoticeModal
          isOpen={isPrivacyNoticeOpen}
          locale={locale}
          onClose={() => setIsPrivacyNoticeOpen(false)}
        />
      </>
    )
  }

  return (
    <>
      <AppShell
        focusOnMount={focusAppOnMount}
        locale={locale}
        onClearLocal={clearLocal}
        onLocaleChange={changeLocale}
        onOpenGuide={() => {
          setNotice(null)
          setFocusAppOnMount(false)
          setFocusGuideOnMount(true)
          setIsGettingStartedOpen(true)
        }}
        onOpenPrivacy={() => setIsPrivacyNoticeOpen(true)}
        onPageChange={changePage}
        page={page}
        report={report}
      >
        {notice && (
          <AppNotice
            dismissLabel={t(locale, 'dismissNotice')}
            key={notice.id}
            message={t(locale, notice.key)}
            onDismiss={() => setNotice(null)}
            tone={notice.tone}
          />
        )}
        {page === 'ledger' && <LedgerPage locale={locale} report={report} />}
        {page === 'arena' && <ArenaPage locale={locale} report={report} />}
        {page === 'trophies' && <TrophiesPage locale={locale} report={report} />}
        {page === 'import' && (
          <ImportPage
            accountComparisonSalt={accountComparisonSalt}
            locale={locale}
            onImport={importReport}
            onImportStart={() => setNotice(null)}
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
