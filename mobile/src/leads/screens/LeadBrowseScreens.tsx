import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type CompositeNavigationProp, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { CalendarIcon, ChartIcon, CheckCircleIcon, ClockIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton, SectionLabel } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { TopBar } from '../../crm/ui/TopBar';
import { completeTask } from '../../tasks/api';
import { firstName, fmtTime, greeting } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadRootStackParamList, LeadStackParamList, LeadTabParamList } from '../navigation';
import { countByGroup, inGroup, STAGE_GROUP_ORDER, STAGE_GROUPS, type StageGroup } from '../stage';
import type { LeadTask, PipelineLead } from '../types';
import { ActionRow, Card, errorMessage, LeadRow, MeetingRow, StatTile, useLoad, useMe } from '../ui';
import type { Tone } from '../../crm/ui/StatusBadge';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  hello: { ...typography.caption, color: t.textMuted },
  name: { ...typography.display, color: t.textPrimary, marginBottom: spacing.md },
  title: { ...typography.display, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  tileRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.sm },
  spacer: { height: spacing.sm },
  search: { paddingHorizontal: spacing.lg },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.sm },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chipOn: { backgroundColor: t.primary, borderColor: t.primary },
  chipText: { ...typography.captionMedium, color: t.textSecondary },
  chipTextOn: { color: t.textOnPrimary },
  taskRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  taskBody: { flex: 1 },
  taskTitle: { ...typography.bodyMedium, color: t.textPrimary },
  taskSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  done: {
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: t.successBg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  doneText: { ...typography.captionMedium, color: t.successText },
  muted: { ...typography.caption, color: t.textMuted },
});

// Module scope so the rows are not handed a new icon function on every render.
const clockIcon = (c: string) => <ClockIcon size={20} color={c} />;
const calendarIcon = (c: string) => <CalendarIcon size={20} color={c} />;
const chartIcon = (c: string) => <ChartIcon size={20} color={c} />;

type HomeNav = CompositeNavigationProp<BottomTabNavigationProp<LeadTabParamList, 'Home'>, NativeStackNavigationProp<LeadRootStackParamList>>;

// ---------------------------------------------------------------------------
// Home (telecaller / sales manager)
// ---------------------------------------------------------------------------

const TELECALLER_TILES: { group: StageGroup; tone: Tone }[][] = [
  [
    { group: 'new', tone: 'info' },
    { group: 'to_call', tone: 'warning' },
  ],
  [
    { group: 'qualified', tone: 'success' },
    { group: 'closed', tone: 'danger' },
  ],
];

const MANAGER_TILES: { group: StageGroup; tone: Tone }[][] = [
  [
    { group: 'new', tone: 'info' },
    { group: 'to_call', tone: 'warning' },
    { group: 'qualified', tone: 'success' },
  ],
  [
    { group: 'meeting', tone: 'accent' },
    { group: 'quoted', tone: 'accent' },
    { group: 'won', tone: 'success' },
  ],
];

export function LeadHomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { user } = useAuth();
  const { persona } = useMe();
  const { styles } = useCrmStyles(factory);

  const loader = useCallback(async () => {
    const [leads, tasks, meetings] = await Promise.all([
      api.listLeads(),
      api.myTasksToday().catch(() => [] as LeadTask[]),
      api.meetingsToday().catch(() => []),
    ]);
    return { leads, tasks, meetings };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your leads.');

  const counts = useMemo(() => countByGroup(data?.leads ?? []), [data]);
  const names = useMemo(() => new Map((data?.leads ?? []).map((l) => [l.id, l.companyName])), [data]);
  const tiles = persona === 'sales_manager' ? MANAGER_TILES : TELECALLER_TILES;
  const openGroup = (group: StageGroup) => navigation.navigate('Leads', { group, at: Date.now() });
  const openTasks = () => (persona === 'telecaller' ? navigation.navigate('Tasks') : navigation.navigate('LeadTasks'));

  return (
    <CrmScreen refreshing={refreshing} onRefresh={refresh}>
      <Text style={styles.hello}>{greeting()},</Text>
      <Text style={styles.name} numberOfLines={1}>
        {firstName(user?.name)}
      </Text>
      <CrmErrorBanner message={error} onRetry={reload} />

      <SectionLabel>{persona === 'sales_manager' ? 'PIPELINE' : 'LEADS TO VERIFY'}</SectionLabel>
      {loading && !data ? (
        <CrmSkeleton height={176} radius={radii.lg} />
      ) : (
        tiles.map((row, i) => (
          <View key={i} style={styles.tileRow}>
            {row.map(({ group, tone }) => (
              <StatTile key={group} label={STAGE_GROUPS[group].label} value={counts[group]} tone={tone} onPress={() => openGroup(group)} />
            ))}
          </View>
        ))
      )}
      <View style={styles.spacer} />

      <SectionLabel>TODAY</SectionLabel>
      <Card>
        <ActionRow
          icon={clockIcon}
          title={`${data?.tasks.length ?? 0} follow-up${data?.tasks.length === 1 ? '' : 's'} due today`}
          hint="Calls and reminders assigned to you"
          tone="warning"
          onPress={openTasks}
        />
        <ActionRow
          icon={calendarIcon}
          title={`${data?.meetings.length ?? 0} meeting${data?.meetings.length === 1 ? '' : 's'} today`}
          hint="Meetings assigned to you"
          tone="accent"
          divider
          onPress={() => navigation.navigate('LeadMeetings')}
        />
        {persona === 'sales_manager' && (
          <ActionRow
            icon={chartIcon}
            title="Team performance"
            hint="Leads, visits and conversions per person"
            tone="info"
            divider
            onPress={() => navigation.navigate('Team')}
          />
        )}
      </Card>

      {!!data && data.meetings.length > 0 && (
        <>
          <SectionLabel>TODAY'S MEETINGS</SectionLabel>
          {data.meetings.slice(0, 3).map((m) => (
            <MeetingRow key={m.id} meeting={m} title={names.get(m.leadId) || m.address || 'Meeting'} onPress={() => navigation.navigate('LeadMeeting', { meetingId: m.id })} />
          ))}
        </>
      )}

      {!!data && data.leads.length === 0 && !error && (
        <CrmEmptyState title="No leads yet" subtitle="New commercial leads will appear here as soon as they are submitted." />
      )}
    </CrmScreen>
  );
}

// ---------------------------------------------------------------------------
// Lead list - a tab for telecaller / manager, a pushed screen for sales
// ---------------------------------------------------------------------------

type ListRoute = RouteProp<{ Leads: { group?: StageGroup; at?: number } | undefined }, 'Leads'>;

export function LeadListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const route = useRoute<ListRoute>();
  const pushed = (route.name as string) === 'LeadList';
  const { styles, theme } = useCrmStyles(factory);
  const [group, setGroup] = useState<StageGroup>(route.params?.group ?? 'all');
  const [query, setQuery] = useState('');

  // A home tile re-opens this (already mounted) tab with a new group.
  const wanted = route.params?.group;
  const at = route.params?.at;
  useEffect(() => {
    if (wanted) setGroup(wanted);
  }, [wanted, at]);

  const loader = useCallback(() => api.listLeads(), []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load leads.');

  const counts = useMemo(() => countByGroup(data ?? []), [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (l: PipelineLead) =>
        inGroup(l, group) &&
        (!q ||
          l.companyName.toLowerCase().includes(q) ||
          l.contactPerson.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.leadNumber ?? '').toLowerCase().includes(q)),
    );
  }, [data, group, query]);

  return (
    <CrmScreen scroll={false} edges={['top']}>
      {pushed ? <TopBar title="Commercial leads" onBack={() => navigation.goBack()} /> : <Text style={styles.title}>Leads</Text>}
      <View style={styles.search}>
        <CrmTextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search company, contact, phone…"
          icon={<SearchIcon size={18} color={theme.textMuted} />}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {STAGE_GROUP_ORDER.map((g) => (
            <Pressable
              key={g}
              onPress={() => setGroup(g)}
              accessibilityRole="button"
              accessibilityState={{ selected: group === g }}
              style={[styles.chip, group === g && styles.chipOn]}
            >
              <Text style={[styles.chipText, group === g && styles.chipTextOn]}>
                {STAGE_GROUPS[g].label} ({counts[g]})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListHeaderComponent={<CrmErrorBanner message={error} onRetry={reload} />}
        ListEmptyComponent={
          loading ? (
            <CrmSkeleton height={120} radius={radii.lg} />
          ) : error ? undefined : (
            <CrmEmptyState title="No leads here" subtitle={query ? 'Nothing matches your search.' : 'There are no leads at this stage.'} />
          )
        }
        renderItem={({ item }) => <LeadRow lead={item} onPress={() => navigation.navigate('LeadWork', { leadId: item.id })} />}
      />
    </CrmScreen>
  );
}

// ---------------------------------------------------------------------------
// Today's lead tasks (follow-ups and meeting reminders)
// ---------------------------------------------------------------------------

export function LeadTasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const route = useRoute();
  const pushed = route.name === 'LeadTasks';
  const { styles, theme } = useCrmStyles(factory);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(() => api.myTasksToday(), []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, "Could not load today's tasks.");

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

  return (
    <CrmScreen scroll={false} edges={['top']}>
      {pushed ? <TopBar title="Today's follow-ups" onBack={() => navigation.goBack()} /> : <Text style={styles.title}>Today</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListHeaderComponent={
          <>
            <CrmErrorBanner message={error} onRetry={reload} />
            <CrmErrorBanner message={actionError} />
          </>
        }
        ListEmptyComponent={
          loading ? (
            <CrmSkeleton height={96} radius={radii.lg} />
          ) : error ? undefined : (
            <CrmEmptyState title="Nothing due today" subtitle="Follow-ups you schedule on a lead will show up here on their day." icon={<CheckCircleIcon size={30} color={theme.textMuted} />} />
          )
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.taskRow}>
              <Pressable
                style={styles.taskBody}
                disabled={!item.leadId}
                accessibilityRole="button"
                onPress={() => item.leadId && navigation.navigate('LeadWork', { leadId: item.leadId })}
              >
                <Text style={styles.taskTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.taskSub} numberOfLines={2}>
                  {[item.dueTime ? fmtTime(item.dueTime) : null, item.leadNumber, item.description].filter(Boolean).join(' · ') || 'Open lead'}
                </Text>
              </Pressable>
              {/* A meeting reminder is closed by completing the visit itself, not from here. */}
              {item.taskType !== 'LEAD_MEETING' && (
                <Pressable onPress={() => markDone(item)} disabled={busy !== null} accessibilityRole="button" accessibilityLabel="Mark done" style={styles.done}>
                  <CheckCircleIcon size={16} color={theme.successText} />
                  <Text style={styles.doneText}>{busy === item.id ? 'Saving' : 'Done'}</Text>
                </Pressable>
              )}
            </View>
          </Card>
        )}
      />
    </CrmScreen>
  );
}
