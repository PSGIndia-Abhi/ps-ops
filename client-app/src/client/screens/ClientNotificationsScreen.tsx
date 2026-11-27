import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { ApiError } from '../../api/httpClient';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { listNotifications, markAllNotificationsRead, markNotificationRead, type ClientNotification } from '../api';
import { relativeDay } from '../format';
import type { ClientStackParamList } from '../navigation';
import { BookServiceArt, ComplaintArt, DocumentsArt, JobsArt } from '../ui/IllustratedIcons';
import { ClientPage } from '../ui/page';
import { useToast } from '../ui/Toast';

const palette = (t: CrmTheme) => ({
  ink: t.isDark ? '#E6E7EA' : '#1B1C1F',
  sub: t.isDark ? '#A3A7AE' : '#5E6470',
  faint: t.isDark ? '#6E737C' : '#9AA1AD',
  blue: t.isDark ? '#A8C7FA' : '#0B57D0',
  blueSoft: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD',
  tint: t.isDark ? t.surfaceAlt : '#F2F5FB',
  unread: t.isDark ? 'rgba(168,199,250,0.10)' : '#EEF4FF',
  white: t.isDark ? t.surface : '#FFFFFF',
});

const factory = (t: CrmTheme) => {
  const c = palette(t);
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.65 },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    markAll: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
    markAllText: { fontSize: 14, fontWeight: '700' as const, color: c.blue },
    section: { fontSize: 13, fontWeight: '700' as const, color: c.sub, letterSpacing: 0.6, marginTop: 16, marginBottom: 8, marginLeft: 4 },
    card: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, padding: 14, borderRadius: 20, backgroundColor: c.tint, marginBottom: 10 },
    cardUnread: { backgroundColor: c.unread },
    iconDisc: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.white, alignItems: 'center' as const, justifyContent: 'center' as const },
    title: { fontSize: 15, color: c.ink, lineHeight: 20 },
    titleUnread: { fontWeight: '700' as const },
    message: { fontSize: 13.5, color: c.sub, marginTop: 3, lineHeight: 19 },
    when: { fontSize: 12, color: c.faint, marginTop: 6 },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.blue, marginTop: 6 },
    empty: { alignItems: 'center' as const, paddingTop: 72, paddingHorizontal: 28 },
    emptyIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: c.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
    emptyTitle: { fontSize: 18, fontWeight: '600' as const, color: c.ink, marginTop: 18 },
    emptySub: { fontSize: 14.5, color: c.sub, textAlign: 'center' as const, marginTop: 6, lineHeight: 21 },
    skeleton: { marginBottom: 10 },
  };
};

/** A bell with a small tick - the empty state's picture. */
function BellArt({ color }: { color: string }) {
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24">
      <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.6c.4.4.1 1-.4 1H4.8c-.5 0-.8-.6-.4-1z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M10 21.2a2.2 2.2 0 0 0 4 0" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M9.4 12l1.8 1.8 3.5-3.6" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Which illustrated icon a notification shows. */
function NotificationArt({ type }: { type: string | null }) {
  if (type === 'client_complaint') return <ComplaintArt size={34} />;
  if (type === 'client_service_request') return <BookServiceArt size={34} />;
  if (type === 'client_document') return <DocumentsArt size={34} />;
  return <JobsArt size={34} />;
}

/** Notifications (GET /api/notifications) - newest first, unread highlighted; a tap opens what it is about. */
export function ClientNotificationsScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
  const toast = useToast();

  const [items, setItems] = useState<ClientNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listNotifications(50));
      setError(null);
      setUnavailable(false);
    } catch (err) {
      // 403: notifications are not switched on for client logins on this server yet.
      if (err instanceof ApiError && err.status === 403) {
        setUnavailable(true);
        setItems([]);
      } else setError((err as Error).message || 'Could not load notifications');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = (n: ClientNotification) => {
    if (!n.is_read) {
      setItems((list) => (list || []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      markNotificationRead(n.id).catch(() => {});
    }
    const id = n.entity_id || '';
    switch (n.entity_type) {
      case 'client_complaint':
        if (id) navigation.navigate('ClientComplaintDetail', { complaintId: id });
        return;
      case 'client_job':
      case 'job':
        if (id) navigation.navigate('ClientJobDetail', { jobId: id });
        return;
      case 'client_service_request':
        navigation.navigate('ClientRequestService', { tab: 'mine' });
        return;
      case 'client_document':
        navigation.navigate('ClientDocuments');
        return;
    }
  };

  const markAll = async () => {
    setItems((list) => (list || []).map((x) => ({ ...x, is_read: true })));
    try {
      await markAllNotificationsRead();
      toast.show('All caught up');
    } catch {
      load();
    }
  };

  const unread = (items || []).filter((n) => !n.is_read);
  const earlier = (items || []).filter((n) => n.is_read);

  const renderCard = (n: ClientNotification) => (
    <Pressable key={n.id} onPress={() => open(n)} style={({ pressed }) => [styles.card, !n.is_read && styles.cardUnread, pressed && styles.pressed]} accessibilityRole="button">
      <View style={styles.iconDisc}>
        <NotificationArt type={n.entity_type} />
      </View>
      <View style={styles.flex1}>
        <Text style={[styles.title, !n.is_read && styles.titleUnread]} numberOfLines={2}>
          {n.title}
        </Text>
        {!!n.message && (
          <Text style={styles.message} numberOfLines={3}>
            {n.message}
          </Text>
        )}
        <Text style={styles.when}>{relativeDay(n.created_at)}</Text>
      </View>
      {!n.is_read && <View style={styles.dot} />}
    </Pressable>
  );

  return (
    <ClientPage
      title="Notifications"
      back
      right={
        unread.length > 0 ? (
          <Pressable onPress={markAll} style={({ pressed }) => [styles.markAll, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : undefined
      }
    >
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={brandRefreshControl(refreshing, () => {
          setRefreshing(true);
          load();
        })}
      >
        <RefreshBanner refreshing={refreshing} />
        <CrmErrorBanner message={error} onRetry={load} />
        {items === null ? (
          Array.from({ length: 5 }).map((_, i) => <CrmSkeleton key={i} height={84} radius={20} style={styles.skeleton} />)
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <BellArt color={c.blue} />
            </View>
            <Text style={styles.emptyTitle}>{unavailable ? 'Notifications coming soon' : "You're all caught up"}</Text>
            <Text style={styles.emptySub}>
              {unavailable ? 'Updates about your visits, requests and complaints will show up here.' : 'New updates about your visits, requests and complaints will show up here.'}
            </Text>
          </View>
        ) : (
          <>
            {unread.length > 0 && <Text style={styles.section}>NEW</Text>}
            {unread.map(renderCard)}
            {earlier.length > 0 && <Text style={styles.section}>EARLIER</Text>}
            {earlier.map(renderCard)}
          </>
        )}
      </ScrollView>
    </ClientPage>
  );
}
