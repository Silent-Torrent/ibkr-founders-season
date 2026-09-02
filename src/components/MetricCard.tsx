import type { ReactNode } from 'react'

interface MetricCardProps {
  explanation?: string
  helpLabel?: string
  label: string
  value: string
  hint?: string
  summary?: string
  tone?: 'positive' | 'negative' | 'neutral'
  icon?: ReactNode
}

export function MetricCard({
  explanation,
  helpLabel,
  hint,
  icon,
  label,
  summary,
  tone = 'neutral',
  value,
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card-head">
        <span>{label}</span>
        {icon && <span aria-hidden="true" className="metric-icon">{icon}</span>}
      </div>
      <strong className={`metric-value ${tone}`}>{value}</strong>
      {hint && <small>{hint}</small>}
      {summary && <p className="metric-summary">{summary}</p>}
      {explanation && helpLabel && (
        <details className="metric-help">
          <summary aria-label={`${label}: ${helpLabel}`}>
            <span aria-hidden="true">?</span>
            {helpLabel}
          </summary>
          <p>{explanation}</p>
        </details>
      )}
    </article>
  )
}
