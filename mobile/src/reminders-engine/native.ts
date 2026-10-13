import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

/** One reminder handed to the phone (see android/.../reminders/ReminderScheduler.kt). */
export interface NativeReminder {
  id: string;
  /** "alarm": rings before something is due. "popup": a banner like a chat message. */
  kind: 'alarm' | 'popup';
  title: string;
  body: string;
  /** Epoch milliseconds. */
  fireAt: number;
  /** JSON of a ReminderRoute - what to open when it is tapped. */
  route: string;
}

interface RemindersNative {
  replaceAll(items: NativeReminder[]): Promise<number>;
  showNow(item: NativeReminder): void;
  canScheduleExact(): Promise<boolean>;
  openExactAlarmSettings(): void;
  consumeOpenedRoute(): Promise<string | null>;
}

const native: RemindersNative | undefined = Platform.OS === 'android' ? (NativeModules.BestServeReminders as RemindersNative | undefined) : undefined;

/** False on iOS or in a build without the module - every call below is then a no-op. */
export const remindersAvailable = !!native;

export async function replaceAllReminders(items: NativeReminder[]): Promise<void> {
  if (native) await native.replaceAll(items);
}

export function showReminderNow(item: NativeReminder): void {
  native?.showNow(item);
}

export async function canScheduleExactAlarms(): Promise<boolean> {
  return native ? native.canScheduleExact() : true;
}

export function openExactAlarmSettings(): void {
  native?.openExactAlarmSettings();
}

export async function consumeOpenedRoute(): Promise<string | null> {
  return native ? native.consumeOpenedRoute() : null;
}

/** Fires with the route JSON when a reminder is tapped while the app is running. */
export function onReminderOpened(listener: (route: string) => void): () => void {
  if (!native) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.BestServeReminders);
  const sub = emitter.addListener('BestServeReminderOpened', (route) => listener(String(route)));
  return () => sub.remove();
}
