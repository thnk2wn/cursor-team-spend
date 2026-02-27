#!/usr/bin/env bash
# Uninstall extension (if present), build, then install the new .vsix.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXT_ID="internal.cursor-team-spend"
if command -v cursor &>/dev/null; then
  cursor --uninstall-extension "$EXT_ID" 2>/dev/null || true
fi

./build.sh

VSIX=$(ls -1 cursor-team-spend-*.vsix 2>/dev/null | head -1)
if [[ -z "$VSIX" ]]; then
  echo "No .vsix produced."
  exit 1
fi

if command -v cursor &>/dev/null; then
  cursor --install-extension "$VSIX"
  echo "Installed: $VSIX"
  echo ""
  echo "Reload Cursor for the new extension to take effect: Cmd+Shift+P → Developer: Reload Window"
else
  echo "Built: $VSIX (install manually: cursor --install-extension $VSIX)"
fi
