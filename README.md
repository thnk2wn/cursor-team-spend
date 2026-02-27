# Cursor Team Spend (private extension)

Shows Cursor team on-demand spend in the status bar and provides a command to open the full spend report. Uses the Cursor Admin API with a token you set locally (not published to marketplace).

## Requirements

- Cursor (or VS Code)
- Cursor **Admin API** key from: [dashboard](https://cursor.com/dashboard) → **Settings** → **Advanced** → **Admin API Keys** (not the Integrations tab)

## Install from VSIX (no marketplace)

1. **Build the extension** (from this folder):

   ```bash
   npm install
   npm run compile
   npx vsce package --no-dependencies
   ```

   This produces `cursor-team-spend-0.1.0.vsix`.

2. **Install in Cursor**:

   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Run: **Extensions: Install from VSIX...**
   - Choose the `.vsix` file

   Or from terminal:

   ```bash
   cursor --install-extension /path/to/cursor-team-spend-0.1.0.vsix
   ```

3. **Set your API token**:

   - Command Palette → **Cursor Team Spend: Set API token**
   - Paste your Admin API key (from Settings → Advanced → Admin API Keys)

4. **Identify yourself** (for status bar):

   - The status bar shows **your** spend, not team total. The extension infers "you" from **global git `user.email`** if it matches a team member; otherwise run **Cursor Team Spend: Set my user** and pick your email from the list. That choice is stored and reused.

## Usage

- **Status bar**: Shows **your** spend vs user target, e.g. `Team Spend: $42.00 / $200`. Click to open the full team report.
- **Cursor Team Spend: Show team spend report** – Opens the full report (team total, on-demand, by user with remaining vs target, by model, by user+model).
- **Cursor Team Spend: Set API token** – Store or clear the API key (saved in secret storage).
- **Cursor Team Spend: Set my user** – Pick which team email is you (so the status bar shows your spend).
- **Cursor Team Spend: Refresh spend in status bar** – Refresh the status bar number.

## Settings

- `cursorTeamSpend.teamSpendLimit` – Team on-demand limit in dollars (default `1200`).
- `cursorTeamSpend.userSpendTarget` – Per-user target for “remaining” column (default `200`).

## Distributing to your team

Share the `.vsix` file (e.g. via internal repo or file share). Each teammate installs it via **Install from VSIX** and runs **Cursor Team Spend: Set API token** with their own (or a shared) Admin API key. The token is stored in Cursor’s secret storage and is not published anywhere.
