import type { ReactNode } from 'react'

interface MetricCardProps {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative' | 'neutral'
  icon?: ReactNode
}

export function MetricCard({ label, value, hint, tone = 'neutral', icon }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card-head">
        <span>{label}</span>
        {icon && <span aria-hidden="true" className="metric-icon">{icon}</span>}
      </div>
      <strong className={`metric-value ${tone}`}>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  )
}
