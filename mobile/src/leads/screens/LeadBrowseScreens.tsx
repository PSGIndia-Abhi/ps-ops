import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, CheckCircleIcon, PhoneIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { completeTask } from '../../tasks/api';
import { fmtTime } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { countByGroup, inGroup, STAGE_GROUP_ORDER, STAGE_GROUPS, type StageGroup } from '../stage';
import type { LeadTask, PipelineLead } from '../types';
import { Card, errorMessage, LeadRow, useLoad, LeadTopBar as TopBar, LeadScreen } from '../ui';

const factory = (t: CrmTheme) => ({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  title: { ...typography.display, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
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
  taskIcon: { width: 38, height: 38, borderRadius: radii.pill, backgroundColor: t.warningBg, alignItems: 'center' as const, justifyContent: 'center' as const },
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
});

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
    <LeadScreen edges={['top']}>
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
    </LeadScreen>
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
    <LeadScreen edges={['top']}>
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
              <View style={styles.taskIcon}>
                {item.taskType === 'LEAD_MEETING' ? <CalendarIcon size={18} color={theme.warningText} /> : <PhoneIcon size={18} color={theme.warningText} />}
              </View>
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
    </LeadScreen>
  );
}
