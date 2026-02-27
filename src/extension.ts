import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { fetchAndBuildReport } from './api';

const SECRET_KEY = 'cursorTeamSpend.apiToken';
const MY_EMAIL_KEY = 'cursorTeamSpend.myEmail';

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

function formatReport(r: Awaited<ReturnType<typeof fetchAndBuildReport>>['report']): string {
  if (!r) return '';
  const lines: string[] = [
    `Billing cycle start: ${r.cycleStartIso}`,
    `Days left in period: ${r.daysLeft}`,
    'Period: cycle start → now',
    '',
    '=== Team total (this period) ===',
    `  $${r.totalDollars}`,
    '',
    'On-Demand (team):',
    `  $${r.onDemandDollars} / $${r.teamLimit}`,
    '',
    '=== By user ===',
    '                                    spend  remaining',
  ];
  for (const u of r.byUser) {
    lines.push(`  ${u.email.padEnd(40)}  $${u.dollars.padStart(8)}  $${u.remaining.padStart(8)}`);
  }
  lines.push('', '=== By model ===');
  for (const m of r.byModel) {
    lines.push(`  ${m.model.padEnd(45)}  $${m.dollars}`);
  }
  lines.push('', '=== By user + model ===');
  for (const um of r.byUserModel) {
    lines.push(`  ${um.email.padEnd(36)}  ${um.model.padEnd(40)}  $${um.dollars}`);
  }
  return lines.join('\n');
}

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBar);

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

    const { report, error } = await fetchAndBuildReport(token, teamLimit, userTarget);
    if (error) {
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
    const mySpend = me?.dollars ?? '0.00';
    statusBar.text = `$(pulse) Team Spend: $${mySpend} / $${userTarget}`;
    statusBar.tooltip = `Your spend this period. Click for full team report.`;
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
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Cursor team spend…' },
        async () => {
          const { report, error } = await fetchAndBuildReport(token, teamLimit, userTarget);
          if (error) {
            vscode.window.showErrorMessage(`Cursor Team Spend: ${error}`);
            return;
          }
          if (report) {
            const doc = await vscode.workspace.openTextDocument({
              content: formatReport(report),
              language: 'plaintext',
            });
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
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
      const { report, error } = await fetchAndBuildReport(token, teamLimit, userTarget);
      if (error) {
        vscode.window.showErrorMessage(`Cursor Team Spend: ${error}`);
        return;
      }
      if (!report || report.byUser.length === 0) {
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
  const interval = setInterval(refreshStatus, 60 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() {}
