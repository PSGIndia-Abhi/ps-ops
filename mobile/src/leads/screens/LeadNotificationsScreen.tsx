import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/notifications';
import {
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  DocumentIcon,
  PinIcon,
  SparkleIcon,
  UsersIcon,
} from '../../components/icons';
import { formatLeadWhen } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { toneColors, type Tone } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import type { AppNotification } from '../../types/notification';
import type { LeadStackParamList } from '../navigation';
import { useLoad, LeadTopBar as TopBar, LeadScreen } from '../ui';

const factory = (t: CrmTheme) => ({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  barRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  unreadText: { ...typography.caption, color: t.textMuted },
  markAll: { ...typography.captionMedium, color: t.primary },
  section: { ...typography.overline, color: t.textMuted, marginTop: spacing.sm, marginBottom: spacing.sm },
  item: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...t.cardShadow,
  },
  itemUnread: { backgroundColor: t.primarySoftBg, borderColor: t.primarySoft },
  pressed: { opacity: 0.85 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.xs },
  title: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  titleUnread: { fontWeight: '700' as const },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.primary, marginTop: 6 },
  message: { ...typography.caption, color: t.textSecondary, marginTop: 2, lineHeight: 18 },
  when: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs },
});

type IconType = React.ComponentType<{ size?: number; color?: string }>;

/** The look of a lead notification by its type (see backend utils/crmLeadNotifications.js). */
function lookOf(type: string): { tone: Tone; Icon: IconType } {
  if (type === 'LEAD_NEW' || type === 'LEAD_SUBMITTED') return { tone: 'info', Icon: SparkleIcon };
  if (type === 'LEAD_VERIFIED') return { tone: 'success', Icon: CheckCircleIcon };
  if (type.startsWith('LEAD_MEETING')) return { tone: 'accent', Icon: CalendarIcon };
  if (type === 'LEAD_VISIT_COMPLETED') return { tone: 'accent', Icon: PinIcon };
  if (type.includes('QUOTATION')) return { tone: 'info', Icon: DocumentIcon };
  if (type.includes('CONVERTED') || type.includes('WON')) return { tone: 'success', Icon: UsersIcon };
  if (type.includes('FOLLOW_UP')) return { tone: 'warning', Icon: ClockIcon };
  if (type.includes('LOST') || type.includes('NOT_GENUINE')) return { tone: 'danger', Icon: CloseIcon };
  return { tone: 'neutral', Icon: BellIcon };
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * What happened on the leads this person works: new leads to verify, meetings set for them,
 * visits, quotations, conversions. Newest first, split into Today and Earlier; unread ones are
 * tinted. A tap marks it read and opens the lead it is about.
 */
export function LeadNotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [allRead, setAllRead] = useState(false);

  const loader = useCallback(() => listNotifications(50), []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load notifications.');

  const isRead = useCallback((n: AppNotification) => allRead || n.is_read || readIds.has(n.id), [allRead, readIds]);
  const unread = (data ?? []).filter((n) => !isRead(n)).length;

  const sections = useMemo(() => {
    const now = new Date();
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    for (const n of data ?? []) (sameDay(new Date(n.created_at), now) ? today : earlier).push(n);
    return [
      { title: 'TODAY', data: today },
      { title: 'EARLIER', data: earlier },
    ].filter((s) => s.data.length > 0);
  }, [data]);

  const open = (n: AppNotification) => {
    if (!isRead(n)) {
      setReadIds((prev) => new Set(prev).add(n.id));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.entity_type === 'lead' && n.entity_id) navigation.navigate('LeadDetail', { leadId: n.entity_id });
  };

  const readAll = () => {
    setAllRead(true);
    markAllNotificationsRead().catch(() => setAllRead(false));
  };

  return (
    <LeadScreen edges={['top']}>
      <TopBar title="Notifications" onBack={() => navigation.goBack()} />
      {!!data && data.length > 0 && (
        <View style={styles.barRow}>
          <Text style={styles.unreadText}>{unread === 0 ? 'All caught up' : unread === 1 ? '1 unread' : `${unread} unread`}</Text>
          {unread > 0 && (
            <Pressable onPress={readAll} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.markAll}>Mark all as read</Text>
            </Pressable>
          )}
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListHeaderComponent={<CrmErrorBanner message={error} onRetry={reload} />}
        ListEmptyComponent={
          loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <CrmSkeleton key={i} height={84} radius={radii.lg} style={{ marginBottom: spacing.sm }} />
              ))}
            </>
          ) : error ? undefined : (
            <CrmEmptyState
              title="No notifications yet"
              subtitle="New leads, meetings, visits and quotations on your leads will show up here."
              icon={<BellIcon size={30} color={theme.textMuted} />}
            />
          )
        }
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => {
          const read = isRead(item);
          const { tone, Icon } = lookOf(item.type);
          const c = toneColors(theme, tone);
          return (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${read ? '' : 'Unread. '}${item.title ?? ''}. ${item.message ?? ''}`}
              style={({ pressed }) => [styles.item, !read && styles.itemUnread, pressed && styles.pressed]}
            >
              <View style={[styles.icon, { backgroundColor: c.bg }]}>
                <Icon size={19} color={c.fg} />
              </View>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, !read && styles.titleUnread]} numberOfLines={2}>
                    {item.title || 'Update'}
                  </Text>
                  {!read && <View style={styles.dot} />}
                </View>
                {!!item.message && (
                  <Text style={styles.message} numberOfLines={3}>
                    {item.message}
                  </Text>
                )}
                <Text style={styles.when}>{formatLeadWhen(item.created_at)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </LeadScreen>
  );
}
