import type { Job } from '../../types/job';

/** How many finished jobs the Completed list shows - the database can hold hundreds, nobody scrolls through those. */
export const RECENT_COMPLETED_LIMIT = 10;

/**
 * This technician's most recently finished jobs, newest first. Jobs carry no "finished at" time, so recency is the
 * job's due (or start) date - the same date the list sorts on.
 */
export function mostRecentCompleted(jobs: Job[], userId: string | number, limit: number = RECENT_COMPLETED_LIMIT): Job[] {
  const time = (job: Job) => {
    const iso = job.dueDate ?? job.start_date;
    const t = iso ? new Date(iso).getTime() : NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  return jobs
    .filter(job => job.status === 'COMPLETED' && job.team.some(member => String(member.id) === String(userId)))
    .sort((a, b) => time(b) - time(a))
    .slice(0, limit);
}

/** One flattened work-queue row - Job and TechnicianVisit are different API shapes, mapped to this one before rendering. */
export interface JobQueueRow {
  rowKey: string;
  jobId: string;
  code: string;
  title: string;
  /** Company/customer name. */
  company: string | undefined;
  /** Site/area name - a different field from `company`. */
  siteArea: string | undefined;
  address: string | null | undefined;
  /** Raw date - what the list sorts and groups on. */
  sortDate: string | null;
  status: string | null | undefined;
  /** "02:07" + "AM" for a visit; "7" + "Sep" for a finished job (which only has a date). */
  timeMain: string;
  timeSub: string;
}

export type QueueItem =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'row'; key: string; row: JobQueueRow };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today" / "Tomorrow" / "Yesterday" / "Mon, 7 Sep" - the heading above each day's jobs. */
export function dayLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date';
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Turns the (already sorted) rows into a flat list with a heading before each new day. Sorting by status
 * mixes days, so headings only make sense when sorted by time - pass `grouped = false` to get plain rows.
 */
export function buildQueueItems(rows: JobQueueRow[], grouped: boolean, now: Date = new Date()): QueueItem[] {
  if (!grouped) return rows.map(row => ({ kind: 'row', key: row.rowKey, row }));

  const items: QueueItem[] = [];
  let currentLabel: string | null = null;
  let headerIndex = -1;
  for (const row of rows) {
    const label = dayLabel(row.sortDate, now);
    if (label !== currentLabel) {
      currentLabel = label;
      headerIndex = items.length;
      items.push({ kind: 'header', key: `h-${label}-${items.length}`, label, count: 0 });
    }
    const header = items[headerIndex];
    if (header.kind === 'header') header.count += 1;
    items.push({ kind: 'row', key: row.rowKey, row });
  }
  return items;
}
