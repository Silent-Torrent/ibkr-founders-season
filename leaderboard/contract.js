// This list is the entire submission schema. Keep parsing and report objects outside this boundary.
export const fields = ['id', 'nickname', 'year', 'asOf', 'division', 'returnBps', 'medals', 'source']
export const divisions = ['rookieLeague', 'retailLeague', 'sixFigureLeague', 'capitalLeague', 'whaleLeague']
export const medalCount = 18
export const nicknameFor = id => 'Player-' + id.slice(0, 8)
export const expiresAt = year => Date.UTC(year + 1, 0, 1) / 1000 + 90 * 86400

export function accepts(entry, today) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.keys(entry).length !== fields.length || !fields.every(key => Object.hasOwn(entry, key))) return false
  const { id, nickname, year, asOf, division, returnBps, medals, source } = entry
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id) || nickname !== nicknameFor(id)) return false
  if (!Number.isInteger(year) || year !== today.getUTCFullYear() || typeof asOf !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number(asOf.slice(0, 4)) !== year) return false
  const date = new Date(asOf + 'T00:00:00Z')
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === asOf && date <= today &&
    divisions.includes(division) && Number.isSafeInteger(returnBps) && source === 'self-reported' &&
    Array.isArray(medals) && medals.length <= 3 && new Set(medals).size === medals.length &&
    medals.every(id => Number.isInteger(id) && id >= 0 && id < medalCount)
}
