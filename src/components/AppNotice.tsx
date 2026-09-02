import type { MouseEvent } from 'react'

interface AppNoticeProps {
  dismissLabel: string
  message: string
  onDismiss: () => void
  tone: 'success' | 'info' | 'warning'
}

export function AppNotice({ dismissLabel, message, onDismiss, tone }: AppNoticeProps) {
  function dismiss(event: MouseEvent<HTMLButtonElement>) {
    const main = event.currentTarget.closest('main')
    onDismiss()
    window.requestAnimationFrame(() => main?.focus({ preventScroll: true }))
  }

  return (
    <section
      aria-atomic="true"
      className={`app-notice ${tone}`}
      role={tone === 'warning' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="app-notice-icon">
        {tone === 'success' ? '✓' : tone === 'warning' ? '!' : 'i'}
      </span>
      <p>{message}</p>
      <button
        className="app-notice-dismiss"
        data-action="dismiss-notice"
        onClick={dismiss}
        type="button"
      >
        {dismissLabel}
      </button>
    </section>
  )
}
