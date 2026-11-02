import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { toneColors } from '../../crm/ui/StatusBadge';
import { fmtDateShort, initials, toDateStr, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { countByGroup, inGroup, STAGE_GROUP_ORDER, STAGE_GROUPS, type StageGroup } from '../stage';
import type { Person, PipelineLead } from '../types';
import { ActiveFilterChips, ANY_TIME, FilterButton, LeadFilterSheet, whenDay, whenLabel, type WhenFilter, type WhoOption } from '../LeadFilterSheet';
import { LeadRow, personTone, useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';

const factory = (t: CrmTheme) => ({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  title: { ...typography.display, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  searchRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm, paddingHorizontal: spacing.lg },
  searchField: { flex: 1 },
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

/** The day a lead was added, on this phone's calendar ('YYYY-MM-DD'). */
const addedOn = (l: PipelineLead) => {
  const d = new Date(l.createdAt.includes('T') ? l.createdAt : l.createdAt.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? l.createdAt.slice(0, 10) : toDateStr(d);
};

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

  const { persona, myId } = useMe();
  const manager = persona === 'sales_manager';
  const loader = useCallback(
    () => Promise.all([api.listLeads(), manager ? api.leadAssignees().catch(() => [] as Person[]) : Promise.resolve([] as Person[])]),
    [manager],
  );
  const { data: loaded, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load leads.');
  const people = useMemo(() => loaded?.[1] ?? [], [loaded]);

  // The filters behind the filter icon. Whose leads (sales manager only): 'all', 'mine' (added by me),
  // 'none' (unassigned) or a person's id. When: the day they were added.
  const [who, setWho] = useState<string>('all');
  const [when, setWhen] = useState<WhenFilter>(ANY_TIME);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterLeads = useCallback(
    (list: PipelineLead[], w: string, wh: WhenFilter) => {
      let out = list;
      if (manager && w !== 'all') {
        if (w === 'mine') out = out.filter((l) => l.createdById === myId);
        else if (w === 'none') out = out.filter((l) => !l.salesEmployeeId);
        else out = out.filter((l) => l.salesEmployeeId === w);
      }
      const day = whenDay(wh);
      return day ? out.filter((l) => addedOn(l) === day) : out;
    },
    [manager, myId],
  );
  // The stage chips, their counts, the list and the search all follow the filters.
  const data = useMemo(() => (loaded?.[0] ? filterLeads(loaded[0], who, when) : undefined), [loaded, who, when, filterLeads]);
  const onDay = whenDay(when);
  const whoLabel =
    who === 'mine' ? 'Added by me' : who === 'none' ? 'Unassigned' : people.find((p) => String(p.id) === who)?.name ?? 'Someone';
  const whoOptions: WhoOption[] = [
    { key: 'all', label: 'Everyone' },
    { key: 'mine', label: 'Added by me' },
    { key: 'none', label: 'Unassigned' },
    ...people.map((p) => {
      const id = String(p.id);
      const tint = toneColors(theme, personTone(p.name));
      return { key: id, label: id === myId ? `${p.name} (me)` : p.name, avatar: { text: initials(p.name), bg: tint.bg, fg: tint.fg } };
    }),
  ];
  const activeFilters = [
    ...(manager && who !== 'all' ? [{ key: 'who', label: whoLabel, onRemove: () => setWho('all') }] : []),
    ...(when.kind !== 'any' ? [{ key: 'when', label: `Added ${whenLabel(when) === 'Today' || whenLabel(when) === 'Yesterday' ? whenLabel(when).toLowerCase() : `on ${whenLabel(when)}`}`, onRemove: () => setWhen(ANY_TIME) }] : []),
  ];

  const counts = useMemo(() => countByGroup(data ?? []), [data]);
  // Sales executives and managers get their leads verified already: the calling-queue filters
  // (New / To call) are only for the telecaller - or while an older lead still sits there.
  const groups = STAGE_GROUP_ORDER.filter((g) => persona === 'telecaller' || !['new', 'to_call'].includes(g) || counts[g] > 0);
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
      {/* Search, with the filters (whose leads, day added) behind the icon at its end. */}
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <CrmTextField
            value={query}
            onChangeText={setQuery}
            placeholder="Search company, contact, phone…"
            icon={<SearchIcon size={18} color={theme.textMuted} />}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <FilterButton count={activeFilters.length} onPress={() => setFiltersOpen(true)} />
      </View>
      <ActiveFilterChips items={activeFilters} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {groups.map((g) => (
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
            <CrmEmptyState
              title="No leads here"
              subtitle={query ? 'Nothing matches your search.' : onDay ? `No leads were added on ${onDay === todayStr() ? 'today' : fmtDateShort(onDay)}.` : 'There are no leads at this stage.'}
            />
          )
        }
        renderItem={({ item }) => <LeadRow lead={item} onPress={() => navigation.navigate('LeadDetail', { leadId: item.id })} />}
      />
      <LeadFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        showWho={manager}
        whoOptions={whoOptions}
        who={who}
        when={when}
        countWith={(w, wh) => filterLeads(loaded?.[0] ?? [], w, wh).length}
        onApply={(w, wh) => {
          setWho(w);
          setWhen(wh);
        }}
      />
    </LeadScreen>
  );
}
