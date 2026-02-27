const BASE = 'https://api.cursor.com';

function authHeader(token: string): Record<string, string> {
  const encoded = Buffer.from(`${token}:`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

export async function fetchSpend(token: string): Promise<{
  subscriptionCycleStart?: number;
  error?: string;
}> {
  const res = await fetch(`${BASE}/teams/spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ page: 1, pageSize: 1 }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code) return { error: `${data.code}: ${data.message ?? 'Error'}` };
  const cycle = data.subscriptionCycleStart as number | undefined;
  return { subscriptionCycleStart: cycle };
}

export interface UsageEvent {
  userEmail?: string;
  user_email?: string;
  kind?: string;
  model?: string;
  tokenUsage?: { totalCents?: number };
  cursorTokenFee?: number;
}

function cost(ev: UsageEvent): number {
  const c = ev.tokenUsage?.totalCents ?? 0;
  const f = ev.cursorTokenFee ?? 0;
  return c + f;
}

export async function fetchUsageEvents(
  token: string,
  startMs: number,
  endMs: number
): Promise<{ events: UsageEvent[]; error?: string }> {
  const all: UsageEvent[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const res = await fetch(`${BASE}/teams/filtered-usage-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ startDate: startMs, endDate: endMs, page, pageSize }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code) return { events: [], error: `${data.code}: ${data.message ?? 'Error'}` };
    const events = (data.usageEvents as UsageEvent[]) ?? [];
    all.push(...events);
    const pag = data.pagination as { numPages?: number } | undefined;
    const numPages = pag?.numPages ?? 1;
    if (page >= numPages) break;
    page += 1;
  }
  return { events: all };
}

export interface ReportData {
  cycleStartIso: string;
  daysLeft: number;
  totalDollars: string;
  onDemandDollars: string;
  teamLimit: number;
  userTarget: number;
  byUser: { email: string; dollars: string; remaining: string }[];
  byModel: { model: string; dollars: string }[];
  byUserModel: { email: string; model: string; dollars: string }[];
}

function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function buildReport(
  cycleStartMs: number,
  events: UsageEvent[],
  teamLimit: number,
  userTarget: number
): ReportData {
  const costPer = (ev: UsageEvent) => cost(ev);
  const totalCents = events.reduce((s, e) => s + costPer(e), 0);
  const onDemandCents = events
    .filter((e) => e.kind === 'Usage-based')
    .reduce((s, e) => s + costPer(e), 0);

  const byUserMap = new Map<string, number>();
  for (const e of events) {
    const email = e.userEmail ?? e.user_email ?? 'unknown';
    byUserMap.set(email, (byUserMap.get(email) ?? 0) + costPer(e));
  }
  const byUser = Array.from(byUserMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([email, cents]) => ({
      email,
      dollars: toDollars(cents),
      remaining: toDollars(userTarget * 100 - cents),
    }));

  const byModelMap = new Map<string, number>();
  for (const e of events) {
    const m = e.model ?? '(unknown)';
    byModelMap.set(m, (byModelMap.get(m) ?? 0) + costPer(e));
  }
  const byModel = Array.from(byModelMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([model, cents]) => ({ model, dollars: toDollars(cents) }));

  const umMap = new Map<string, number>();
  for (const e of events) {
    const email = e.userEmail ?? e.user_email ?? 'unknown';
    const m = e.model ?? '(unknown)';
    const key = `${email}\t${m}`;
    umMap.set(key, (umMap.get(key) ?? 0) + costPer(e));
  }
  const byUserModel = Array.from(umMap.entries())
    .map(([key, cents]) => {
      const [email, model] = key.split('\t');
      return { email, model, dollars: toDollars(cents) };
    })
    .sort((a, b) => a.email.localeCompare(b.email) || a.model.localeCompare(b.model));

  const cycleStartSec = Math.floor(cycleStartMs / 1000);
  const cycleStartIso = new Date(cycleStartSec * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const nowSec = Math.floor(Date.now() / 1000);
  const nextCycleSec = cycleStartSec + 30 * 86400;
  let daysLeft = Math.floor((nextCycleSec - nowSec) / 86400);
  if (daysLeft < 0) daysLeft = 0;

  return {
    cycleStartIso,
    daysLeft,
    totalDollars: toDollars(totalCents),
    onDemandDollars: toDollars(onDemandCents),
    teamLimit,
    userTarget,
    byUser,
    byModel,
    byUserModel,
  };
}

export async function fetchAndBuildReport(
  token: string,
  teamLimit: number,
  userTarget: number
): Promise<{ report?: ReportData; error?: string }> {
  const spend = await fetchSpend(token);
  if (spend.error) return { error: spend.error };
  const cycleStart = spend.subscriptionCycleStart ?? Date.now() - 30 * 86400 * 1000;
  const endMs = Date.now();
  const { events, error } = await fetchUsageEvents(token, cycleStart, endMs);
  if (error) return { error };
  const report = buildReport(cycleStart, events, teamLimit, userTarget);
  return { report };
}
