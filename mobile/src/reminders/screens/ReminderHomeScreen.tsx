import React, { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRawRole } from '../../auth/role';
import { AlertTriangleIcon, BellIcon, CalendarIcon, ChevronRightIcon } from '../../components/icons';
import { formatINR } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { useAppSwitch } from '../../navigation/AppSwitchContext';
import { initials, todayStr } from '../../tasks/format';
import { BandBackground, QuickAction, Tile } from '../../tasks/screens/TaskHomeScreen';
import { TaskBrandMark } from '../../tasks/ui/TaskBrandMark';
import { CheckIcon, ClipboardIcon, RepeatIcon, SwapIcon } from '../../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../../theme';
import { byDue } from '../format';
import type { ReminderListTab, ReminderStackParamList } from '../navigation';
import { useReminders } from '../RemindersContext';
import { ReminderCard } from '../ui';
import { useOutstandingOf } from './ReminderListScreen';

const NEXT_LIMIT = 3;
/** How far the stat tiles hang below the header band. */
const TILE_OVERLAP = 64;

// Same shape as Task Management's Home (tasks/screens/TaskHomeScreen.tsx), whose band, tiles
// and quick actions this screen reuses.
const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  band: { paddingHorizontal: spacing.lg, paddingBottom: TILE_OVERLAP + spacing.lg, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' as const },
  ident: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  logo: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const, elevation: 4 },
  hi: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  name: { ...typography.title, fontSize: 20, lineHeight: 25, color: '#FFFFFF' },
  roleChip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
  },
  roleText: { ...typography.overline, fontSize: 10, color: '#FFFFFF' },
  me: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  meText: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.primary },
  switchBadge: {
    position: 'absolute' as const,
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: { opacity: 0.75 },
  tiles: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  money: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...t.cardShadow,
  },
  moneyLabel: { ...typography.caption, color: t.textSecondary },
  moneyValue: { ...typography.subtitle, color: t.textPrimary, marginTop: 2 },
  moneyRed: { color: t.dangerText },
  moneyNote: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm },
  sectionTitle: { ...typography.subtitle, fontSize: 19, color: t.textPrimary },
  underline: { width: 28, height: 3, borderRadius: 1.5, backgroundColor: t.crestRed, marginTop: spacing.xs },
  sectionAction: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  sectionActionText: { ...typography.bodyMedium, color: t.primary },
  skeletonRow: { marginBottom: spacing.sm },
  cards: { gap: spacing.sm },
  quickSection: { marginTop: spacing.lg },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm },
});

/**
 * Payment Reminders Home: the same blue band and three tiles as Task Management's Home
 * (Today / Overdue / Upcoming reminders), what is owed in total, the next reminders to act on
 * and shortcuts into the list. The avatar opens the app switcher.
 */
export function ReminderHomeScreen() {
  const navigation = useNavigation<NavigationProp<ReminderStackParamList>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const { userName, invoices, customers, reminders, schedules, ready, refreshing, error, reload } = useReminders();
  const { openSwitcher } = useAppSwitch();
  const outstandingOf = useOutstandingOf();
  const rawRole = useRawRole();

  const stats = useMemo(() => {
    const open = reminders.filter((r) => r.active);
    return {
      today: open.filter((r) => r.display_status === 'TODAY').length,
      overdue: open.filter((r) => r.display_status === 'OVERDUE').length,
      upcoming: open.filter((r) => r.display_status === 'UPCOMING').length,
      completed: reminders.filter((r) => r.status === 'COMPLETED').length,
    };
  }, [reminders]);

  const money = useMemo(() => {
    const today = todayStr();
    const late = invoices.filter((i) => i.status !== 'CANCELLED' && i.pending_amount > 0 && !!i.due_date && i.due_date < today);
    return {
      outstanding: customers.reduce((sum, c) => sum + c.outstanding, 0),
      customers: customers.length,
      overdue: late.reduce((sum, i) => sum + i.pending_amount, 0),
      overdueInvoices: late.length,
    };
  }, [invoices, customers]);

  // The reminders to act on first: overdue, then today's, then what comes after.
  const next = useMemo(() => reminders.filter((r) => r.active).sort(byDue).slice(0, NEXT_LIMIT), [reminders]);

  const openList = (tab: ReminderListTab) => navigation.navigate('ReminderTabs', { screen: 'Reminders', params: { tab, at: Date.now() } });

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing && ready} onRefresh={reload} tintColor={theme.primary} colors={[theme.primary]} progressViewOffset={insets.top} />
        }
      >
        <View style={[styles.band, { paddingTop: insets.top + spacing.md }]}>
          <BandBackground />
          <View style={styles.ident}>
            <View style={styles.logo}>
              <TaskBrandMark size={40} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.hi}>Welcome back</Text>
              <Text style={styles.name} numberOfLines={2}>
                {userName}
              </Text>
              {!!rawRole && (
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>{rawRole}</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => openSwitcher(() => navigation.navigate('Profile'))}
              style={({ pressed }) => [styles.me, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Switch app"
              testID="header-avatar"
            >
              <Text style={styles.meText}>{initials(userName)}</Text>
              <View style={styles.switchBadge}>
                <SwapIcon size={11} color={theme.primary} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.tiles}>
          {!ready ? (
            <>
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
            </>
          ) : (
            <>
              <Tile icon={<BellIcon size={18} color="#FFFFFF" />} value={stats.today} label="Due Today" tone="info" onPress={() => openList('TODAY')} />
              <Tile icon={<AlertTriangleIcon size={18} color="#FFFFFF" />} value={stats.overdue} label="Overdue" tone="danger" onPress={() => openList('OVERDUE')} />
              <Tile icon={<CalendarIcon size={18} color="#FFFFFF" />} value={stats.upcoming} label="Upcoming" tone="success" onPress={() => openList('UPCOMING')} />
            </>
          )}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />

          {ready && !error && (
            <View style={styles.money}>
              <View style={styles.flex1}>
                <Text style={styles.moneyLabel}>Total Outstanding</Text>
                <Text style={styles.moneyValue}>{formatINR(money.outstanding)}</Text>
                <Text style={styles.moneyNote}>
                  {money.customers} customer{money.customers === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.flex1}>
                <Text style={styles.moneyLabel}>Overdue Amount</Text>
                <Text style={[styles.moneyValue, styles.moneyRed]}>{formatINR(money.overdue)}</Text>
                <Text style={styles.moneyNote}>
                  {money.overdueInvoices} invoice{money.overdueInvoices === 1 ? '' : 's'} past due
                </Text>
              </View>
            </View>
          )}

          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.sectionTitle}>Up Next</Text>
              <View style={styles.underline} />
            </View>
            {ready && next.length > 0 && (
              <Pressable style={styles.sectionAction} onPress={() => openList('ALL')} hitSlop={10} accessibilityRole="button">
                <Text style={styles.sectionActionText}>View all</Text>
                <ChevronRightIcon size={16} color={theme.primary} />
              </Pressable>
            )}
          </View>

          {!ready && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={96} radius={radii.lg} style={styles.skeletonRow} />)}
          {ready && next.length === 0 && !error && (
            <CrmEmptyState
              title="No open reminders"
              subtitle="Create a reminder to follow up on a customer or an invoice."
              icon={<BellIcon size={30} color={theme.primary} />}
              action={<PrimaryButton label="Create a reminder" onPress={() => navigation.navigate('CreateReminder')} />}
            />
          )}
          <View style={styles.cards}>
            {next.map((r) => (
              <ReminderCard key={r.id} reminder={r} outstanding={outstandingOf(r)} onPress={() => navigation.navigate('ReminderDetail', { reminderId: r.id })} />
            ))}
          </View>

          <View style={styles.quickSection}>
            <View style={styles.sectionRow}>
              <View>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.underline} />
              </View>
            </View>
            <View style={styles.quickRow}>
              <QuickAction icon={<ClipboardIcon size={19} color="#FFFFFF" />} label="All Reminders" tone="info" count={reminders.length} onPress={() => openList('ALL')} />
              <QuickAction
                icon={<RepeatIcon size={19} color="#FFFFFF" />}
                label="Repeating"
                tone="accent"
                count={schedules.length}
                onPress={() => navigation.navigate('ReminderTabs', { screen: 'Repeating' })}
              />
              <QuickAction icon={<CheckIcon size={20} color="#FFFFFF" />} label="Completed" tone="success" count={stats.completed} onPress={() => openList('COMPLETED')} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
