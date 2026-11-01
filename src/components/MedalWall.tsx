import { useContext } from 'react'
import type { PortfolioReport, Locale } from '../types'
import { medals, local, tr, insufficient } from '../data/medals'
import { Settings } from './Preferences'
import { ramen } from '../lib/cardOptions'
import { hotTickers } from '../lib/medalRules'
import { formatCurrency } from '../lib/format'
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
          const n = r.medalValues?.[i],
            earned = r.source === 'local' && n != null && n !== 0
          const tier =
            earned && (i === 0 || i === 6)
              ? n! >= (i === 0 ? 270 : 10)
                ? 2
                : n! >= (i === 0 ? 180 : 5)
                  ? 1
                  : 0
              : null
          const detail =
            earned && n != null
              ? i === 0
                ? n + tr(l, ' 天', ' 天', ' days')
                : i === 1 && p.amount
                  ? formatCurrency(n, r.baseCurrency, l)
                  : i === 6
                    ? n + tr(l, ' 个派息标的', ' 檔配息標的', ' payers')
                    : i === 7
                      ? ramen(r, l, p)
                      : i === 11 || i === 12
                        ? String(n).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3')
                        : i === 13
                          ? p.firstMonth
                          : i >= 14 && !p.hideTickers
                            ? hotTickers[r.seasonYear]?.[i - 14]
                                .filter((_, j) => n & (1 << j))
                                .join(' · ')
                            : ''
              : ''
          const points = Array.from({ length: 3 + (i % 6) }, (_, j) => {
            const a = (j * 2 * Math.PI) / (3 + (i % 6)) - Math.PI / 2
            return [32 + Math.cos(a) * 15, 28 + Math.sin(a) * 15].join(',')
          }).join(' ')
          return (
            <details
              className={
                'medal ' +
                (earned ? 'earned ' : '') +
                (i === 13 ? 'founder' : '')
              }
              key={i}
            >
              <summary>
                <svg aria-hidden="true" viewBox="0 0 64 72">
                  <path
                    d="M13 44 9 69 24 62 31 69 36 45M32 45 38 70 49 62 57 67 50 42"
                    fill="currentColor"
                  />
                  <path
                    d="m32 2 23 13 3 25-26 15L6 40l3-25Z"
                    fill="currentColor"
                  />
                  <g fill="none" stroke="#182023" strokeWidth="3">
                    <polygon points={points} />
                    <path
                      d={
                        ['M22 29h20', 'm24 32 8-10 8 10', 'm23 24 9 10 9-10'][
                          Math.floor(i / 6)
                        ]
                      }
                    />
                  </g>
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
              <p>{local(m[p.roast ? 2 : 3], l)}</p>
            </details>
          )
        })}
      </div>
    </section>
  )
}
