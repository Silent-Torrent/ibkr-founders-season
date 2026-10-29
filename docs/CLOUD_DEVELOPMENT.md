# 云端开发与换设备接力

本项目以 [GitHub 仓库](https://github.com/Silent-Torrent/ibkr-founders-season) 保存代码、开发文档、测试和版本历史，以 GitHub Codespaces 提供浏览器里的开发电脑。2026-10-29 用户授权跨设备云端开发，并明确保留公开代码。

## 从哪里进入

- **日常继续开发：**打开 [我的 Codespaces](https://github.com/codespaces)，登录自己的 GitHub 账号，选择本项目已有的工作区。换电脑时也打开同一个工作区，不必每次新建。
- **第一次创建或工作区被删除后重建：**[创建本项目 Codespace](https://codespaces.new/Silent-Torrent/ibkr-founders-season)，选择 `main`、仓库的开发容器配置、2 核机器。先核对自己的免费额度和预算。
- **只看代码或小幅修改文档：**[浏览器编辑器](https://github.dev/Silent-Torrent/ibkr-founders-season) 不运行项目；要运行、测试或预览，请进入 Codespaces。

电脑浏览器是主要开发入口，Chrome/Edge 为 GitHub 推荐浏览器。平板可尝试外接键盘；手机适合查看与轻量修改，实际编辑体验取决于设备和浏览器，未做真机开发验收。

## 打开后怎么运行

创建时自动安装 Node 22、Chromium、zsh 和锁定的项目依赖。进入编辑器后，打开 **Terminal → New Terminal**，粘贴下面这一行并回车：

```sh
npm run dev:cloud
```

打开 **Ports** 面板中 **5173** 对应的浏览器链接，即可查看正在开发的应用。确认 **Visibility = Private**；公开源码不代表开发预览也需要公开。修改源文件并保存后，开发预览会刷新。

需要检查实际构建结果时，另开终端运行：

```sh
npm run build && npm run preview:cloud
```

使用 **4173** 的私有链接查看构建预览。开发服务器与构建预览用途不同；Safari/iPhone 的正式兼容性判断不能依据开发服务器。

完整项目检查：

```sh
unset IBKR_BROWSER_IMPORT_SKIP_BUILD IBKR_BROWSER_IMPORT_DIST_DIR
npm run check
```

检查必须如实通过，包括真实 Chromium/Worker 回归。不要为了云端通过而跳过浏览器测试、降低阈值或默认关闭浏览器隔离。macOS 专用的原生内存诊断仍需在 Mac 上进行。

## 保存、换设备与恢复

保存文件只保存到这台云端工作区。长期保存还需要在 **Source Control** 检查改动，填写本次改动说明，点击 **Commit**，再 **Sync Changes / Push**，确认 GitHub 上出现最新提交。提交前先检查没有真实报表、密钥或个人资料，不能直接把所有文件盲目加入。

换设备时登录同一 GitHub 账号并恢复同一个 Codespace；恢复后重新运行 `npm run dev:cloud`。如果另外使用本机副本或新建工作区，先拉取 GitHub 最新版本再修改，避免同时改同一文件造成冲突。

工作结束时在 [我的 Codespaces](https://github.com/codespaces) 中选择 **Stop codespace**。关闭浏览器不等于立即停止云电脑。默认未使用 30 天的停止工作区可能被自动删除；已推送到 GitHub 的代码与历史可以重建，未提交/未推送的工作不应只留在工作区。

## 哪些内容在云端

| 内容 | 保存位置与边界 |
|---|---|
| 源代码、开发规则、交接文档、虚构测试数据、Git 历史 | 公开 GitHub 仓库，Codespace 克隆同一版本 |
| 运行环境与开发中未提交的文件 | 个人 Codespace，长期保存仍需提交并推送 |
| 真实券商 CSV/PDF、IBKR 凭据、`.env.local`、SSH 私钥 | 不随代码上传，不复制进 Codespace |
| 应用里已导入的报表 | 仍只在当前浏览器标签页内存中，不自动跨设备同步 |
| 本机旧压缩包、历史构建文件、临时设备测试包 | 保留本机；可再生成的依赖/构建结果由云端生成 |
| ChatGPT/Codex 历史聊天 | 不会因为 GitHub 迁移自动变成代码文件；开发接力依据仓库交接文档 |

云端迁移没有增加数据库或券商自动连接。云开发预览是个人开发工具，不是全天候对外网站；现有产品发布门槛仍按 `RELEASE_GATE_TRACKER.md` 管理。

## 费用与保护

截至 2026-10-29，GitHub Free 官方包含每月 120 core-hours（2 核约 60 小时）和 15 GB-month 存储；停止的工作区仍占用存储。额度与规则可能变化，使用前以自己的 [用量](https://github.com/settings/billing) 和 [预算](https://github.com/settings/billing/budgets) 为准。保持 Codespaces 超额预算为 0 且达到预算停止，不启用付费或提高预算，除非自己决定。

本次选择 2 核起步，只保留一个主要工作区，不启用预构建。账号默认空闲停止已设为 15 分钟；这是账号设置，不是仓库配置的保证，新账号或重建时应核对。账号设置与实际验收状态见 `CLOUD_MIGRATION_2026-10-29.md`。

官方参考：[浏览器开发](https://docs.github.com/en/codespaces/developing-in-a-codespace/developing-in-a-codespace?tool=webui)、[私有端口](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)、[计费规则](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)、[自动删除](https://docs.github.com/en/codespaces/setting-your-user-preferences/configuring-automatic-deletion-of-your-codespaces)。
