import { useEffect, useRef, type ReactNode } from 'react'
import type { Locale, PageId, PortfolioReport } from '../types'
import { t } from '../i18n'
import { isImportedSource, reportSourceStatusKey } from '../lib/reportSource'
import { ArenaMark } from './ArenaMark'

interface AppShellProps {
  children: ReactNode
  focusOnMount: boolean
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  page: PageId
  onPageChange: (page: PageId) => void
  report: PortfolioReport
  onClearLocal: () => void
  onOpenGuide: () => void
  onOpenPrivacy: () => void
}

const navItems: Array<{ id: PageId; label: 'navLedger' | 'navArena' | 'navTrophies' | 'navImport'; icon: string }> = [
  { id: 'ledger', label: 'navLedger', icon: '∑' },
  { id: 'arena', label: 'navArena', icon: '⌁' },
  { id: 'trophies', label: 'navTrophies', icon: '◇' },
  { id: 'import', label: 'navImport', icon: '⇧' },
]

export function AppShell({
  children,
  focusOnMount,
  locale,
  onLocaleChange,
  page,
  onPageChange,
  report,
  onClearLocal,
  onOpenGuide,
  onOpenPrivacy,
}: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null)
  const previousPageRef = useRef(page)
  const previousReportSourceRef = useRef(report.source)

  useEffect(() => {
    if (!focusOnMount) return
    window.scrollTo({ left: 0, top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [focusOnMount])

  useEffect(() => {
    const pageChanged = previousPageRef.current !== page
    const reportWasCleared =
      isImportedSource(previousReportSourceRef.current) && report.source === 'demo'

    previousPageRef.current = page
    previousReportSourceRef.current = report.source

    if (pageChanged || reportWasCleared) {
      window.scrollTo({ left: 0, top: 0 })
      mainRef.current?.focus({ preventScroll: true })
    }
  }, [page, report.source])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t(locale, 'skipToContent')}
      </a>
      <span aria-live="polite" className="sr-only report-source-status" role="status">
        {t(locale, reportSourceStatusKey(report.source))}
      </span>
      <aside className="sidebar">
        <button className="brand" onClick={() => onPageChange('ledger')} type="button">
          <span className="brand-mark" aria-hidden="true">
            <ArenaMark className="arena-mark" />
          </span>
          <span>
            <strong>{t(locale, 'appName')}</strong>
            <small>{report.seasonYear} {t(locale, 'seasonLabel')}</small>
          </span>
        </button>

        <nav className="side-nav" aria-label={t(locale, 'primaryNavigation')}>
          {navItems.map((item) => (
            <button
              className={page === item.id ? 'nav-item active' : 'nav-item'}
              aria-current={page === item.id ? 'page' : undefined}
              data-page={item.id}
              key={item.id}
              onClick={() => onPageChange(item.id)}
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{t(locale, item.label)}</span>
            </button>
          ))}
        </nav>

        <div className="privacy-card">
          <span aria-hidden="true" className="privacy-dot" />
          <strong>{t(locale, 'privateByDesign')}</strong>
          <p>{t(locale, 'privateDetail')}</p>
          <div className="sidebar-help-actions">
            <button
              className="privacy-card-action"
              data-action="open-guide"
              onClick={onOpenGuide}
              type="button"
            >
              {t(locale, 'guideButton')}
            </button>
            <button className="privacy-card-action" onClick={onOpenPrivacy} type="button">
              {t(locale, 'privacyNoticeOpen')}
            </button>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="source-row">
            <span className={`source-pill ${report.source}`}>
              {t(locale, reportSourceStatusKey(report.source))}
            </span>
            <span aria-hidden="true" className={`quality-dot ${report.dataQuality}`} />
          </div>
          {isImportedSource(report.source) && (
            <button
              className="text-button danger"
              data-action="clear-report"
              onClick={onClearLocal}
              type="button"
            >
              {t(locale, 'clearLocal')}
            </button>
          )}
        </div>
      </aside>

      <main className="main-column" id="main-content" ref={mainRef} tabIndex={-1}>
        <header className="topbar">
          <div>
            <span className="eyebrow">
              {t(locale, 'seasonEyebrow').replace('{year}', String(report.seasonYear))}
            </span>
            <strong>{report.accountIdMasked}</strong>
          </div>
          <div className="topbar-actions">
            <span className={`source-pill ${report.source} mobile-source`}>
              {t(locale, reportSourceStatusKey(report.source))}
            </span>
            <select
              aria-label={t(locale, 'languageLabel')}
              className="language-select"
              data-action="change-language"
              onChange={(event) => onLocaleChange(event.target.value as Locale)}
              value={locale}
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
              <option value="zh-TW">繁體中文</option>
            </select>
          </div>
        </header>

        <div className="page-content">{children}</div>
        <footer className="site-footer">
          <span>{t(locale, 'footerDisclaimer')}</span>
          <button
            className="footer-privacy-button"
            data-action="open-guide"
            onClick={onOpenGuide}
            type="button"
          >
            {t(locale, 'guideButton')}
          </button>
          <button className="footer-privacy-button" onClick={onOpenPrivacy} type="button">
            {t(locale, 'privacyNoticeOpen')}
          </button>
        </footer>
      </main>

      <nav className="bottom-nav" aria-label={t(locale, 'mobileNavigation')}>
        {navItems.map((item) => (
          <button
            className={page === item.id ? 'bottom-nav-item active' : 'bottom-nav-item'}
            aria-current={page === item.id ? 'page' : undefined}
            data-page={item.id}
            key={item.id}
            onClick={() => onPageChange(item.id)}
            type="button"
          >
            <span aria-hidden="true">{item.icon}</span>
            <small>{t(locale, item.label)}</small>
          </button>
        ))}
      </nav>
    </div>
  )
}
