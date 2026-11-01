import { parseNumber, sumExactNumbers } from './csv'
export const hotTickers: Record<number, readonly (readonly string[])[]> = {
  2026: [
    ['GME', 'AMC'],
    ['SPCX'],
    ['NVDA', 'AMD', 'AVGO', 'TSM', 'MU', 'INTC'],
    ['KO', 'BRK.B', 'JNJ', 'PG'],
  ],
}
// null = insufficient evidence; zero = rule evaluated, not earned.
export type MedalValues = (number | null)[]
type Row = Record<string, string>
const columns: Record<string, string[]> = {
  Trades: [
    'DataDiscriminator',
    'Asset Category',
    'Symbol',
    'Date/Time',
    'Quantity',
    'T. Price',
    'Comm/Fee',
    'Realized P/L',
    'Code',
    'Currency',
  ],
  'Open Positions': ['Symbol', 'Quantity'],
  Dividends: ['Date', 'Description', 'Amount', 'Currency'],
  Fees: ['Amount', 'Currency'],
}
export function medalIndex() {
  const headers = new Map<string, Map<string, number>>()
  const data = new Map<string, Row[]>()
  const bad = new Set<string>()
  function visit(row: string[]) {
    const [section, kind] = row
    if (!Object.hasOwn(columns, section)) return
    if (kind === 'Header') {
      const fields = new Map<string, number>()
      row.forEach((k, i) => {
        if (columns[section].includes(k)) {
          if (fields.has(k)) bad.add(section)
          fields.set(k, i)
        }
      })
      headers.set(section, fields)
      if (!data.has(section)) data.set(section, [])
    } else if (kind === 'Data' && !bad.has(section)) {
      const fields = headers.get(section),
        rows = data.get(section)
      if (!fields || !rows) {
        bad.add(section)
        return
      }
      if (section === 'Trades') {
        const i = fields.get('DataDiscriminator')
        if (i == null || !row[i]) {
          bad.add(section)
          return
        }
        if (row[i] !== 'Order') return
      }
      const obj: Row = {}
      for (const [key, i] of fields) obj[key] = row[i] ?? ''
      rows.push(obj)
    }
  }
  return {
    visit,
    finish(end: string, currency: string) {
      const rows = (s: string) => (bad.has(s) ? undefined : data.get(s))
      return evaluateMedals(
        rows('Trades'),
        rows('Open Positions'),
        rows('Dividends'),
        rows('Fees'),
        end,
        currency,
      )
    },
  }
}
const option =
  /^(\S+)\s+(\d\d)(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d\d)\s+[\d.]+\s+[CP]$/i
const months = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
const dayMs = 86400000
function dateMs(s: string) {
  const n = Date.parse(s + 'T00:00:00Z')
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s
    ? n
    : NaN
}
const easternHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  hourCycle: 'h23',
})
export function evaluateMedals(
  trades: Row[] | undefined,
  positions: Row[] | undefined,
  dividends: Row[] | undefined,
  fees: Row[] | undefined,
  end: string,
  currency: string,
): MedalValues {
  const result: MedalValues = Array(18).fill(null)
  const year = Number(end.slice(0, 4))
  result[13] = +(year === 2026)
  const complete = (rs: Row[] | undefined, ...keys: string[]) =>
    rs && rs.every((r) => keys.every((k) => r[k]?.trim()))
  const numeric = (rs: Row[] | undefined, key: string) =>
    rs && rs.every((r) => parseNumber(r[key]) != null)
  const inBase = (r: Row) => !r.Currency || r.Currency === currency
  if (dividends && numeric(dividends, 'Amount') && dividends.every(inBase)) {
    const total = sumExactNumbers(dividends.map((r) => parseNumber(r.Amount)!))
    const tickers = dividends.filter(r=>parseNumber(r.Amount)!>0).map(
      (r) => r.Description?.match(/^([A-Z][A-Z0-9.-]*)(?=\s|\()/)?.[1],
    )
    result[6] =
      total == null
        ? null
        : total <= 0
          ? 0
          : tickers.every(Boolean)
            ? new Set(tickers).size
            : null
  }
  if (!trades) return result
  if (
    fees &&
    numeric(trades, 'Comm/Fee') &&
    numeric(fees, 'Amount') &&
    trades.every(inBase) &&
    fees.every(inBase)
  )
    result[7] =
      sumExactNumbers([
        ...trades.map((r) => Math.abs(parseNumber(r['Comm/Fee'])!)),
        ...fees.map((r) => Math.abs(parseNumber(r.Amount)!)),
      ]) ?? null
  const code = (r: Row, k: string) =>
    r.Code?.split(';')
      .map((c) => c.trim())
      .includes(k)
  const timed = (r: Row) =>
    /^\d{4}-\d\d-\d\d[, T]+(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(
      r['Date/Time'],
    ) && Number.isFinite(dateMs(r['Date/Time'].slice(0, 10)))
  trades=trades.filter(r=>!timed(r) || (r['Date/Time'].startsWith(year+'-') && r['Date/Time'].slice(0,10)<=end))
  const stamp=(r:Row)=> (r['Date/Time']??'').replace(/[, T]+/,'T')
  const ordered = [...trades].sort((a,b)=>stamp(a).localeCompare(stamp(b)))
  const closes = trades.filter((r) => code(r, 'C'))
  if (complete(trades, 'Code')) {
    result[5] = +trades.some((r) => code(r, 'A'))
    if (numeric(closes, 'Realized P/L') && closes.every(inBase)) {
      const values = closes.map((r) => parseNumber(r['Realized P/L'])!)
      result[1] = values.reduce((min, n) => Math.min(min, n), 0)
      const outcomes = values.filter((n) => n !== 0)
      const wins = outcomes.filter((n) => n > 0).length
      result[8] = +(
        closes.length >= 20 &&
        outcomes.length > 0 &&
        10 * wins < 3 * outcomes.length
      )
      result[9] = +(
        closes.length >= 20 &&
        outcomes.length > 0 &&
        10 * wins >= 7 * outcomes.length
      )
    }
  }
  if (
    complete(trades, 'Symbol', 'Code') &&
    numeric(trades, 'Quantity') &&
    trades.every(timed)
  ) {
    const buys = ordered.filter(
      (r) => code(r, 'O') && parseNumber(r.Quantity)! > 0,
    )
    const closed = new Set(closes.map((r) => r.Symbol))
    if (
      positions &&
      complete(positions, 'Symbol') &&
      numeric(positions, 'Quantity')
    ) {
      const held = new Set(
        positions
          .filter((r) => parseNumber(r.Quantity) !== 0)
          .map((r) => r.Symbol),
      )
      const days = buys.reduce(
        (max, r) =>
          held.has(r.Symbol) && !closed.has(r.Symbol)
            ? Math.max(
                max,
                (dateMs(end) - dateMs(r['Date/Time'].slice(0, 10))) / dayMs,
              )
            : max,
        0,
      )
      result[0] = days >= 120 ? days : 0
    }
    if (numeric(buys, 'T. Price')) {
      const last = new Map<string, number>(),
        dips = new Map<string, number>()
      for (const r of buys) {
        const price = parseNumber(r['T. Price'])!
        if (price < (last.get(r.Symbol) ?? -Infinity))
          dips.set(r.Symbol, (dips.get(r.Symbol) ?? 0) + 1)
        last.set(r.Symbol, price)
      }
      result[2] = +[...dips.values()].some((n) => n >= 3)
    }
  }
  if (complete(trades, 'Symbol','Code','Asset Category') && trades.every(timed)) {
      const sold = new Set<string>()
      let theta = false,
        near = false,
        unknown = false
      for (const r of ordered.filter((r) =>
        /option/i.test(r['Asset Category']),
      )) {
        if (code(r, 'Ep') && sold.has(r.Symbol)) theta = true
        if (!code(r, 'O')) continue
        if (parseNumber(r.Quantity)! < 0) sold.add(r.Symbol)
        const m = r.Symbol.match(option)
        const expires = m
          ? dateMs(
              '20' +
                m[4] +
                '-' +
                String(months.indexOf(m[3].toUpperCase()) + 1).padStart(
                  2,
                  '0',
                ) +
                '-' +
                m[2],
            )
          : NaN
        const days = (expires - dateMs(r['Date/Time'].slice(0, 10))) / dayMs
        if (!Number.isFinite(days)) unknown = true
        if (days >= 0 && days <= 1) near = true
      }
      result[3] = theta ? 1 : numeric(ordered.filter(r => code(r,'O') && /option/i.test(r['Asset Category'])),'Quantity') ? 0 : null
      result[4] = near ? 1 : unknown ? null : 0
  }
  if (trades.every(timed)) {
    const offsets = new Map<string, number>()
    result[10] = +trades.some((r) => {
      const stamp = r['Date/Time'],
        date = stamp.slice(0, 10)
      // Beijing midnight–04:59 corresponds to midday in New York, after any DST transition.
      if (!offsets.has(date))
        offsets.set(
          date,
          20 - Number(easternHour.format(dateMs(date) + 12 * 3600000)),
        )
      return (Number(stamp.slice(-8, -6)) + offsets.get(date)!) % 24 < 5
    })
    if (numeric(trades, 'Realized P/L') && trades.every(inBase)) {
      const daily = new Map<string, number[]>()
      for (const r of ordered) {
        const d = r['Date/Time'].slice(0, 10)
        if (!daily.has(d)) daily.set(d, [])
        daily.get(d)!.push(parseNumber(r['Realized P/L'])!)
      }
      let high = 0,
        low = 0
      result[11] = result[12] = 0
      for (const [d, nums] of daily) {
        const n = sumExactNumbers(nums)
        if (n == null) {
          result[11] = result[12] = null
          break
        }
        if (n > high) {
          high = n
          result[11] = Number(d.replaceAll('-', ''))
        }
        if (n < low) {
          low = n
          result[12] = Number(d.replaceAll('-', ''))
        }
      }
    }
  }
  if (complete(trades, 'Symbol') && hotTickers[year]) {
    const symbols = new Set(
      trades.map((r) => r.Symbol.match(option)?.[1] ?? r.Symbol),
    )
    hotTickers[year].forEach((group, i) => {
      result[14 + i] = group.reduce(
        (mask, s, j) => (symbols.has(s) ? mask | (1 << j) : mask),
        0,
      )
    })
  }
  return result
}
export function validMedalValues(v: unknown): v is MedalValues {
  return (
    Array.isArray(v) &&
    v.length === 18 &&
    v.every(
      (n, i) =>
        n === null ||
        (typeof n === 'number' &&
          Number.isFinite(n) &&
          Math.abs(n) <= Number.MAX_SAFE_INTEGER &&
          (i === 1
            ? n <= 0
            : i === 7
              ? n >= 0
              : i === 0
                ? Number.isInteger(n) && (n === 0 || (n >= 120 && n <= 366))
                : i === 6
                  ? Number.isInteger(n) && n >= 0
                  : i === 11 || i === 12
                    ? n === 0 ||
                      (/^\d{8}$/.test(String(n)) &&
                        Number.isFinite(
                          dateMs(
                            String(n).replace(
                              /^(\d{4})(\d\d)(\d\d)$/,
                              '$1-$2-$3',
                            ),
                          ),
                        ))
                    : i >= 14
                      ? Number.isInteger(n) &&
                        n >= 0 &&
                        n < 2 ** hotTickers[2026][i - 14].length
                      : n === 0 || n === 1)),
    )
  )
}
