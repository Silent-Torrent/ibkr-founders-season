export const thresholds = {
  holdDays:180, fastOrdersPerWeek:5, optionsShare:0.4, dividendShare:0.4,
  recurringMonths:3, concentratedExposure:0.9,
}
export const personalities = [
  ['钻石手型|鑽石手型|Diamond Hands','密码忘了，仓位还在。|密碼忘了，籌碼還在。|Lost the password. Kept the position.','耐心有自己的节奏。|耐心有自己的節奏。|You gave your thesis time.'],
  ['闪电手型|閃電手型|Lightning Hands','账本翻页比日历快。|對帳單翻得比日曆快。|Your ledger needs a faster printer.','这一季节奏鲜明。|這一季節奏鮮明。|Your season had a distinct tempo.'],
  ['收租型|收租型|Premium Landlord','到期日就是收租日。|到期日就是收租日。|Your calendar bills by expiry.','善于观察时间价值。|懂得觀察時間價值。|You paid attention to time value.'],
  ['末日轮型|末日輪型|Expiry Rider','合约保质期比牛奶短。|合約賞味期比牛奶短。|Your options expire before the milk.','到期日历记得清。|到期日曆記得牢。|You knew the expiry calendar.'],
  ['股息躺平型|股息躺平型|Dividend Lounger','到账通知就是闹钟。|入帳通知就是鬧鐘。|Your alarm clock pays dividends.','现金流留下了足迹。|現金流留下足跡。|Income marked the passing months.'],
  ['定投老实人型|定投老實人型|Calendar Regular','月历才是你的基金经理。|月曆才是你的基金經理。|Your portfolio manager is a calendar.','持续投入有迹可循。|持續投入有跡可循。|Consistency left a trail.'],
] as const
