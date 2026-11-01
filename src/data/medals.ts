import type { Locale } from '../types'
export const tr = (l: Locale, cn: string, tw: string, en: string) =>
  l === 'en' ? en : l === 'zh-CN' ? cn : tw
export const advice = (l: Locale) =>
  tr(l, '非投资建议', '非投資建議', 'Not investment advice')
export const insufficient = (l: Locale) =>
  tr(l, '数据不足', '資料不足', 'Insufficient data')
export const medals = [
  [
    '钻石手|鑽石手|Diamond Hands',
    '持有满120/180/270天，本季买入未平仓且期末仍持有。|持有滿120/180/270天，本季買進後未平倉且期末仍持有。|Hold for 120/180/270 days with a season buy, no close and an open position.',
    '手比钻石硬，心比账户稳——也可能是忘了密码。|比鑽石還硬，也可能只是忘了密碼。|Unshakeable conviction. Or a lost password.',
    '耐心是最稀缺的超能力。|耐心是難能可貴的超能力。|Patience is a rare edge.',
  ],
  [
    '割肉侠|割肉俠|Stop-Loss Samurai',
    '至少一次亏损平仓。|至少一次虧損平倉。|Close at least one position at a loss.',
    '壮士断腕，明天又是一条好汉。|忍痛停損，明天重新出發。|That exit stung. The ledger lives on.',
    '会止损的人才能活到下一季。|懂得停損，留力走下一季。|You made room for another season.',
  ],
  [
    '补仓达人|補倉達人|Average-Down Addict',
    '同一合约至少三次以更低价格开仓买入。|同一標的至少三次以更低價格買進開倉。|Three lower-priced opening buys versus the preceding opening buy in the same symbol.',
    '越跌越买，主打一个信仰。|越跌越買，信念很足。|Your conviction came with a refill button.',
    '你对自己的判断很有信心。|你對自己的判斷很有信心。|You stuck with your thesis.',
  ],
  [
    'Theta 收租人|Theta 收租人|Theta Landlord',
    '卖出开仓后同一期权出现 Ep。|賣出開倉後同一選擇權出現 Ep。|An expiry follows a short opening in the same option.',
    '别人买彩票，你卖彩票。|別人買彩券，你賣彩券。|Everyone bought a ticket. You ran the booth.',
    '时间站在你这边。|時間站在你這邊。|Time worked in your favor.',
  ],
  [
    '末日轮骑士|末日輪騎士|0DTE Knight',
    '距离到期0或1天开仓。|距到期零或一天開倉。|Open an option on expiry day or the preceding day.',
    '到期日就是你的主场，心脏还好吗？|到期日是你的主場，心跳還好嗎？|A very short lease on that option.',
    '胆大心细，记得控制仓位。|膽大心細，留意部位大小。|A short clock calls for careful sizing.',
  ],
  [
    '被动上车|被動上車|Assigned Passenger',
    '成交代码含 A。|成交代碼含 A。|An order carries the assignment code A.',
    '不是我想上车，是车把我拉上来的。|不是想上車，是車把我載走了。|You did not board. The bus collected you.',
    '规则吃透了，下次更从容。|熟悉規則，下次更從容。|One more contract mechanic understood.',
  ],
  [
    '股息躺赚|股利躺賺|Dividend Napper',
    '净股息为正，按1/5/10个派息标的分档。|淨股利為正，按1/5/10檔配息標的分級。|Positive net dividends from 1/5/10 distinct payers.',
    '睡觉也有钱进账，标准的躺平韭菜。|睡著也有股利入帳，躺平有理。|Your pillow worked the dividend desk.',
    '现金流就是底气。|現金流就是底氣。|Cash flow speaks for itself.',
  ],
  [
    "券商年度VIP|券商年度VIP|Broker's MVP",
    '佣金及费用绝对值合计大于零。|佣金與費用絕對值合計大於零。|Absolute commissions plus fees exceed zero.',
    '券商年终奖有你一份。|券商年終獎金有你一份。|Your broker sends holiday greetings.',
    '交易成本心里有数就好。|交易成本，心裡有數就好。|Knowing your costs counts.',
  ],
  [
    '人肉反指|人肉反指|Human Contrarian Indicator',
    '平仓至少20笔，非零平仓胜率低于30%。|至少20筆平倉，非零損益勝率低於30%。|At least 20 closes and under 30% wins among nonzero closes.',
    '建议朋友反着看——开玩笑的。|朋友說要反著看，開玩笑啦。|Your friends have jokes. The ledger has receipts.',
    '输得起，才学得快。|願意復盤，學得更快。|There is something to learn in the misses.',
  ],
  [
    '常胜将军|常勝將軍|Steady Winner',
    '平仓至少20笔，非零平仓胜率至少70%。|至少20筆平倉，非零損益勝率達70%。|At least 20 closes and at least 70% wins among nonzero closes.',
    '低调，别让券商知道。|低調點，別讓券商知道。|Quiet. The broker might hear.',
    '稳定比暴利更难得。|穩定比暴利更難得。|Consistency is hard earned.',
  ],
  [
    '美股夜猫子|美股夜貓子|Night Owl',
    '北京时间00:00至04:59有成交。|北京時間00:00至04:59有成交。|An order lands between midnight and 04:59 Beijing time.',
    '别人睡觉你盯盘，黑眼圈是勋章。|別人睡覺你看盤，黑眼圈就是勳章。|Your screen kept the night shift company.',
    '敬业，但记得睡觉。|認真看盤，也記得睡覺。|A dedicated night owl deserves some sleep.',
  ],
  [
    '吃肉日|吃肉日|Feast Day',
    '最佳美东交易日的已实现盈亏为正。|最佳美東交易日的已實現損益為正。|Best Eastern trading day has positive realized P&L.',
    '那天的肉，记得分点给朋友。|那天的肉，記得分朋友一點。|Save your friends a seat at that feast.',
    '高光时刻，值得纪念。|這一刻，值得紀念。|A day worth bookmarking.',
  ],
  [
    '关灯吃面日|關燈吃麵日|Noodles-in-the-Dark Day',
    '最差美东交易日的已实现盈亏为负。|最差美東交易日的已實現損益為負。|Worst Eastern trading day has negative realized P&L.',
    '那天的面，没开灯。|那天吃麵，沒開燈。|Dinner was noodles. Lighting was optional.',
    '熬过最难的一天了。|最難熬的那天過去了。|You made it through a rough day.',
  ],
  [
    '创始赛季|創始賽季|Founders Season 2026',
    '导入2026赛季报表。|匯入2026賽季報表。|Import a statement for the 2026 season.',
    'Founders 限定，2027 起绝版。|創始限定，2027 起絕版。|Class of 2026. One season only.',
    'Founders 限定，2027 起绝版。|創始限定，2027 起絕版。|Class of 2026. One season only.',
  ],
  [
    'Meme 股老兵|Meme 股老兵|Meme Stock Veteran',
    '本季成交记录里出现过游戏驿站或 AMC 院线的股票或期权。|本季成交紀錄裡有過 GameStop 或 AMC 電影院的股票或選擇權。|A GameStop or AMC Entertainment share or option trade appears on your season statement.',
    '别人存梗图，你存成交回单。|別人收藏迷因圖，你收藏成交單。|Everyone saved the meme. You kept the receipt.',
    '这段网络往事，你有自己的票根。|這段網路往事，你留了一張票根。|Your ledger doubles as a little piece of internet history.',
  ],
  [
    '火星船票|火星船票|Mars Ticket',
    '本季有过SpaceX的股票或期权成交。|本季成交過SpaceX的股票或選擇權。|A share or option trade in SpaceX earns the stamp.',
    '登机牌有了，登机口还在地球。|登機證拿到了，登機門還在地球。|Boarding pass issued. Gate still on Earth.',
    '你的赛季手账多了一枚太空邮戳。|你的賽季手帳多了一枚太空郵戳。|A spaceport stamp for your season scrapbook.',
  ],
  [
    '绊倒体幸存者|絆倒體倖存者|Semiconductor Survivor',
    '本季成交过英伟达、超威、博通、台积电、美光或英特尔的股票或期权。|本季成交過輝達、超微、博通、台積電、美光或英特爾的股票或選擇權。|A share or option trade in Nvidia, Advanced Micro Devices, Broadcom, TSMC, Micron or Intel counts.',
    '芯片越做越薄，你的成交单倒是厚了一页。|晶片越做越薄，你的對帳單倒是厚了一頁。|The chips got thinner. Your statement gained a page.',
    '这一季的芯片故事，你留了一张底片。|這一季的晶片故事，你留了一張底片。|One frame of the chip story, preserved in your ledger.',
  ],
  [
    '老登认证|老登認證|Old-School Certified',
    '本季成交过可口可乐、伯克希尔 B 股、强生或宝洁的股票或对应期权。|本季成交過可口可樂、波克夏 B 股、嬌生或寶僑的股票或對應選擇權。|A share or option trade in Coca-Cola, Berkshire Class B, Johnson & Johnson or Procter & Gamble earns this stamp.',
    '这张成交单，配黑胶唱片刚刚好。|這張成交單，配黑膠唱片剛剛好。|Your trade confirmation looks like it came with liner notes.',
    '给你的赛季相册添了一张复古照。|替你的賽季相簿添了一張復古照。|A vintage print for your season album.',
  ],
]
export function local(s: string, l: Locale) {
  return s.split('|')[l === 'en' ? 2 : l === 'zh-TW' ? 1 : 0]
}
export const lines = [
  [
    '赚了别飘，市场专治各种不服。|賺了別飄，市場專治不服。|The market has a cure for swagger.',
    '肉还没凉，别急着写自传。|肉還沒涼，先別寫自傳。|Finish dinner before writing the memoir.',
    '今天加肉，明天照样看账。|今天加肉，明天照樣對帳。|Steak tonight. Bookkeeping tomorrow.',
  ],
  [
    '这一季的你，值得一顿烤肉。|這一季的你，值得一頓烤肉。|You earned a seat at the grill.',
    '把这次进步记下来。|把這次進步記下來。|Mark the progress you made.',
    '这顿饭吃得踏实。|這頓飯吃得踏實。|Enjoy a well-earned meal.',
  ],
  [
    '老韭菜了，割了还会再长。|老韭菜了，割了還會再長。|The chives have grown back before.',
    '今晚少放一片肉。|今晚少放一片肉。|Tonight the garnish is a budget item.',
    '账本有点辣，面汤刚刚好。|帳本有點辣，麵湯剛剛好。|Spicy ledger. Mild broth.',
  ],
  [
    '亏损是学费，明年见真章。|虧損是學費，下季再驗收。|Take the lesson into next season.',
    '今天复盘，明天再来。|今天復盤，明天再來。|Review today. Start fresh tomorrow.',
    '这一碗吃完，经验留下。|麵吃完，經驗留下。|Keep the lesson after the bowl is empty.',
  ],
]
