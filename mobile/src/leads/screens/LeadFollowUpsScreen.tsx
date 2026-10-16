import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircleIcon, PhoneIcon, PlayIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { refreshReminders } from '../../reminders-engine/useReminders';
import { addDays, fmtDateShort, fmtTime, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { errorMessage, useLoad, useMe, LeadScreen, LeadTopBar } from '../ui';
import { RemindersScreen } from './RemindersScreens';
import { EditIcon, TrashIcon } from '../../tasks/ui/taskIcons';
import { MeetingsScreen } from './MeetingScreens';

type Tab = 'followups' | 'meetings' | 'reminders';
const TABS: { value: Tab; label: string }[] = [
  { value: 'followups', label: 'Follow-ups' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'reminders', label: 'Reminders' },
];
// Residential leads have no meetings.
const RESIDENTIAL_TABS = TABS.filter((t) => t.value !== 'meetings');

const factory = (t: CrmTheme) => ({
  title: { ...typography.display, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sub: { ...typography.caption, color: t.textMuted, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tabs: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  stats: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.md },
  stat: { flex: 1, borderRadius: radii.lg, paddingVertical: spacing.sm, alignItems: 'center' as const, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  statValue: { ...typography.title, color: t.textPrimary },
  statLabel: { ...typography.caption, color: t.textMuted },
  chips: { gap: spacing.xs, paddingBottom: spacing.md },
  chip: { minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, justifyContent: 'center' as const },
  chipOn: { backgroundColor: t.primary, borderColor: t.primary },
  chipText: { ...typography.captionMedium, color: t.textSecondary },
  chipTextOn: { color: t.textOnPrimary },
  group: { ...typography.overline, color: t.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  groupLate: { color: t.danger },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowLate: { borderColor: t.danger },
  // One lead's card: its next follow-up; a tap opens all of them (LeadFollowUpHistory)
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  countPill: { alignSelf: 'flex-start' as const, marginTop: 4, paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: t.primarySoftBg },
  countText: { ...typography.captionMedium, color: t.primary },
  badgeRow: { flexDirection: 'row' as const, marginTop: 4 },
  timeCol: { width: 78, alignItems: 'center' as const },
  time: { ...typography.bodyMedium, color: t.textPrimary },
  timeSub: { ...typography.caption, color: t.textMuted },
  timeLate: { color: t.danger },
  text: { flex: 1, gap: 2 },
  name: { ...typography.bodyMedium, color: t.textPrimary },
  meta: { ...typography.caption, color: t.textMuted },
  forWho: { ...typography.captionMedium, color: t.primary },
  done: { ...typography.caption, color: t.successText },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  callBtn: { backgroundColor: t.successBg },
  doneBtn: { backgroundColor: t.primarySoftBg },
  dim: { opacity: 0.4 },
  empty: { alignItems: 'center' as const, paddingVertical: spacing.xxl, gap: spacing.xs },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary },
  emptyText: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const },
  more: { ...typography.captionMedium, color: t.primary, paddingVertical: spacing.sm, textAlign: 'center' as const },
  inlineActions: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: 6 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const },
  iconBtnEdit: { backgroundColor: t.primarySoftBg },
  iconBtnDelete: { backgroundColor: t.dangerBg },
});

/** One lead's follow-ups, in time order; `next` is the first of them. */
interface LeadGroup {
  key: string;
  next: api.FollowUpRow;
  items: api.FollowUpRow[];
}
const dueKey = (f: api.FollowUpRow) => `${f.dueDate ?? '9999-99-99'}T${f.dueTime ?? '99:99'}`;
function byLead(rows: api.FollowUpRow[]): LeadGroup[] {
  const map = new Map<string, api.FollowUpRow[]>();
  for (const f of rows) map.set(f.leadId, [...(map.get(f.leadId) ?? []), f]);
  return [...map.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
      return { key, next: sorted[0], items: sorted };
    })
    .sort((a, b) => dueKey(a.next).localeCompare(dueKey(b.next)));
}

/**
 * Follow-ups in the Commercial Leads app (they are not shown in Task Management): your own, on
 * commercial leads only - for every role, the sales manager too. Overdue, Today, Upcoming, and the
 * last 7 days' done. Call, mark done, or tap to open the lead (where the date and time can be
 * changed). The second tab is the Reminders list. (Residential follow-up calls live on each
 * residential lead, in the Residential app.)
 */
export function LeadFollowUpsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  // Pushed from the Residential app's More (leadType 'consumer'); else the Commercial app's tab.
  const residential = (useRoute().params as { leadType?: string } | undefined)?.leadType === 'consumer';
  const leadType = residential ? 'consumer' : 'commercial';
  const { styles, theme } = useCrmStyles(factory);
  const { myId } = useMe();
  // Your own follow-ups only (the team view was more confusing than useful).
  const team = false;
  const [tab, setTab] = useState<Tab>('followups');
  const [person, setPerson] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const loader = useCallback(() => api.listFollowUps({ team, done: true, leadType }), [team, leadType]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the follow-ups.');
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const f of data ?? []) if (f.assignedTo && !seen.has(f.assignedTo)) seen.set(f.assignedTo, f.assignedTo === myId ? 'Me' : f.assignedToName);
    return [...seen.entries()].sort((a, b) => (a[1] === 'Me' ? -1 : b[1] === 'Me' ? 1 : a[1].localeCompare(b[1])));
  }, [data, myId]);

  // One card per lead: its follow-ups together, the card filed by its NEXT (earliest) one.
  const groups = useMemo(() => {
    const today = todayStr();
    const rows = (data ?? []).filter((f) => person === 'all' || f.assignedTo === person);
    const open = byLead(rows.filter((f) => f.status !== 'COMPLETED'));
    return {
      overdue: open.filter((g) => !!g.next.dueDate && g.next.dueDate < today),
      today: open.filter((g) => !g.next.dueDate || g.next.dueDate === today),
      upcoming: open.filter((g) => !!g.next.dueDate && g.next.dueDate > today),
      done: byLead(rows.filter((f) => f.status === 'COMPLETED')).reverse(),
    };
  }, [data, person]);
  // A card opens the lead's follow-up page (open ones + history), like the web.
  const openLead = (f: api.FollowUpRow) =>
    navigation.navigate('LeadFollowUpHistory', { leadId: f.leadId, name: f.leadName, number: f.leadNumber, phone: f.phone, leadType: f.leadType });
  const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});
  const removeFollowUp = (f: api.FollowUpRow) =>
    Alert.alert('Delete this follow-up?', `${f.leadName}${f.dueDate ? ` · ${fmtDateShort(f.dueDate)}${f.dueTime ? `, ${fmtTime(f.dueTime)}` : ''}` : ''}`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(f.id);
          setActionError(null);
          try {
            await api.deleteFollowUp(f.id);
            refreshReminders();
            reload();
          } catch (err) {
            setActionError(errorMessage(err, 'Could not delete the follow-up.'));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  /** The round button's step, as a task in Task Management: Start -> Completed (Resume when paused). */
  const step = async (f: api.FollowUpRow) => {
    setBusy(f.id);
    setActionError(null);
    try {
      if (f.status === 'OPEN') await api.startFollowUp(f.id);
      else if (f.status === 'PAUSED') await api.resumeFollowUp(f.id);
      else await api.completeFollowUp(f.id);
      refreshReminders();
      reload();
    } catch (err) {
      setActionError(errorMessage(err, f.status === 'IN_PROGRESS' ? 'Could not mark it done.' : 'Could not start the follow-up.'));
    } finally {
      setBusy(null);
    }
  };

  /** The icons of one follow-up of mine: change, delete, done. */
  const actions = (f: api.FollowUpRow) => (
    <View style={styles.inlineActions}>
      <Pressable
        onPress={() => navigation.navigate('LeadFollowUp', { leadId: f.leadId, name: f.leadName, taskId: f.id })}
        accessibilityRole="button"
        accessibilityLabel="Change the follow-up"
        hitSlop={6}
        style={[styles.iconBtn, styles.iconBtnEdit]}
      >
        <EditIcon size={16} color={theme.primary} />
      </Pressable>
      <Pressable
        onPress={() => removeFollowUp(f)}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel="Delete the follow-up"
        hitSlop={6}
        style={[styles.iconBtn, styles.iconBtnDelete]}
      >
        <TrashIcon size={16} color={theme.danger} />
      </Pressable>
    </View>
  );

  const card = (g: LeadGroup, late = false) => {
    const f = g.next;
    const tomorrow = addDays(todayStr(), 1);
    const many = g.items.length > 1;
    const mine = f.assignedTo === myId;
    const done = f.status === 'COMPLETED';
    const when = done ? 'Done' : f.dueTime ? fmtTime(f.dueTime) : 'Any time';
    const day = done ? '' : late ? fmtDateShort(f.dueDate).replace(/, \d{4}$/, '') : !f.dueDate || f.dueDate === todayStr() ? 'Today' : f.dueDate === tomorrow ? 'Tomorrow' : fmtDateShort(f.dueDate).replace(/, \d{4}$/, '');
    return (
      <View key={g.key} style={[styles.card, late && styles.rowLate]}>
        <Pressable onPress={() => openLead(f)} accessibilityRole="button" style={({ pressed }) => [styles.cardHead, pressed && { opacity: 0.9 }]}>
          <View style={styles.timeCol}>
            <Text style={[styles.time, late && styles.timeLate]}>{when}</Text>
            {!!day && <Text style={[styles.timeSub, late && styles.timeLate]}>{day}</Text>}
          </View>
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>
              {f.leadName}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[f.leadType === 'consumer' ? 'Residential' : f.leadNumber, f.phone].filter(Boolean).join(' · ')}
            </Text>
            {!!f.description && (
              <Text style={styles.meta} numberOfLines={1}>
                {many && !done ? `Next: ${f.description}` : f.description}
              </Text>
            )}
            {done && <Text style={styles.done}>{many ? `${g.items.length} follow-ups completed` : 'Completed'}</Text>}
            {!done && f.status !== 'OPEN' && (
              <View style={styles.badgeRow}>
                <StatusBadge label={f.status === 'PAUSED' ? 'Paused' : 'In progress'} tone={f.status === 'PAUSED' ? 'warning' : 'info'} />
              </View>
            )}
            {!done && many && (
              <View style={styles.countPill}>
                <Text style={styles.countText}>{g.items.length} follow-ups</Text>
              </View>
            )}
            {!done && mine && !many && actions(f)}
          </View>
          {!done && !!f.phone && (
            <Pressable onPress={() => call(f.phone)} accessibilityRole="button" accessibilityLabel={`Call ${f.leadName}`} hitSlop={4} style={[styles.action, styles.callBtn]}>
              <PhoneIcon size={18} color={theme.successText} />
            </Pressable>
          )}
          {!done && mine && !many && (
            <Pressable
              onPress={() => step(f)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={f.status === 'IN_PROGRESS' ? 'Mark done' : f.status === 'PAUSED' ? 'Resume' : 'Start'}
              hitSlop={4}
              style={[styles.action, f.status === 'IN_PROGRESS' ? styles.callBtn : styles.doneBtn, busy === f.id && styles.dim]}
            >
              {f.status === 'IN_PROGRESS' ? <CheckCircleIcon size={20} color={theme.successText} /> : <PlayIcon size={18} color={theme.primary} />}
            </Pressable>
          )}
        </Pressable>

      </View>
    );
  };

  const total = groups.overdue.length + groups.today.length + groups.upcoming.length;
  const count = (list: LeadGroup[]) => list.reduce((n, g) => n + g.items.length, 0);

  return (
    <LeadScreen edges={residential ? ['top', 'bottom'] : ['top']}>
      {residential ? (
        <LeadTopBar title="Follow-ups" subtitle="Your residential calls and reminders" onBack={() => navigation.goBack()} />
      ) : (
        <>
          <Text style={styles.title}>Follow-ups</Text>
          <Text style={styles.sub}>Your follow-ups, meetings and reminders</Text>
        </>
      )}
      <View style={styles.tabs}>
        <SegmentedControl options={residential ? RESIDENTIAL_TABS : TABS} value={tab} onChange={setTab} />
      </View>

      {tab === 'reminders' ? (
        <RemindersScreen embedded />
      ) : tab === 'meetings' ? (
        <MeetingsScreen embedded />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        >
          <CrmErrorBanner message={error} onRetry={reload} />
          <CrmErrorBanner message={actionError} />

          {team && people.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {[['all', 'Whole team'] as [string, string], ...people].map(([id, label]) => (
                <Pressable key={id} onPress={() => setPerson(id)} accessibilityRole="button" accessibilityState={{ selected: person === id }} style={[styles.chip, person === id && styles.chipOn]}>
                  <Text style={[styles.chipText, person === id && styles.chipTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {!!data && (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, groups.overdue.length > 0 && { color: theme.danger }]}>{groups.overdue.length}</Text>
                <Text style={styles.statLabel}>Overdue</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{groups.today.length}</Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{groups.upcoming.length}</Text>
                <Text style={styles.statLabel}>Upcoming</Text>
              </View>
            </View>
          )}

          {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={76} radius={radii.lg} style={{ marginBottom: spacing.sm }} />)}

          {!!data && total === 0 && !error && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No follow-ups</Text>
              <Text style={styles.emptyText}>
                {residential
                  ? 'Log a call on a residential lead and set the next call. Turn on "Set a reminder" to have your phone ring.'
                  : 'Add one from a lead (Follow-up). Turn on "Set a reminder" to have your phone ring.'}
              </Text>
            </View>
          )}

          {groups.overdue.length > 0 && (
            <>
              <Text style={[styles.group, styles.groupLate]}>OVERDUE · {groups.overdue.length}</Text>
              {groups.overdue.map((g) => card(g, true))}
            </>
          )}
          {groups.today.length > 0 && (
            <>
              <Text style={styles.group}>TODAY · {groups.today.length}</Text>
              {groups.today.map((g) => card(g))}
            </>
          )}
          {groups.upcoming.length > 0 && (
            <>
              <Text style={styles.group}>UPCOMING · {groups.upcoming.length}</Text>
              {groups.upcoming.map((g) => card(g))}
            </>
          )}
          {groups.done.length > 0 && (
            <>
              <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button">
                <Text style={styles.more}>{showDone ? 'Hide done' : `Show done in the last 7 days (${count(groups.done)})`}</Text>
              </Pressable>
              {showDone && groups.done.map((g) => card(g))}
            </>
          )}
        </ScrollView>
      )}
    </LeadScreen>
  );
}
