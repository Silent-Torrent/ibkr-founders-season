import { isMedalSelection, medalKey } from './lib/medalCollection'
import { flushSync } from 'react-dom'
import { Settings } from './components/Preferences'
import { defaults,type Preferences } from './lib/cardOptions'
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

function removeStoredMedals() {
  try { window.localStorage.removeItem(medalKey) } catch { /* storage unavailable */ }
}

function readStoredMedals(): number[] {
  try {
    const raw = window.localStorage.getItem(medalKey)
    if (raw === null) return []
    const selection: unknown = JSON.parse(raw)
    if (isMedalSelection(selection)) return selection
  } catch { /* malformed JSON or unavailable storage */ }
  removeStoredMedals()
  return []
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(loadStoredLocale)
  const [worn,setWorn] = useState<number[]>(readStoredMedals)
  const [prefs,setPrefs] = useState<Preferences>(() => {
    try {
      const raw=JSON.parse(window.localStorage.getItem('pnl-arena.settings.v1') ?? '{}')
      const prices:Record<string,number>={}
      for(const [k,n] of Object.entries(raw.prices??{})) if(/^[A-Z]{3}$/.test(k)&&typeof n==='number'&&n>0&&Number.isFinite(n)) prices[k]=n
      return {benchmark:typeof raw.benchmark==='number'&&Number.isFinite(raw.benchmark)?raw.benchmark:undefined,roast:raw.roast!==false,amount:raw.amount===true,hideTickers:raw.hideTickers!==false,
        colors:raw.colors==='red'||raw.colors==='green'?raw.colors:'auto',prices,
        firstMonth:/^2026-(0[1-9]|1[0-2])$/.test(raw.firstMonth)?raw.firstMonth:undefined}
    } catch {return defaults}
  })
  function updatePrefs(next:Preferences) {
    const {worn: selection, ...settings} = next
    if (selection !== worn && isMedalSelection(selection)) {
      const ids = selection
      setWorn(ids)
      try { localStorage.setItem(medalKey, JSON.stringify(ids)) } catch { /* session only */ }
    }
    setPrefs(settings)
    try { window.localStorage.setItem('pnl-arena.settings.v1',JSON.stringify(settings)) } catch { /* session-only */ }
  }
  useEffect(()=>{document.documentElement.dataset.gains=prefs.colors==='auto'?(locale==='zh-CN'?'red':'green'):prefs.colors},[prefs.colors,locale])
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

    if(nextReport.source==='local' && nextReport.seasonYear===2026 && !prefs.firstMonth) updatePrefs({...prefs,firstMonth:nextReport.importedAt.slice(0,7)})
    setReport(nextReport)
    setPage('ledger')
    showNotice('importSuccess', 'success')
    return decision
  }

  function clearLocal() {
    if (!window.confirm(t(locale, 'clearConfirm'))) return
    removeStoredMedals()
    setWorn([])
    setReport(demoReport)
    setPage('ledger')
    showNotice('reportCleared', 'info')
  }

  function useDemo() {
    if (isImportedSource(report.source)) {
      if (!window.confirm(t(locale, 'clearConfirm'))) return
      removeStoredMedals()
      setWorn([])
    }
    setReport(demoReport)
    setPage('ledger')
    showNotice('demoReady', 'info')
  }

  function completeGettingStarted(target: 'ledger' | 'import') {
    flushSync(() => {
      setNotice(null)
      setPage(target)
      setFocusAppOnMount(true)
      setFocusGuideOnMount(false)
      setIsGettingStartedOpen(false)
    })
    window.setTimeout(() => {
      try { window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'seen') } catch { /* optional preference */ }
    }, 0)
  }

  function changePage(nextPage: PageId) {
    setNotice(null)
    setPage(nextPage)
  }

  if (isGettingStartedOpen) {
    return (
      <>
        <GettingStartedScreen
          report={report}
          roast={prefs.roast}
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
    <Settings.Provider value={{prefs:{...prefs,worn},update:updatePrefs}}>
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
    </Settings.Provider>
  )
}
