# 2026-11-13 · 发布证据对账

基线 main `27cdc656edd5f22cc35a887457fa8244d041839a`。#17 改了移动布局，#18 增加对战海报与导出，#20 增加本地隐私采集。门禁追踪中 `2f465b2` 的 19 项检查仍可作历史对照。当前结果取自基线提交的非 root Linux Chrome 157、回环 HTTP 生产构建及虚构数据。19 项手机模拟和完整 `npm run check` 通过。 [历史基线](mobile-gates-2f465b2/README.md) · [当前 CI](https://github.com/Silent-Torrent/ibkr-founders-season/actions/runs/43382279754) · [当前手机报告](https://github.com/Silent-Torrent/ibkr-founders-season/actions/runs/43382279754/artifacts/14017002805)

| 项目 | `27cdc65` 证据 | 待验收 |
| --- | --- | --- |
| D01 容量与响应 | 5 MiB、100,000 行、500 个虚构标的和 1,000 个事件，触控模拟导入 1,542.4 ms、最长主线程任务 0 ms，低于 10,000 / 250 ms。Worker 运行期 23 次采样，观测最大 19.63 MiB。 | Philip 验收模拟结果。内存为有限采样，尚无批准的数值上限。 |
| D02 导入与分享 | 虚构 CSV 经生产 Worker 得到 3 行、+7.7% 和三项精确对账。手机用例覆盖导入、账本筛选、勋章、清理和三种 PNG 尺寸。打开原 PNG 发现 3:4 人格名与模板标题重叠。 | 核对修复后的候选提交。 |
| D07 辅助功能 | 三语辅助功能树覆盖成功、失败、取消和手选。四页键盘导航、两类弹窗的焦点环与回焦通过。 | Philip 验收模拟结果。 |
| D08 横竖视口 | 390×844、844×390、667×375 切换通过，受测控件达到 44 CSS px，导航和面板无横向溢出。另有 390×844、393×852、1440×900 代表性截图。 | Philip 验收模拟结果。 |
| R01 隐私 | 观察到的 HTTP 请求均为同源静态 GET。外部、非 GET 和 Worker 子请求各 0。导入、刷新、清除后三次仅存获准偏好，其他受查存储和页面可见 Cookie 为空。 | Philip 在受保护 HTTPS Preview 核对匿名拒绝、实际部署提交、登录后的 Network/Storage、HTML/资源/Worker 响应头与 MIME。 |
| R02 文件重开 | 三张赛季 PNG 可在本地解码。#18 的对战海报有虚构样本浏览器测试，导出为 1080×1440。 | Philip 在受保护 HTTPS 候选构建下载并重开，核对完整文件名、尺寸、内容和默认隐藏金额。 |

#17 的完整布局矩阵保留当时的范围，当前提交另有代表性截图。旧提交 `e6f2405` 的 R01/R02 结果仅适用于当时的受保护部署。 [当前布局截图](https://github.com/Silent-Torrent/ibkr-founders-season/actions/runs/43382279754/artifacts/14017002799) · [当前本地隐私报告](https://github.com/Silent-Torrent/ibkr-founders-season/actions/runs/43382279754/artifacts/14017237188)

3:4 修复调整标题、收益率及说明坐标。英语吃肉模板的人格与标题字形从重叠 15 px 改为相隔 44 px，修复分支三语两模板的最小间隔为 44 px。手机和桌面截图来自同一虚构演示的实际生成 PNG。 [修复 CI](https://github.com/Silent-Torrent/ibkr-founders-season/actions/runs/43487152949)

F01 仍缺支持格式的完成行权记录形状，真实报表校准由 Philip 在自己设备上完成。D06 待确认旧测试图的定位及收尾。R03 待 Philip 正式验收已选的私有路线。 [门禁追踪](../RELEASE_GATE_TRACKER.md)

本轮门禁 **9 OPEN / 3 CLOSED**。
