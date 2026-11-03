# IBKR 收益验证可行性研究

2026-11-03 供 Philip 决策。本次只查阅公开文档。自报榜继续使用 Self-Reported 标记，未调用真实账户或请求账户授权。

## 能验证什么

优先评估经 IBKR 批准的第三方 Web API，对单一账户向 PortfolioAnalyst 请求 YTD，以响应中的期间、截止日、收益计量方式核对本地同口径收益率。官方说明多个账户会合并，收益可按 TWR 或 MWR 表示；两者不能混用。即使核验成功，也只证明某个授权账户在指定区间的回报，无法证明用户列出了全部账户、没有选择性参赛或仅提交一次。[Account Performance](https://www.interactivebrokers.com/docs/web-api/v1/endpoints/portfolio-analyst/account-performance)

| 路径 | 用户授权与数据边界 | 项目判断 |
|---|---|---|
| Activity Flex Web Service | 用户在 Client Portal 自选查询、范围和账户，启用服务并生成令牌。服务以 token + query ID 发出 SendRequest，凭 reference code 取报告。用户可设置 6 小时至 1 年有效期和 IP 限制，查询可能涵盖关联账户。 | 只读报告在技术上可行。查询由用户控制，可能夹带账户标识、余额及全部交易。公开文档没有授予本项目代持令牌或再发布收益率的许可。应先向 IBKR 取得书面许可并确认查询可限制到一个账户和最小字段。 |
| 第三方 Web API / Client Portal API | 申请成为 vendor，经 Compliance 审核及协议签署后使用获批流程。第三方 OAuth 工作流由用户在 IBKR 完成授权，回调后换取访问权限。个人 Client Portal Gateway 依赖本机程序和账户登录。 | 向 IBKR 申请仅限 performance 的只读权限并要求书面确认可公开衍生百分比。Campus 同页分别列出机构 OAuth 2.0 beta 和第三方申请 OAuth 1.0a，不能假定本项目已可使用任一协议或有真正仅限单端点的 scope。个人 Gateway 不适宜用作多人托管验证服务。 |
| 官方第三方数据服务或聚合商 | IBKR 列出可由客户启用、停用的数据馈送。经批准的聚合服务另有客户同意、商业条款、处理地区和产品数据覆盖范围。 | 先询问是否返回可核对日期与口径的 YTD 收益率，以及是否授权榜单再展示。出现在 IBKR 名单不代表本项目可复用其令牌。 |
| 本机 CSV、对战码或人工看截图 | 由用户提交，可在交付前修改。 | 继续作为自报；人工复核异常值与券商直连验证分别标记。 |

[Flex 令牌和账户范围](https://www.interactivebrokers.com/docs/web-api/flex-web-service/client-portal-configuration/enable-and-create-access-token) · [Flex 取报告](https://www.interactivebrokers.com/docs/web-api/api-reference/get-statement) · [Web API 第三方审批](https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/) · [OAuth 授权工作流](https://www.interactivebrokers.com/docs/web-api/authentication/oauth-1a/third-party-oauth/third-party-o-auth-workflow) · [个人 Gateway](https://www.interactivebrokers.com/docs/web-api/getting-started) · [官方第三方数据馈送](https://www.ibkrguides.com/brokerportal/performanceandstatements/third-party-reports.htm)

## 最小取数与失败处理

仅请求单账户、自然年年初至指定日、券商计算的收益率和计量方式。账户选择所需标识只在隔离验证进程中短暂使用。需验证五档分组时，要求单独同意在内存读取同日净清算值及币种，算出分组即销毁；无法用同一币种规则核实时只验证收益，不推断分组。勋章如需逐笔明细，保留自报属性。不给整张卡笼统加 Verified。

拒绝多账户合计、不完整期间、日期不符、TWR/MWR 无法区分、币种或分组规则不匹配、证据缺失和超时。保留自报渠道。设计上先以一次性核验替代后台长期同步。新来源类型与验证标记必须先获批准，现有自报接口只接受自报来源。

## 令牌、撤销与上线前提

用户先看到用途、允许读取的最少字段、展示对象、保留期和撤销入口，再在 IBKR 页面授权。禁止向项目提交券商密码、验证码或交易权限。Flex token 和查询 ID 不进入客户端持久化、URL 日志、错误追踪或数据库。若获准一次性服务，隔离后只在内存短时处理，禁用请求与响应内容日志；查询参数可能携带令牌，必须先验证代理、函数及供应商日志均已脱敏。Flex 用户可禁用服务或生成新令牌，使旧令牌失效；轮换可能同时影响其他使用者。[Flex 撤销与轮换](https://www.ibkrguides.com/brokerportal/performanceandstatements/flex3.htm)

OAuth 由 IBKR 确认 vendor、地区、授权范围和具体撤销接口。取消同步后先停任务、删除本地凭据，再验证旧凭据确实失效；删除榜单记录与撤销券商权限是两个操作。长期同步如被另批，需密钥管理服务封装加密、最小服务角色、到期轮换、无敏感内容的访问审计以及撤销演练。公开材料不足以确认本项目的许可、费用、衍生数据分发权、撤销时延或各地区适用条款。拿到书面协议前维持封闭自报榜。
