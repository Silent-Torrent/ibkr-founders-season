import { createHash, createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { accepts, divisions, expiresAt, fields } from '../leaderboard/contract.js'
import { mutate, publicRows, rate, redis } from '../server/store.js'

export function handle(command = redis, env = process.env, now = () => new Date()) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Vary', 'Origin')
    const send = (status, body) => res.status(status).json(body)
    const origin = env.LEADERBOARD_ORIGIN
    const method = req.method
    try {
      if (!origin || env.LEADERBOARD_BETA !== 'enabled' || !env.LEADERBOARD_RATE_SECRET ||
          env.LEADERBOARD_RATE_SECRET.length < 32) return send(503, { error: 'closed' })
      if (new URL(origin).protocol !== 'https:' || req.headers.host !== new URL(origin).host ||
          (method !== 'GET' && req.headers.origin !== origin) ||
          (req.headers.origin && req.headers.origin !== origin)) return send(403, { error: 'origin' })
      res.setHeader('Access-Control-Allow-Origin', origin)
      if (!['POST', 'GET', 'DELETE'].includes(method)) return send(405, { error: 'method' })
      if (method === 'POST' && env.LEADERBOARD_WRITES !== 'enabled') return send(503, { error: 'paused' })
      const ip = req.headers['x-vercel-forwarded-for']
      if (typeof ip !== 'string' || !isIP(ip)) return send(403, { error: 'origin' })
      const today = now()
      const bucket = createHmac('sha256', env.LEADERBOARD_RATE_SECRET)
        .update(today.toISOString().slice(0, 10) + '|' + ip).digest('hex')
      const count = await command(['EVAL', rate, 1, 'lb:rate:' + method + ':' + bucket])
      if (count > (method === 'POST' ? 5 : 30)) return send(429, { error: 'rate' })
      const query = new URL(req.url, origin).searchParams
      if (method === 'POST') {
        if (query.size || req.headers['content-type']?.split(';')[0] !== 'application/json')
          return send(400, { error: 'schema' })
        const payload = req.body
        if (Number(req.headers['content-length']) > 1024 || Buffer.byteLength(JSON.stringify(payload) ?? '') > 1024)
          return send(413, { error: 'size' })
        if (!accepts(payload, today)) return send(400, { error: 'schema' })
        const entry = Object.fromEntries(fields.map(key => [key, payload[key]]))
        const state = env.LEADERBOARD_AUTO_LIST === 'enabled' && Math.abs(entry.returnBps) <= 10000
          ? 'listed' : 'pending'
        const endOfDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1) / 1000
        const result = await command(['EVAL', mutate, 3, 'lb:' + entry.year, 'lb:stop', 'lb:daily:' + bucket,
          entry.id, state, JSON.stringify(entry), expiresAt(entry.year), endOfDay])
        return send(({ paused: 503, full: 503, daily: 429, conflict: 409 })[result] ?? 200, { status: result })
      }
      const year = Number(query.get('year'))
      if (!Number.isInteger(year) || year < 2026 || year > today.getUTCFullYear() ||
          today.valueOf() >= expiresAt(year) * 1000) return send(400, { error: 'year' })
      if (method === 'DELETE') {
        const key = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '')?.[1]
        if (!key || query.size !== 1) return send(400, { error: 'receipt' })
        const id = createHash('sha256').update(key).digest('hex').slice(0, 32)
        await command(['EVAL', mutate, 2, 'lb:' + year, 'lb:stop', id, 'withdraw'])
        return send(200, { status: 'withdrawn' })
      }
      const division = query.get('division')
      if (query.size !== 2 || !divisions.includes(division)) return send(400, { error: 'group' })
      return send(200, { rows: publicRows(await command(['HGETALL', 'lb:' + year]), division) })
    } catch {
      return send(503, { error: 'unavailable' })
    }
  }
}
export default handle()
