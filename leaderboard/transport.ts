import type { Entry } from './contract.js'
const endpoint = '/api/leaderboard'
export interface Row { rank: number; nickname: string; returnBps: number; asOf: string }
async function request(query: string, init: RequestInit) {
  const response = await fetch(endpoint + query, {
    ...init, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw Error(String(response.status))
  return response.json()
}
export const boardApi = {
  submit: (entry: Entry): Promise<{status: string}> => request('', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(entry),
  }),
  read: (year: number, division: string): Promise<{rows: Row[]}> =>
    request('?' + new URLSearchParams({year: String(year), division}), { method: 'GET' }),
  withdraw: (year: number, secret: string): Promise<unknown> => request('?year=' + year, {
    method: 'DELETE', headers: {Authorization: 'Bearer ' + secret},
  }),
}
