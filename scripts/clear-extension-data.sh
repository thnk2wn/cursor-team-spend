#!/usr/bin/env bash
# Remove saved extension data (globalStorage) so the next Cursor launch behaves like a clean install.
# The API token is in the OS keychain; run "Cursor: Clear saved data" from the Command Palette to clear it, or clear it after opening Cursor via "Cursor: Set API token" (submit empty).

set -e
EXT_ID="internal.cursor-team-spend"
case "$(uname -s)" in
  Darwin)
    GLOBAL_STORAGE="${HOME}/Library/Application Support/Cursor/User/globalStorage/${EXT_ID}"
    ;;
  Linux)
    GLOBAL_STORAGE="${HOME}/.config/Cursor/User/globalStorage/${EXT_ID}"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    GLOBAL_STORAGE="${APPDATA:-$HOME/AppData/Roaming}/Cursor/User/globalStorage/${EXT_ID}"
    ;;
  *)
    echo "Unsupported OS. Set GLOBAL_STORAGE to your Cursor User/globalStorage/${EXT_ID} path and run: rm -rf \"\$GLOBAL_STORAGE\""
    exit 1
    ;;
esac
if [[ -d "$GLOBAL_STORAGE" ]]; then
  rm -rf "$GLOBAL_STORAGE"
  echo "Removed: $GLOBAL_STORAGE"
else
  echo "Nothing to remove: $GLOBAL_STORAGE"
fi
echo "Token is stored in the OS keychain. In Cursor, run 'Cursor Team Spend: Clear saved data (token, user)' to clear token and user, or run 'Cursor Team Spend: Set API token' and submit empty."
