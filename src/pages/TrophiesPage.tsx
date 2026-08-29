import type { Locale, PortfolioReport } from '../types'
import type { MessageKey } from '../i18n'
import { t } from '../i18n'
import { getTrophies } from '../lib/season'
import { isSyntheticSource, reportTrustLabelKey } from '../lib/reportSource'

interface TrophiesPageProps {
  report: PortfolioReport
  locale: Locale
}

const titleKeys: Record<string, MessageKey> = {
  founders: 'badgeFoundersTitle',
  theta: 'badgeThetaTitle',
  assigned: 'badgeAssignedTitle',
  green: 'badgeGreenTitle',
  bagholder: 'badgeBagholderTitle',
  reverse: 'badgeReverseTitle',
  iv: 'badgeIvTitle',
  cash: 'badgeCashTitle',
}

const descriptionKeys: Record<string, MessageKey> = {
  founders: 'badgeFoundersDesc',
  theta: 'badgeThetaDesc',
  assigned: 'badgeAssignedDesc',
  green: 'badgeGreenDesc',
  bagholder: 'badgeBagholderDesc',
  reverse: 'badgeReverseDesc',
  iv: 'badgeIvDesc',
  cash: 'badgeCashDesc',
}

export function TrophiesPage({ report, locale }: TrophiesPageProps) {
  const trophies = getTrophies(report)
  const unlocked = trophies.filter((item) => item.unlocked).length
  const isSynthetic = isSyntheticSource(report.source)
  const counterLabel = t(locale, isSynthetic ? 'achievementPreview' : 'trophyCounterLabel')

  return (
    <>
      <section className="trophy-hero">
        <div>
          <span className="eyebrow">{unlocked}/{trophies.length} {counterLabel}</span>
          <h1>{t(locale, 'trophiesTitle')}</h1>
          <p>{t(locale, 'trophiesSubtitle')}</p>
        </div>
        <div className="trophy-counter">
          <strong>{unlocked}</strong>
          <span>{counterLabel}</span>
        </div>
      </section>

      <div className="notice-banner">
        <span aria-hidden="true">◇</span>
        <div>
          <strong>{t(locale, isSynthetic ? reportTrustLabelKey(report.source) : 'localAchievement')}</strong>
          <p>{t(locale, isSynthetic ? 'trophyDemoNotice' : 'trophyLocalNotice')}</p>
        </div>
      </div>

      <section aria-label={t(locale, 'trophiesTitle')} className="trophy-grid" role="list">
        {trophies.map((trophy) => (
          <article className={`trophy-card ${trophy.tone} ${trophy.unlocked ? 'unlocked' : 'locked'}`} key={trophy.id} role="listitem">
            <div aria-hidden="true" className="trophy-art">
              <div className="trophy-ring" />
              <span>{trophy.icon}</span>
            </div>
            <div className="trophy-status">
              <span>{trophy.unlocked ? t(locale, 'localAchievement') : t(locale, 'locked')}</span>
              {trophy.unlocked && <i />}
            </div>
            <h2>{t(locale, titleKeys[trophy.id])}</h2>
            <p>{t(locale, descriptionKeys[trophy.id])}</p>
            {!trophy.unlocked && trophy.progress != null && (
              <div
                aria-label={t(locale, titleKeys[trophy.id])}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(trophy.progress * 100)}
                className="progress-track"
                role="progressbar"
              >
                <span style={{ width: `${Math.round(trophy.progress * 100)}%` }} />
              </div>
            )}
          </article>
        ))}
      </section>
    </>
  )
}
