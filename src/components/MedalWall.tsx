import { ribbon, seal, sealLines } from '../lib/medalArt'
import { useContext } from 'react'
import type { PortfolioReport, Locale } from '../types'
import { medals, local, tr, insufficient, advice } from '../data/medals'
import { Settings } from './Preferences'
import { medalOutcome } from '../lib/cardOptions'
export function MedalWall({
  report: r,
  locale: l,
}: {
  report: PortfolioReport
  locale: Locale
}) {
  const { prefs: p } = useContext(Settings)
  return (
    <section className="medal-wall">
      <h2>{tr(l, '赛季勋章墙', '賽季勳章牆', 'Season medal wall')}</h2>
      <div className="medal-grid">
        {medals.map((m, i) => {
          const { value: n, earned, tier, detail } = medalOutcome(i, r, l, p)
          return (
            <details
              className={
                'medal ' +
                (earned ? 'earned ' : '') +
                (i === 13 ? 'founder' : '')
              }
              data-tier={tier==null ? undefined : ['bronze','silver','gold'][tier]}
              key={i}
            >
              <summary>
                <svg aria-hidden="true" viewBox="0 0 64 72">
                  <path d={ribbon} fill="currentColor" />
                  <path d={seal} fill="currentColor" />
                  <path
                    d={sealLines(i)}
                    fill="none"
                    stroke="#182023"
                    strokeWidth="3"
                  />
                </svg>
                <strong>{local(m[0], l)}</strong>
                <small>
                  {r.source !== 'local'
                    ? tr(l, '预览', '預覽', 'Preview')
                    : n == null
                      ? insufficient(l)
                      : earned
                        ? tier == null
                          ? tr(l, '已获得', '已獲得', 'Earned')
                          : local(
                              ['铜|銅|Bronze', '银|銀|Silver', '金|金|Gold'][
                                tier
                              ],
                              l,
                            )
                        : tr(l, '未获得', '未獲得', 'Locked')}
                </small>
              </summary>
              <p>{local(m[1], l)}</p>
              {detail && <p>{detail}</p>}
              <p>{local(m[p.roast ? 2 : 3], l)}</p><small>{advice(l)}</small>
            </details>
          )
        })}
      </div>
    </section>
  )
}
