#!/bin/zsh
set -e
cd "$(dirname "$0")"

npm ci --no-fund
npm audit --audit-level=high
npm run check
npm run build

echo
echo "Verification completed. Production files are in ./dist"
read "?Press Return to close..."
