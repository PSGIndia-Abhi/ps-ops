import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { radii, spacing, touchTarget, typography } from '../../theme';
import { formatINR } from '../format';
import { useLeads } from '../LeadsContext';
import type {
  CrmTabParamList,
  CrmTabScreenNav,
  LeadFilter,
} from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import { normalizePhone } from '../validation';
import { CrmBackgroundWash } from '../ui/CrmBackgroundWash';
import { CloseIcon } from '../../components/icons';
import { ClipboardListIcon, SearchIcon } from '../ui/crmIcons';
import {
  CrmEmptyState,
  CrmErrorBanner,
  CrmScreen,
  CrmSkeleton,
  NoticeBanner,
} from '../ui/CrmScreen';
import { LeadCard } from '../ui/LeadCard';
import { PrimaryButton } from '../ui/PrimaryButton';
import type { Lead } from '../types';

const factory = (t: CrmTheme) => ({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
  },
  title: { ...typography.display, color: t.textPrimary },
  subtitle: { ...typography.caption, color: t.textMuted },
  summary: {
    backgroundColor: t.primary,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden' as const,
    ...t.raisedShadow,
  },
  blobA: {
    position: 'absolute' as const,
    right: -30,
    top: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  blobB: {
    position: 'absolute' as const,
    right: 60,
    bottom: -50,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  summaryRow: { flexDirection: 'row' as const },
  summaryCell: { flex: 1 },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: spacing.sm,
  },
  summaryLabel: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  summaryValue: { ...typography.title, color: '#FFFFFF', marginTop: 2 },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget.minHeight,
    backgroundColor: t.surface,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: t.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...t.cardShadow,
  },
  searchFocused: { borderColor: t.primary },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: t.textPrimary,
    paddingVertical: spacing.sm,
  },
  clear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chips: {
    flexDirection: 'row' as const,
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: 6,
    paddingLeft: spacing.sm,
    paddingRight: 6,
  },
  chipActive: { backgroundColor: t.primary, borderColor: t.primary },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipDotPaid: { backgroundColor: t.success },
  chipDotPending: { backgroundColor: t.warning },
  chipDotAll: { backgroundColor: t.primary },
  chipText: { ...typography.captionMedium, color: t.textSecondary },
  chipTextActive: { color: t.textOnPrimary },
  chipCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipCountText: { ...typography.captionMedium, color: t.textSecondary },
  skeletonCard: { borderRadius: radii.lg, marginBottom: spacing.sm },
});

const FILTERS: { value: LeadFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
];

function matchesFilter(lead: Lead, filter: LeadFilter): boolean {
  if (filter === 'all') return true;
  return lead.paymentStatus === filter;
}

function matchesQuery(lead: Lead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = normalizePhone(q);
  return (
    lead.customerName.toLowerCase().includes(q) ||
    (digits.length > 0 && lead.phone.includes(digits))
  );
}

export function CrmLeadsScreen() {
  const navigation = useNavigation<CrmTabScreenNav<'Leads'>>();
  const route = useRoute<RouteProp<CrmTabParamList, 'Leads'>>();
  const {
    leads,
    stats,
    loading,
    refreshing,
    refresh,
    error,
    notice,
    noticeTone,
    dismissNotice,
  } = useLeads();
  const { styles, theme } = useCrmStyles(factory);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filter, setFilter] = useState<LeadFilter>(
    route.params?.filter ?? 'all',
  );
  const paramFilter = route.params?.filter;
  const paramAt = route.params?.at;

  // Home's "Paid" tile / "View all" open this tab (which stays mounted), so re-apply the requested filter each time.
  useEffect(() => {
    if (paramFilter) setFilter(paramFilter);
  }, [paramFilter, paramAt]);

  const counts = useMemo(
    () => ({
      all: leads.length,
      paid: leads.filter(l => l.paymentStatus === 'paid').length,
      pending: leads.filter(l => l.paymentStatus === 'pending').length,
    }),
    [leads],
  );

  const visible = useMemo(
    () => leads.filter(l => matchesFilter(l, filter) && matchesQuery(l, query)),
    [leads, filter, query],
  );

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Leads</Text>
        <Text style={styles.subtitle}>
          {counts.all === 1 ? '1 lead' : `${counts.all} leads`}
        </Text>
      </View>
      <NoticeBanner
        message={notice}
        tone={noticeTone}
        onDismiss={dismissNotice}
      />
      <CrmErrorBanner message={error} onRetry={refresh} />

      <View style={styles.summary}>
        <View style={styles.blobA} />
        <View style={styles.blobB} />
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Total Leads</Text>
            <Text style={styles.summaryValue}>{counts.all}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Collected</Text>
            <Text style={styles.summaryValue}>
              {formatINR(stats.paidTotal)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>To Collect</Text>
            <Text style={styles.summaryValue}>
              {formatINR(stats.pendingTotal)}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.search, searchFocused && styles.searchFocused]}>
        <SearchIcon size={20} color={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or phone"
          placeholderTextColor={theme.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          accessibilityLabel="Search leads by customer name or phone number"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clear}
          >
            <CloseIcon size={14} color={theme.textMuted} />
          </Pressable>
        )}
      </View>
      <View style={styles.chips}>
        {FILTERS.map(f => {
          const active = f.value === filter;
          const dotStyle =
            f.value === 'paid'
              ? styles.chipDotPaid
              : f.value === 'pending'
              ? styles.chipDotPending
              : styles.chipDotAll;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              {!active && <View style={[styles.chipDot, dotStyle]} />}
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {f.label}
              </Text>
              <View
                style={[styles.chipCount, active && styles.chipCountActive]}
              >
                <Text
                  style={[
                    styles.chipCountText,
                    active && styles.chipTextActive,
                  ]}
                >
                  {counts[f.value]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const emptyForSearch = query.trim().length > 0 || filter !== 'all';

  return (
    <View style={styles.flex}>
      <CrmBackgroundWash />
      <CrmScreen scroll={false} transparent>
        <FlatList
          data={loading ? [] : visible}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          renderItem={({ item, index }) => (
            <LeadCard
              lead={item}
              index={index}
              onPress={() =>
                navigation.navigate('CrmLeadDetail', { leadId: item.id })
              }
            />
          )}
          ListEmptyComponent={
            loading ? (
              <View>
                <CrmSkeleton
                  height={190}
                  radius={radii.lg}
                  style={styles.skeletonCard}
                />
                <CrmSkeleton
                  height={190}
                  radius={radii.lg}
                  style={styles.skeletonCard}
                />
                <CrmSkeleton
                  height={190}
                  radius={radii.lg}
                  style={styles.skeletonCard}
                />
              </View>
            ) : emptyForSearch ? (
              <CrmEmptyState
                title="No matching leads"
                subtitle="Try a different name or phone number, or switch the filter."
                icon={<SearchIcon size={30} color={theme.textMuted} />}
              />
            ) : (
              <CrmEmptyState
                title="No leads yet"
                subtitle="Add your first lead to get started."
                icon={<ClipboardListIcon size={30} color={theme.textMuted} />}
                action={
                  <PrimaryButton
                    label="New Lead"
                    onPress={() => navigation.navigate('CrmNewLead')}
                  />
                }
              />
            )
          }
        />
      </CrmScreen>
    </View>
  );
}
