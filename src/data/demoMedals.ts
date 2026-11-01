import { evaluateMedals } from '../lib/medalRules'

// Invented orders and payouts behind the built-in demo, in USD.
const order = (symbol: string, date: string, fee: number, code: string, option = false) => ({
  Symbol: symbol, 'Date/Time': date + ' 09:30:00', 'Comm/Fee': String(fee),
  'Asset Category': option ? 'Equity and Index Options' : 'Stocks',
  Code: code, Quantity: '1', 'T. Price': '12', 'Realized P/L': '0',
})
export const demoMedalValues = evaluateMedals(
  [order('NVDA','2026-01-05',-12,'O'), order('SPY 21AUG26 500 C','2026-08-20',-20,'O',true),
   order('NVDA 21AUG26 100 P','2026-08-21',-12,'A',true)],
  [{Symbol:'NVDA',Quantity:'10'}],
  Array.from({length:10},(_,i)=>({Description:'PAY'+i+'(DEMO) Cash Dividend',Date:'2026-06-01',Amount:'2'})),
  [{Amount:'-100'}], '2026-08-27','USD',
)
