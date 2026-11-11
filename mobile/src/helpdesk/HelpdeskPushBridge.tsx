import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { getInitialNotification, getMessaging, onNotificationOpenedApp } from '@react-native-firebase/messaging';
import type { AuthenticatedStackParamList } from '../navigation/types';

/**
 * Tapping a Helpdesk push (a reply, a status change, a new ticket for the team) opens that ticket,
 * from whichever app the person is in. Only `helpdesk_ticket` pushes are handled here - the lead /
 * task / payment pushes keep going through reminders-engine/push.ts exactly as before (it ignores
 * this type). Renders nothing.
 */
const handled = new Set<string>();

export function HelpdeskPushBridge() {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const open = (msg: { messageId?: string; data?: Record<string, unknown> } | null) => {
      if (!msg?.data || String(msg.data.entityType ?? '') !== 'helpdesk_ticket') return;
      const ticketId = String(msg.data.entityId ?? '');
      // The push that cold-started the app is reported again after a sign-out / sign-in: open it once.
      const key = msg.messageId || ticketId;
      if (!ticketId || handled.has(key)) return;
      handled.add(key);
      navigation.navigate('HelpdeskTicket', { ticketId });
    };
    let off = () => {};
    try {
      const messaging = getMessaging();
      getInitialNotification(messaging).then(open).catch(() => {});
      off = onNotificationOpenedApp(messaging, open);
    } catch {
      // No Google Play services - nothing to listen to.
    }
    return off;
  }, [navigation]);

  return null;
}
