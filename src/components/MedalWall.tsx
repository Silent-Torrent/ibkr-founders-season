import { bagholder, displayedMedals, nextTarget, rarity, rarityLabels } from '../lib/medalCollection'
import { medalPoster } from '../lib/medalPoster'
import { ribbon, seal, sealLines } from '../lib/medalArt'
import { useContext } from 'react'
import type { PortfolioReport, Locale } from '../types'
import { medals, local, tr, insufficient, advice } from '../data/medals'
import { Settings } from './Preferences'
import { medalOutcome, tierName } from '../lib/cardOptions'
export function MedalWall({
  report: r,
  locale: l,
}: {
  report: PortfolioReport
  locale: Locale
}) {
  const { prefs: p, update } = useContext(Settings)
  const worn = displayedMedals(r.medalValues ?? [],p.worn ?? [])
  const growth = bagholder(r.medalValues ?? [])
  return (
    <section className="medal-wall">
      <h2>{tr(l, '赛季勋章墙', '賽季勳章牆', 'Season medal wall')}</h2>
      {growth != null && <p>{tr(l,'韭菜成长等级','韭菜成長等級','Bagholder Level')} {local(['新韭菜|嫩韭菜|Fresh Sprout','风吹韭菜|風吹韭菜|Windblown Sprout','半山腰韭菜|半山腰韭菜|Hillside Regular','越冬韭菜|越冬韭菜|Winter Survivor','老韭菜|老韭菜|Seasoned Bagholder'][growth],l)} · {growth+1}/5 · {tr(l,'仅供自嘲。','自嘲而已。','For a laugh.')}</p>}
      <div className="medal-grid">
        {medals.map((m, i) => {
          const { value: n, earned, tier, detail } = medalOutcome(i, r, l, p)
          const target = nextTarget(i,n)
          const selected = worn.includes(i)
          const explicit = (p.worn ?? []).filter(id => Boolean(r.medalValues?.[id]))
          return (
            <details
              className={
                'medal ' +
                (earned ? 'earned ' : '') +
                (i === 13 ? 'founder' : '')
              }
              data-tier={tier==null ? undefined : ['bronze','silver','gold','diamond'][tier]}
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
                  {n == null ? insufficient(l) : !earned ? tr(l,'未获得','未獲得','Locked') :
                    tier == null ? tr(l,'已获得','已獲得','Earned') : tierName(tier,l)}
                </small>
                <span>{local(rarityLabels[rarity[i]],l)}</span>
              </summary>
              {target && n != null && <p><progress aria-label={local(m[0],l)} value={n} max={target}/>{' '}{tr(l,'还差','還差','Remaining')} {target-n} {i===0?tr(l,'天','天','days'):tr(l,'个派息标的','檔配息標的','payers')}</p>}
              {earned && <div className="medal-tools">
                <button type="button" aria-pressed={selected} disabled={!selected && explicit.length>=3} onClick={() => update({...p,worn:selected?worn.filter(id=>id!==i):[...explicit,i]})}>{selected?tr(l,'摘下','摘下','Unpin'):tr(l,'佩戴','佩戴','Pin')}</button>
                <button type="button" onClick={() => {
                  const poster=medalPoster(r,i,l,p)
                  if (!poster) return
                  const a=document.createElement('a')
                  a.download=poster.filename
                  a.href=poster.url
                  a.click()
                }}>{tr(l,'导出勋章','匯出勳章','Export medal')}</button>
              </div>}
              {tier!=null && <p className="medal-tier">{tr(l,'等级','等級','Tier')} · {tierName(tier,l)}</p>}
              {r.source!=='local' && <small>{tr(l,'虚构示例','虛構範例','Fictional sample')}</small>}
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
