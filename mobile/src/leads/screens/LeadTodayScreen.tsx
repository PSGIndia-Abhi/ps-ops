import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BriefcaseIcon, CalendarIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, PinIcon, SunIcon, UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { StatusBadge, type Tone } from '../../crm/ui/StatusBadge';
import { completeTask } from '../../tasks/api';
import { fmtTime } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import type { LeadTask, Meeting, PipelineLead } from '../types';
import { errorMessage, MEETING_STATUS_META, useLoad, LeadTopBar as TopBar, LeadScreen } from '../ui';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const factory = (t: CrmTheme) => ({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { ...typography.display, fontSize: 30, color: t.textPrimary },
  date: { ...typography.body, color: t.textSecondary, marginTop: 2 },

  stats: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.lg },
  stat: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    ...t.cardShadow,
  },
  statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  statValue: { ...typography.title, color: t.textPrimary },
  statLabel: { ...typography.caption, color: t.textMuted },

  sectionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm, marginTop: spacing.xs },
  section: { ...typography.overline, color: t.textMuted },
  sectionCount: { ...typography.captionMedium, color: t.textMuted },
  sectionEmpty: {
    ...typography.caption,
    color: t.textMuted,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: t.border,
    padding: spacing.md,
    textAlign: 'center' as const,
    marginBottom: spacing.lg,
  },
  group: { marginBottom: spacing.lg },

  item: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    marginBottom: spacing.sm,
    overflow: 'hidden' as const,
    ...t.cardShadow,
  },
  pressed: { opacity: 0.9 },
  timeCol: { width: 76, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: spacing.md, backgroundColor: t.surfaceAlt },
  time: { ...typography.bodyMedium, color: t.textPrimary },
  ampm: { ...typography.caption, color: t.textMuted },
  anyTime: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const },
  itemBody: { flex: 1, padding: spacing.md, gap: 3 },
  itemTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  itemTitle: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  metaText: { ...typography.caption, color: t.textMuted, flex: 1 },
  chevron: { justifyContent: 'center' as const, paddingRight: spacing.sm },
  doneBtn: {
    alignSelf: 'center' as const,
    marginRight: spacing.sm,
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: t.success,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  doneBtnBusy: { opacity: 0.5 },

  clear: { alignItems: 'center' as const, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  clearIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: t.warningBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.md,
  },
  clearTitle: { ...typography.subtitle, color: t.textPrimary },
  clearText: { ...typography.body, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xs },
});

/** "14:30:00" -> ["2:30", "PM"]; null for "any time". */
function splitTime(time: string | null | undefined): [string, string] | null {
  if (!time) return null;
  const formatted = fmtTime(time);
  const [clock, ampm] = formatted.split(' ');
  return [clock, ampm ?? ''];
}

function TimeColumn({ time }: { time: string | null | undefined }) {
  const { styles } = useCrmStyles(factory);
  const parts = splitTime(time);
  return (
    <View style={styles.timeCol}>
      {parts ? (
        <>
          <Text style={styles.time}>{parts[0]}</Text>
          <Text style={styles.ampm}>{parts[1]}</Text>
        </>
      ) : (
        <Text style={styles.anyTime}>Any{'\n'}time</Text>
      )}
    </View>
  );
}

/**
 * The day at a glance for the lead roles (the "Today" tab): today's meetings with their live
 * status, and the follow-up calls due today with a one-tap Done. Also pushed as "Today's
 * follow-ups" from a manager's Home.
 */
export function LeadTasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const pushed = useRoute().name === 'LeadTasks';
  const { styles, theme } = useCrmStyles(factory);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(async () => {
    const [tasks, meetings, leads] = await Promise.all([
      api.myTasksToday(),
      api.meetingsToday().catch(() => [] as Meeting[]),
      // Meetings carry only the lead's id; the list gives them a company name.
      api.listLeads().catch(() => [] as PipelineLead[]),
    ]);
    const names = new Map(leads.map((l) => [l.id, l.companyName]));
    const byTime = (a: string | null, b: string | null) => (a ?? '99').localeCompare(b ?? '99');
    return {
      // A meeting's reminder task is the meeting itself, already listed with its status.
      followUps: tasks.filter((t) => t.taskType !== 'LEAD_MEETING').sort((a, b) => byTime(a.dueTime, b.dueTime)),
      meetings: [...meetings].sort((a, b) => byTime(a.time, b.time)),
      names,
    };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, "Could not load today's plan.");

  const markDone = async (task: LeadTask) => {
    setBusy(task.id);
    setActionError(null);
    try {
      await completeTask(task.id);
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not mark this done.'));
    } finally {
      setBusy(null);
    }
  };

  const now = new Date();
  const dateLabel = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  const meetings = data?.meetings ?? [];
  const followUps = data?.followUps ?? [];
  const nothing = !!data && meetings.length === 0 && followUps.length === 0;

  return (
    <LeadScreen edges={['top']}>
      {pushed ? (
        <TopBar title="Today" subtitle={dateLabel} onBack={() => navigation.goBack()} />
      ) : (
        <View style={styles.head}>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />

        <View style={styles.stats}>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: theme.accentBg }]}>
              <CalendarIcon size={19} color={theme.accent} />
            </View>
            <View>
              <Text style={styles.statValue}>{data ? meetings.length : '-'}</Text>
              <Text style={styles.statLabel}>{meetings.length === 1 ? 'Meeting' : 'Meetings'}</Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: theme.warningBg }]}>
              <ClockIcon size={19} color={theme.warning} />
            </View>
            <View>
              <Text style={styles.statValue}>{data ? followUps.length : '-'}</Text>
              <Text style={styles.statLabel}>{followUps.length === 1 ? 'Follow-up' : 'Follow-ups'}</Text>
            </View>
          </View>
        </View>

        {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={86} radius={radii.lg} style={{ marginBottom: spacing.sm }} />)}

        {nothing && (
          <View style={styles.clear}>
            <View style={styles.clearIcon}>
              <SunIcon size={34} color={theme.warning} />
            </View>
            <Text style={styles.clearTitle}>You are all clear today</Text>
            <Text style={styles.clearText}>Meetings and follow-ups due today will show up here.</Text>
          </View>
        )}

        {!!data && !nothing && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>MEETINGS</Text>
              {meetings.length > 0 && <Text style={styles.sectionCount}>{meetings.length}</Text>}
            </View>
            {meetings.length === 0 ? (
              <Text style={styles.sectionEmpty}>No meetings today</Text>
            ) : (
              <View style={styles.group}>
                {meetings.map((m) => {
                  const inProgress = m.status === 'SCHEDULED' && !!m.checkInAt;
                  const meta: { label: string; tone: Tone } = inProgress ? { label: 'In progress', tone: 'warning' } : MEETING_STATUS_META[m.status];
                  const office = m.type === 'OFFICE';
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => navigation.navigate('LeadMeeting', { meetingId: m.id })}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                    >
                      <TimeColumn time={m.time} />
                      <View style={styles.itemBody}>
                        <View style={styles.itemTop}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {data.names.get(m.leadId) || 'Meeting'}
                          </Text>
                          <StatusBadge label={meta.label} tone={meta.tone} />
                        </View>
                        <View style={styles.meta}>
                          {office ? <UsersIcon size={13} color={theme.textMuted} /> : <BriefcaseIcon size={13} color={theme.textMuted} />}
                          <Text style={styles.metaText}>{office ? 'Office meeting' : 'Site visit'}</Text>
                        </View>
                        {!!m.address && (
                          <View style={styles.meta}>
                            <PinIcon size={13} color={theme.textMuted} />
                            <Text style={styles.metaText} numberOfLines={1}>
                              {m.address}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.chevron}>
                        <ChevronRightIcon size={16} color={theme.textMuted} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.sectionRow}>
              <Text style={styles.section}>FOLLOW-UPS</Text>
              {followUps.length > 0 && <Text style={styles.sectionCount}>{followUps.length}</Text>}
            </View>
            {followUps.length === 0 ? (
              <Text style={styles.sectionEmpty}>No follow-ups due today</Text>
            ) : (
              <View style={styles.group}>
                {followUps.map((task) => (
                  <Pressable
                    key={task.id}
                    onPress={() => task.leadId && navigation.navigate('LeadDetail', { leadId: task.leadId })}
                    disabled={!task.leadId}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                  >
                    <TimeColumn time={task.dueTime} />
                    <View style={styles.itemBody}>
                      <Text style={styles.itemTitle} numberOfLines={2}>
                        {task.companyName || task.title}
                      </Text>
                      {!!task.description && (
                        <Text style={styles.metaText} numberOfLines={2}>
                          {task.description}
                        </Text>
                      )}
                      {!!task.leadNumber && <Text style={styles.metaText}>{task.leadNumber}</Text>}
                    </View>
                    <Pressable
                      onPress={() => markDone(task)}
                      disabled={busy !== null}
                      accessibilityRole="button"
                      accessibilityLabel="Mark done"
                      hitSlop={6}
                      style={[styles.doneBtn, busy === task.id && styles.doneBtnBusy]}
                    >
                      <CheckCircleIcon size={22} color={theme.success} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </LeadScreen>
  );
}
