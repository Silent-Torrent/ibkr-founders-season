export interface Entry {
  id: string
  nickname: string
  year: number
  asOf: string
  division: string
  returnBps: number
  medals: number[]
  source: 'self-reported'
}
export function accepts(entry: unknown, today: Date): entry is Entry
export function nicknameFor(id: string): string
export const divisions: readonly string[]
export const fields: readonly string[]
export const medalCount: number
export function expiresAt(year: number): number
