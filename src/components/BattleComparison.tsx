import { useEffect, useId, useState } from 'react'
import { local } from '../data/medals'
import { t } from '../i18n'
import { battlePoster, paintBattlePoster, type BattlePosterVisibility } from '../lib/battlePoster'
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
  visibility: BattlePosterVisibility
  onVisibilityChange: (visibility: BattlePosterVisibility) => void
}

export function BattleComparison({ mine, opponent, locale, colors, visibility, onVisibilityChange }: Props) {
  const titleId = useId()
  const visibilityNoteId = useId()
  const [feedback, setFeedback] = useState('')
  const [fontsReady, setFontsReady] = useState(false)
  const poster = battlePoster(mine, opponent, locale, visibility)
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
      <fieldset className="battle-visibility" aria-describedby={visibilityNoteId}>
        <legend>{local('对战卡隐私|對戰卡隱私|Battle poster privacy', locale)}</legend>
        <label>
          <input
            type="checkbox" data-battle-hide="division" checked={visibility.hideDivision}
            onChange={event => onVisibilityChange({ ...visibility, hideDivision: event.target.checked })}
          />
          {local('隐藏资产组别|隱藏資產組別|Hide asset divisions', locale)}
        </label>
        <label>
          <input
            type="checkbox" data-battle-hide="medals" checked={visibility.hideMedals}
            onChange={event => onVisibilityChange({ ...visibility, hideMedals: event.target.checked })}
          />
          {local('隐藏勋章|隱藏勳章|Hide medals', locale)}
        </label>
        <p id={visibilityNoteId}>
          {local('预览和 PNG 中，你与对手使用相同选项。复制的对战码仍含组别和勋章 ID。|預覽和 PNG 中，你與對手使用相同選項。複製的對戰碼仍含組別和勳章 ID。|Applies to both sides in the preview and PNG. Copied codes still include divisions and medal IDs.', locale)}
        </p>
      </fieldset>
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
              {side.division && <p>{side.division}</p>}
              {side.medals && (side.medals.length ? (
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
              ) : <small>{poster.emptyMedals}</small>)}
            </article>
          ))}
        </div>
        <footer>
          <p>{poster.comparability}</p>
          {poster.privacy && <p>{poster.privacy}</p>}
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
