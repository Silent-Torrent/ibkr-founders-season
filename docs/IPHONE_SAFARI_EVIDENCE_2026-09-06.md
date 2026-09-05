# iPhone Safari 0.19 恢复与 PNG 真机证据（2026-09-06）

状态：`FINAL_WITH_OPEN_GATES`。本文件记录本轮已完成的真机观察与收尾：本机三张 PNG 已可恢复删除，iCloud 四个测试对象已移除本机下载但保留云端原件，测试标签与临时服务已关闭，设备版本已核对。Photos 旧图仍未定位、iCloud 同步删除待用户确认，横竖屏与 VoiceOver 等门槛仍开放；不宣称全部测试文件已删除或全部发布门槛已通过。

## 测试边界

- 日期与时区：2026-09-06，Asia/Shanghai。
- 源代码版本：`8cf0496`，checkpoint 0.19；本轮使用生产构建。
- 设备：通过用户已打开的 iPhone 镜像操作系统 Safari；在 Settings → General → About 现场核对为 iPhone 17 Pro Max、iOS 27.0。该版本是本轮现场确认，不是直接沿用旧记录。
- 连接：用户已同意的可信局域网临时 HTTP。没有 HTTPS 或外部部署；仓库不记录局域网 IP。
- 输入：既有全虚构压力包中的 `00-control-small.csv`、`01-accepted-exact-capacity.csv`、`02-cancel-timeout-probe.csv`、`03-reject-501-symbols.csv`。没有使用真实 IBKR CSV/PDF。
- 观察方式：iPhone 镜像中的页面、原生文件选择器、Files 信息及图片预览。没有 Safari Web Inspector、Worker 进程日志或峰值内存测量。
- 本轮 Mac 验证：生产构建与既有外置压力包校验通过；文档更新后的 `npm run test:policy` 和 `git diff --check` 通过。完整 `npm run check` 通过属于 2026-09-05 的实现检查点，本次仅新增设备证据、未改应用代码，未重跑完整套件。
- 时间口径：下文秒数是操作到后续屏幕观察的间隔或明确的继续观察时长，不能解释为精确解析耗时。

## H1：取消与同标签恢复

| 项目 | 状态 | 已观察证据 |
| --- | --- | --- |
| 可视取消 | `PASS_OBSERVED` | 从 Demo 选择 `02`，解析期间可见取消按钮并执行取消；页面回到空闲 Import，仍保留 Demo。 |
| 取消后无迟到结果 | `PASS_OBSERVED` | 取消后继续观察 25.631 秒，仍为空闲 Demo，没有迟到的新报表或自动返回账本。 |
| 原生文件选择器取消 | `PASS_OBSERVED` | 从取消面板点击重新选择，原生选择器打开；按 Escape 关闭后回到原取消页面，重新选择入口仍可操作。 |
| 同标签成功重试 | `PASS_OBSERVED` | 随后再次从恢复入口选择 `00`，没有刷新或重开标签；成功进入账本，显示 Fully synthetic test、Internal checks passed 和约 `+$740`。滚动核对三行虚构标的 `ZZFICTA`、`XTS.USD`、`ZZFICTB`。 |

这些结果证明可见取消、无迟到结果和用户可完成重试；不声称直接观察到 Worker 内部终止、销毁或回收。

## H2：自然超时与同标签恢复

第一次尝试因原生选择器的 Recents 顺序变化误选了小文件。这次不计入 `02` 自然超时结果；刷新回 Demo 后，重新明确选中 `02` 才开始下面的有效观察。

| 项目 | 状态 | 已观察证据 |
| --- | --- | --- |
| 自然超时错误 | `PASS_OBSERVED` | 生产页面导入原样 `02`，未人工暂停 Worker、未取消、未缩短超时。选择后 23.222 秒进行屏幕观察时，页面已显示既有固定超时错误。此数值不是超时触发时刻或解析耗时；应用原有上限仍为 12 秒。 |
| 超时后无迟到结果 | `PASS_OBSERVED` | 在上述错误状态后再观察 28.431 秒，页面仍停留错误状态，没有迟到报表。 |
| 同标签成功重试 | `PASS_OBSERVED` | 直接从错误面板重新选择 `00`，未刷新、未切换或重开标签；成功显示全虚构账本，并核对三行标的。 |

本轮自然超时已实际触发，因此此项不记为 `NOT_TRIGGERED`。它仍是用户界面层观察，不是 Worker 内部状态证据。

## H3：容量错误后的保留与恢复

| 项目 | 状态 | 已观察证据 |
| --- | --- | --- |
| 精确容量报表接受 | `PASS_OBSERVED` | 选择 `01` 后 19.527 秒才进行屏幕观察，届时已成功显示 Local Report / Self-reported，Underlyings 计数为 500，`CAP000` 等虚构行可见。19.527 秒不是精确导入耗时，不能据此宣称触及或超过 12 秒 Worker 上限。 |
| 第一次 `03` 拒绝与旧报表保留 | `PASS_OBSERVED` | 导入 `03` 后显示固定容量错误；回到账本并滚动至 Underlyings，再次确认旧报表仍为 500 行。 |
| 第二次 `03` 拒绝与直接重试 | `PASS_OBSERVED` | 重新进入导入页，再次导入 `03` 并观察固定容量拒绝；这次不切页，直接从错误面板选择 `00`，成功显示 Fully synthetic test 和三行明细。 |

两次 `03` 分别证明保留旧报表和仍在错误面板时的直接重试。此轮未重复 `04-reject-1001-events.csv`；旧版本的 `04` 通过记录不冒充本轮已测。

## H4：当前页面与 PNG

| 项目 | 状态 | 已观察证据 |
| --- | --- | --- |
| 首次引导路径 | `PASS_OBSERVED` | 当前引导正常显示；点击 Explore demo 后进入账本。 |
| 当前三语隐私文案核读 | `PASS_OBSERVED` | English、简体中文、繁體中文的隐私弹窗均已打开、滚动并读到末尾。均显示原始 CSV/完整报表仅在当前标签页内存保留，仅语言与首次引导已见状态两项非财务偏好可持久化，内部检查不等于券商认证，CSV 必选且 PDF 当前不解析，以及刷新/关闭/清除和独立 PNG/剪贴板副本等边界。 |
| 三语弹窗关闭 | `PASS_OBSERVED` | 英文使用 Got it、简体使用右上角 ×、繁体点击遮罩，均成功关闭。每种语言各验证一种关闭方法，不是每种语言均验证三种方法。 |
| 当前 PNG 预览、关闭和重新生成 | `PASS_OBSERVED` | 0.19 当前页面生成新图，关闭后再次生成正常；Open PNG in Safari 打开非空图片。 |
| 当前 PNG 保存与重开 | `PASS_OBSERVED` | 从 Safari 分享菜单选择 Save to Files，直接保存到 On My iPhone；本轮该路径没有经 Photos 中转。随后在 Files 通过 Open 使用 Preview 打开新图，整张卡片非空且完整可见。 |
| 当前 PNG 内容与隐私 | `PASS_OBSERVED` | 新图可见约 `+$740`、`+7.7%`、Stocks `168`、Options `450`、Fully synthetic test、Internal checks passed、品牌标记和页脚；没有显示持仓代码、账户标识或精确 NAV。 |
| 当前 PNG 文件信息 | `PASS_OBSERVED` | Files Info 显示 PNG、2.1 MB、1200×1500；本机位置，时间为 2026-09-06 00:50。2.1 MB 是系统显示值，没有测得精确字节数。 |
| 指定文件名完整保留 | `FAIL` | Save as 默认显示 Unknown；操作时手工填写 `pnl-arena-test-20260906.png`，实际文件名为 `pnl-arena-test-20260906.png.png`。系统再次追加 `.png`，没有保持所填名称，更没有证明应用原定文件名可自动保留。 |
| HTTPS 原生 Web Share 及原定文件名 | `NOT_AVAILABLE` | 当前为局域网 HTTP 的 Safari 图片保存路径，不是 HTTPS 原生文件分享验证。 |
| 实际横竖屏 | `NOT_AVAILABLE` | 当前镜像操作不能完成实际旋转，尚未转动手机；需要用户身体操作，不能用桌面宽度或镜像窗口变化代替。 |

本轮的新图与旧版本遗留 PNG 分开记录。旧 PNG 没有用作当前构建的通过证据。

保存 PNG 后曾误按 `super+w`，关闭的是 iPhone Mirroring 窗口。重连后手机网页仍在，此操作不记为 Safari 崩溃、网页关闭或报表清除。随后通过 Safari 标签页概览关闭了唯一的 Blob 图片标签；收尾时再逐个关闭两个测试 Ledger 标签，已回到 Safari Start Page。本轮没有向 Photos 新存图片。

## H5：VoiceOver

状态：`NOT_AVAILABLE`。当前镜像步骤不能独立采集手机语音，本轮未开启 VoiceOver，也没有用户实际听取状态播报或完整焦点顺序。需要用户单独参与后才能继续；镜像可见状态不能替代语音和焦点验收。收尾时在 Settings → Accessibility 列表现场核对 VoiceOver 为 Off；本轮未修改该设置。

## 测试文件清理记录

用户已要求测试结束后清理 iPhone 上旧轮次及本轮产生的测试文件。已在 Files → On My iPhone 精确多选下面三张已识别 PNG 并点击垃圾桶：目录从 10 项变为 7 个无关文件夹，三张测试图片均从原位置消失。随后在 Recently Deleted 中现场看到这三张图片，来源均标记 On My iPhone。因此三张均记为可恢复删除，未永久删除，也没有触碰其他已删除项目。

| 位置 | 已确认对象 | 当前清理状态 |
| --- | --- | --- |
| On My iPhone | `9a06432b-0e0f-4a33-914b-d2576b58c67c.png`，旧 Demo 卡约 `+$20,040` | `DELETED_RECOVERABLY`：已从原位置移除，并在 Recently Deleted 复核 |
| On My iPhone | `pnl-arena-2026-season.png.PNG`，旧全虚构导入卡约 `+$740` | `DELETED_RECOVERABLY`：已从原位置移除，并在 Recently Deleted 复核 |
| On My iPhone | `pnl-arena-test-20260906.png.png`，本轮新图 | `DELETED_RECOVERABLY`：已从原位置移除，并在 Recently Deleted 复核 |
| iCloud Drive / Downloads | 旧全虚构小型 CSV、`iphone-stress-pack-2026-09-02` 目录和两份压力包 ZIP，共四个顶层对象 | `LOCAL_DOWNLOAD_REMOVED`：选中时显示 4 Items，执行 Remove Download 后四对象均显示云朵下载标记；云端原件保留，未删除 |
| Photos | 旧轮次曾产生的测试卡副本；本轮有界查找未定位可确认对象，现存数量未知 | `NEEDS_USER_LOCATION / UNVERIFIED`：没有删除任何照片，不能据未搜到推定不存在 |

Photos 的有界查找包括搜索 `740` 和 `pnl-arena`，均显示 No Results；`P&L` 和日期查询返回无关结果，Recent Saved 中可见缩略图也未定位到可确认的测试图片。这些查找不构成全库穷尽核查，也不能证明旧图不存在；尚需用户提供位置或帮助识别。没有删除任何照片，本轮也没有新保存图片到 Photos。

本轮清理计数：On My iPhone 三张 PNG 可恢复删除；iCloud Downloads 四个顶层对象仅移除本机下载，其中一个对象是压力包目录，不能称为“四个文件已删除”；Photos 删除数为零；永久删除数为零。

Remove Download 仅表示普通的本机下载移除，云端对象仍可见且可重新下载，不是云端删除，也不是安全擦除或所有缓存字节已不可恢复的证明。已向用户说明 iCloud 四对象的删除会跨设备同步并询问该范围，尚未收到答复；跨设备 iCloud 同步删除和永久删除均未执行。Mac 归档、仓库 fixture 和旧验收记录保留。

## 收尾与剩余边界

- Safari 标签页概览中已关闭本轮 1 个 Blob 图片标签和 2 个 Ledger 测试标签，最后回到 Safari Start Page。
- Mac 端以只读监听检查确认端口 `4173` 的唯一进程为本仓库 Vite Preview，PID `8673`。使用 SIGTERM 正常停止该进程后再次检查，命令退出码为 1 且没有输出，确认该端口无监听。仓库不记录局域网 IP。
- 本轮设备型号与系统版本已现场核对为 iPhone 17 Pro Max / iOS 27.0。
- Settings → Accessibility 显示 VoiceOver 为 Off；本轮没有开启或修改该设置。其他未明确识别的历史权限不据此宣称已撤回。
- On My iPhone 的三张已识别测试 PNG 已可恢复删除，并在 Recently Deleted 复核；未永久删除或操作其他已删除项目。Mac 归档保持保留。
- iCloud Downloads 四个顶层测试对象均已执行 Remove Download 并显示云朵下载标记；云端原件保留，未进行跨设备同步删除。普通移除下载不等于安全擦除。
- Photos 有界查找未定位可确认的旧测试图，没有删除任何照片；保留 `NEEDS_USER_LOCATION / UNVERIFIED`，不能宣称全部测试文件已清理。
- 三语隐私已完成上述核读及每语言一种关闭方法；横竖屏和 VoiceOver 验收仍未完成。本轮记录已收束，后续按尚开放的用户参与及清理项目继续。
- iOS/Safari 16.4 支持下限、峰值内存、Worker 内部状态、完整 VoiceOver、HTTPS 原生分享/精确原定文件名、部署后 Network/Storage/响应头及合格真实 Exercise 样本仍未由本轮证明。
