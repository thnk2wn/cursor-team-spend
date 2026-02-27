#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

npm install
npm run compile
npx vsce package --no-dependencies

echo ""
echo "Built: $(ls -1 cursor-team-spend-*.vsix 2>/dev/null | head -1)"
