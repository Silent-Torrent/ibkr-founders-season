#!/bin/zsh
set -e
cd "$(dirname "$0")"

for node22_bin in /opt/homebrew/opt/node@22/bin /usr/local/opt/node@22/bin; do
  if [[ -x "$node22_bin/node" ]]; then
    export PATH="$node22_bin:$PATH"
    break
  fi
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 22 LTS, then run this file again."
  echo "Official download: https://nodejs.org/"
  echo
  read "?Press Return to close..."
  exit 1
fi

node -e '
const [major, minor] = process.versions.node.split(".").map(Number)
const supported = major === 22 && minor >= 12
if (!supported) {
  console.error(`Node.js ${process.versions.node} is not the supported project runtime. Use the latest Node.js 22 LTS security release.`)
  process.exit(1)
}
'

echo "Node: $(node --version)"
echo "npm:  $(npm --version)"
echo

npm ci --no-fund
npm audit --audit-level=high
npm run check
npm run build

echo
echo "Verification completed. Production files are in ./dist"
read "?Press Return to close..."
