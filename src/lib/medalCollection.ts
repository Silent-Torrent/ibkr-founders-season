import { medals } from '../data/medals'

export function isMedalSelection(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 3 &&
    value.every(id => Number.isInteger(id) && id >= 0 && id < medals.length) &&
    new Set(value).size === value.length
}

// Rarity describes the rule, never the proportion of users earning it.
export const rarity = [3,0,1,2,1,2,2,0,2,3,1,1,1,0,1,2,1,1] as const
export const rarityLabels = ['普通|普通|Common','稀有|稀有|Rare','史诗|史詩|Epic','传说|傳說|Legendary']
export const medalKey = 'pnl-arena.medals.v1'

export function validSelection(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((id): id is number =>
    Number.isInteger(id) && id >= 0 && id < rarity.length))].slice(0,3)
}

export function displayedMedals(values: (number|null)[], selected: number[]) {
  const earned = rarity.map((_,id) => id).filter(id => Boolean(values[id]))
  const worn = validSelection(selected).filter(id => earned.includes(id))
  return worn.length ? worn : earned.sort((a,b) => rarity[b]-rarity[a]).slice(0,3)
}

export function nextTarget(id: number, value: number|null) {
  if (value === null) return undefined
  // The parser reports zero for all holdings under 120 days.
  if (id === 0 && !value) return undefined
  const thresholds = id === 0 ? [120,180,270,365] : id === 6 ? [1,5,10,20] : []
  return thresholds.find(target => target > value)
}

export function bagholder(values: (number|null)[]) {
  const [days,loss,dips] = values
  if (days == null || loss == null || dips == null) return undefined
  return Number(loss < 0) + Number(dips > 0) + Number(days >= 180) + Number(days >= 270)
}
