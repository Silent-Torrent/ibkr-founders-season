import type { Locale, PortfolioReport } from '../types'
import { t } from '../i18n'
import { formatPercent, pnlClass } from '../lib/format'
import { getShareSourceLabel } from '../lib/shareCard'
import { PersonaIdentity } from './PersonaIdentity'
import '../design/report.css'

export function SeasonPoster({report,locale,roast}:{report:PortfolioReport;locale:Locale;roast:boolean}) {
  const value = report.seasonReturn
  return <div className="season-poster" data-roast={roast}>
    <div className="poster-copy">
      <span className="poster-slug">{report.seasonYear} / {getShareSourceLabel(report,locale)}</span>
      <span className="poster-label">{t(locale,'seasonReturn')}</span>
      <strong className={'poster-score '+pnlClass(value)} data-available={value!=null}>
        {value==null ? t(locale,'seasonReturnMissingHint') : formatPercent(value,locale)}
      </strong>
    </div>
    <PersonaIdentity report={report} locale={locale} roast={roast}/>
  </div>
}
