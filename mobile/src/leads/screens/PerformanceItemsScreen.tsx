import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRightIcon } from '../../components/icons';
import { formatINR } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { toneColors, type Tone } from '../../crm/ui/StatusBadge';
import { MONTHS_LONG } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { STAGE_META } from '../stage';
import type { PipelineStage } from '../types';
import { StageBadge, useLoad, LeadScreen, LeadTopBar } from '../ui';

const factory = (t: CrmTheme) => ({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  period: { ...typography.caption, color: t.textMuted, marginBottom: spacing.md },
  card: {
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
  accent: { width: 4 },
  body: { flex: 1, paddingVertical: spacing.md, paddingLeft: spacing.md, paddingRight: spacing.sm },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  company: { ...typography.bodyMedium, fontSize: 16, color: t.textPrimary, flex: 1 },
  amount: { ...typography.bodyMedium, color: t.textPrimary },
  detail: { ...typography.body, color: t.textSecondary, marginTop: 2 },
  bottom: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.sm },
  when: { ...typography.caption, color: t.textMuted, flex: 1 },
  chevron: { justifyContent: 'center' as const, paddingRight: spacing.sm },
  chevronDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Search and stage chips, fixed above the list.
  tools: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  chips: { gap: spacing.xs, paddingBottom: spacing.sm },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  chipOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  chipText: { ...typography.captionMedium, color: t.textSecondary },
  chipTextOn: { color: t.primary },
  chipCount: { ...typography.caption, color: t.textMuted },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

/** "17 Oct, 11:00 AM" - or just "17 Oct" for a day (a follow-up's due date). */
function whenText(iso: string, dayOnly: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = `${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  if (dayOnly) return day;
  const h = d.getHours();
  return `${day}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * The records behind one number of a performance report (Performance -> tap a tile): the leads,
 * meetings, quotations or follow-ups that make up the count, newest first. A row opens the lead.
 */
export function PerformanceItemsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { metric, label, from, to, employeeId, name, periodLabel } = useRoute<RouteProp<LeadStackParamList, 'LeadPerformanceItems'>>().params;
  const { styles, theme } = useCrmStyles(factory);

  const loader = useCallback(() => api.performanceItems(metric, from, to, employeeId), [metric, from, to, employeeId]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the list.');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<PipelineStage | null>(null);

  // The stages present in this list, most common first, for the chips.
  const stages = useMemo(() => {
    const counts = new Map<PipelineStage, number>();
    (data ?? []).forEach((i) => i.stage && counts.set(i.stage, (counts.get(i.stage) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter((i) => !stage || i.stage === stage)
      .filter(
        (i) =>
          !q ||
          [i.company, i.contact, i.leadNumber ?? '', i.detail].some((v) => v.toLowerCase().includes(q)),
      );
  }, [data, query, stage]);
  const narrowed = !!query.trim() || !!stage;

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <LeadTopBar title={label} subtitle={name} onBack={() => navigation.goBack()} />
      <View style={styles.tools}>
        <CrmTextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search company, contact, lead no..."
          icon={<SearchIcon size={18} color={theme.textMuted} />}
          autoCorrect={false}
          returnKeyType="search"
        />
        {stages.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            <Pressable onPress={() => setStage(null)} accessibilityRole="button" accessibilityState={{ selected: !stage }} style={[styles.chip, !stage && styles.chipOn]}>
              <Text style={[styles.chipText, !stage && styles.chipTextOn]}>All</Text>
              <Text style={styles.chipCount}>{data?.length ?? 0}</Text>
            </Pressable>
            {stages.map(([key, count]) => {
              const on = stage === key;
              const meta = STAGE_META[key];
              return (
                <Pressable
                  key={key}
                  onPress={() => setStage(on ? null : key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <View style={[styles.dot, { backgroundColor: toneColors(theme, meta?.tone ?? 'neutral').fg }]} />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{meta?.label ?? key}</Text>
                  <Text style={styles.chipCount}>{count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
      <FlatList
        data={shown}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item, i) => `${item.leadId}-${item.at}-${i}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListHeaderComponent={
          <>
            <Text style={styles.period}>
              {periodLabel}
              {data
                ? narrowed
                  ? `  ·  ${shown.length} of ${data.length}`
                  : `  ·  ${data.length} ${data.length === 1 ? 'record' : 'records'}`
                : ''}
            </Text>
            <CrmErrorBanner message={error} onRetry={reload} />
          </>
        }
        ListEmptyComponent={
          loading && !data ? (
            <CrmSkeleton height={260} radius={radii.lg} />
          ) : !error ? (
            <CrmEmptyState
              title={narrowed ? 'No matches' : 'Nothing here'}
              subtitle={narrowed ? 'Try another search or stage.' : 'No records for this period.'}
            />
          ) : undefined
        }
        renderItem={({ item }) => {
          const tone: Tone = item.stage ? STAGE_META[item.stage]?.tone ?? 'neutral' : 'neutral';
          // A follow-up is a planned day; everything else happened at a moment.
          const when = whenText(item.at, metric === 'followUpsDue');
          const line = [item.detail, when].filter(Boolean).join('  ·  ');
          return (
            <Pressable
              onPress={() => navigation.navigate('LeadDetail', { leadId: item.leadId })}
              accessibilityRole="button"
              accessibilityLabel={`${item.company}${item.detail ? `, ${item.detail}` : ''}`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.accent, { backgroundColor: toneColors(theme, tone).fg }]} />
              <View style={styles.body}>
                <View style={styles.top}>
                  <Text style={styles.company} numberOfLines={1}>
                    {item.company || item.contact || 'Lead'}
                  </Text>
                  {item.amount !== null && <Text style={styles.amount}>{formatINR(item.amount)}</Text>}
                </View>
                {!!line && (
                  <Text style={styles.detail} numberOfLines={2}>
                    {line}
                  </Text>
                )}
                <View style={styles.bottom}>
                  <Text style={styles.when} numberOfLines={1}>
                    {item.leadNumber ?? ''}
                  </Text>
                  {!!item.stage && <StageBadge stage={item.stage} />}
                </View>
              </View>
              <View style={styles.chevron}>
                <View style={styles.chevronDot}>
                  <ChevronRightIcon size={15} color={theme.primary} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </LeadScreen>
  );
}
