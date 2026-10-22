import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { PersonIcon, UsersIcon } from '../../components/icons';
import { toneColors } from '../../crm/ui/StatusBadge';
import { initials } from '../../tasks/format';
import { ActionSheet, type SheetAction } from '../../tasks/ui/sheets';
import { ChevronDownIcon } from '../../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { countByGroup, inGroup, STAGE_GROUP_ORDER, STAGE_GROUPS, type StageGroup } from '../stage';
import type { Person, PipelineLead } from '../types';
import { LeadRow, personTone, useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';

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
  // Sales manager: whose leads (Everyone / a sales executive / Unassigned / Added by me)
  personRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  person: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  personOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  personText: { ...typography.bodyMedium, color: t.textPrimary },
  personTextOn: { color: t.primary },
  initials: { ...typography.captionMedium },
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

  const { persona, myId } = useMe();
  const manager = persona === 'sales_manager';
  const loader = useCallback(
    () => Promise.all([api.listLeads(), manager ? api.leadAssignees().catch(() => [] as Person[]) : Promise.resolve([] as Person[])]),
    [manager],
  );
  const { data: loaded, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load leads.');
  const people = useMemo(() => loaded?.[1] ?? [], [loaded]);

  // Sales manager: whose leads to show - 'all', 'mine' (added by me), 'none' (unassigned) or a person's id.
  const [who, setWho] = useState<string>('all');
  const [pickWho, setPickWho] = useState(false);
  const data = useMemo(() => {
    const all = loaded?.[0];
    if (!all || !manager || who === 'all') return all;
    if (who === 'mine') return all.filter((l) => l.createdById === myId);
    if (who === 'none') return all.filter((l) => !l.salesEmployeeId);
    return all.filter((l) => l.salesEmployeeId === who);
  }, [loaded, manager, who, myId]);
  const whoLabel =
    who === 'all' ? 'Everyone' : who === 'mine' ? 'Added by me' : who === 'none' ? 'Unassigned' : people.find((p) => String(p.id) === who)?.name ?? 'Someone';
  const countFor = (key: string) => {
    const all = loaded?.[0] ?? [];
    if (key === 'all') return all.length;
    if (key === 'mine') return all.filter((l) => l.createdById === myId).length;
    if (key === 'none') return all.filter((l) => !l.salesEmployeeId).length;
    return all.filter((l) => l.salesEmployeeId === key).length;
  };
  // Each option's circle: a group, me, nobody yet - and a person's initials on their own tint.
  const whoActions: SheetAction[] = [
    { key: 'all', label: 'Everyone', sub: `${countFor('all')} leads`, icon: <UsersIcon size={18} color={theme.primary} />, selected: who === 'all', onPress: () => setWho('all') },
    { key: 'mine', label: 'Added by me', sub: `${countFor('mine')} leads`, icon: <PersonIcon size={18} color={theme.primary} />, selected: who === 'mine', onPress: () => setWho('mine') },
    {
      key: 'none',
      label: 'Unassigned',
      sub: `${countFor('none')} leads`,
      icon: <PersonIcon size={18} color={theme.textMuted} />,
      iconBg: theme.surfaceAlt,
      selected: who === 'none',
      onPress: () => setWho('none'),
    },
    ...people.map((p) => {
      const id = String(p.id);
      const tint = toneColors(theme, personTone(p.name));
      return {
        key: id,
        icon: <Text style={[styles.initials, { color: tint.fg }]}>{initials(p.name)}</Text>,
        iconBg: tint.bg,
        label: id === myId ? `${p.name} (me)` : p.name,
        sub: `${api.roleName(p.role)} · ${countFor(id)} leads`,
        selected: who === id,
        onPress: () => setWho(id),
      };
    }),
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
      {manager && (
        <View style={styles.personRow}>
          <Pressable
            onPress={() => setPickWho(true)}
            accessibilityRole="button"
            accessibilityLabel={`Whose leads: ${whoLabel}`}
            style={({ pressed }) => [styles.person, who !== 'all' && styles.personOn, pressed && { opacity: 0.85 }]}
          >
            <PersonIcon size={16} color={who !== 'all' ? theme.primary : theme.textSecondary} />
            <Text style={[styles.personText, who !== 'all' && styles.personTextOn]} numberOfLines={1}>
              {whoLabel}
            </Text>
            <ChevronDownIcon size={16} color={who !== 'all' ? theme.primary : theme.textMuted} />
          </Pressable>
        </View>
      )}
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
            <CrmEmptyState title="No leads here" subtitle={query ? 'Nothing matches your search.' : 'There are no leads at this stage.'} />
          )
        }
        renderItem={({ item }) => <LeadRow lead={item} onPress={() => navigation.navigate('LeadDetail', { leadId: item.id })} />}
      />
      {manager && <ActionSheet visible={pickWho} onClose={() => setPickWho(false)} title="Whose leads" actions={whoActions} />}
    </LeadScreen>
  );
}
