#!/bin/zsh
set -e
setopt pipefail

cd "$(dirname "$0")"

echo "============================================================"
echo " P&L Arena — 2026 Founders Season"
echo "============================================================"
echo

select_node_22() {
  local node22_bin current_node
  for node22_bin in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin; do
    if [[ -x "$node22_bin/node" ]] \
      && "$node22_bin/node" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 22 && minor >= 12 ? 0 : 1)' >/dev/null 2>&1; then
      export PATH="$node22_bin:$PATH"
      return 0
    fi
  done

  current_node="$(command -v node 2>/dev/null || true)"
  if [[ -n "$current_node" ]] \
    && "$current_node" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 22 && minor >= 12 ? 0 : 1)' >/dev/null 2>&1; then
    export PATH="${current_node:h}:$PATH"
    return 0
  fi
  return 1
}

if ! select_node_22; then
  echo "未找到可用的 Node.js 22（需要 22.12 或更高的 22.x 版本）。"
  echo "请安装最新的 Node.js 22 LTS，然后重新双击本文件。"
  echo "官方下载：https://nodejs.org/"
  echo
  read "?按回车键关闭..."
  exit 1
fi

echo "Node: $(node --version)"
echo "npm:  $(npm --version)"
echo

if [[ ! -f package.json || ! -f package-lock.json ]]; then
  echo "项目依赖清单不完整，无法安全启动。请不要自行新建或替换这些文件。"
  echo "请把这个提示交给项目维护者处理。"
  read "?按回车键关闭..."
  exit 1
fi

if ! dependency_hash="$(/usr/bin/shasum -a 256 package.json package-lock.json | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}')"; then
  echo "无法核对项目依赖清单，已停止启动。请保留上方错误并交给项目维护者处理。"
  read "?按回车键关闭..."
  exit 1
fi
if [[ -z "$dependency_hash" ]]; then
  echo "无法核对项目依赖清单，已停止启动。请把这个提示交给项目维护者处理。"
  read "?按回车键关闭..."
  exit 1
fi
dependency_stamp="node_modules/.pnl-arena-dependencies.sha256"
installed_hash=""
if [[ -f "$dependency_stamp" ]]; then
  installed_hash="$(<"$dependency_stamp")"
fi

needs_install=false
if [[ ! -x node_modules/.bin/vite \
  || ! -f node_modules/.package-lock.json \
  || "$installed_hash" != "$dependency_hash" ]]; then
  needs_install=true
elif ! npm ls --all --silent >/dev/null 2>&1; then
  needs_install=true
fi

if [[ "$needs_install" == true ]]; then
  echo "首次运行或依赖清单已更新，正在安装锁定版本的项目组件..."
  if ! npm ci --no-fund; then
    echo
    echo "项目组件安装失败。原因可能是网络、磁盘空间、权限、证书或依赖清单不一致。"
    echo "请保留上方错误信息并交给项目维护者；不要自行删除或替换项目文件。"
    read "?按回车键关闭..."
    exit 1
  fi
  print -r -- "$dependency_hash" > "$dependency_stamp"
else
  echo "项目组件已就绪，跳过重复安装和完整验收。"
fi

echo
echo "正在打开仅本机可见的网站..."
echo "使用期间请保持这个终端窗口开启；关闭窗口即可停止网站。"
echo "完整检查请另行双击 VERIFY_MAC.command。"
echo
dev_args=(--host 127.0.0.1)
if [[ "${PNL_ARENA_SKIP_OPEN:-0}" != 1 ]]; then
  dev_args+=(--open)
fi
npm run dev -- "${dev_args[@]}"
