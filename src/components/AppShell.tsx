import { useEffect, useRef, type ReactNode } from 'react'
import type { Locale, PageId, PortfolioReport } from '../types'
import { t } from '../i18n'

interface AppShellProps {
  children: ReactNode
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  page: PageId
  onPageChange: (page: PageId) => void
  report: PortfolioReport
  onClearLocal: () => void
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
  locale,
  onLocaleChange,
  page,
  onPageChange,
  report,
  onClearLocal,
  onOpenPrivacy,
}: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null)
  const previousPageRef = useRef(page)
  const previousReportSourceRef = useRef(report.source)

  useEffect(() => {
    const pageChanged = previousPageRef.current !== page
    const reportWasCleared =
      previousReportSourceRef.current === 'local' && report.source === 'demo'

    previousPageRef.current = page
    previousReportSourceRef.current = report.source

    if (pageChanged || reportWasCleared) mainRef.current?.focus()
  }, [page, report.source])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t(locale, 'skipToContent')}
      </a>
      <span aria-live="polite" className="sr-only report-source-status" role="status">
        {report.source === 'demo' ? t(locale, 'demoData') : t(locale, 'localReport')}
      </span>
      <aside className="sidebar">
        <button className="brand" onClick={() => onPageChange('ledger')} type="button">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
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
          <button className="privacy-card-action" onClick={onOpenPrivacy} type="button">
            {t(locale, 'privacyNoticeOpen')}
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="source-row">
            <span className={report.source === 'demo' ? 'source-pill demo' : 'source-pill local'}>
              {report.source === 'demo' ? t(locale, 'demoData') : t(locale, 'localReport')}
            </span>
            <span aria-hidden="true" className={`quality-dot ${report.dataQuality}`} />
          </div>
          {report.source === 'local' && (
            <button className="text-button danger" onClick={onClearLocal} type="button">
              {t(locale, 'clearLocal')}
            </button>
          )}
        </div>
      </aside>

      <main className="main-column" id="main-content" ref={mainRef} tabIndex={-1}>
        <header className="topbar">
          <div>
            <span className="eyebrow">{report.seasonYear} SEASON</span>
            <strong>{report.accountIdMasked}</strong>
          </div>
          <div className="topbar-actions">
            <span className={report.source === 'demo' ? 'source-pill demo mobile-source' : 'source-pill local mobile-source'}>
              {report.source === 'demo' ? t(locale, 'demoData') : t(locale, 'localReport')}
            </span>
            <select
              aria-label={t(locale, 'languageLabel')}
              className="language-select"
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
