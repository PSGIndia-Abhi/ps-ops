import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  getInitialNotification,
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { consumeOpenedRoute, onReminderOpened, showReminderNow } from '../reminders-engine/native';
import { registerForPush } from '../reminders-engine/push';
import type { ClientStackParamList } from './navigation';

/**
 * Push notifications for client logins. The server sends them when staff act on the client's
 * outlet (backend services/clientNotify.service.js): a complaint reply or resolution, a booked or
 * rejected service request, a completed visit, a new document. With the app closed Android shows
 * them itself; with it open we show them as our own notification. A tap opens the right screen.
 */

type Data = Record<string, unknown> | undefined;
type Nav = NativeStackNavigationProp<ClientStackParamList>;

/** Where a client push opens - stored in a native notification as JSON, so `app` tells ours apart. */
interface ClientRoute {
  app: 'client';
  entityType: string;
  entityId: string;
}

const routeOf = (data: Data): ClientRoute | null => {
  const entityType = String(data?.entityType ?? '');
  if (!entityType.startsWith('client_')) return null;
  return { app: 'client', entityType, entityId: String(data?.entityId ?? '') };
};

function openRoute(navigation: Nav, route: ClientRoute) {
  const id = route.entityId;
  switch (route.entityType) {
    case 'client_complaint':
      if (id) navigation.navigate('ClientComplaintDetail', { complaintId: id });
      return;
    case 'client_job':
      if (id) navigation.navigate('ClientJobDetail', { jobId: id });
      return;
    case 'client_service_request':
      navigation.navigate('ClientRequestService', { tab: 'mine' });
      return;
    case 'client_document':
      navigation.navigate('ClientDocuments');
      return;
  }
}

/** Android 13+ shows no notification until the person allows it - asked once, on first sign-in. */
async function askNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  try {
    if (await PermissionsAndroid.check(perm)) return;
    await PermissionsAndroid.request(perm, {
      title: 'Stay updated',
      message: 'BestServe lets you know when we reply to a complaint, book your request, finish a visit or share a document.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
  } catch {
    // Pushes simply won't show; everything is still in the app.
  }
}

/** Mounted once inside the client app (ClientTabs): registers the phone and handles pushes. */
export function useClientPush(): void {
  const navigation = useNavigation<Nav>();
  const navRef = useRef(navigation);
  navRef.current = navigation;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    askNotificationPermission();
    registerForPush();
    const open = (route: ClientRoute | null) => {
      if (route) openRoute(navRef.current, route);
    };
    const messaging = getMessaging();

    // Tapped while the app was closed / in the background (Android drew the notification).
    getInitialNotification(messaging)
      .then((msg) => open(msg ? routeOf(msg.data) : null))
      .catch(() => {});
    const offOpened = onNotificationOpenedApp(messaging, (msg) => open(routeOf(msg.data)));

    // Arrived with the app open: Android shows nothing by itself, so we post it.
    const offMessage = onMessage(messaging, (msg) => {
      if (msg.data?.type === 'REMINDERS_SYNC') return;
      const route = routeOf(msg.data);
      showReminderNow({
        id: `push:${msg.messageId ?? Date.now()}`,
        kind: 'update',
        title: msg.notification?.title ?? 'BestServe',
        body: msg.notification?.body ?? '',
        fireAt: Date.now(),
        route: route ? JSON.stringify(route) : '',
      });
    });

    // Tapped one of the notifications we posted ourselves.
    const handleNative = (raw: string | null) => {
      if (!raw) return;
      try {
        const route = JSON.parse(raw) as ClientRoute;
        if (route?.app === 'client') open(route);
      } catch {
        // Not ours.
      }
    };
    consumeOpenedRoute().then(handleNative).catch(() => {});
    const offNative = onReminderOpened((raw) => {
      consumeOpenedRoute().catch(() => {});
      handleNative(raw);
    });

    const offRefresh = onTokenRefresh(messaging, () => {
      registerForPush();
    });
    return () => {
      offOpened();
      offMessage();
      offNative();
      offRefresh();
    };
  }, []);
}
