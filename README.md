# Cursor Team Spend (private extension)

Shows Cursor team on-demand spend in the status bar and provides a command to open the full spend report. Uses the Cursor Admin API with a token you set locally (not published to marketplace).

## Requirements

- Cursor (or VS Code)
- Cursor **Admin API** key from: [dashboard](https://cursor.com/dashboard) → **Settings** → **Advanced** → **Admin API Keys** (not the Integrations tab)

## Getting Started

### Step 1: Install from a release

- **[Releases](https://github.com/thnk2wn/cursor-team-spend/releases)** — download the `.vsix` from the latest release, then in Cursor: Command Palette → **Extensions: Install from VSIX...** and select the file.

  **Quick install (GitHub CLI):**

  ```bash
  gh release download --repo thnk2wn/cursor-team-spend --pattern '*.vsix' -O cts.vsix && cursor --install-extension cts.vsix
  ```

### Step 2: Set your API token

- Click the extension’s status bar item, or **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`) → **Cursor Team Spend: Set API token**
- Paste your Admin API key (from Settings → Advanced → Admin API Keys). It is stored in Cursor’s secret storage and not published.

### Step 3: Set your username

- The status bar shows **your** spend. The extension infers “you” from **global git `user.email`** if it matches a team member; otherwise click the status bar or run **Command Palette** → **Cursor Team Spend: Set my user** and pick your email from the list. That choice is stored and reused.

## Usage

- **Status bar** — Shows your spend vs user target, e.g. `My Cursor Spend: $42.00 / $200`. Click to open the full team report.
- **Cursor Team Spend: Show team spend report** — Full report (team total, on-demand, by user with remaining vs target, by model).
- **Cursor Team Spend: Set API token** / **Set my user** / **Refresh spend in status bar** / **Clear saved data** — As above or from Command Palette.

## Settings

- `cursorTeamSpend.teamSpendLimit` — Team on-demand limit in dollars (default `1200`).
- `cursorTeamSpend.userSpendTarget` — Per-user target for “remaining” column (default `200`).

---

## Development

Use `npm run reinstall` for a clean build and install: removes `out` and `node_modules`, rebuilds, then installs the new `.vsix` into Cursor (so **Developer: Reload Window** picks it up). If `cursor` isn’t on your PATH it only builds the `.vsix`; install via **Extensions: Install from VSIX...** or:

```bash
cursor --install-extension ./cursor-team-spend-*.vsix
```

**Releases** are built from tags via [GitHub Actions](.github/workflows/release-vsix.yml); the VSIX is attached to the [Releases](https://github.com/thnk2wn/cursor-team-spend/releases) page. To cut a new version:

```bash
git tag v0.1.3
git push origin v0.1.3
```

The workflow uses the tag as the version (e.g. `v0.1.3` → version `0.1.3` in the built VSIX).
