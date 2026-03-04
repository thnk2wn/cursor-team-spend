const BASE = 'https://api.cursor.com';

export type LogFn = (message: string, level?: 'error' | 'info') => void;

function authHeader(token: string): Record<string, string> {
  const encoded = Buffer.from(`${token}:`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

export async function fetchSpend(
  token: string,
  log?: LogFn
): Promise<{ subscriptionCycleStart?: number; error?: string }> {
  const res = await fetch(`${BASE}/teams/spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ page: 1, pageSize: 1 }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code) {
    const err = `${data.code}: ${data.message ?? 'Error'}`;
    log?.(`fetchSpend: ${err}`, 'error');
    return { error: err };
  }
  const cycle = data.subscriptionCycleStart as number | undefined;
  return { subscriptionCycleStart: cycle };
}

export interface UsageEvent {
  userEmail?: string;
  user_email?: string;
  kind?: string;
  model?: string;
  tokenUsage?: {
    totalCents?: number;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    [k: string]: number | undefined;
  };
  cursorTokenFee?: number;
  createdAtMs?: number;
  createdAt?: number;
  created_at?: number;
  timestamp?: number;
  date?: number;
  time?: number;
  totalTokens?: number;
  total_tokens?: number;
  tokens?: number;
  token_count?: number;
}

function cost(ev: UsageEvent): number {
  const c = ev.tokenUsage?.totalCents ?? 0;
  const f = ev.cursorTokenFee ?? 0;
  return c + f;
}

export async function fetchUsageEvents(
  token: string,
  startMs: number,
  endMs: number,
  log?: LogFn
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
    if (data.code) {
      const err = `${data.code}: ${data.message ?? 'Error'}`;
      log?.(`fetchUsageEvents: ${err}`, 'error');
      return { events: [], error: err };
    }
    const events = (data.usageEvents as UsageEvent[]) ?? [];
    all.push(...events);
    const pag = data.pagination as { numPages?: number } | undefined;
    const numPages = pag?.numPages ?? 1;
    if (page >= numPages) break;
    page += 1;
  }
  log?.(`Fetched ${all.length} usage events`, 'info');
  if (all.length > 0 && log) {
    const first = all[0] as Record<string, unknown>;
    const keys = Object.keys(first).sort().join(', ');
    log(`First event keys: ${keys}`, 'info');
    const tu = first.tokenUsage as Record<string, unknown> | undefined;
    if (tu && typeof tu === 'object') {
      log(`First event tokenUsage keys: ${Object.keys(tu).sort().join(', ')}`, 'info');
    }
  }
  return { events: all };
}

export interface ReportTransactionRow {
  date: string;
  user: string;
  type: string;
  model: string;
  tokens: string;
  cost: string;
}

export interface ReportData {
  byModel: { model: string; dollars: string }[];
  byUser: { email: string; dollars: string; remaining: string }[];
  byUserModel: { email: string; model: string; dollars: string }[];
  cycleStartIso: string;
  daysLeft: number;
  myDailyAvgDollars?: string;
  myDollars?: string;
  myEmail?: string;
  myEstimateExceedInDays?: number;
  myLastDaySpendDate?: string;
  myLastDaySpendDollars?: string;
  myRecentTransactions?: ReportTransactionRow[];
  onDemandDollars: string;
  teamLimit: number;
  totalDollars: string;
  userTarget: number;
}

function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function eventTimeMs(ev: UsageEvent): number {
  if (ev.createdAtMs != null) return ev.createdAtMs;
  if (ev.createdAt != null) return ev.createdAt * 1000;
  if (ev.created_at != null) return ev.created_at * 1000;
  if (ev.timestamp != null) return ev.timestamp >= 1e12 ? ev.timestamp : ev.timestamp * 1000;
  if (ev.date != null) return ev.date >= 1e12 ? ev.date : ev.date * 1000;
  if (ev.time != null) return ev.time >= 1e12 ? ev.time : ev.time * 1000;
  return 0;
}

function eventTokens(ev: UsageEvent): number {
  const tu = ev.tokenUsage;
  if (ev.totalTokens != null && ev.totalTokens > 0) return ev.totalTokens;
  if (ev.total_tokens != null && ev.total_tokens > 0) return ev.total_tokens;
  if (tu?.totalTokens != null && tu.totalTokens > 0) return tu.totalTokens;
  if (tu?.inputTokens != null || tu?.outputTokens != null)
    return (tu.inputTokens ?? 0) + (tu.outputTokens ?? 0);
  if (ev.tokens != null && ev.tokens > 0) return ev.tokens;
  if (ev.token_count != null && ev.token_count > 0) return ev.token_count;
  return 0;
}

function formatTimeAgo(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return '—';
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (sec < 60) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hour < 24) return `${hour}h ago`;
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

function formatTokens(n: number): string {
  if (n == null || n === 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function buildReport(
  cycleStartMs: number,
  events: UsageEvent[],
  teamLimit: number,
  userTarget: number,
  myEmail?: string
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

  let myDollars: string | undefined;
  let myDailyAvgDollars: string | undefined;
  let myEstimateExceedInDays: number | undefined;
  let myLastDaySpendDate: string | undefined;
  let myLastDaySpendDollars: string | undefined;
  let myRecentTransactions: ReportTransactionRow[] | undefined;
  if (myEmail) {
    const norm = myEmail.toLowerCase();
    const myEvents = events.filter(
      (e) => (e.userEmail ?? e.user_email ?? '').toLowerCase() === norm
    );
    const myCents = myEvents.reduce((s, e) => s + costPer(e), 0);
    myDollars = toDollars(myCents);

    const dayToCents = new Map<number, number>();
    for (const e of myEvents) {
      const t = eventTimeMs(e);
      if (t > 0) {
        const day = Math.floor(t / 86400000);
        dayToCents.set(day, (dayToCents.get(day) ?? 0) + costPer(e));
      }
    }
    const yesterdayDay = Math.floor(Date.now() / 86400000) - 1;
    const lastDayWithSpend =
      dayToCents.has(yesterdayDay)
        ? yesterdayDay
        : (dayToCents.size > 0 ? Math.max(...dayToCents.keys()) : undefined);
    if (lastDayWithSpend != null) {
      myLastDaySpendDollars = toDollars(dayToCents.get(lastDayWithSpend)!);
      myLastDaySpendDate =
        lastDayWithSpend === yesterdayDay
          ? 'Yesterday'
          : new Date(lastDayWithSpend * 86400000).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
    }
    const daysWithUsage = dayToCents.size;
    if (daysWithUsage > 0) {
      myDailyAvgDollars = toDollars(Math.round(myCents / daysWithUsage));
      const remainingCents = userTarget * 100 - myCents;
      const dailyAvgCents = myCents / daysWithUsage;
      if (userTarget > 0 && remainingCents > 0 && dailyAvgCents > 0) {
        const daysToExceed = remainingCents / dailyAvgCents;
        myEstimateExceedInDays = Math.ceil(daysToExceed);
      }
    }

    const sorted = [...myEvents].sort((a, b) => eventTimeMs(b) - eventTimeMs(a));
    myRecentTransactions = sorted.slice(0, 5).map((ev) => ({
      date: formatTimeAgo(eventTimeMs(ev)),
      user: ev.userEmail ?? ev.user_email ?? '—',
      type: ev.kind ?? '—',
      model: ev.model ?? '—',
      tokens: formatTokens(eventTokens(ev)),
      cost: `$${toDollars(costPer(ev))}`,
    }));
  }

  return {
    byModel,
    byUser,
    byUserModel,
    cycleStartIso,
    daysLeft,
    myDailyAvgDollars,
    myDollars,
    myEmail: myEmail ? myEmail : undefined,
    myEstimateExceedInDays,
    myLastDaySpendDate,
    myLastDaySpendDollars,
    myRecentTransactions,
    onDemandDollars: toDollars(onDemandCents),
    teamLimit,
    totalDollars: toDollars(totalCents),
    userTarget,
  };
}

export async function fetchAndBuildReport(
  token: string,
  teamLimit: number,
  userTarget: number,
  myEmail?: string,
  log?: LogFn
): Promise<{ report?: ReportData; error?: string }> {
  const spend = await fetchSpend(token, log);
  if (spend.error) return { error: spend.error };
  const cycleStart = spend.subscriptionCycleStart ?? Date.now() - 30 * 86400 * 1000;
  const endMs = Date.now();
  const { events, error } = await fetchUsageEvents(token, cycleStart, endMs, log);
  if (error) return { error };
  const report = buildReport(cycleStart, events, teamLimit, userTarget, myEmail);
  return { report };
}
