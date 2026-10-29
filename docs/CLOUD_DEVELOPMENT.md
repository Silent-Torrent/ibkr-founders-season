# 云端开发与换设备接力

代码、开发文档、虚构测试数据和版本历史保存在 [GitHub 仓库](https://github.com/Silent-Torrent/ibkr-founders-season)；Codespaces 提供浏览器里的开发电脑。用户已授权跨设备云端开发，并保留公开源码。

> 2026-10-29 当前状态：日常云端开发流程已通过当前 Mac 浏览器验收，包括启动、打开和编辑文件、构建、提交推送，以及重建和空闲停止后的恢复。使用下方“两步入口”进入 JupyterLab。VS Code 网页编辑器仍有连接故障，完整云端自动测试尚未通过，第二台实体设备与手机开发尚未验收。详细证据见 [迁移记录](CLOUD_MIGRATION_2026-10-29.md)。

## 一、启动云端工作区

打开 [启动 IBKR Cloud Development v2](https://github.com/codespaces/ibkr-cloud-development-v2-96jq957j797v39x64?editor=jupyter)，登录自己的 GitHub 账号，等待工作区启动。这个官方入口会启动 JupyterLab 服务；其内嵌页面目前可能出现 **Blocked** 或空白框，接着使用第二步的独立入口即可。

在 [我的 Codespaces](https://github.com/codespaces) 中也可以核对 **IBKR Cloud Development v2** 是否已启动。旧的 **IBKR Cloud Development** 已停止并保留，暂不要在旧工作区继续改文件。

## 二、打开编辑器并保存

启动后，打开 [JupyterLab 文件与终端](https://ibkr-cloud-development-v2-96jq957j797v39x64-8888.app.github.dev/lab)。这是独立的私有 HTTPS 编辑页，按正常 GitHub 登录跳转即可。本次恢复流程无需手工输入 Jupyter 令牌，也没有修改浏览器安全设置。

在左侧文件列表打开项目文件，修改后选择 **File → Save**。如果出现旧目录提示，点击 **Close** 关闭提示，再从左侧进入项目目录；列表没有更新时刷新网页后重试。工作区内的项目路径是 `/workspaces/ibkr-founders-season`。本次已实测重建及空闲停止恢复后重新打开原文档、追加内容、保存并推送。

只查看代码或小幅修改文档，也可用 [GitHub 浏览器编辑器](https://github.dev/Silent-Torrent/ibkr-founders-season)，但它没有本项目的运行终端。原工作区被删除后，可 [创建项目 Codespace](https://codespaces.new/Silent-Torrent/ibkr-founders-season)，选择 `main`、仓库开发容器配置和 2 核机器，并核对额度。JupyterLab 4.6.4 和依赖已固定，实际容器重建及依赖检查通过。

电脑浏览器是主要入口，GitHub 推荐 Chrome/Edge。手机适合查看和轻量修改；目前没有第二台实体设备或手机开发验收结果。

## 三、运行和预览

**工作区停止后，应用预览不会自动重新运行。** 每次恢复后，在 JupyterLab 打开 **File → New → Terminal**，运行：

```sh
cd /workspaces/ibkr-founders-season
npm run dev:cloud
```

打开 [开发预览 5173](https://ibkr-cloud-development-v2-96jq957j797v39x64-5173.app.github.dev)。该入口已验证欢迎页和 Demo；通过另一条加密转发路径的虚构 CSV 导入也已通过。如果提示端口已占用，说明可能已有开发服务，先查看链接，勿反复启动。

查看构建后的版本时，在另一个终端运行：

```sh
cd /workspaces/ibkr-founders-season
npm run build && npm run preview:cloud
```

[构建预览 4173](https://ibkr-cloud-development-v2-96jq957j797v39x64-4173.app.github.dev) 已通过直接私有 HTTPS 访问和文件选择器导入验收；停止恢复并重启服务后再次导入也通过，虚构样例显示内部检查通过、+$740、+7.7% 和 3 个标的。两种预览都应保持 **Private**。源码公开不会要求个人开发预览公开；Safari/iPhone 正式兼容性须另外测试构建版本。

## 保存到云端与换设备

**保存文件只保存到当前 Codespace；提交并推送才会进入 GitHub 的长期版本历史。** 本次已在 JupyterLab 网页终端完成“保存 → 提交 → 推送”验收，并在重建及停止恢复后重复通过，使用正常 HTTPS 登录凭据，无需复制密钥或开启临时密钥转发。单独使用本机 CLI 的 SSH 会话尚有凭据继承限制，不影响已验证的网页终端路径。

日常修改后，在网页终端先运行 `git status` 和 `git diff` 查看改动，再只提交本次需要的文件，填写说明，执行 `git push origin main`。具体文件名和提交说明由当次开发任务确定，不要盲目把所有文件加入。推送后在 GitHub 仓库核对最新提交，而不只看编辑器的“已保存”。

提交前确认没有真实券商报表、密钥或个人资料；不要把 SSH 私钥或凭据粘贴进网页终端、文档或仓库。当前工作区的重建、网页编辑和停止恢复已通过；继续使用同一个工作区即可。

换设备时登录同一 GitHub 账号，按“一、启动 → 二、编辑 → 三、运行”进入 **IBKR Cloud Development v2**。这套恢复流程已在当前 Mac 浏览器验证，第二台实体设备仍需实测。停止后请重新运行预览命令。如果还使用本机副本，先拉取 GitHub 最新版本再修改，避免同时改同一文件。

工作结束在 [我的 Codespaces](https://github.com/codespaces) 选择 **Stop codespace**。关闭浏览器不会立即停止云电脑。默认停止后 30 天不再使用的工作区可能自动删除，未推送工作不应只留在其中。

## 测试结果怎么判断

本机 Node 22 全量测试已通过。云端 Node 22.23.4、npm 10.9.9 的依赖安装、零已知漏洞审计、非浏览器测试及构建通过；**云端完整检查未通过**：Chromium 启动被系统的 namespace 权限限制阻止，错误为 `Operation not permitted`。

完整检查命令仍是：

```sh
unset IBKR_BROWSER_IMPORT_SKIP_BUILD IBKR_BROWSER_IMPORT_DIST_DIR
npm run check
```

不能跳过浏览器测试、降低阈值或关闭浏览器隔离来宣称通过。JupyterLab 能编辑、构建成功或一次手动虚构导入，都不能替代完整回归。Mac 专用的原生内存诊断仍在 Mac 上进行。

## 哪些内容会跟随项目

| 内容 | 保存位置与边界 |
|---|---|
| 源代码、开发规则、交接文档、虚构测试数据、Git 历史 | 公开 GitHub 仓库；Codespace 使用同一版本 |
| 未提交的修改、正在运行的开发环境 | 当前个人 Codespace；长期保存还需推送 |
| 真实 CSV/PDF、IBKR 凭据、`.env.local`、SSH 私钥 | 不随代码上传，不复制进 Codespace |
| 应用导入的财务报表 | 当前浏览器标签页内存，不自动跨设备同步 |
| 旧压缩包、临时测试包、历史构建文件 | 保留本机；依赖和构建结果可在云端重新生成 |
| ChatGPT/Codex 历史聊天 | 不因迁移自动进入仓库；开发接力依据交接文档 |

此次没有新增数据库或券商自动连接。云端预览是个人开发工具，产品发布门槛仍按 [发布检查表](RELEASE_GATE_TRACKER.md) 管理。

## 费用与保护

截至 2026-10-29，GitHub Free 含每月 120 core-hours（2 核约 60 小时）和 15 GB-month 存储。账号已有的 Codespaces 超额预算为 **$0 且达到预算停止**，本次保持不变；默认空闲停止已设为 **15 分钟**，保留期为 **30 天**。这些是账号/工作区设置，新账号或重建时应重新核对 [用量](https://github.com/settings/billing) 与 [预算](https://github.com/settings/billing/budgets)。

当前使用一个主要的 2 核工作区，旧工作区已停止但保留，因此仍占用存储。没有提高预算或启用预构建；不要把“停止”理解为不再占用任何额度。

官方参考：[浏览器开发](https://docs.github.com/en/codespaces/developing-in-a-codespace/developing-in-a-codespace?tool=webui)、[JupyterLab 入口](https://docs.github.com/en/codespaces/developing-in-a-codespace/opening-an-existing-codespace?tool=webui)、[私有端口](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)、[计费规则](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)、[自动删除](https://docs.github.com/en/codespaces/setting-your-user-preferences/configuring-automatic-deletion-of-your-codespaces)。
