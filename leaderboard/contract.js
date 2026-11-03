// This list is the entire submission schema. Keep parsing and report objects outside this boundary.
export const fields = ['id', 'nickname', 'year', 'asOf', 'division', 'returnBps', 'medals', 'source']
export const divisions = ['rookieLeague', 'retailLeague', 'sixFigureLeague', 'capitalLeague', 'whaleLeague']
export const medalCount = 18
export const MAX_RETURN_BPS = 100_000_000
const nicknames = [
  ['韭菜', '韭菜', 'Chive'], ['老登', '老登', 'Old Timer'],
  ['牛魔王', '牛魔王', 'Bull King'], ['熊大', '熊大', 'Big Bear'],
  ['梭哈侠', '梭哈俠', 'All-In Ace'], ['抄底王', '抄底王', 'Dip Hunter'],
]

export function nicknameFor(id) {
  const word = parseInt(id.slice(0, 8), 16) % nicknames.length
  const digits = parseInt(id.slice(8, 16), 16) % 10000
  return nicknames[word][0] + '-' + String(digits).padStart(4, '0')
}

// Keep the wire nickname identical across locales and translate it only for display.
export function displayNickname(nickname, locale) {
  const [word, digits] = nickname.split('-')
  const labels = nicknames.find(([canonical]) => canonical === word)
  if (!labels || !/^\d{4}$/.test(digits)) return nickname
  return labels[locale === 'en' ? 2 : locale === 'zh-TW' ? 1 : 0] + '-' + digits
}
export const expiresAt = year => Date.UTC(year + 1, 3, 1) / 1000

export function accepts(entry, today) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.keys(entry).length !== fields.length || !fields.every(key => Object.hasOwn(entry, key))) return false
  const { id, nickname, year, asOf, division, returnBps, medals, source } = entry
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id) || nickname !== nicknameFor(id)) return false
  if (!Number.isInteger(year) || year !== today.getUTCFullYear() || typeof asOf !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number(asOf.slice(0, 4)) !== year) return false
  const date = new Date(asOf + 'T00:00:00Z')
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === asOf && date <= today &&
    divisions.includes(division) && Number.isSafeInteger(returnBps) &&
    returnBps >= -10000 && returnBps <= MAX_RETURN_BPS && source === 'self-reported' &&
    Array.isArray(medals) && medals.length <= 3 && new Set(medals).size === medals.length &&
    medals.every(id => Number.isInteger(id) && id >= 0 && id < medalCount)
}
