import { useEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Locale, PortfolioReport, SourceRef, SymbolPnl } from '../types'
import { t } from '../i18n'
import { formatCurrency, formatDate, pnlClass } from '../lib/format'
import { SourceRows } from './SourceRows'

const eventLabelKeys = {
  assignment: 'assignmentEvent',
  exercise: 'exerciseEvent',
  expiration: 'expirationEvent',
} as const

interface SymbolDrawerProps {
  symbol: SymbolPnl | null
  report: PortfolioReport
  locale: Locale
  onClose: () => void
}

interface SourceDetailsProps {
  isDemo: boolean
  label: string
  locale: Locale
  refs: SourceRef[]
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

function SourceDetails({ isDemo, label, locale, refs }: SourceDetailsProps) {
  return (
    <details className="provenance-details drawer-source-details">
      <summary>
        <span>{label}</span>
        <small>
          {isDemo
            ? t(locale, 'synthetic')
            : t(locale, 'sourceRowCount').replace('{count}', String(refs.length))}
        </small>
      </summary>
      <SourceRows isDemo={isDemo} locale={locale} refs={refs} />
    </details>
  )
}

interface DrawerMetricProps {
  isDemo: boolean
  label: string
  locale: Locale
  refs: SourceRef[]
  value: string
  valueClass: string
}

function DrawerMetric({ isDemo, label, locale, refs, value, valueClass }: DrawerMetricProps) {
  return (
    <article className="drawer-metric-card">
      <span className="drawer-metric-label">{label}</span>
      <strong className={`drawer-metric-value ${valueClass}`}>{value}</strong>
      <SourceDetails
        isDemo={isDemo}
        label={t(locale, 'sourceDetails')}
        locale={locale}
        refs={refs}
      />
    </article>
  )
}

export function SymbolDrawer({ symbol, report, locale, onClose }: SymbolDrawerProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!symbol) return undefined

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
  }, [symbol])

  if (!symbol) return null
  const events = report.events.filter((event) => event.symbol === symbol.symbol)
  const isDemo = report.source === 'demo'
  const otherRefs = symbol.sourceRefs.otherYtdMtm ?? []
  const showOther = symbol.otherYtdMtm !== 0 || otherRefs.length > 0

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
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

  return createPortal(
    <div
      className="drawer-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <aside
        aria-labelledby="symbol-drawer-title"
        aria-modal="true"
        className="symbol-drawer"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">UNDERLYING</span>
            <h2 id="symbol-drawer-title">{symbol.symbol}</h2>
            <p>{symbol.description}</p>
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
        </div>

        {isDemo && (
          <p className="demo-source-notice drawer-demo-source">{t(locale, 'demoNoLocalSource')}</p>
        )}

        <div className="drawer-total">
          <span className="drawer-metric-label">{t(locale, 'ytdPnl')}</span>
          <strong className={pnlClass(symbol.totalYtdMtm)}>
            {formatCurrency(symbol.totalYtdMtm, report.baseCurrency, locale)}
          </strong>
          <SourceDetails
            isDemo={isDemo}
            label={t(locale, 'sourceDetails')}
            locale={locale}
            refs={symbol.sourceRefs.totalYtdMtm ?? []}
          />
        </div>

        <div className="detail-grid">
          <DrawerMetric
            isDemo={isDemo}
            label={t(locale, 'stockYtd')}
            locale={locale}
            refs={symbol.sourceRefs.stockYtdMtm ?? []}
            value={formatCurrency(symbol.stockYtdMtm, report.baseCurrency, locale)}
            valueClass={pnlClass(symbol.stockYtdMtm)}
          />
          <DrawerMetric
            isDemo={isDemo}
            label={t(locale, 'optionYtd')}
            locale={locale}
            refs={symbol.sourceRefs.optionYtdMtm ?? []}
            value={formatCurrency(symbol.optionYtdMtm, report.baseCurrency, locale)}
            valueClass={pnlClass(symbol.optionYtdMtm)}
          />
          {showOther && (
            <DrawerMetric
              isDemo={isDemo}
              label={t(locale, 'otherYtd')}
              locale={locale}
              refs={otherRefs}
              value={formatCurrency(symbol.otherYtdMtm, report.baseCurrency, locale)}
              valueClass={pnlClass(symbol.otherYtdMtm)}
            />
          )}
          <DrawerMetric
            isDemo={isDemo}
            label={t(locale, 'realized')}
            locale={locale}
            refs={symbol.sourceRefs.totalRealizedYtd ?? []}
            value={formatCurrency(symbol.totalRealizedYtd, report.baseCurrency, locale)}
            valueClass={pnlClass(symbol.totalRealizedYtd)}
          />
          <DrawerMetric
            isDemo={isDemo}
            label={t(locale, 'unrealized')}
            locale={locale}
            refs={symbol.sourceRefs.totalCurrentUnrealized ?? []}
            value={formatCurrency(symbol.totalCurrentUnrealized, report.baseCurrency, locale)}
            valueClass={pnlClass(symbol.totalCurrentUnrealized)}
          />
        </div>

        <div className="event-summary">
          <div><strong>{symbol.assignmentCount}</strong><span>{t(locale, 'assignments')}</span></div>
          <div><strong>{symbol.exerciseCount}</strong><span>{t(locale, 'exercises')}</span></div>
          <div><strong>{symbol.expirationCount}</strong><span>{t(locale, 'expirations')}</span></div>
        </div>

        <section className="drawer-section">
          <h3>{t(locale, 'eventHistory')}</h3>
          {events.length === 0 ? (
            <p className="muted-copy">{t(locale, 'noEvents')}</p>
          ) : (
            <div className="event-list">
              {events.map((event, index) => (
                <article key={`${event.symbol}-${event.date}-${event.type}-${index}`}>
                  <div className="event-item-main">
                    <span className={`event-type ${event.type}`}>
                      {t(locale, eventLabelKeys[event.type])}
                    </span>
                    <div>
                      <strong>{event.contract ?? event.symbol}</strong>
                      <small>{event.date ? formatDate(event.date, locale) : '—'}</small>
                    </div>
                  </div>
                  <SourceDetails
                    isDemo={isDemo}
                    label={t(locale, 'eventSources')}
                    locale={locale}
                    refs={event.sourceRefs}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>,
    document.body,
  )
}
