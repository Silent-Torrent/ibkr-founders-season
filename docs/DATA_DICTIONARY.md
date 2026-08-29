# P&L Arena 数据字典与数据边界

> 状态：2026 Founders Season 冻结基线
> 适用范围：当前本地 MVP、静态 Beta，以及未来账号/排行榜的设计约束
> 目的：规定「读取什么、如何计算、可以保存什么、可以公开什么」。本文档不是对任何一份用户报表的真实性背书。

## 1. 不可默认改变的导入合同

1. CSV 是当前产品的**必需主数据源**；PDF 只是**可选的人工/交叉核验材料**。
2. 接受的 CSV 范围仅为：
   - IBKR Activity Statement；
   - 英文；
   - 一个账户；
   - 当前自然年 Year-to-Date，起始日必须为 1 月 1 日；
   - 一个自然年对应一个赛季。
3. 更新的同年 YTD 快照替换旧快照；不累加、不拼接重叠期间。
4. 赛季盈亏的唯一主口径是 IBKR YTD Mark-to-Market P&L。
5. Current Unrealized P&L 仅用于解释，不得再加入 YTD MTM。
6. 入金、出金、转账、账户余额变动不得当作利润。
7. 用户上传文件的结果最高只能是 `reconciled_self_reported`，不能标记为 `verified`。
8. 当前 MVP 没有账号、后端、数据库或真实公开排行榜；原始报表只能在用户浏览器本地处理。
9. PDF-only 不能产生正式成绩；如未来增加 PDF-only 预览，必须明示为低置信度且不进入排名。

## 2. 数据层级与边界枚举

### 2.1 来源与可信度

| 枚举 | 含义 | 允许用途 |
|---|---|---|
| `demo` | 产品内置合成数据 | 演示界面、测试；不与真实用户混排 |
| `self_reported` | 用户本地导入 CSV，通过格式与算术检查 | 本地成绩、自报成就 |
| `reconciled_self_reported` | CSV 与可选 PDF 在账户、期间和关键汇总上交叉一致 | 未来独立的「已对账自报」榜；仍不是 Verified |
| `broker_sourced` | 未来在获得用户授权和 IBKR 合规批准后，从只读渠道直接取得 | 可进入与自报榜分离的 Verified 榜 |

`verified` 不是文件外观检查的结果；哈希只能证明「收到后未变更」，不能证明「由 IBKR 签发」。

### 2.2 敏感等级

| 级别 | 定义 | 例子 | 默认边界 |
|---|---|---|---|
| `S0_PUBLIC` | 不指向个人或财务账户的公开信息 | 赛季年份、计算规则版本 | 可公开 |
| `S1_DERIVED` | 可能与用户关联的最小派生信息 | 资本分组、验证层级、导入状态 | 本地；未来服务端须明确用途 |
| `S2_FINANCIAL` | 个人财务数据 | 盈亏、TWR、持仓、标的、入出金 | 默认仅本地；公开须逐项选择 |
| `S3_IDENTITY_SECRET` | 可直接识别个人、账户或导致账户风险的数据 | 姓名、完整账号、地址、token、密码 | 不公开；金融原始识别信息不上传；凭据永不采集 |

### 2.3 存储区域

| 区域 | 代码 | 规则 |
|---|---|---|
| 本地短暂内存 | `LOCAL_EPHEMERAL` | 原文件和原始行只在解析期间存在；重置、替换、关闭页面后释放 |
| 本地会话派生对象 | `LOCAL_SESSION` | 默认保留一份最新规范化快照，仅供当前会话显示 |
| 本地可选持久化 | `LOCAL_OPT_IN` | 只有用户主动选择「记住在本机」才允许；仅保留最新同年快照；提供一键清除 |
| 未来服务端最小汇总 | `SERVER_MINIMAL_FUTURE` | MVP 禁用；未来只允许明确列入白名单的账号和排名派生字段 |
| 公开展示 | `PUBLIC_OPT_IN` | 昵称和成绩等必须由用户明确选择公开；默认私密 |
| 禁止存储 | `PROHIBITED` | 密码、2FA、交易权限、IBKR 登录凭据和未经批准的原始财务数据 |

## 3. 真实样本覆盖范围

当前样本仅证明**英文、单账户、当年 YTD Activity Statement**的结构覆盖，不能外推到其他语言、多账户、历史年、月度报表、Flex 自定义模板或未知格式。样本中观察到 26 个逻辑区块：

| # | 区块（归一化名） | 关键字段/作用 | 优先级 | 产品处理 |
|---:|---|---|---|---|
| 1 | Statement | 报表类型、期间、生成时间 | P0 | 验收输入合同 |
| 2 | Account Information | 账户数、基础币种、账户类型；完整账号仅用于本地校验 | P0 | 不上传、不记日志 |
| 3 | Net Asset Value | 期初/期末 NAV、资产分类、TWR | P0 | 精确 NAV 默认不公开 |
| 4 | Change in NAV | 期初至期末变化的报表分量 | P0 | 用于对账，不自行猜测缺失分量 |
| 5 | Mark-to-Market Performance Summary | 资产类别、标的、YTD MTM | P0 | 赛季盈亏的主数据源 |
| 6 | Total P/L for Statement Period | 报表期总盈亏 | P0 | 对账项，不替代 YTD MTM 主口径 |
| 7 | Realized & Unrealized Performance Summary | 已实现、当前未实现 | P0 | 仅解释；不重复加入 YTD MTM |
| 8 | Cash Report | 期初/期末现金、币种汇总 | P1 | 对账用，不当作利润 |
| 9 | Open Positions | 当前持仓、数量、成本、未实现 | P0 | 本地解释；默认不公开 |
| 10 | Forex Balances | 币种余额 | P1 | 对账/解释；不并入股票 |
| 11 | Net Stock Position Summary | 净股票仓位及变动 | P1 | 持仓辅助对账 |
| 12 | Trades | 资产类别、合约、日期、数量、价格、代码 | P0 | 期权生命周期与异常对账；原始交易不上传 |
| 13 | Deposits & Withdrawals | 入金、出金、转账 | P1 | 仅对账；明确排除于利润 |
| 14 | Fees | 账户费用 | P1 | 按 IBKR 汇总关系对账，不二次加减 |
| 15 | Dividends | 股息收入 | P1 | 解释/对账，不二次加入主口径 |
| 16 | Withholding Tax | 预扣税 | P1 | 解释/对账；敏感财务数据 |
| 17 | Interest | 利息收支 | P1 | 解释/对账，不二次加减 |
| 18 | Interest Accruals | 利息应计 | P1 | 期间对账 |
| 19 | Change in Dividend Accruals | 股息应计变化 | P1 | 期间对账 |
| 20 | Stock Yield Enhancement Program Securities Lent | 出借证券及数量 | P1 | 本地解释；默认不公开 |
| 21 | Collateral | 证券出借抵押品 | P1 | 对账；精确数值不公开 |
| 22 | Lent Activity | 出借/归还活动 | P1 | 生命周期辅助解释 |
| 23 | Fee Earned Details | 证券出借费用明细 | P1 | 解释/对账；不二次加入 |
| 24 | Financial Instrument Information | 标的、合约描述、乘数、到期日、行权价、期权类型、内部标识 | P0 | 期权必须先映射 underlying；内部标识不公开 |
| 25 | Codes | 交易/事件代码定义 | P0 | 先按报表定义解码；未知代码必须告警 |
| 26 | Notes / Legal Notes | 格式、口径、法律说明 | P1 | 保留为解析诊断；不向公共 UI 复制整段原文 |

生命周期样本边界：

- Assignment：真实样本已覆盖，允许增加回归测试。
- Expiration：真实样本已覆盖，允许增加回归测试。
- Exercise：真实样本**未覆盖**；在取得脱敏真实样本或可证实合成 fixture 前，不得声称已完成真实 Exercise 验证。

## 4. P0 规范化字段字典

类型约定：

- `date`：ISO `YYYY-MM-DD`。
- `datetime`：保留报表时区或明确标记时区未知，不默认猜测 UTC。
- `decimal`：解析时保留源精度，只在显示层四舍五入。
- `currency`：大写 ISO 4217 代码；未知币种拒绝金额聚合。
- 任何缺失/空值均为 `null`，不得自动补 `0`。

### 4.1 报表级

| 字段 | 类型 | 来源/推导 | 必需 | 敏感度 | 存储/公开 | 校验与失败处理 |
|---|---|---|---|---|---|---|
| `sourceKind` | enum | 导入流程 | 是 | S0 | LOCAL_SESSION；可公开 | 只允许第 2.1 节枚举 |
| `statementType` | string | Statement | 是 | S0 | LOCAL_SESSION | 非 Activity Statement 则拒绝 |
| `statementLocale` | enum | 标题/表头 | 是 | S0 | LOCAL_SESSION | MVP 只允许 `en` |
| `periodStart` | date | Statement/BOF | 是 | S1 | LOCAL_SESSION | 必须为赛季年 1 月 1 日 |
| `periodEnd` | date | Statement/BOF | 是 | S1 | LOCAL_SESSION | 必须与起始日同年，且不晚于当前日 |
| `seasonYear` | integer | `periodEnd.year` | 是 | S0 | LOCAL_SESSION；可公开 | MVP 必须为当前自然年 |
| `generatedAt` | datetime/null | Statement | 否 | S1 | LOCAL_SESSION | 缺失时告警，不猜测 |
| `baseCurrency` | currency | Account Information | 是 | S1 | LOCAL_SESSION | 所有账户级汇总必须与它一致 |
| `accountCount` | integer | 去重后账户标识数 | 是 | S1 | LOCAL_SESSION | 必须等于 1，否则拒绝 |
| `accountIdRaw` | string | Account Information/BOF | 临时必需 | S3 | LOCAL_EPHEMERAL | 只用于单账户和跨文件一致性检查；解析后丢弃 |
| `accountIdMasked` | string | `accountIdRaw` 掩码 | 否 | S2 | LOCAL_SESSION | 只显示最少必需后缀；不记日志、不公开 |
| `verificationTier` | enum | 文件来源与对账状态 | 是 | S1 | LOCAL_SESSION；未来可公开 | 上传文件不得越过 `reconciled_self_reported` |
| `calculationVersion` | string | 应用内部常量 | 是 | S0 | LOCAL_SESSION；未来可公开 | 每次会计规则变更必须升版 |
| `importedAt` | datetime | 本地导入时间 | 是 | S1 | LOCAL_SESSION | 不作为报表生成时间 |

### 4.2 成绩与对账级

| 字段 | 类型 | 来源/公式 | 必需 | 敏感度 | 存储/公开 | 校验与失败处理 |
|---|---|---|---|---|---|---|
| `reportedAllAssetsYtdMtm` | decimal | MTM Summary 的 All Assets YTD MTM | 是 | S2 | LOCAL_SESSION；公开须 opt-in | 赛季盈亏主数据源；无此字段则拒绝正式导入 |
| `parsedStockYtdMtm` | decimal | 股票 YTD MTM 明细汇总 | 是 | S2 | LOCAL_SESSION；公开须 opt-in | 仅聚合明确分类为股票的行 |
| `parsedOptionYtdMtm` | decimal | 期权 YTD MTM 明细汇总 | 是 | S2 | LOCAL_SESSION；公开须 opt-in | 期权先映射 underlying，再聚合 |
| `parsedOtherYtdMtm` | decimal | 非股票/期权 YTD MTM 明细汇总 | 是 | S2 | LOCAL_SESSION；公开须 opt-in | Forex 等不得默认归为股票 |
| `parsedAllAssetsYtdMtm` | decimal | `parsedStockYtdMtm + parsedOptionYtdMtm + parsedOtherYtdMtm` | 是 | S2 | LOCAL_SESSION | 只作明细对账，不覆盖已存在的券商汇总 |
| `mtmReconciliationDifference` | decimal | `reportedAllAssetsYtdMtm - parsedAllAssetsYtdMtm` | 是 | S1 | LOCAL_SESSION | 方向固定为 reported - parsed；超过 CSV 容差则可见告警 |
| `seasonReturnTwr` | decimal/null | Net Asset Value 中的 TWR/YTD return | 否 | S2 | LOCAL_SESSION；公开须 opt-in | 保存为比例值；缺失时不自行计算 |
| `totalRealizedYtd` | decimal/null | Realized & Unrealized Summary | 否 | S2 | LOCAL_SESSION | 仅解释；不加入 `reportedAllAssetsYtdMtm` |
| `currentUnrealized` | decimal/null | Realized & Unrealized Summary | 否 | S2 | LOCAL_SESSION | 仅解释；不加入 `reportedAllAssetsYtdMtm` |
| `statementPeriodTotalPnl` | decimal/null | Total P/L for Statement Period | 否 | S2 | LOCAL_SESSION | 对账用；不替换 `reportedAllAssetsYtdMtm` |
| `navStart` | decimal/null | Net Asset Value/Change in NAV | 否 | S2 | LOCAL_SESSION | 精确值不公开 |
| `navEnd` | decimal/null | Net Asset Value | 否 | S2 | LOCAL_SESSION | 可派生资本分组，然后丢弃服务端不需要的精确值 |
| `capitalDivision` | enum/null | `navEnd` 按冻结分组边界派生 | 否 | S1 | LOCAL_SESSION；未来可 opt-in 公开 | 不是技能分，不泄露精确 NAV |
| `reconciliations[]` | object[] | MTM、statement-period P/L、NAV bridge | 是 | S1/S2 | LOCAL_SESSION | 每项含 `status`、差额、容差、reason code 和 `sourceRefs` |
| `metricSourceRefs` | object | 派生指标的本地来源元数据 | 是 | S1 | LOCAL_SESSION | 只保留 section/record type/row/header/field；不保留 raw 整行、raw value、文件名或账号 |
| `warnings` | code[] | 解析和对账引擎 | 是 | S1 | LOCAL_SESSION | 只保存标准化代码；不包含原始行 |

最小对账规则：

1. `parsedStockYtdMtm + parsedOptionYtdMtm + parsedOtherYtdMtm` 必须与 `reportedAllAssetsYtdMtm` 对上；当前 CSV epsilon 固定为 `0.000001` 基础货币单位，不在 UI 中临时硬编码。
2. NAV 桥、佣金、分红、预扣税、利息、费用等必须按报表实际出现的分量对账；不得用缺失值补零强行闭合。
3. `totalRealizedYtd + currentUnrealized` 不必等于 `reportedAllAssetsYtdMtm`；它们与 YTD MTM 存在差额不能单独判定为错误。
4. 重复快照必须拒绝；旧快照不得覆盖新快照；同年快照不得求和。
5. 任何不支持的区块、资产类别、代码、币种或对账差异必须产生可见警告，不能默认丢弃。

Checkpoint 0.3 已在完全虚构的 current-schema fixture 上验证 MTM、statement-period P/L 和 NAV bridge 三项 `PASS_EXACT`，并在私密样本上只读复验三项 `PASS_EXACT`。这只证明已覆盖 schema 的数字关系闭合，不证明文件真伪，也不扩展为其他 IBKR 模板。

### 4.3 Underlying 级

| 字段 | 类型 | 来源/公式 | 必需 | 敏感度 | 边界 | 规则 |
|---|---|---|---|---|---|---|
| `underlying` | string | Financial Instrument Information 的 Underlying，其次为可验证规则派生 | 是 | S2 | LOCAL_SESSION | 期权不得直接以合约字符串代替 underlying |
| `description` | string/null | Financial Instrument Information | 否 | S2 | LOCAL_SESSION | 仅当地显示；对原始文字做输出编码 |
| `stockYtdMtm` | decimal | 该 underlying 的股票 MTM 汇总 | 是 | S2 | LOCAL_SESSION | 与期权、Other 分开 |
| `optionYtdMtm` | decimal | 该 underlying 的期权 MTM 汇总 | 是 | S2 | LOCAL_SESSION | 所有合约先完成 underlying 映射 |
| `otherYtdMtm` | decimal | 该 underlying/类别的 Other MTM | 是 | S2 | LOCAL_SESSION | 不得暗中归入股票 |
| `totalYtdMtm` | decimal | 上述三项之和 | 是 | S2 | LOCAL_SESSION | 必须与源汇总对账 |
| `realizedYtd` | decimal/null | Realized & Unrealized Summary | 否 | S2 | LOCAL_SESSION | 解释字段 |
| `currentUnrealized` | decimal/null | Realized & Unrealized Summary/Open Positions | 否 | S2 | LOCAL_SESSION | 解释字段，不加入 MTM |
| `assignmentCount` | integer | 规范化生命周期事件 | 是 | S1 | LOCAL_SESSION | 事件计数不创造利润 |
| `exerciseCount` | integer | 规范化生命周期事件 | 是 | S1 | LOCAL_SESSION | 当前真实样本未验证 |
| `expirationCount` | integer | 规范化生命周期事件 | 是 | S1 | LOCAL_SESSION | 事件计数不创造利润 |

Underlying、持仓和交易明细均不得出现在默认分享卡、URL、错误上报或产品分析事件中。

### 4.4 期权合约与生命周期

| 字段 | 类型 | 来源 | 敏感度 | 边界 | 规则 |
|---|---|---|---|---|---|
| `contractDisplay` | string | Financial Instrument Information 的 Description | S2 | LOCAL_SESSION | 用于显示；不应默认使用 Trades/Open Positions 的 Symbol 作展示名 |
| `underlying` | string | Financial Instrument Information 的 Underlying | S2 | LOCAL_SESSION | 作为聚合键 |
| `expiry` | date/null | Expiry | S2 | LOCAL_SESSION | 缺失时告警 |
| `strike` | decimal/null | Strike | S2 | LOCAL_SESSION | 不从不受支持的字符串猜测 |
| `right` | `call` / `put` / null | Type/Right | S2 | LOCAL_SESSION | 未知值告警 |
| `multiplier` | decimal/null | Multiplier | S1 | LOCAL_SESSION | 期权计算前必须存在或显示不支持 |
| `brokerInstrumentId` | string/null | Conid/Security ID | S3 | LOCAL_EPHEMERAL | 可临时用于表内映射；不公开、不记日志 |
| `eventType` | enum | Codes + Trades | S1 | LOCAL_SESSION | 只允许 `assignment` / `exercise` / `expiration` |
| `eventDate` | date/null | Trades/Event section | S2 | LOCAL_SESSION | 只保留对产品有用的日粒度；不默认收集精确时间 |
| `sourceCode` | string | Codes/Trades | S1 | LOCAL_SESSION | 保留标准化代码以便诊断；未知代码不猜测 |

## 5. P1 解释与对账字段

P1 字段不是公开榜必需数据，只在本地为用户解释数字或定位差异。

| 类别 | 规范化字段 | 类型 | 敏感度 | 保存边界 | 会计规则 |
|---|---|---|---|---|---|
| 现金 | `cashStart`, `cashEnd`, `cashByCurrency[]` | decimal/object | S2 | LOCAL_SESSION | 不当作利润；不混合不同币种 |
| 资金流 | `deposits`, `withdrawals`, `transfers` | decimal | S2 | LOCAL_SESSION | 明确排除于盈亏 |
| 分红/税 | `dividends`, `withholdingTax`, `dividendAccrualChange` | decimal | S2 | LOCAL_SESSION | 按报表已包含口径对账，不二次加减 |
| 利息 | `interest`, `interestAccruals` | decimal | S2 | LOCAL_SESSION | 按报表分量对账，不二次加减 |
| 费用 | `fees`, `commissions` | decimal | S2 | LOCAL_SESSION | 区分交易佣金与账户费用；不重复扣减 |
| 股票出借 | `lentQuantity`, `collateral`, `lendingFees` | decimal | S2 | LOCAL_SESSION | 用于解释/对账；不默认公开 |
| 持仓 | `positionQuantity`, `costBasis`, `marketValue` | decimal | S2 | LOCAL_SESSION | 仅当地标的详情和对账 |
| 交易 | `tradeDate`, `quantity`, `tradePrice`, `proceeds`, `tradeCommission` | mixed | S2 | LOCAL_EPHEMERAL/LOCAL_SESSION 仅按必需派生 | 不向分析系统或服务端发送原始行 |

## 6. 默认禁止采集、上传或记录的字段

下列信息可能因本地解析而短暂出现，但不得进入默认持久化、公开展示、分析、错误上报或服务端日志：

- 用户姓名、地址、电话、税务或其他直接身份信息；
- 完整 IBKR 账号及低熵的可逆哈希；
- IBKR 用户名、密码、PIN、2FA 码、交易权限、任何未经批准的 token；
- 原始 CSV/PDF 文件、文件名、原始文本、整行内容、截图；
- 完整持仓、成本基础、交易明细、精确交易时间；
- 精确 NAV、现金余额、入出金、预扣税及股票出借明细；
- 交易流水号、order ID、transaction ID、Conid/Security ID 等内部标识；
- 标的、期权合约、金额、请求体或原始错误对象。

未来的登录邮箱/通行密钥属于独立账号系统数据，只能在用户批准开启账号功能后，由成熟身份服务管理；不得混入财务报表数据集。

## 7. 公开、本地与未来服务端白名单

| 数据 | 本地解析 | 本地默认持久化 | 未来服务端 | 公开展示 |
|---|---:|---:|---:|---:|
| 原始 CSV/PDF | 允许，只在内存 | 禁止 | 默认禁止 | 禁止 |
| 完整账号/姓名/地址 | 允许临时识别 | 禁止 | 禁止 | 禁止 |
| 最新规范化快照 | 允许 | 禁止；用户 opt-in 后可保留一份 | 当前禁止 | 禁止整体公开 |
| 精确盈亏/TWR | 允许 | 同上 | 未来排名经批准可最小保留 | 用户逐项 opt-in |
| 精确 NAV/资金流 | 允许 | 同上 | 默认禁止 | 禁止 |
| 资本分组 | 允许 | 可随快照保留 | 未来可保留 | 用户 opt-in |
| 标的/持仓/交易 | 允许 | 仅 opt-in 本地快照 | 默认禁止 | 默认禁止 |
| 季度、验证层级、计算版本 | 允许 | 可保留 | 未来可保留 | 可公开 |
| 标准化错误代码 | 允许 | 默认不保留 | 未来经同意可保留 | 不公开 |

2026-08-29 已从代码中移除完整规范化报表的默认 `localStorage` 持久化路径。仍需通过真实浏览器的 Storage 与 Network 检查确认不存在其他持久化或外发路径；文档状态不能替代运行时验证。

## 8. 保留、删除与替换规则

| 对象 | 默认保留期 | 删除/替换触发 |
|---|---|---|
| 原始文件二进制、文本和原始行 | 0 持久化；仅解析会话 | 解析完成、失败、取消、重置或页面关闭 |
| 默认规范化报表 | 当前页面会话 | 重置、关闭、成功导入更新快照 |
| 用户 opt-in 本地快照 | 每账户-赛季仅一份最新快照 | 用户清除、更新 YTD 快照替换、应用数据重置 |
| 本地偏好 | 直到用户清除 | 用户清除/应用重置 |
| 未来排名汇总 | 未定；上线前必须单独批准 | 账号删除、赛季政策到期、合法删除请求 |
| 未来安全日志 | 未定；必须有最短必要期限 | 到期自动删除；事故保全须单独记录理由 |

服务端保留期未批准前，对应功能不得上线；不能以「以后分析可能有用」作为无限期保留理由。

## 9. 日志与产品分析白名单

当前本地 MVP 默认不发送产品分析事件。如未来经用户批准启用，一个事件最多只能包含：

- `eventName`：固定白名单事件名；
- `appVersion` 与 `calculationVersion`；
- `locale`；
- `result`：`success` / `warning` / `failure`；
- `errorCode`：标准化、不携带原文的代码；
- `fileSizeBucket`、`rowCountBucket`、`parseTimeBucket`；
- `sectionPresenceBitmap`：只表示已知区块是否存在，不携带数值；
- `browserClass` / `deviceClass`：粗粒度分类，不做指纹识别。

日志严禁包含：文件名、账号、姓名、原始行、原始错误对象、金额、标的、持仓、交易时间、请求体、token 或任何登录凭据。URL 不得使用查询参数承载财务数据。

## 10. PDF 可选核验字典

PDF 解析器不得代替 CSV 解析器。当前只允许提取下列最小字段做交叉核验：

| PDF 字段 | 对应 CSV 字段 | 必须一致的方式 | 不一致处理 |
|---|---|---|---|
| 报表类型 | `statementType` | 归一化后精确匹配 | 不得升级为 reconciled |
| 账户标识 | `accountIdRaw` | 只在本地内存精确比较 | 失败；不记录原值 |
| 期间 | `periodStart`, `periodEnd` | 日期精确匹配 | 失败 |
| 基础币种 | `baseCurrency` | 精确匹配 | 失败 |
| All Assets YTD MTM | `reportedAllAssetsYtdMtm` | 按 PDF 显示精度比较 | 超容差则失败 |
| Total P/L | `statementPeriodTotalPnl` | 按 PDF 显示精度比较 | 超容差则 warning/fail |
| Realized + Unrealized | 对应解释汇总 | 按 PDF 显示精度比较 | 超容差则 warning/fail |
| TWR | `seasonReturnTwr` | 按 PDF 百分比显示精度比较 | 超容差则 warning |

PDF 仅保留对账结果、字段级差异代码和解析器版本；不保留 PDF 原文、页面图像、文本片段或用户身份值。PDF 没有可验证数字签名时，不能因「版式看起来真」而提高到 `broker_sourced`。

## 11. 解析器与产品验收门槛

下列条件未全部满足时，不得把真实数据功能标记为完成：

- [ ] 只接受冻结的英文单账户当年 YTD CSV 合同。
- [ ] 真实样本的 26 个区块能被盘点；未支持区块能显式告警。
- [ ] 报表级 YTD MTM、股票、期权、Other 及对账差额通过回归测试。
- [ ] 期权 Trades/Open Positions 能通过 Financial Instrument Information 映射到正确 underlying 和展示描述。
- [ ] Assignment 与 Expiration 有真实脱敏 fixture 回归测试。
- [ ] Exercise 保持「真实样本未验证」标记，直到有合格 fixture。
- [ ] 原始 CSV/PDF 和 S3 字段不会进入长期存储、日志、URL、错误上报或第三方请求。
- [ ] 规范化快照默认只在会话内存，本地持久化有明确 opt-in 和一键清除。
- [ ] 清除、替换新快照、拒绝旧快照和拒绝多账户均有测试。
- [ ] 可选 PDF 只做最小字段交叉核验，PDF-only 不产生正式成绩。
- [ ] 分享卡默认不包含账号、NAV、持仓、交易、文件名和原始标的列表。

## 12. 规则变更程序

以下任一变更都必须经用户明确批准，更新本字典、计算版本、fixture/测试和验证记录：

- 从 CSV 必需改为 PDF-only 或其他主数据源；
- 扩展到非英文、多账户、非 YTD 或历史赛季；
- 更改赛季盈亏主口径；
- 新增服务端上传、原始报表保留、用户账号或公开排行榜；
- 新增任何会读取导入页面或财务数据的第三方脚本；
- 将 `S2_FINANCIAL` 或 `S3_IDENTITY_SECRET` 字段从本地边界移入服务端或公开边界。

对于任何新报表变体，先记录「已确认字段 / 未知字段 / 对账差异」，再修改解析器；不得为了让导入通过而静默推断或丢弃数据。
