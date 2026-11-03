import './board.css'
import {useRef, useState} from 'react'
import type {Locale, PortfolioReport} from '../src/types'
import {local} from '../src/data/medals'
import {t} from '../src/i18n'
import type {DivisionKey} from '../src/lib/season'
import {boardApi, type Row} from './transport'
import {project} from './projection'
import {divisions, expiresAt} from './contract.js'

interface Props { report: PortfolioReport; locale: Locale; worn: number[] }
export function Board(props: Props) {
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState('')
  function toggle() {
    if (!secret) setSecret(Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''))
    setOpen(!open)
  }
  return <section className="panel closed-board">
    <button type="button" aria-expanded={open} onClick={toggle}>
      {local('内测自报榜|內測自報榜|Closed beta leaderboard', props.locale)}
    </button>
    {open && <Enrollment {...props} secret={secret}/>}
  </section>
}
function Enrollment({report, locale, worn, secret}: Props & {secret: string}) {
  const tr = (s: string) => local(s, locale)
  const entry = project(report, worn, secret)
  const [consent, setConsent] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sent, setSent] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [division, setDivision] = useState(entry?.division ?? divisions[0])
  const [year, setYear] = useState(new Date().getUTCFullYear())
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [status, setStatus] = useState('')
  const receiptText = entry ? entry.year + '.' + secret : ''
  async function act(task: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setStatus('')
    try { await task() }
    catch { setStatus(tr('请求未能确认。可用撤回码撤回，再自行重试。|請求未能確認。可用撤回碼撤回，再自行重試。|Request unconfirmed. You can withdraw with your receipt before retrying.')) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div>
    <h2>{tr('自报成绩 · 未验证|自報成績 · 未驗證|Self-reported · Unverified')}</h2>
    {entry ? <>
      <p>{tr('以下八项将提交给内测榜。分组会透露资产区间。至少十条已通过记录才显示分组。|以下八項將提交至內測榜。分組會透露資產區間。至少十筆通過紀錄才顯示分組。|These eight fields go to the private beta. Your division reveals an asset range. A group is visible at ten accepted entries.')}</p>
      <pre aria-label={tr('提交预览|提交預覽|Submission preview')}>{JSON.stringify(entry, null, 2)}</pre>
      <p>{tr('删除日期（UTC）|刪除日期（UTC）|Deletion date (UTC)')} · {new Date(expiresAt(entry.year)*1000).toISOString().slice(0,10)}</p>
      <a download="pnl-arena-withdrawal.txt" href={'data:text/plain;charset=utf-8,'+encodeURIComponent(receiptText)}
        onClick={() => setSaved(true)}>{tr('保存本机撤回码|儲存本機撤回碼|Save withdrawal receipt')}</a>
      <label><input type="checkbox" checked={consent} disabled={sent || busy} onChange={e => setConsent(e.target.checked)}/>
        {tr('我已保存撤回码，同意向封闭内测榜提交以上八项。|我已儲存撤回碼，同意向封閉內測榜提交以上八項。|I saved my receipt and consent to submitting these eight fields to the closed beta.')}</label>
      <button type="button" disabled={!saved || !consent || sent || busy} onClick={() => act(async () => {
        const result = await boardApi.submit(entry)
        setSent(true)
        setStatus(result.status === 'pending' ? tr('等待人工复核。|等待人工覆核。|Awaiting manual review.') : tr('已提交。|已提交。|Submitted.'))
      })}>{tr('提交一次|提交一次|Submit entry')}</button>
    </> : <p>{tr('参赛需本年度可计算收益率及分组的本地年初至今报表。|參賽需本年度可計算報酬率及分組的本機年初至今報表。|Enter with a local year-to-date report with an eligible return and division.')}</p>}
    <h3>{tr('查看分组|查看分組|View a group')}</h3>
    <label>{tr('自然年|自然年|Season year')} <input type="number" min="2026" value={year} onChange={e=>{setYear(Number(e.target.value));setRows(null)}} disabled={busy}/></label>
    <label>{tr('分组|分組|Division')} <select value={division} onChange={e=>{setDivision(e.target.value);setRows(null)}} disabled={busy}>
      {divisions.map(d=><option key={d} value={d}>{t(locale,d as DivisionKey)}</option>)}</select></label>
    <button type="button" disabled={busy} onClick={()=>act(async()=>setRows((await boardApi.read(year,division)).rows))}>{tr('读取内测榜|讀取內測榜|Load beta standings')}</button>
    {rows && (rows.length ? <ol>{rows.map(row=><li key={row.rank+'-'+row.nickname+'-'+row.asOf}>{row.rank}. {row.nickname} · {(row.returnBps/100).toFixed(2)}% · {row.asOf}</li>)}</ol>
      : <p>{tr('本组尚未展示。|本組尚未顯示。|This group is not displayed yet.')}</p>)}
    <h3>{tr('撤回成绩|撤回成績|Withdraw an entry')}</h3>
    <label>{tr('本机撤回码|本機撤回碼|Withdrawal receipt')} <input type="password" autoComplete="off" value={receipt} onChange={e=>setReceipt(e.target.value.trim())}/></label>
    <button type="button" disabled={busy || !/^\d{4}\.[a-f0-9]{64}$/.test(receipt)} onClick={()=>act(async()=>{
      const [season, key] = receipt.split('.')
      await boardApi.withdraw(Number(season),key)
      setRows(null);setReceipt('');setStatus(tr('撤回请求已处理。|撤回請求已處理。|Withdrawal processed.'))
    })}>{tr('撤回|撤回|Withdraw')}</button>
    <p role="status">{status}</p>
    <small>{tr('非投资建议|非投資建議|Not investment advice')}</small>
  </div>
}
