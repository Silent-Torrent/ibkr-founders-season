import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Locale } from '../types'
import { t } from '../i18n'

interface PrivacyNoticeModalProps {
  isOpen: boolean
  locale: Locale
  onClose: () => void
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  )
}

export function PrivacyNoticeModal({ isOpen, locale, onClose }: PrivacyNoticeModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return undefined

    const returnFocusTarget = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousBodyOverflow = document.body.style.overflow
    const appShell = document.querySelector<HTMLElement>('.app-shell')
    const appShellWasInert = appShell?.inert ?? false

    document.body.style.overflow = 'hidden'
    if (appShell) appShell.inert = true
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousBodyOverflow
      if (appShell) appShell.inert = appShellWasInert
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusableElements = getFocusableElements(dialogRef.current)
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (!firstElement || !lastElement) {
      event.preventDefault()
      dialogRef.current.focus()
      return
    }

    const activeElement = document.activeElement
    if (event.shiftKey && (activeElement === firstElement || !dialogRef.current.contains(activeElement))) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && (activeElement === lastElement || !dialogRef.current.contains(activeElement))) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <div
      className="privacy-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        aria-describedby="privacy-notice-description"
        aria-labelledby="privacy-notice-title"
        aria-modal="true"
        className="privacy-modal"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="privacy-modal-header">
          <div>
            <span className="eyebrow">LOCAL-FIRST BETA</span>
            <h2 id="privacy-notice-title">{t(locale, 'privacyNoticeTitle')}</h2>
          </div>
          <button
            aria-label={t(locale, 'close')}
            className="close-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>

        <p className="privacy-modal-intro" id="privacy-notice-description">
          {t(locale, 'privacyNoticeIntro')}
        </p>

        <div className="privacy-modal-grid">
          <section className="privacy-modal-section">
            <h3>{t(locale, 'privacyLocalTitle')}</h3>
            <p>{t(locale, 'privacyLocalBody')}</p>
          </section>
          <section className="privacy-modal-section">
            <h3>{t(locale, 'privacyMemoryTitle')}</h3>
            <p>{t(locale, 'privacyMemoryBody')}</p>
          </section>
          <section className="privacy-modal-section">
            <h3>{t(locale, 'privacyPreferenceTitle')}</h3>
            <p>{t(locale, 'privacyPreferenceBody')}</p>
          </section>
          <section className="privacy-modal-section">
            <h3>{t(locale, 'privacyTrustTitle')}</h3>
            <p>{t(locale, 'privacyTrustBody')}</p>
          </section>
          <section className="privacy-modal-section">
            <h3>{t(locale, 'privacyPdfTitle')}</h3>
            <p>{t(locale, 'privacyPdfBody')}</p>
          </section>
          <section className="privacy-modal-section">
            <h3>{t(locale, 'privacyDisclaimerTitle')}</h3>
            <p>{t(locale, 'privacyDisclaimerBody')}</p>
          </section>
          <section className="privacy-modal-section privacy-modal-clear-section">
            <h3>{t(locale, 'privacyClearTitle')}</h3>
            <p>{t(locale, 'privacyClearBody')}</p>
          </section>
        </div>

        <footer className="privacy-modal-footer">
          <button className="primary-button" onClick={onClose} type="button">
            {t(locale, 'privacyAcknowledge')}
          </button>
        </footer>
      </div>
    </div>
  )
}
