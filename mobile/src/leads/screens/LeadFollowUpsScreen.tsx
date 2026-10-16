import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircleIcon, ChevronRightIcon, PhoneIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { refreshReminders } from '../../reminders-engine/useReminders';
import { addDays, fmtDateShort, fmtTime, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { errorMessage, useLoad, useMe, LeadScreen } from '../ui';
import { RemindersScreen } from './RemindersScreens';

type Tab = 'followups' | 'reminders';
const TABS: { value: Tab; label: string }[] = [
  { value: 'followups', label: 'Follow-ups' },
  { value: 'reminders', label: 'Reminders' },
];

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
});

/**
 * Follow-ups in the Commercial Leads app (they are not shown in Task Management): your own, on
 * commercial leads only - for every role, the sales manager too. Overdue, Today, Upcoming, and the
 * last 7 days' done. Call, mark done, or tap to open the lead (where the date and time can be
 * changed). The second tab is the Reminders list. (Residential follow-up calls live on each
 * residential lead, in the Residential app.)
 */
export function LeadFollowUpsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { myId } = useMe();
  // Your own follow-ups only (the team view was more confusing than useful).
  const team = false;
  const [tab, setTab] = useState<Tab>('followups');
  const [person, setPerson] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const loader = useCallback(() => api.listFollowUps({ team, done: true, leadType: 'commercial' }), [team]);
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

  const groups = useMemo(() => {
    const today = todayStr();
    const rows = (data ?? []).filter((f) => person === 'all' || f.assignedTo === person);
    const open = rows.filter((f) => f.status !== 'COMPLETED');
    return {
      overdue: open.filter((f) => !!f.dueDate && f.dueDate < today),
      today: open.filter((f) => !f.dueDate || f.dueDate === today),
      upcoming: open.filter((f) => !!f.dueDate && f.dueDate > today),
      done: rows.filter((f) => f.status === 'COMPLETED').reverse(),
    };
  }, [data, person]);

  const openLead = (f: api.FollowUpRow) => navigation.navigate('LeadDetail', { leadId: f.leadId });
  const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});
  const markDone = async (f: api.FollowUpRow) => {
    setBusy(f.id);
    setActionError(null);
    try {
      await api.completeFollowUp(f.id);
      refreshReminders();
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not mark it done.'));
    } finally {
      setBusy(null);
    }
  };

  const row = (f: api.FollowUpRow, late = false) => {
    const tomorrow = addDays(todayStr(), 1);
    const mine = f.assignedTo === myId;
    const done = f.status === 'COMPLETED';
    const when = done ? 'Done' : f.dueTime ? fmtTime(f.dueTime) : 'Any time';
    const day = done ? '' : !f.dueDate || f.dueDate === todayStr() ? (late ? '' : 'Today') : f.dueDate === tomorrow ? 'Tomorrow' : fmtDateShort(f.dueDate);
    return (
      <Pressable key={f.id} onPress={() => openLead(f)} accessibilityRole="button" style={({ pressed }) => [styles.row, late && styles.rowLate, pressed && { opacity: 0.9 }]}>
        <View style={styles.timeCol}>
          <Text style={[styles.time, late && styles.timeLate]}>{when}</Text>
          {!!(late ? fmtDateShort(f.dueDate).replace(/, \d{4}$/, '') : day) && (
            <Text style={[styles.timeSub, late && styles.timeLate]}>{late ? fmtDateShort(f.dueDate).replace(/, \d{4}$/, '') : day}</Text>
          )}
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
              {f.description}
            </Text>
          )}
          {team && <Text style={styles.forWho}>{mine ? 'For me' : `For ${f.assignedToName}`}</Text>}
          {done && !!f.completedAt && <Text style={styles.done}>Completed</Text>}
        </View>
        {!done && !!f.phone && (
          <Pressable onPress={() => call(f.phone)} accessibilityRole="button" accessibilityLabel={`Call ${f.leadName}`} hitSlop={4} style={[styles.action, styles.callBtn]}>
            <PhoneIcon size={18} color={theme.successText} />
          </Pressable>
        )}
        {!done && mine ? (
          <Pressable
            onPress={() => markDone(f)}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Mark done"
            hitSlop={4}
            style={[styles.action, styles.doneBtn, busy === f.id && styles.dim]}
          >
            <CheckCircleIcon size={20} color={theme.primary} />
          </Pressable>
        ) : (
          <ChevronRightIcon size={16} color={theme.textMuted} />
        )}
      </Pressable>
    );
  };

  const total = groups.overdue.length + groups.today.length + groups.upcoming.length;

  return (
    <LeadScreen edges={['top']}>
      <Text style={styles.title}>Follow-ups</Text>
      <Text style={styles.sub}>Your follow-ups on commercial leads, and your reminders</Text>
      <View style={styles.tabs}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>

      {tab === 'reminders' ? (
        <RemindersScreen embedded />
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
              <Text style={styles.emptyText}>Add one from a lead (Follow-up) and it shows here - your phone rings at its time.</Text>
            </View>
          )}

          {groups.overdue.length > 0 && (
            <>
              <Text style={[styles.group, styles.groupLate]}>OVERDUE · {groups.overdue.length}</Text>
              {groups.overdue.map((f) => row(f, true))}
            </>
          )}
          {groups.today.length > 0 && (
            <>
              <Text style={styles.group}>TODAY · {groups.today.length}</Text>
              {groups.today.map((f) => row(f))}
            </>
          )}
          {groups.upcoming.length > 0 && (
            <>
              <Text style={styles.group}>UPCOMING · {groups.upcoming.length}</Text>
              {groups.upcoming.map((f) => row(f))}
            </>
          )}
          {groups.done.length > 0 && (
            <>
              <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button">
                <Text style={styles.more}>{showDone ? 'Hide done' : `Show done in the last 7 days (${groups.done.length})`}</Text>
              </Pressable>
              {showDone && groups.done.map((f) => row(f))}
            </>
          )}
        </ScrollView>
      )}
    </LeadScreen>
  );
}
