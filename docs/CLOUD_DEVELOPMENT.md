# 云端开发与换设备接力

代码、开发文档、虚构测试数据和版本历史保存在 [GitHub 仓库](https://github.com/Silent-Torrent/ibkr-founders-season)；Codespaces 提供浏览器里的开发电脑。用户已授权跨设备云端开发，并保留公开源码。

> 2026-10-29 当前状态：云端已实测打开文件、修改保存，并在 JupyterLab 网页终端完成构建、提交和推送。VS Code 网页编辑器仍有连接故障；重建后后台已恢复，网页复测因 Mac 锁屏待完成；官方启动入口、完整云端测试及第二台设备尚未全部验收，不能视为迁移完成。详细证据见 [迁移记录](CLOUD_MIGRATION_2026-10-29.md)。

## 从哪里进入

- **当前主要工作区：**打开 [我的 Codespaces](https://github.com/codespaces)，选择 **IBKR Cloud Development v2**。换设备也进入同一个工作区。旧的 **IBKR Cloud Development** 已停止并保留，暂不要在旧工作区继续改文件。
- **目前已验证的网页编辑入口：**[JupyterLab 文件与终端](https://ibkr-cloud-development-v2-96jq957j797v39x64-8888.app.github.dev/lab)。它使用个人工作区的私有端口，需登录自己的 GitHub 账号；新会话可能还需要 Jupyter 的当次登录令牌，优先使用下面的官方启动入口，不公开分享带令牌的链接。工作区停止或服务未启动时不可用。本次重建后的网页仍待解锁复测。
- **可收藏的官方启动入口，尚在验收：**[用 JupyterLab 打开该工作区](https://github.com/codespaces/ibkr-cloud-development-v2-96jq957j797v39x64?editor=jupyter)。此入口由 GitHub 官方支持，但本工作区尚未完成从停止到可编辑的完整验证。
- **只看代码或小幅修改文档：**[GitHub 浏览器编辑器](https://github.dev/Silent-Torrent/ibkr-founders-season) 可以编辑仓库文件，不提供本项目的运行终端。
- **首次创建或原工作区被删除后：**[创建项目 Codespace](https://codespaces.new/Silent-Torrent/ibkr-founders-season)，选择 `main`、仓库开发容器配置、2 核机器；先核对免费额度与预算。JupyterLab 4.6.4 和依赖版本已固定在容器配置，实际重建及依赖检查已通过。

电脑浏览器是主要入口，GitHub 推荐 Chrome/Edge。手机适合查看和轻量修改；目前没有第二台实体设备或手机开发验收结果。

## 打开、修改和运行

在 JupyterLab 左侧文件列表打开项目文件，修改后选择 **File → Save**。本次已实测创建文档、保存并读回一致；网页终端也已成功构建项目。

打开 **File → New → Terminal**，确认位于 `ibkr-founders-season` 项目目录，再运行：

```sh
npm run dev:cloud
```

打开 [开发预览 5173](https://ibkr-cloud-development-v2-96jq957j797v39x64-5173.app.github.dev)。该入口已验证欢迎页和 Demo；通过另一条加密转发路径的虚构 CSV 导入也已通过。如果提示端口已占用，说明可能已有开发服务，先查看链接，勿反复启动。

查看构建后的版本时，在另一个终端运行：

```sh
npm run build && npm run preview:cloud
```

[构建预览 4173](https://ibkr-cloud-development-v2-96jq957j797v39x64-4173.app.github.dev) 已通过直接私有 HTTPS 访问和文件选择器导入验收：虚构样例显示内部检查通过、+$740、+7.7% 和 3 个标的。两种预览都应保持 **Private**。源码公开不会要求个人开发预览公开；Safari/iPhone 正式兼容性须另外测试构建版本。

## 保存到云端与换设备

**保存文件只保存到当前 Codespace；提交并推送才会进入 GitHub 的长期版本历史。** 本次已在 JupyterLab 网页终端完成“保存 → 提交 → 推送”验收，使用正常 HTTPS 登录凭据，无需复制密钥或开启临时密钥转发。单独使用本机 CLI 的 SSH 会话尚有凭据继承限制，不影响已验证的网页终端路径。

日常修改后，在网页终端先运行 `git status` 和 `git diff` 查看改动，再只提交本次需要的文件，填写说明，执行 `git push origin main`。具体文件名和提交说明由当次开发任务确定，不要盲目把所有文件加入。推送后在 GitHub 仓库核对最新提交，而不只看编辑器的“已保存”。

提交前确认没有真实券商报表、密钥或个人资料；不要把 SSH 私钥或凭据粘贴进网页终端、文档或仓库。当前工作区已重建并恢复后台服务，网页最终复测仍待解锁完成；继续使用它即可。

换设备时登录同一 GitHub 账号并恢复 **IBKR Cloud Development v2**。重建后后台及预览服务已恢复，重新打开网页的最后检查仍待完成；停止后预览服务通常需要重新运行。如果还使用本机副本，先拉取 GitHub 最新版本再修改，避免同时改同一文件。

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
