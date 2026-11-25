import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { getMessaging, getToken } from '@react-native-firebase/messaging';
import { httpClient } from '../api/httpClient';

/**
 * The phone side of client notifications:
 *  - the in-app native notifier (android/.../notifier/ClientNotifier.kt) that shows a push arriving
 *    while the app is open and reports which one was tapped;
 *  - telling the server this phone's push address (same /api/push endpoints the staff app uses).
 * Every call is a safe no-op on iOS, in a build without the module, or without Firebase set up.
 */

interface NotifierNative {
  showNow(item: { id: string; title: string; body: string; route: string }): void;
  consumeOpenedRoute(): Promise<string | null>;
}

const native: NotifierNative | undefined =
  Platform.OS === 'android' ? (NativeModules.BestServeClientNotifier as NotifierNative | undefined) : undefined;

export function showNotificationNow(item: { id: string; title: string; body: string; route: string }): void {
  native?.showNow(item);
}

export async function consumeOpenedRoute(): Promise<string | null> {
  return native ? native.consumeOpenedRoute() : null;
}

/** Fires with the route JSON when one of our notifications is tapped while the app is running. */
export function onNotificationOpened(listener: (route: string) => void): () => void {
  if (!native) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.BestServeClientNotifier);
  const sub = emitter.addListener('BestServeClientNotificationOpened', (route) => listener(String(route)));
  return () => sub.remove();
}

let lastToken: string | null = null;

/** Tells the server this phone's push address. Safe to call often; never throws. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const token = await getToken(getMessaging());
    if (!token) return;
    lastToken = token;
    await httpClient.post('/api/push/register', { token, platform: 'android' });
  } catch {
    // No Google Play services, Firebase not set up yet, offline, or not signed in - the app still works.
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
