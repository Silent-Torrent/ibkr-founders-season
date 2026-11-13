import { advice, local, medals } from '../data/medals'
import { t } from '../i18n'
import type { Locale } from '../types'
import type { Battle } from './battleCode'
import type { Preferences } from './cardOptions'
import { ribbon, seal, sealLines } from './medalArt'
import type { DivisionKey } from './season'

type Side = {
  name: string
  source: string
  returnLabel: string
  sign: 'positive' | 'negative' | ''
  division: string
  medals: { id: number; name: string }[]
}

export function battlePoster(
  mine: { percent?: number; division?: DivisionKey; medals: number[]; source: string },
  opponent: Battle,
  locale: Locale,
) {
  const number = new Intl.NumberFormat(locale, {
    style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero',
  })
  function side(name: string, source: string, percent: number | undefined, division: DivisionKey | undefined, ids: number[]): Side {
    return {
      name, source,
      returnLabel: percent == null ? t(locale, 'valueUnavailable') : number.format(percent / 100),
      sign: percent == null || percent === 0 ? '' : percent > 0 ? 'positive' : 'negative',
      division: t(locale, division ?? 'divisionUnavailable'),
      medals: ids.map(id => ({ id, name: local(medals[id][0], locale) })),
    }
  }
  return {
    title: local('赛季对战|賽季對戰|Season battle', locale),
    kicker: local('本地对比 · 仅供娱乐|本機對比 · 僅供娛樂|Local comparison · for fun', locale),
    sides: [
      side(local('我|我|You', locale), mine.source, mine.percent, mine.division, mine.medals),
      side(local('对手|對手|Opponent', locale), t(locale, 'selfReportedUnverified'), opponent.percent, opponent.division, opponent.medals),
    ],
    emptyMedals: local('无勋章|無勳章|No medals', locale),
    privacy: local('资产组别会透露账户规模范围。|資產組別會透露帳戶規模範圍。|Divisions reveal broad account-size ranges.', locale),
    comparability: local('对战码不含赛季与截止日。|對戰碼不含賽季與截止日。|Codes omit the season and as-of date.', locale),
    disclaimer: advice(locale),
  }
}

export function paintBattlePoster(
  canvas: HTMLCanvasElement,
  poster: ReturnType<typeof battlePoster>,
  locale: Locale,
  colors: Preferences['colors'],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  canvas.width = 1080
  canvas.height = 1440
  const paper = '#f4efe6'
  const muted = '#c2bdb5'
  const redGains = colors === 'red' || (colors === 'auto' && locale === 'zh-CN')
  const text = (line: string, x: number, y: number, size: number, maxWidth: number, color = paper, display = false) => {
    ctx.font = display ? `400 ${size}px Anton, ArenaSeason, sans-serif` : `600 ${size}px "Space Grotesk", ArenaSeason, sans-serif`
    ctx.fillStyle = color
    ctx.fillText(line, x, y, maxWidth)
  }
  ctx.fillStyle = '#0b0b0b'
  ctx.fillRect(0, 0, 1080, 1440)
  ctx.fillStyle = '#ff2b2b'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(1080, 0)
  ctx.lineTo(1080, 12)
  ctx.lineTo(0, 46)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = paper
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(34, 66, 1012, 1330, 32)
  ctx.stroke()
  text('P&L ARENA', 72, 145, 34, 936)
  text(poster.title, 72, 269, 100, 936, paper, true)
  text(poster.kicker, 72, 328, 36, 936, muted)
  poster.sides.forEach((side, index) => {
    const x = 72 + index * 480
    ctx.fillStyle = '#171717'
    ctx.beginPath()
    ctx.roundRect(x, 389, 456, 666, 26)
    ctx.fill()
    text(side.name, x + 30, 458, 47, 396)
    text(side.source, x + 30, 506, 24, 396, muted)
    const red = redGains ? '#ff858d' : '#ff7e88'
    const scoreColor = side.sign === '' ? paper : (side.sign === 'positive') === redGains ? red : '#68e3ad'
    text(side.returnLabel, x + 30, 670, 106, 396, scoreColor, true)
    text(side.division, x + 30, 741, 33, 396)
    ctx.fillStyle = '#3a3a3a'
    ctx.fillRect(x + 30, 780, 396, 2)
    if (!side.medals.length) text(poster.emptyMedals, x + 30, 846, 30, 396, muted)
    side.medals.forEach((medal, medalIndex) => {
      const y = 844 + medalIndex * 62
      ctx.save()
      ctx.translate(x + 30, y - 30)
      ctx.scale(.48, .48)
      ctx.fillStyle = '#e3b960'
      ctx.fill(new Path2D(ribbon))
      ctx.fill(new Path2D(seal))
      ctx.strokeStyle = '#171717'
      ctx.lineWidth = 3
      ctx.stroke(new Path2D(sealLines(medal.id)))
      ctx.restore()
      text(medal.name, x + 79, y, 30, 347)
    })
  })
  text(poster.comparability, 72, 1151, 31, 936, muted)
  text(poster.privacy, 72, 1216, 31, 936, muted)
  text(poster.disclaimer, 72, 1322, 37, 936)
  return true
}
