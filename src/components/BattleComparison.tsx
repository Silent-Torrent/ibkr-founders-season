import { useEffect, useId, useState } from 'react'
import { local } from '../data/medals'
import { t } from '../i18n'
import { battlePoster, paintBattlePoster } from '../lib/battlePoster'
import type { Battle } from '../lib/battleCode'
import type { Preferences } from '../lib/cardOptions'
import { ribbon, seal, sealLines } from '../lib/medalArt'
import type { Locale } from '../types'
import '../design/battle.css'

type Props = {
  mine: Parameters<typeof battlePoster>[0]
  opponent: Battle
  locale: Locale
  colors: Preferences['colors']
}

export function BattleComparison({ mine, opponent, locale, colors }: Props) {
  const titleId = useId()
  const [feedback, setFeedback] = useState('')
  const [fontsReady, setFontsReady] = useState(false)
  const poster = battlePoster(mine, opponent, locale)
  useEffect(() => {
    let current = true
    void document.fonts.ready.then(() => { if (current) setFontsReady(true) })
    return () => { current = false }
  }, [])
  function save() {
    try {
      const canvas = document.createElement('canvas')
      if (!paintBattlePoster(canvas, poster, locale, colors)) throw new Error('No canvas context')
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = 'pnl-arena-battle.png'
      link.click()
      setFeedback(t(locale, 'shareCardDownloadStarted'))
    } catch {
      setFeedback(local('无法生成对战卡。|無法產生對戰卡。|Could not generate the battle card.', locale))
    }
  }
  return (
    <section className="battle-comparison" aria-labelledby={titleId}>
      <div className="battle-poster">
        <header>
          <span className="eyebrow">{poster.kicker}</span>
          <h4 id={titleId}>{poster.title}</h4>
        </header>
        <div className="battle-sides" aria-live="polite">
          {poster.sides.map(side => (
            <article key={side.name} className="battle-side">
              <h5>{side.name}</h5>
              <small>{side.source}</small>
              <strong className={`battle-return ${side.sign}`}>{side.returnLabel}</strong>
              <p>{side.division}</p>
              {side.medals.length ? (
                <ul>
                  {side.medals.map(medal => (
                    <li key={medal.id}>
                      <svg viewBox="0 0 64 72" aria-hidden="true">
                        <path d={ribbon} fill="currentColor" />
                        <path d={seal} fill="currentColor" />
                        <path d={sealLines(medal.id)} fill="none" stroke="#171717" strokeWidth="3" />
                      </svg>
                      {medal.name}
                    </li>
                  ))}
                </ul>
              ) : <small>{poster.emptyMedals}</small>}
            </article>
          ))}
        </div>
        <footer>
          <p>{poster.comparability} {poster.privacy}</p>
          <p>{poster.disclaimer}</p>
        </footer>
      </div>
      <div className="battle-share-actions">
        <button onClick={save} type="button" disabled={!fontsReady} data-battle-export>{local('下载对战卡|下載對戰卡|Download battle card', locale)}</button>
        <p>{local('分享前请与对手确认。|分享前請與對手確認。|Check with your opponent before sharing.', locale)}</p>
        <output aria-live="polite">{feedback}</output>
      </div>
    </section>
  )
}
