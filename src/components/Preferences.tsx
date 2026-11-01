import { createContext, useContext, useId } from 'react'
import type { Locale } from '../types'
import { defaults, priceFor, type Preferences } from '../lib/cardOptions'
import { tr } from '../data/medals'
export const Settings = createContext({
  prefs: defaults,
  update: (_p: Preferences) => {},
})
export function SettingsPanel({
  locale: l,
  currency: c,
}: {
  locale: Locale
  currency: string
}) {
  const priceHint = useId()
  const { prefs: p, update } = useContext(Settings)
  return (
    <details className="batch-settings">
      <summary>{tr(l, '设置', '設定', 'Settings')}</summary>
      {(
        [
          ['roast', tr(l, '毒舌模式', '毒舌模式', 'Roast mode')],
          [
            'amount',
            tr(
              l,
              '分享卡显示金额',
              '分享卡顯示金額',
              'Show amounts on share cards',
            ),
          ],
          [
            'hideTickers',
            tr(l, '隐藏股票代码', '隱藏股票代碼', 'Hide tickers'),
          ],
        ] as const
      ).map(([k, label]) => (
        <label key={k}>
          <input
            type="checkbox"
            checked={p[k]}
            onChange={(e) => update({ ...p, [k]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <label>
        {tr(l, '涨跌颜色', '漲跌顏色', 'Gain/loss colors')}{' '}
        <select
          value={p.colors}
          onChange={(e) =>
            update({ ...p, colors: e.target.value as Preferences['colors'] })
          }
        >
          {(['auto', 'red', 'green'] as const).map((v, i) => (
            <option key={v} value={v}>
              {
                [
                  tr(l, '随语言', '依語言', 'Language default'),
                  tr(l, '红涨绿跌', '紅漲綠跌', 'Red gains'),
                  tr(l, '绿涨红跌', '綠漲紅跌', 'Green gains'),
                ][i]
              }
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr(l, '每碗拉面价格', '每碗拉麵價格', 'Price per ramen bowl')} ({c}){' '}
        <input
          aria-describedby={priceHint}
          type="number"
          min="0.01"
          step="any"
          key={c + l}
          defaultValue={priceFor(p, l, c) ?? ''}
          onBlur={(e) => {
            const prices = { ...p.prices }
            const n = e.target.valueAsNumber
            if (n > 0 && Number.isFinite(n)) prices[c] = n
            else delete prices[c]
            update({ ...p, prices })
            e.target.value = String(priceFor({ ...p, prices }, l, c) ?? '')
          }}
        />
      </label>
      <small id={priceHint} className="ramen-price-hint">{tr(l,'默认按地区估算，可自行修改。','預設按地區估算，可自行修改。','The default is a regional estimate. You can change it.')}</small>
    </details>
  )
}
