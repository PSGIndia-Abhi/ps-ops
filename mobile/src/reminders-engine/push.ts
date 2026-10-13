import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { httpClient } from '../api/httpClient';
import type { ReminderRoute } from './engine';
import { showReminderNow } from './native';

/**
 * Push notifications (Firebase Cloud Messaging). The server sends a push whenever it saves a
 * notification for someone (backend services/push.service.js). With the app closed or in the
 * background Android shows it by itself; with the app open we show it as our own popup. Either
 * way a tap opens the lead (or task) it is about.
 */

type RemoteMessage = Parameters<Parameters<typeof onMessage>[1]>[0];

let lastToken: string | null = null;

/** Where a push should open, from the entity it is about. */
export function routeOfPush(data: Record<string, unknown> | undefined): ReminderRoute | null {
  const type = String(data?.entityType ?? '');
  const id = String(data?.entityId ?? '');
  if (!id) return null;
  // The "payment reminder due" notification (backend PaymentFollowUp.service) is about the reminder's task.
  if (type === 'payment_reminder') return { app: 'payment', screen: 'ReminderDetail', params: { reminderId: id } };
  if (type === 'lead') return { app: 'lead', screen: 'LeadDetail', params: { leadId: id } };
  if (type === 'work_task' || type === 'task') return { app: 'task', screen: 'TaskDetail', params: { taskId: id } };
  return null;
}

/** Tells the server this phone's push address. Safe to call often; never throws. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const token = await getToken(getMessaging());
    if (!token) return;
    lastToken = token;
    await httpClient.post('/api/push/register', { token, platform: 'android' });
  } catch {
    // No Google Play services, offline, or not signed in yet - local reminders still work.
  }
}

/** On sign-out: this phone stops getting the account's pushes. Never throws. */
export async function unregisterFromPush(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const token = lastToken ?? (await getToken(getMessaging()));
    if (token) await httpClient.post('/api/push/unregister', { token });
  } catch {
    // Best effort - a stale token is removed by the server the next time a push to it fails.
  }
}

/**
 * Listens while an app is signed in: shows pushes that arrive with the app open, re-registers when
 * Firebase renews the token, and reports taps. `onArrive` lets the caller refresh its reminders
 * (a new meeting gets its alarm straight away).
 */
export function listenForPush(onOpen: (route: ReminderRoute) => void, onArrive: () => void): () => void {
  if (Platform.OS !== 'android') return () => {};
  const messaging = getMessaging();
  const open = (msg: RemoteMessage | null) => {
    const route = msg ? routeOfPush(msg.data) : null;
    if (route) onOpen(route);
  };
  getInitialNotification(messaging).then(open).catch(() => {});
  const offOpened = onNotificationOpenedApp(messaging, open);
  const offMessage = onMessage(messaging, (msg) => {
    const route = routeOfPush(msg.data);
    showReminderNow({
      id: `push:${msg.messageId ?? Date.now()}`,
      kind: 'popup',
      title: msg.notification?.title ?? 'BestServe',
      body: msg.notification?.body ?? '',
      fireAt: Date.now(),
      route: route ? JSON.stringify(route) : '',
    });
    onArrive();
  });
  const offRefresh = onTokenRefresh(messaging, () => {
    registerForPush();
  });
  return () => {
    offOpened();
    offMessage();
    offRefresh();
  };
}

/** Must be set at start-up (index.js): Android shows the notification itself; nothing else to do. */
export function setupBackgroundPush(): void {
  if (Platform.OS !== 'android') return;
  setBackgroundMessageHandler(getMessaging(), async () => {});
}
