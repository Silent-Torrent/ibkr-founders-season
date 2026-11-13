# R01 本地对照证据

Product checks 的 `local-privacy-evidence` 产物来自隔离的 Chromium、回环 HTTP 生产构建及虚构报表。`local-privacy-report.json` 包含提交、浏览器版本、页面及解析 Worker 观察到的资源路径和请求计数，以及三个时点的存储检查。

- 虚构报表已在内存、刷新回到 demo、手机模拟点击清除后三次检查。只允许现有偏好的键和值结构。记录键名和计数，报告不保存值。
- 核对 sessionStorage、IndexedDB、Cache Storage、Service Worker 和页面可见 Cookie。网络只允许本站静态 GET；页面和 Worker 的记录分列，保留原完整套件的 WebSocket 和 CSP 断言。
- 网络汇总范围是完整套件从打开应用到原网络断言的路径。后续主动触发的 CSP 拒绝对照不进入常规资源计数。报告只含经校验的相对静态资源路径，不含请求头、请求体、参数、Cookie 值或账户数据。

本地结果供 R01 在获准环境比对。部署响应头、服务端日志、HttpOnly Cookie 和平台 SSO 另有验收范围。R01 继续 OPEN，由 Philip 验收。
