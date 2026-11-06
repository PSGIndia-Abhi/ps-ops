// "All team" on the Team report: the same performance numbers, target and history as one person's,
// added up for everyone on the leaderboard. Each person's figures come from the same endpoints as
// their own screen (one request per person), so the team total is exactly the sum of the rows.

import * as api from './api';
import type { Performance } from './types';

export interface TeamMember {
  id: number;
  name: string;
}

const METRIC_KEYS: (keyof Performance)[] = [
  'leadsGenerated',
  'genuineLeads',
  'meetingsScheduled',
  'visitsCompleted',
  'locationsVisited',
  'quotationsSent',
  'leadsConverted',
  'leadsLost',
  'followUpsDue',
];

/** Everyone's performance numbers added up. A person whose numbers cannot be read is left out. */
export async function teamPerformance(team: TeamMember[], from: string, to: string): Promise<Performance> {
  const each = await Promise.all(team.map((p) => api.performance(from, to, p.id).catch(() => null)));
  const ok = each.filter((x): x is Performance => !!x);
  if (team.length > 0 && ok.length === 0) throw new Error('Could not load the team report.');
  const total = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as unknown as Performance;
  for (const p of ok) for (const k of METRIC_KEYS) total[k] += Number(p[k]) || 0;
  return total;
}

/** The records behind one number for the whole team, newest first, each with whose it is. */
export async function teamItems(metric: api.PerformanceMetric, team: TeamMember[], from: string, to: string): Promise<(api.PerformanceItem & { by: string })[]> {
  const each = await Promise.all(
    team.map((p) =>
      api
        .performanceItems(metric, from, to, p.id)
        .then((items) => items.map((i) => ({ ...i, by: p.name })))
        .catch(() => [] as (api.PerformanceItem & { by: string })[]),
    ),
  );
  return each.flat().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** This month's target for the team: everyone's targets and achieved amounts added up. */
export function teamTarget(targets: api.SalesTarget[], team: TeamMember[]): api.SalesTarget | null {
  const ids = new Set(team.map((p) => p.id));
  const mine = targets.filter((t) => ids.has(t.userId));
  if (!mine.length) return null;
  const set = mine.filter((t) => t.target);
  return {
    userId: -1,
    name: 'All team',
    role: '',
    month: mine[0].month,
    target: set.length ? set.reduce((s, t) => s + (t.target ?? 0), 0) : null,
    achieved: mine.reduce((s, t) => s + t.achieved, 0),
    converted: mine.reduce((s, t) => s + t.converted, 0),
    canSet: false,
  };
}

/** Everyone's month-by-month achievement and lifetime added up (a month's target only if someone had one). */
export async function teamHistory(team: TeamMember[], months = 24): Promise<api.AchievementHistory> {
  const each = (await Promise.all(team.map((p) => api.targetHistory(p.id, months).catch(() => null)))).filter(
    (h): h is api.AchievementHistory => !!h,
  );
  const byMonth = new Map<string, { month: string; target: number | null; achieved: number; converted: number }>();
  let since: string | null = null;
  const lifetime = { achieved: 0, converted: 0 };
  for (const h of each) {
    for (const m of h.months) {
      const row = byMonth.get(m.month) ?? { month: m.month, target: null, achieved: 0, converted: 0 };
      if (m.target !== null) row.target = (row.target ?? 0) + m.target;
      row.achieved += m.achieved;
      row.converted += m.converted;
      byMonth.set(m.month, row);
    }
    lifetime.achieved += h.lifetime.achieved;
    lifetime.converted += h.lifetime.converted;
    if (h.lifetime.since && (!since || h.lifetime.since < since)) since = h.lifetime.since;
  }
  return {
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    lifetime: { ...lifetime, since },
  };
}
