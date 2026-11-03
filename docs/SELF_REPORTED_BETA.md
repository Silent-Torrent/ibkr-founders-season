# 自报榜封闭内测操作

本分支未配置任何服务。Philip 在独立非商业 Hobby 项目中配置 Vercel Functions 与 Marketplace Upstash Redis Free。通过 HTTPS REST 调用 Redis，无常驻连接。Lua 在同一次操作内检查停写、冲突、容量和到期时间；同一赛季和 ID 的相同请求幂等，不同内容拒绝。每季至多 500 条，分组不足十条或全在待审队列时返回空列表。排序使用整数基点，同分同名次。

| 环境变量 | 负责人操作 |
|---|---|
| VITE_LEADERBOARD_BETA | 默认不设置；仅封闭内测构建设为 enabled |
| LEADERBOARD_ORIGIN | 内测页面和函数共用的规范 HTTPS origin，无尾斜杠；构建和运行时都需要 |
| LEADERBOARD_BETA | 完成全部保护检查后设为 enabled |
| LEADERBOARD_WRITES | 默认停写；确认免费配额、数据区域、备份及日志后设为 enabled |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | 从专用免费库配置到服务端。禁止 VITE_ 前缀 |
| LEADERBOARD_RATE_SECRET | 本机随机生成至少 32 字符的服务端密钥；不进仓库和客户端 |

**封闭与费用。** 全部域名开启 Vercel Authentication / All Deployments，不设公开例外。逐一匿名访问页面及 API，确认需要认证；检查带参和别名路径。API 仅服务规范 origin。费用新增上限为每月 0 美元，Hobby 加固定免费 Redis，不启用付费回退或自动升级。容量和速率限制是业务限制，无法代替供应商硬上限。若无可执行的零支出上限或保留策略，保持停写。未获批公开。Git 部署开关保持禁用。[Vercel 的 All Deployments 公告](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan) · [Redis 套餐](https://upstash.com/pricing/redis)

**请求路径。** 构建内测版时在原 self-only CSP 外叠加只允许规范 HTTPS origin 下 /api/ 的 connect-src。导入、解析、计算与打开表单在本地完成。预览列出八项，先保存本机撤回凭证并另行勾选同意。点击提交只发一次 POST /api/leaderboard，不自动重试。单独点击读榜才 GET；单独点击撤回才 DELETE。撤回码由年份和 256 位本地随机秘密组成，提交时只传秘密摘要的前 128 位作为参赛 ID。撤回时才通过 HTTPS Authorization 发送秘密以验证所有权。禁止记录请求体、授权头、IP 或成绩。遗失回执无法自助证明控制权，应向内测负责人申请人工隐藏。操作已超时也可用原回执撤回。

**审核与停写。** 在专用 Redis 控制台执行 `SET lb:stop 1` 即时拒绝新增和重试，撤回继续可用。复核后 `DEL lb:stop` 恢复。函数仅信任 Vercel 写入的 x-vercel-forwarded-for；按日 HMAC 后建立 60 秒窗口，单 IP 每分钟提交 5 次，读取和撤回分别 30 次。绝对收益超过 10,000 基点转人工复核，阈值只是异常提示。自报系统不能防止多身份或伪造。审核者用 HSCAN 查看赛季哈希 lb:<year> 内 p:* 字段，按 leaderboard/store.js 中 moderate 原子脚本执行 approve 或 reject。投诉条目先 HDEL 指定 a:<id>，保留其余数据；不征集账户凭据。拒绝或撤回立即删除相应字段。没有公共审核接口。

**清理。** 全季哈希的 EXPIREAT 固定为下一年 1 月 1 日 UTC 加 90 天。包含待审、已展示的条目；读取拒绝过期年份，没有浏览器排名缓存或 CDN 缓存。启用前核对供应商日志与备份不会在到期后保留数据，撤回后清理副本；不能满足时不开写。用虚构条目演练 9→10→9、并列、重复提交、极端值、关停、撤回与到期。尚未用托管账户验证运行配置。
