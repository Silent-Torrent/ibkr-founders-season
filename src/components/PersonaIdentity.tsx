import { mascot, personaCopy } from '../lib/persona'
import type { PortfolioReport, Locale } from '../types'

export function PersonaIdentity({report,locale,roast}:{report:PortfolioReport,locale:Locale,roast:boolean}) {
  const copy=personaCopy(report,locale,roast)
  const path=mascot(report)
  return <span className="persona-identity" title={copy.line}>
    {path && <svg viewBox="0 0 44 44" aria-hidden="true"><path fill="#e3b960" d={path}/><path stroke="#172329" strokeWidth="3" d="M13 21h5m8 0h5"/></svg>}
    <span>{copy.name}</span>{copy.tags.map(tag=><small key={tag}>{tag}</small>)}
  </span>
}
