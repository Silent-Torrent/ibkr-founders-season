#!/bin/zsh
set -e
setopt pipefail
cd "$(dirname "$0")"

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
  echo "项目依赖清单不完整，无法执行完整验收。请把这个提示交给项目维护者处理。"
  read "?按回车键关闭..."
  exit 1
fi

npm ci --no-fund
if ! dependency_hash="$(/usr/bin/shasum -a 256 package.json package-lock.json | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}')"; then
  echo "无法核对项目依赖清单，完整验收已停止。请保留上方错误并交给项目维护者处理。"
  read "?按回车键关闭..."
  exit 1
fi
if [[ -z "$dependency_hash" ]]; then
  echo "无法核对项目依赖清单，完整验收已停止。请把这个提示交给项目维护者处理。"
  read "?按回车键关闭..."
  exit 1
fi
print -r -- "$dependency_hash" > node_modules/.pnl-arena-dependencies.sha256
npm audit --audit-level=high
npm run check
npm run build

echo
echo "Verification completed. Production files are in ./dist"
if [[ -t 0 ]]; then
  read "?Press Return to close..."
fi
