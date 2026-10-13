import { PermissionsAndroid, Platform } from 'react-native';
import { kvGet, kvSet } from '../crm/secureKv';
import { fmtDateShort, fmtTime, todayStr } from '../tasks/format';
import { replaceAllReminders, showReminderNow, type NativeReminder } from './native';

/**
 * The shared reminders engine. Any module (lead meetings and follow-ups, Task Management, payment
 * follow-ups) describes what is coming up as ReminderItems; the engine turns them into:
 *  - an ALARM `leadMinutes` before each one (09:00 on the day for items with no time), and
 *  - a POPUP the first time an item set for you by someone else is seen.
 * Each sync hands the phone the complete list, so rescheduled items move and finished or cancelled
 * ones simply drop out.
 */

export type ReminderKind = 'meeting' | 'followup' | 'task' | 'payment' | 'personal';

/** Where a tap on the reminder goes. `app` lets each app open only its own screens. */
export interface ReminderRoute {
  app: 'lead' | 'task' | 'payment';
  screen: string;
  params?: Record<string, unknown>;
}

export interface ReminderItem {
  /** Stable across syncs (e.g. the work task id). */
  key: string;
  kind: ReminderKind;
  /** What it is about - "TestToday", "Send GST summary". */
  title: string;
  /** Extra context for the line under the title - "Site visit", "Call back". */
  detail?: string;
  /** Wall-clock 'YYYY-MM-DD' and 'HH:MM[:SS]' (null = any time that day). */
  date: string;
  time: string | null;
  /** True when someone else set it for you - only those announce themselves with a popup. */
  fromSomeoneElse: boolean;
  route: ReminderRoute | null;
}

export interface ReminderSettings {
  enabled: boolean;
  /** How long before a timed item the alarm rings. */
  leadMinutes: number;
}

export const DEFAULT_SETTINGS: ReminderSettings = { enabled: true, leadMinutes: 30 };
const SCOPE = 'reminders';
/** Items with no time ring at this hour on their day. */
const ALL_DAY_HOUR = 9;

const KIND_TEXT: Record<ReminderKind, { soon: string; dueToday: string; isNew: string }> = {
  meeting: { soon: 'Meeting', dueToday: 'Meeting today', isNew: 'New meeting scheduled' },
  followup: { soon: 'Follow-up', dueToday: 'Follow-up due today', isNew: 'New follow-up for you' },
  task: { soon: 'Task due', dueToday: 'Task due today', isNew: 'New task assigned' },
  payment: { soon: 'Payment follow-up', dueToday: 'Payment follow-up today', isNew: 'New payment follow-up' },
  personal: { soon: 'Reminder', dueToday: 'Reminder', isNew: 'New reminder' },
};

export async function loadReminderSettings(): Promise<ReminderSettings> {
  return { ...DEFAULT_SETTINGS, ...((await kvGet<Partial<ReminderSettings>>(SCOPE, 'settings')) ?? {}) };
}

export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  await kvSet(SCOPE, 'settings', s);
}

function dueAt(item: ReminderItem): Date {
  const [y, m, d] = item.date.split('-').map(Number);
  if (!item.time) return new Date(y, m - 1, d, ALL_DAY_HOUR, 0, 0);
  const [hh, mm] = item.time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm || 0, 0);
}

/** "Today, 11:00 AM" / "Tomorrow, 9:30 AM" / "Oct 15, 2026, 4:00 PM". */
function whenText(item: ReminderItem): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const day = item.date === todayStr() ? 'Today' : item.date === t ? 'Tomorrow' : fmtDateShort(item.date);
  return item.time ? `${day}, ${fmtTime(item.time)}` : day;
}

function bodyOf(item: ReminderItem): string {
  return [item.detail, item.title].filter(Boolean).join(' · ');
}

/** The alarm for one item, or null when its moment has passed. */
export function alarmFor(item: ReminderItem, settings: ReminderSettings, now = Date.now()): NativeReminder | null {
  const due = dueAt(item).getTime();
  // A personal reminder rings at the very time the person chose; everything else rings early.
  const personal = item.kind === 'personal';
  const fireAt = item.time && !personal ? due - settings.leadMinutes * 60_000 : due;
  if (fireAt <= now) return null;
  const text = KIND_TEXT[item.kind];
  if (personal) {
    return {
      id: `alarm:${item.key}:${item.date}T${item.time ?? ''}`,
      kind: 'alarm',
      title: `⏰ ${item.title}`,
      body: item.detail ? item.detail : `Reminder · ${item.time ? fmtTime(item.time) : 'today'}`,
      fireAt,
      route: item.route ? JSON.stringify(item.route) : '',
    };
  }
  return {
    id: `alarm:${item.key}:${item.date}T${item.time ?? ''}`,
    kind: 'alarm',
    title: item.time ? `${text.soon} in ${settings.leadMinutes} min` : text.dueToday,
    body: `${bodyOf(item)}${item.time ? ` · ${fmtTime(item.time)}` : ''}`,
    fireAt,
    route: item.route ? JSON.stringify(item.route) : '',
  };
}

let asked = false;
/** Android 13+ needs the person's yes before any notification shows. Asked once per app run. */
async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(perm)) return true;
  if (asked) return false;
  asked = true;
  const res = await PermissionsAndroid.request(perm, {
    title: 'Allow reminders',
    message: 'BestServe rings before your meetings, follow-ups and tasks, and lets you know when one is set for you.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Arms every reminder for these items and pops up the ones that are new to this person. `userId`
 * keeps the "already seen" list per account; on the very first sync nothing pops up (the person
 * already knows what is on their list), it is only remembered.
 */
export async function syncReminders(userId: string, items: ReminderItem[]): Promise<void> {
  if (!userId) return;
  const settings = await loadReminderSettings();
  if (!settings.enabled) {
    await replaceAllReminders([]);
    return;
  }
  if (!(await ensurePermission())) return;

  const now = Date.now();
  const alarms = items.map((i) => alarmFor(i, settings, now)).filter((r): r is NativeReminder => r !== null);
  await replaceAllReminders(alarms);

  const seenKey = `seen.${userId}`;
  const seen = await kvGet<string[]>(SCOPE, seenKey);
  const current = items.map((i) => i.key);
  if (seen) {
    const known = new Set(seen);
    for (const item of items) {
      if (known.has(item.key) || !item.fromSomeoneElse || dueAt(item).getTime() < now) continue;
      showReminderNow({
        id: `new:${item.key}`,
        kind: 'popup',
        title: KIND_TEXT[item.kind].isNew,
        body: `${bodyOf(item)} · ${whenText(item)}`,
        fireAt: now,
        route: item.route ? JSON.stringify(item.route) : '',
      });
    }
  }
  // Remember what is on the list now (bounded: only current items matter for "is it new?").
  await kvSet(SCOPE, seenKey, Array.from(new Set([...(seen ?? []).slice(-300), ...current])));
}
