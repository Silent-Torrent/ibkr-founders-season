import { getDivision } from '../src/lib/season'
import { displayedMedals } from '../src/lib/medalCollection'
import { sha256Hex } from '../src/lib/sha256'
import type { PortfolioReport } from '../src/types'
import { accepts, nicknameFor, type Entry } from './contract.js'

export function project(report: PortfolioReport, selected: number[], secret: string, today = new Date()): Entry | undefined {
  if (report.source !== 'local' || !report.isYtd || report.dataQuality === 'error' ||
      report.seasonReturn == null || report.parserFacts.seasonReturnConflict) return
  const division = getDivision(report.netLiquidationValue, report.baseCurrency)
  if (!division) return
  const id = sha256Hex(secret).slice(0, 32)
  const entry: Entry = {
    id, nickname: nicknameFor(id), year: report.seasonYear, asOf: report.endDate, division,
    returnBps: Math.round(report.seasonReturn * 10000),
    medals: displayedMedals(report.medalValues ?? [], selected), source: 'self-reported',
  }
  if (accepts(entry, today)) return entry
}
