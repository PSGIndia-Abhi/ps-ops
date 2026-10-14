import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { kvGet, kvSet } from '../crm/secureKv';
import { syncReminders, type ReminderRoute } from './engine';
import { canScheduleExactAlarms, consumeOpenedRoute, onReminderOpened, openExactAlarmSettings, remindersAvailable } from './native';
import { listenForPush, registerForPush } from './push';
import { myUpcomingTasks, taskToReminder } from './sources';

/** While an app is open its reminders are refreshed this often (plus on open and on return). */
const SYNC_EVERY_MS = 5 * 60_000;

let currentSync: (() => Promise<void>) | null = null;
/**
 * Re-arm right away - call after saving something with a due time (a meeting scheduled or moved, a
 * follow-up set, a task done) so its alarm is set or dropped without waiting for the next sync.
 * A short delay lets the server finish its own write first.
 */
export function refreshReminders(): void {
  setTimeout(() => currentSync?.(), 800);
}

let exactAsked = false;
/** Once per install: ask to allow exact alarms, so the alarm rings on the minute rather than late. */
async function askExactOnce() {
  if (exactAsked || (await canScheduleExactAlarms())) return;
  exactAsked = true;
  if (await kvGet<boolean>('reminders', 'exactAsked')) return;
  await kvSet('reminders', 'exactAsked', true);
  Alert.alert(
    'Ring reminders on time',
    'Allow "Alarms & reminders" for BestServe so meeting and task alarms ring exactly 30 minutes before.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Allow', onPress: openExactAlarmSettings },
    ],
  );
}

/**
 * Keeps this person's reminders armed while an app is open, and opens the right screen when a
 * reminder is tapped. Each app mounts it once (in a screen that stays mounted) and says which
 * routes it can open: `app` must match, and `open` navigates.
 */
export function useReminders(myId: string, app: ReminderRoute['app'], open: (route: ReminderRoute) => void) {
  const openRef = useRef(open);
  openRef.current = open;
  const busy = useRef(false);
  // Asked for while a sync was running (a push for a just-saved follow-up, say): one more after it,
  // so the newest item is never lost to a sync that had already read the list.
  const again = useRef(false);

  const sync = useCallback(async () => {
    if (!remindersAvailable || !myId) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        again.current = false;
        try {
          const tasks = await myUpcomingTasks(myId);
          await syncReminders(myId, tasks.map((t) => taskToReminder(t, myId)));
          askExactOnce();
        } catch {
          // Offline or the server is down: the alarms already armed stay armed; try again later.
        }
      } while (again.current);
    } finally {
      busy.current = false;
    }
  }, [myId]);

  useEffect(() => {
    if (!remindersAvailable) return;
    const handle = (raw: string | null) => {
      if (!raw) return;
      try {
        const route = JSON.parse(raw) as ReminderRoute;
        if (route.app === app) openRef.current(route);
      } catch {
        // Not a route we know - just stay where we are.
      }
    };
    consumeOpenedRoute().then(handle);
    const off = onReminderOpened((raw) => {
      consumeOpenedRoute();
      handle(raw);
    });
    return off;
  }, [app]);

  // Push notifications: register this phone, and open the right screen when a push is tapped.
  useEffect(() => {
    if (!myId) return;
    registerForPush();
    return listenForPush(
      (route) => {
        if (route.app === app) openRef.current(route);
      },
      () => refreshReminders(),
    );
  }, [myId, app]);

  useEffect(() => {
    currentSync = sync;
    sync();
    const timer = setInterval(sync, SYNC_EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      if (currentSync === sync) currentSync = null;
      clearInterval(timer);
      sub.remove();
    };
  }, [sync]);

  return sync;
}
