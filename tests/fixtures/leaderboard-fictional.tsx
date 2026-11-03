// 虚构数据. Browser harness only, excluded from production builds.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {Board} from '../../leaderboard/Board'
import {demoReport} from '../../src/data/demo'
import type {Locale} from '../../src/types'
import '../../src/styles.css'

const locale = new URLSearchParams(location.search).get('locale') as Locale
const now = new Date()
const report = {...demoReport, source:'local' as const, seasonYear:now.getUTCFullYear(),
  endDate:now.toISOString().slice(0,10), accountIdMasked:'FICTIONAL-NEVER-SEND', seasonReturn:.042}
createRoot(document.getElementById('root')!).render(<Board report={report} worn={[1]} locale={locale}/>)
