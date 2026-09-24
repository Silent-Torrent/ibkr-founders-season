# P&L Arena 数据字典与数据边界

> 状态：2026 Founders Season checkpoint 0.10 已实现字段 + 未来边界基线
> 适用范围：当前本地 MVP；标明“未来”的字段只是设计约束，不得当作已实现 schema
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
| `synthetic` | 与仓库自带虚构 CSV 的 SHA-256 内容摘要匹配 | 解析器与界面测试；不排名、不发本机成就 |
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

## 3. 样本证据边界

仓库只保留完全虚构的 CSV fixture 作为可复跑证据。历史上曾对一份英文、单账户、当年 YTD 私密 CSV/PDF 做过只读校准，但原文件和精确行数、页数、区块/交易/标的数量或清单等私密派生指纹都不应写入仓库。

当前可确认的范围只是：异构/重复表头、主要会计与辅助类别、期权 underlying 映射、Assignment/Expiration 曾被观察；Exercise 仍未获得有资格的 CSV 样本。这些经验不能外推到其他语言、多账户、历史年、月度报表、自定义 Flex 或未知模板。

## 4. P0 规范化字段字典

类型约定：

- `date`：ISO `YYYY-MM-DD`。
- `datetime`：保留报表时区或明确标记时区未知，不默认猜测 UTC。
- `decimal`：实现中是通过严格语法和可表示性检查的 JavaScript `number`；采用十进制安全求和，但不保留原 token 或尾随小数位。
- `currency`：大写 ISO 4217 代码；未知币种拒绝金额聚合。
- 任何缺失/空值均为 `null`，不得自动补 `0`。

### 4.1 报表级

| 字段 | 类型 | 来源/推导 | 必需 | 敏感度 | 存储/公开 | 校验与失败处理 |
|---|---|---|---|---|---|---|
| `source` | `demo` / `synthetic` / `local` | 导入流程 | 是 | S0/S1 | LOCAL_SESSION | 只表示当前实现来源，不等于未来验证等级 |
| `fingerprint` | SHA-256/null | 规范化 CSV 内容 | 否 | S1 | LOCAL_SESSION | 用于重复快照，不证明签发方 |
| `startDate` / `endDate` | date | Statement/BOF | 是 | S1 | LOCAL_SESSION | 必须为当年 1 月 1 日起的非未来 YTD |
| `seasonYear` | integer | `endDate.year` | 是 | S0 | LOCAL_SESSION；可公开 | 必须为当前自然年 |
| `isYtd` | boolean | 期间验证 | 是 | S0 | LOCAL_SESSION | 当前接受的报告必须为 `true` |
| `baseCurrency` | currency | Account Information | 是 | S1 | LOCAL_SESSION | 三位受支持币种代码，多源必须一致 |
| `accountComparisonKey` | string | `SHA-256(sessionSalt + accountIdRaw)` | 是 | S2 | LOCAL_SESSION | 仅当前标签页跨文件比较；不显示/分享 |
| `accountIdMasked` | string | `accountIdRaw` 掩码 | 是 | S2 | LOCAL_SESSION | 只用于本地显示；完整账号解析后丢弃 |
| `importedAt` | datetime | 本地导入时间 | 是 | S1 | LOCAL_SESSION | 不当作报表生成时间 |
| `dataQuality` | enum | 对账与警告 | 是 | S1 | LOCAL_SESSION | `good` / `warning` / `error` |
| `parserFacts` | object | 解析器固定事实 | 是 | S1 | LOCAL_SESSION | 当前为 realized 区块缺失与 TWR 冲突 |
| `sections` | string[] | 已见技术区块名 | 是 | S1 | LOCAL_SESSION | 规范化名称，不是原始 BOS 描述 |

`statementType`、英文 schema、单账户和原始账号会在解析阶段验证，但不作为 `PortfolioReport` 字段保留。`verificationTier`、`calculationVersion`、报表生成时间等仍是未来设计字段。

### 4.2 成绩与对账级

| 字段 | 类型 | 来源/公式 | 必需 | 敏感度 | 存储/公开 | 校验与失败处理 |
|---|---|---|---|---|---|---|
| `reportedAllAssetsYtdMtm` | decimal | 权威 YTD 业绩区块的 All Assets YTD MTM；双家族共存时优先 MTM | 是 | S2 | LOCAL_SESSION；公开须 opt-in | 无此字段则拒绝；MTM + Month/YTD 必须逐规范化券商资产类别和 underlying 精确一致，且只计一次 |
| `seasonPnl` | decimal | 已验收的 All Assets YTD MTM | 是 | S2 | LOCAL_SESSION；公开须 opt-in | 当前与 `reportedAllAssetsYtdMtm` 同源 |
| `stockPnl` / `optionPnl` / `otherPnl` | decimal | 三个资产桶的 YTD MTM 明细汇总 | 是 | S2 | LOCAL_SESSION | 分类和 underlying 映射后十进制安全聚合 |
| `parsedAllAssetsYtdMtm` | decimal | `stockPnl + optionPnl + otherPnl` | 是 | S2 | LOCAL_SESSION | 只作明细对账，不覆盖已存在的券商汇总 |
| `mtmReconciliationDifference` | decimal | `reportedAllAssetsYtdMtm - parsedAllAssetsYtdMtm` | 是 | S1 | LOCAL_SESSION | 方向固定为 reported - parsed；超过 CSV 容差则可见告警 |
| `seasonReturn` | decimal/null | MTM、NAV 或 Change-in-NAV 中的显式 TWR/YTD return | 否 | S2 | LOCAL_SESSION；公开须 opt-in | 缺失时不自行计算；Month/YTD/PLUI 不能提供 |
| `statementPeriodTotalPnl` | decimal/null | Total P/L for Statement Period | 否 | S2 | LOCAL_SESSION | 对账用；不替换 `reportedAllAssetsYtdMtm` |
| `beginningNav` / `endingNav` / `calculatedEndingNav` | decimal/null | NAV/Change in NAV 与桥接计算 | 否 | S2 | LOCAL_SESSION | 精确值默认不分享 |
| `netLiquidationValue` / `cashValue` | decimal/null | 行式 NAV 或当前 wide Flex NAV，及 Cash Report 交叉检查 | 否 | S2 | LOCAL_SESSION | NAV 分项与 Total 先闭合；两源同时存在时必须一致；`cashValue` 仅取精确 `Cash`，不取 `SLB Cash Collateral` |
| `reconciliations[]` | object[] | MTM、statement-period P/L、NAV bridge | 是 | S1/S2 | LOCAL_SESSION | 每项含 `status`、差额、容差、reason code 和 `sourceRefs` |
| `metricSourceRefs` | object | 派生指标的本地来源元数据 | 是 | S1 | LOCAL_SESSION | section/field 是规范化技术别名；不保留原始 code/header/row/value、文件名或账号 |
| `warnings` | `ParserDiagnostic[]` | 解析和对账引擎 | 是 | S1 | LOCAL_SESSION | 固定代码；只有明确定义的受控参数，不包含原始行 |

最小对账规则：

1. `stockPnl + optionPnl + otherPnl` 必须与 `reportedAllAssetsYtdMtm` 对上；当前 CSV epsilon 固定为 `0.000001` 基础货币单位，不在 UI 中临时硬编码。
2. NAV 桥、佣金、分红、预扣税、利息、费用等必须按报表实际出现的分量对账；不得用缺失值补零强行闭合。
3. 标的级 `totalRealizedYtd + totalCurrentUnrealized` 不必等于 YTD MTM；它们只是解释字段。
4. 重复快照必须拒绝；旧快照不得覆盖新快照；同年快照不得求和。
5. 任何不支持的区块、资产类别、代码、币种或对账差异必须产生可见警告，不能默认丢弃。
6. MTM 与 Month/YTD 可以同时出现，但必须先分别校验，再对 All Assets 总额与每个 `规范化券商资产类别 + underlying` 做精确等价比较；通过后只用 MTM 计算成绩，绝不相加。公开展示虽将 Forex/Futures 等统称为 Other，交叉校验仍保留它们各自的原始类别语义。
7. 金额必须使用十进制安全聚合；重复识别列、重复明细、冲突的券商总计或无法精确进入 Worker 数值协议的结果必须阻断。
8. Realized/FIFO 存在时是已实现/当前未实现解释的权威来源；缺失时仅允许经校验的 Month/YTD realized S/T + L/T 作带警告备用，MTM 不能冒充。
9. YTD、Realized/FIFO、FII 和被选中的事件区块如果暴露 Account ID/Model，必须同属报表账户且 Model 为空；空 Asset Class 不得靠猜测分类。
10. YTD 中任何已出现的资产小计必须逐字段精确等于对应明细块，关闭后不得再追加同资产明细；All Assets 必须是身份独立、非 SubTotal 的唯一总计。Total/SubTotal 不得成为标的、映射别名或事件。专用生命周期的全部 `Data` 行必须先通过类型、合约、资产身份和歧义校验；小计不能压掉 Trades 备用来源，畸形 Data 也不能静默回退。

Checkpoint 0.10 的仓库证据是完全虚构的 current-schema fixture、家族正确的 mixed-YTD 合成回归、三项 `PASS_EXACT` 和对抗性失败关闭用例。私密样本只作仓库外的只读校准；这不能证明文件真伪，也不扩展为其他 IBKR 模板。

### 4.3 Underlying 级

| 字段 | 类型 | 来源/公式 | 必需 | 敏感度 | 边界 | 规则 |
|---|---|---|---|---|---|---|
| `symbol` | string | 规范化 underlying/instrument key | 是 | S2 | LOCAL_SESSION | `SymbolPnl` 的键；期权先做 underlying 映射 |
| `description` | string/null | Financial Instrument Information | 否 | S2 | LOCAL_SESSION | 仅当地显示；对原始文字做输出编码 |
| `stockYtdMtm` | decimal | 该 underlying 的股票 MTM 汇总 | 是 | S2 | LOCAL_SESSION | 与期权、Other 分开 |
| `optionYtdMtm` | decimal | 该 underlying 的期权 MTM 汇总 | 是 | S2 | LOCAL_SESSION | 所有合约先完成 underlying 映射 |
| `otherYtdMtm` | decimal | 该 underlying/类别的 Other MTM | 是 | S2 | LOCAL_SESSION | 不得暗中归入股票 |
| `totalYtdMtm` | decimal | 上述三项之和 | 是 | S2 | LOCAL_SESSION | 必须与源汇总对账 |
| `stockRealizedYtd` | decimal | Realized & Unrealized Summary/YTD summary | 是 | S2 | LOCAL_SESSION | 股票已实现解释字段 |
| `optionRealizedYtd` | decimal | Realized & Unrealized Summary/YTD summary | 是 | S2 | LOCAL_SESSION | 期权已实现解释字段 |
| `otherRealizedYtd` | decimal | Realized & Unrealized Summary/YTD summary | 是 | S2 | LOCAL_SESSION | CFD、Forex 等 Other 已实现解释字段；不能丢弃 |
| `totalRealizedYtd` | decimal | 上述三项十进制安全求和 | 是 | S2 | LOCAL_SESSION | 仅解释；即使 YTD MTM 为零也保留该标的 |
| `stockCurrentUnrealized` | decimal | Realized & Unrealized Summary | 是 | S2 | LOCAL_SESSION | 股票当前未实现解释字段 |
| `optionCurrentUnrealized` | decimal | Realized & Unrealized Summary | 是 | S2 | LOCAL_SESSION | 期权当前未实现解释字段 |
| `otherCurrentUnrealized` | decimal | Realized & Unrealized Summary | 是 | S2 | LOCAL_SESSION | CFD、Forex 等 Other 当前未实现解释字段 |
| `totalCurrentUnrealized` | decimal | 上述三项十进制安全求和 | 是 | S2 | LOCAL_SESSION | 解释字段，不加入 MTM |
| `assignmentCount` | integer | 规范化生命周期事件 | 是 | S1 | LOCAL_SESSION | 事件计数不创造利润 |
| `exerciseCount` | integer | 规范化生命周期事件 | 是 | S1 | LOCAL_SESSION | 当前真实样本未验证 |
| `expirationCount` | integer | 规范化生命周期事件 | 是 | S1 | LOCAL_SESSION | 事件计数不创造利润 |

Underlying、持仓和交易明细均不得出现在默认分享卡、URL、错误上报或产品分析事件中。

### 4.4 当前 `OptionEvent` 生命周期字段

| 字段 | 类型 | 来源 | 敏感度 | 边界 | 规则 |
|---|---|---|---|---|---|
| `symbol` | string | 规范化 underlying | S2 | LOCAL_SESSION | 作为标的键 |
| `contract` | string/null | 事件行合约 | S2 | LOCAL_SESSION | 只本地显示；不进入默认分享 |
| `date` | date | Trades/专用 event section | S2 | LOCAL_SESSION | 必须是报表期间内的有效日期；显示为日粒度，同合约同日同类型但原始事件行不同则拒绝整份导入，不擅自合并或双计 |
| `type` | enum | 事件文本/受支持 code | S1 | LOCAL_SESSION | `assignment` / `exercise` / `expiration` |
| `sourceRefs` | object[] | 事件行与 mapping | S1 | LOCAL_SESSION | 不保留 raw row/value |

Expiry、strike、right、multiplier、broker instrument ID 和规范化 `sourceCode` 均不是当前 `OptionEvent` 字段；如未来需要，必须独立设计和审批。

## 5. P1 解释与对账字段

P1 表中大多数是未来目标字段，不是 checkpoint 0.10 `PortfolioReport` schema。实现前必须逐项确认会计口径、必要性和存储边界。

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

2026-08-29 已从代码中移除完整规范化报表的默认 `localStorage` 持久化路径。本地生产包 Chrome 回归已确认刷新后回到 Demo，且没有外部页面请求或 POST；这不替代以后的真 iPhone/Safari 或部署环境 Network/Storage 检查。

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
| 期间 | `startDate`, `endDate` | 日期精确匹配 | 失败 |
| 基础币种 | `baseCurrency` | 精确匹配 | 失败 |
| All Assets YTD MTM | `reportedAllAssetsYtdMtm` | 按 PDF 显示精度比较 | 超容差则失败 |
| Total P/L | `statementPeriodTotalPnl` | 按 PDF 显示精度比较 | 超容差则 warning/fail |
| Realized + Unrealized | 对应解释汇总 | 按 PDF 显示精度比较 | 超容差则 warning/fail |
| TWR | `seasonReturn` | 按 PDF 百分比显示精度比较 | 超容差则 warning |

PDF 仅保留对账结果、字段级差异代码和解析器版本；不保留 PDF 原文、页面图像、文本片段或用户身份值。PDF 没有可验证数字签名时，不能因「版式看起来真」而提高到 `broker_sourced`。

## 11. 解析器与产品验收门槛

下列条件未全部满足时，不得把真实数据功能标记为完成：

- [ ] 只接受冻结的英文单账户当年 YTD CSV 合同。
- [ ] 仓库虚构 fixture 中的受支持区块能重复验证；未支持/歧义 schema 不会静默丢值。
- [ ] 报表级 YTD MTM、股票、期权、Other 及对账差额通过回归测试。
- [ ] 期权 Trades/Open Positions 能通过 Financial Instrument Information 映射到正确 underlying 和展示描述。
- [ ] Assignment 与 Expiration 有完全虚构 fixture 回归；私密校准只记录通过/失败，不沉淀派生内容。
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
