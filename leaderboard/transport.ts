import type { Entry } from './contract.js'
export interface Row { rank: number; nickname: string; returnBps: number; asOf: string }
async function request(params: URLSearchParams | null, init: RequestInit) {
  const response = await fetch('/api/leaderboard' + (params ? '?' + params.toString() : ''), {
    ...init, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw Error(String(response.status))
  return response.json()
}
export const boardApi = {
  submit: (entry: Entry): Promise<{status: string}> => request(null, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(entry),
  }),
  read: (year: number, division: string): Promise<{rows: Row[]}> =>
    request(new URLSearchParams({year: String(year), division}), { method: 'GET' }),
  withdraw: (year: number, secret: string): Promise<unknown> => request(new URLSearchParams({year: String(year)}), {
    method: 'DELETE', headers: {Authorization: 'Bearer ' + secret},
  }),
}
