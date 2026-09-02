import { useEffect, useRef } from 'react'
import type { Locale } from '../types'
import { t } from '../i18n'

interface GettingStartedScreenProps {
  focusOnMount: boolean
  hasCurrentReport: boolean
  locale: Locale
  onImport: () => void
  onLocaleChange: (locale: Locale) => void
  onOpenPrivacy: () => void
  onPrimaryAction: () => void
}

export function GettingStartedScreen({
  focusOnMount,
  hasCurrentReport,
  locale,
  onImport,
  onLocaleChange,
  onOpenPrivacy,
  onPrimaryAction,
}: GettingStartedScreenProps) {
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!focusOnMount) return
    window.scrollTo({ left: 0, top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [focusOnMount])

  return (
    <div className="app-shell getting-started-shell">
      <a className="skip-link" href="#getting-started-main">
        {t(locale, 'skipToContent')}
      </a>

      <header className="getting-started-topbar">
        <div className="welcome-brand">
          <span aria-hidden="true" className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>{t(locale, 'appName')}</strong>
            <small>2026 {t(locale, 'seasonLabel')}</small>
          </span>
        </div>
        <div className="getting-started-actions">
          <button className="welcome-privacy-button" onClick={onOpenPrivacy} type="button">
            {t(locale, 'privacyNoticeOpen')}
          </button>
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

      <main
        className="getting-started-main"
        id="getting-started-main"
        ref={mainRef}
        tabIndex={-1}
      >
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <span className="eyebrow">{t(locale, 'welcomeEyebrow')}</span>
          <h1 id="welcome-title">{t(locale, 'welcomeTitle')}</h1>
          <p>{t(locale, 'welcomeSubtitle')}</p>
        </section>

        <section aria-label={t(locale, 'welcomeChoiceLabel')} className="welcome-choice-grid">
          <article className="panel welcome-choice-card primary-choice">
            <span className="step-label">01</span>
            <h2>
              {t(locale, hasCurrentReport ? 'welcomeCurrentTitle' : 'welcomeDemoTitle')}
            </h2>
            <p>
              {t(locale, hasCurrentReport ? 'welcomeCurrentBody' : 'welcomeDemoBody')}
            </p>
            <button
              className="primary-button"
              data-action="welcome-primary"
              onClick={onPrimaryAction}
              type="button"
            >
              {t(locale, hasCurrentReport ? 'resumeCurrentReport' : 'exploreDemo')}
            </button>
          </article>

          <article className="panel welcome-choice-card">
            <span className="step-label">02</span>
            <h2>{t(locale, 'welcomeImportTitle')}</h2>
            <p>{t(locale, 'welcomeImportBody')}</p>
            <button
              className="secondary-button"
              data-action="welcome-import"
              onClick={onImport}
              type="button"
            >
              {t(locale, 'importMyStatement')}
            </button>
          </article>
        </section>

        <section className="panel welcome-needs" aria-labelledby="welcome-needs-title">
          <div>
            <span aria-hidden="true" className="definition-icon">i</span>
            <h2 id="welcome-needs-title">{t(locale, 'welcomeNeedsTitle')}</h2>
          </div>
          <ol>
            <li>{t(locale, 'welcomeNeedCsv')}</li>
            <li>{t(locale, 'welcomeNeedLocal')}</li>
            <li>{t(locale, 'welcomeNeedTrust')}</li>
          </ol>
        </section>
      </main>

      <footer className="welcome-footer">
        <span>{t(locale, 'footerDisclaimer')}</span>
      </footer>
    </div>
  )
}
