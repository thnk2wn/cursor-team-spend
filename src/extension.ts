import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { fetchAndBuildReport, LogFn } from './api';

const SECRET_KEY = 'cursorTeamSpend.apiToken';
const MY_EMAIL_KEY = 'cursorTeamSpend.myEmail';

const OUTPUT_CHANNEL_NAME = 'Cursor Team Spend';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (increase if you hit API rate limits)
const SPEND_WARNING_RATIO = 0.9; // toast when at or above 90% of personal target

function createLogger(channel: vscode.OutputChannel): LogFn {
  return (message: string, level?: 'error' | 'info') => {
    const ts = new Date().toISOString();
    const prefix = level === 'error' ? '[ERROR] ' : level === 'info' ? '[INFO] ' : '';
    channel.appendLine(`${ts} ${prefix}${message}`);
  };
}

function getGitUserEmail(): string | undefined {
  try {
    const out = execSync('git config --global user.email', { encoding: 'utf8' });
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('cursorTeamSpend');
  return {
    teamLimit: cfg.get<number>('teamSpendLimit', 1200),
    userTarget: cfg.get<number>('userSpendTarget', 200),
  };
}

async function getToken(context: vscode.ExtensionContext): Promise<string | undefined> {
  let token = await context.secrets.get(SECRET_KEY);
  if (token) return token;
  await vscode.commands.executeCommand('cursorTeamSpend.setToken');
  return context.secrets.get(SECRET_KEY);
}

type Report = Awaited<ReturnType<typeof fetchAndBuildReport>>['report'];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reportToHtml(r: Report): string {
  if (!r) return '';
  const periodBlock =
    r.myDollars != null
      ? `<div class="your-spend-stat"><div class="big">$${escapeHtml(r.myDollars)} <span style="font-size:14px;color:var(--muted)">/ $${r.userTarget}</span></div><div class="meta" style="font-size:12px;">Period spend</div></div>`
      : '';
  const lastDayBlock =
    r.myLastDaySpendDollars != null && r.myLastDaySpendDate != null
      ? `<div class="your-spend-stat"><div class="last-day-spend">$${escapeHtml(r.myLastDaySpendDollars)}</div><div class="meta" style="font-size:12px;">${escapeHtml(r.myLastDaySpendDate)}</div></div>`
      : '';
  const dailyAvgBlock =
    r.myDailyAvgDollars != null
      ? `<div class="your-spend-stat"><div class="daily-avg">$${escapeHtml(r.myDailyAvgDollars)} <span class="info-icon" title="Average per day, only counting days when you had usage">ℹ</span></div><div class="meta" style="font-size:12px;">Daily avg</div></div>`
      : '';
  const estExceedBlock =
    r.myEstimateExceedInDays != null
      ? `<div class="your-spend-stat"><div class="est-exceed">~${r.myEstimateExceedInDays} days</div><div class="meta" style="font-size:12px;">Est. to exceed budget</div></div>`
      : '';
  const statsBlock =
    periodBlock || lastDayBlock || dailyAvgBlock || estExceedBlock
      ? `<div class="your-spend-stats">${periodBlock}${lastDayBlock}${dailyAvgBlock}${estExceedBlock}</div>`
      : '';
  const mySection =
    r.myEmail && r.myDollars != null
      ? `
  <section>
    <h2>Your spend (this period)</h2>
    <div class="your-spend-row">
      ${statsBlock}
    </div>
    ${
      r.myRecentTransactions && r.myRecentTransactions.length > 0
        ? `
    <p class="meta" style="margin-top:12px;margin-bottom:8px;">Last 5 transactions</p>
    <table><thead><tr><th>Date</th><th>Type</th><th>Model</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead><tbody>
    ${r.myRecentTransactions
      .map(
        (t) =>
          `<tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.type)}</td><td class="model">${escapeHtml(t.model)}</td><td class="num">${escapeHtml(t.tokens)}</td><td class="num">${escapeHtml(t.cost)}</td></tr>`
      )
      .join('')}
    </tbody></table>`
        : ''
    }
  </section>`
      : `
  <section>
    <h2>Your spend</h2>
    <p class="meta">Set your user to see your spend and last 5 transactions here. Command Palette → <strong>Cursor Team Spend: Set my user</strong></p>
  </section>`;
  const rowsByUser = r.byUser
    .map(
      (u) =>
        `<tr><td class="email">${escapeHtml(u.email)}</td><td class="num">$${escapeHtml(u.dollars)}</td><td class="num">$${escapeHtml(u.remaining)}</td></tr>`
    )
    .join('');
  const rowsByModel = r.byModel
    .map(
      (m) =>
        `<tr><td class="model">${escapeHtml(m.model)}</td><td class="num">$${escapeHtml(m.dollars)}</td></tr>`
    )
    .join('');
  const rowsByUserModel = r.byUserModel
    .map(
      (um) =>
        `<tr><td class="email">${escapeHtml(um.email)}</td><td class="model">${escapeHtml(um.model)}</td><td class="num">$${escapeHtml(um.dollars)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cursor Team Spend</title>
  <style>
    :root { --bg: #f6f8fa; --card: #fff; --border: #e1e4e8; --text: #24292f; --muted: #57606a; --accent: #0969da; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: var(--text); background: var(--bg); }
    h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
    .meta { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
    section { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    section h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
    .summary { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
    .summary section { flex: 1; min-width: 180px; margin-bottom: 0; }
    .big { font-size: 24px; font-weight: 600; color: var(--accent); }
    .your-spend-row { display: flex; gap: 40px; flex-wrap: wrap; align-items: flex-start; }
    .your-spend-stats { display: flex; gap: 32px; flex-wrap: wrap; }
    .your-spend-stat { display: flex; flex-direction: column; gap: 2px; }
    .daily-avg, .last-day-spend { font-size: 18px; font-weight: 600; color: var(--accent); }
    .est-exceed { font-size: 16px; font-weight: 600; color: var(--text); }
    .info-icon { cursor: help; color: var(--muted); margin-left: 4px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
    th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .num { font-variant-numeric: tabular-nums; text-align: right; }
    .email, .model { word-break: break-all; }
  </style>
</head>
<body>
  <h1>Cursor Team Spend</h1>
  <p class="meta">Billing cycle start: ${escapeHtml(r.cycleStartIso)} · ${r.daysLeft} days left · Period: cycle start → now</p>
  <div class="summary">
    <section>
      <h2>Team total (this period)</h2>
      <div class="big">$${escapeHtml(r.totalDollars)}</div>
    </section>
    <section>
      <h2>On-demand (team)</h2>
      <div class="big">$${escapeHtml(r.onDemandDollars)} <span style="font-size:14px;color:var(--muted)">/ $${r.teamLimit}</span></div>
    </section>
  </div>${mySection}
  <section>
    <h2>By user</h2>
    <table><thead><tr><th>User</th><th class="num">Spend</th><th class="num">Remaining</th></tr></thead><tbody>${rowsByUser}</tbody></table>
  </section>
  <section>
    <h2>By model</h2>
    <table><thead><tr><th>Model</th><th class="num">Spend</th></tr></thead><tbody>${rowsByModel}</tbody></table>
  </section>
  <section>
    <h2>By user + model</h2>
    <table><thead><tr><th>User</th><th>Model</th><th class="num">Spend</th></tr></thead><tbody>${rowsByUserModel}</tbody></table>
  </section>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
  const log = createLogger(outputChannel);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBar);
  let spentToastShownThisSession = false;

  async function refreshStatus() {
    const token = await context.secrets.get(SECRET_KEY);
    if (!token) {
      statusBar.text = '$(key) Team Spend: set token';
      statusBar.tooltip = 'Set API token: Cursor Team Spend: Set API token';
      statusBar.command = 'cursorTeamSpend.setToken';
      statusBar.show();
      return;
    }
    let myEmail = context.globalState.get<string>(MY_EMAIL_KEY);
    const { teamLimit, userTarget } = getConfig();

    const { report, error } = await fetchAndBuildReport(token, teamLimit, userTarget, undefined, log);
    if (error) {
      log(error, 'error');
      statusBar.text = '$(warning) Team Spend: error';
      statusBar.tooltip = error;
      statusBar.command = 'cursorTeamSpend.showReport';
      statusBar.show();
      return;
    }
    if (!report) return;

    if (!myEmail && report.byUser.length > 0) {
      const gitEmail = getGitUserEmail();
      const match = report.byUser.find((u) => u.email.toLowerCase() === gitEmail?.toLowerCase());
      if (match) {
        myEmail = match.email;
        await context.globalState.update(MY_EMAIL_KEY, myEmail);
      }
    }

    if (!myEmail) {
      statusBar.text = '$(person) Team Spend: set user';
      statusBar.tooltip = 'Click to choose your user (for status bar spend).';
      statusBar.command = 'cursorTeamSpend.setMyUser';
      statusBar.show();
      return;
    }

    const me = report.byUser.find((u) => u.email.toLowerCase() === myEmail!.toLowerCase());
    const mySpendStr = me?.dollars ?? '0.00';
    const mySpendNum = parseFloat(mySpendStr) || 0;
    const ratio = userTarget > 0 ? mySpendNum / userTarget : 0;

    let icon: string;
    if (ratio >= 1) {
      icon = '$(error)';
      statusBar.tooltip = `Over personal spend target ($${mySpendStr} / $${userTarget}). Click for report.`;
    } else if (ratio >= SPEND_WARNING_RATIO) {
      icon = '$(warning)';
      statusBar.tooltip = `Approaching spend target ($${mySpendStr} / $${userTarget}). Click for report.`;
      if (!spentToastShownThisSession) {
        spentToastShownThisSession = true;
        vscode.window.showWarningMessage(
          `Cursor Team Spend: You're at ${Math.round(ratio * 100)}% of your personal spend target ($${mySpendStr} / $${userTarget}).`
        );
      }
    } else {
      icon = '$(pulse)';
      statusBar.tooltip = `Your spend this period. Click for full team report.`;
    }

    statusBar.text = `${icon} My Cursor Spend: $${mySpendStr} / $${userTarget}`;
    statusBar.command = 'cursorTeamSpend.showReport';
    statusBar.show();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTeamSpend.setToken', async () => {
      const token = await context.secrets.get(SECRET_KEY);
      const placeHolder = token ? '••••••••' : 'Paste Admin API key (from Settings → Advanced → Admin API Keys)';
      const value = await vscode.window.showInputBox({
        title: 'Cursor Team Spend – API token',
        placeHolder,
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) return;
      if (!value?.trim()) {
        await context.secrets.delete(SECRET_KEY);
        vscode.window.showInformationMessage('Cursor Team Spend: token cleared.');
      } else {
        await context.secrets.store(SECRET_KEY, value.trim());
        vscode.window.showInformationMessage('Cursor Team Spend: token saved.');
      }
      refreshStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTeamSpend.showReport', async () => {
      const token = await getToken(context);
      if (!token) return;
      const { teamLimit, userTarget } = getConfig();
      const myEmail = context.globalState.get<string>(MY_EMAIL_KEY);
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Cursor team spend…' },
        async () => {
          const { report, error } = await fetchAndBuildReport(token, teamLimit, userTarget, myEmail, log);
          if (error) {
            log(error, 'error');
            vscode.window.showErrorMessage(`Cursor Team Spend: ${error}`);
            return;
          }
          if (report) {
            log(
              report.myEmail
                ? `Report opened (user: ${report.myEmail}, ${report.myRecentTransactions?.length ?? 0} recent transactions)`
                : 'Report opened (no user set)',
              'info'
            );
            const panel = vscode.window.createWebviewPanel(
              'cursorTeamSpend.report',
              'Cursor Team Spend',
              vscode.ViewColumn.One,
              { enableScripts: false }
            );
            panel.webview.html = reportToHtml(report);
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTeamSpend.setMyUser', async () => {
      const token = await getToken(context);
      if (!token) return;
      const { teamLimit, userTarget } = getConfig();
      const { report, error } = await fetchAndBuildReport(token, teamLimit, userTarget, undefined, log);
      if (error) {
        log(error, 'error');
        vscode.window.showErrorMessage(`Cursor Team Spend: ${error}`);
        return;
      }
      if (!report || report.byUser.length === 0) {
        log('setMyUser: no team users in report', 'info');
        vscode.window.showInformationMessage('Cursor Team Spend: no team users in report.');
        return;
      }
      const current = context.globalState.get<string>(MY_EMAIL_KEY);
      const pick = await vscode.window.showQuickPick(
        report.byUser.map((u) => ({ label: u.email, description: `$${u.dollars} spend` })),
        {
          title: 'Select your Cursor team email',
          matchOnDescription: false,
          placeHolder: current ? `Current: ${current}` : 'Choose to show your spend in the status bar',
        }
      );
      if (pick) {
        await context.globalState.update(MY_EMAIL_KEY, pick.label);
        vscode.window.showInformationMessage(`Cursor Team Spend: you are ${pick.label}`);
        refreshStatus();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTeamSpend.refreshStatus', refreshStatus)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorTeamSpend.clearSavedData', async () => {
      await context.secrets.delete(SECRET_KEY);
      await context.globalState.update(MY_EMAIL_KEY, undefined);
      vscode.window.showInformationMessage('Cursor Team Spend: API token and user cleared.');
      refreshStatus();
    })
  );

  refreshStatus();
  const interval = setInterval(refreshStatus, REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() {}
