// Per-season hashes have one fixed expiry, independent of the last write.
// A field starts with a: (approved) or p: (pending). Both count toward the beta capacity.
export const mutate = `
local id, action = ARGV[1], ARGV[2]
local active, pending = 'a:' .. id, 'p:' .. id
if action == 'withdraw' then
  redis.call('HDEL', KEYS[1], active, pending)
  return 'withdrawn'
end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'paused' end
local previous = redis.call('HGET', KEYS[1], active) or redis.call('HGET', KEYS[1], pending)
if previous then
  if previous ~= ARGV[3] then return 'conflict' end
  return redis.call('HEXISTS', KEYS[1], active) == 1 and 'listed' or 'pending'
end
if redis.call('HLEN', KEYS[1]) >= 500 then return 'full' end
if action == 'pending' then
  local count = 0
  for _, field in ipairs(redis.call('HKEYS', KEYS[1])) do
    if string.sub(field, 1, 2) == 'p:' then count = count + 1 end
  end
  if count >= 200 then return 'full' end
end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 10 then return 'daily' end
redis.call('INCR', KEYS[3])
redis.call('EXPIREAT', KEYS[3], ARGV[5])
redis.call('HSET', KEYS[1], action == 'pending' and pending or active, ARGV[3])
redis.call('EXPIREAT', KEYS[1], ARGV[4])
return action
`
export const rate = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return n
`
// Operator-only operation via the database console. The existing field keeps the season TTL alive.
export const moderate = `
local value = redis.call('HGET', KEYS[1], 'p:' .. ARGV[1])
if not value then return 0 end
if ARGV[2] == 'approve' then redis.call('HSET', KEYS[1], 'a:' .. ARGV[1], value)
elseif ARGV[2] ~= 'reject' then return 0 end
return redis.call('HDEL', KEYS[1], 'p:' .. ARGV[1])
`

export function publicRows(hash, division) {
  const entries = []
  for (let i = 0; i < hash.length; i += 2) {
    if (!hash[i].startsWith('a:')) continue
    const entry = JSON.parse(hash[i + 1])
    if (entry.division === division) entries.push(entry)
  }
  if (entries.length < 10) return []
  entries.sort((a, b) => b.returnBps - a.returnBps || a.id.localeCompare(b.id))
  let rank = 0
  return entries.map((entry, index) => {
    if (!index || entries[index - 1].returnBps !== entry.returnBps) rank = index + 1
    return { rank, nickname: entry.nickname, returnBps: entry.returnBps, asOf: entry.asOf }
  })
}

export async function redis(command) {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') ||
      !process.env.UPSTASH_REDIS_REST_TOKEN) throw Error('Storage unavailable')
  const response = await fetch(url.origin, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4000),
    headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!response.ok) throw Error('Storage unavailable')
  const reply = await response.json()
  if (reply.error) throw Error('Storage unavailable')
  return reply.result
}
