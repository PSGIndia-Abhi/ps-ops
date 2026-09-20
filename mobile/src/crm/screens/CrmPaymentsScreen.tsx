import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CloseIcon, DocumentIcon } from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR } from '../format';
import { useLeads } from '../LeadsContext';
import type { CrmTabScreenNav } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import { PAYMENT_METHODS, type Lead, type PaymentMethod } from '../types';
import { normalizePhone } from '../validation';
import { CrmBackgroundWash } from '../ui/CrmBackgroundWash';
import { RupeeIcon, SearchIcon, WalletIcon } from '../ui/crmIcons';
import {
  CrmEmptyState,
  CrmErrorBanner,
  CrmScreen,
  CrmSkeleton,
} from '../ui/CrmScreen';
import { SegmentedControl } from '../ui/SegmentedControl';

type StatusFilter = 'all' | 'paid' | 'pending';
type MethodFilter = 'all' | PaymentMethod;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
];

const METHOD_OPTIONS: { value: MethodFilter; label: string }[] = [
  { value: 'all', label: 'Any method' },
  ...PAYMENT_METHODS,
];

const factory = (t: CrmTheme) => ({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  title: { ...typography.display, color: t.textPrimary },
  titleSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  hero: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  heroLabel: { ...typography.captionMedium, color: t.textMuted },
  heroValue: {
    ...typography.display,
    fontSize: 32,
    color: t.textPrimary,
    marginTop: 2,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.warningBg,
    overflow: 'hidden' as const,
    marginTop: spacing.sm,
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: t.success },
  heroFoot: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.xs,
  },
  heroFootText: { ...typography.caption, color: t.textSecondary },
  heroPaid: { ...typography.captionMedium, color: t.successText },
  heroDue: { ...typography.captionMedium, color: t.warningText },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 46,
    backgroundColor: t.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: t.textPrimary,
    paddingVertical: spacing.xs,
  },
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  methodRow: { gap: spacing.xs, paddingVertical: spacing.sm },
  method: {
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  methodActive: { backgroundColor: t.primarySoftBg, borderColor: t.primary },
  methodText: { ...typography.captionMedium, color: t.textSecondary },
  methodTextActive: { color: t.primary },
  section: {
    ...typography.overline,
    color: t.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  group: {
    backgroundColor: t.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  groupFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  groupLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowPressed: { backgroundColor: t.surfaceAlt },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconPaid: { backgroundColor: t.successBg },
  iconPending: { backgroundColor: t.warningBg },
  rowMain: { flex: 1 },
  rowName: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  rowRight: { alignItems: 'flex-end' as const },
  amountPaid: { ...typography.bodyMedium, color: t.successText },
  amountPending: { ...typography.bodyMedium, color: t.textPrimary },
  rowState: { ...typography.caption, marginTop: 1 },
  statePaid: { color: t.successText },
  statePending: { color: t.warningText },
  skeleton: { marginBottom: spacing.sm },
});

function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find(m => m.value === method)?.label ?? '';
}

function matchesQuery(lead: Lead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = normalizePhone(q);
  return (
    lead.customerName.toLowerCase().includes(q) ||
    lead.service.toLowerCase().includes(q) ||
    (digits.length > 0 && lead.phone.includes(digits))
  );
}

function PaymentIcon({
  method,
  color,
}: {
  method: PaymentMethod;
  color: string;
}) {
  if (method === 'online') return <WalletIcon size={20} color={color} />;
  if (method === 'cash') return <RupeeIcon size={20} color={color} />;
  return <DocumentIcon size={20} color={color} />;
}

export function CrmPaymentsScreen() {
  const navigation = useNavigation<CrmTabScreenNav<'Payments'>>();
  const { leads, stats, loading, refreshing, refresh, error } = useLeads();
  const { styles, theme } = useCrmStyles(factory);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [method, setMethod] = useState<MethodFilter>('all');

  const total = stats.paidTotal + stats.pendingTotal;
  const percent = total > 0 ? Math.round((stats.paidTotal / total) * 100) : 0;

  const sections = useMemo(() => {
    const visible = leads.filter(
      l =>
        (status === 'all' || l.paymentStatus === status) &&
        (method === 'all' || l.paymentMethod === method) &&
        matchesQuery(l, query),
    );
    const byDay = new Map<string, Lead[]>();
    for (const lead of visible) {
      const label = dayLabel(lead.createdAt);
      byDay.set(label, [...(byDay.get(label) ?? []), lead]);
    }
    return Array.from(byDay, ([title, data]) => ({ title, data }));
  }, [leads, status, method, query]);

  const filtering =
    query.trim().length > 0 || status !== 'all' || method !== 'all';

  const header = (
    <View>
      <Text style={styles.title}>Payments</Text>
      <Text style={styles.titleSub}>Money collected and still to collect</Text>
      <CrmErrorBanner message={error} onRetry={refresh} />

      {loading ? (
        <CrmSkeleton height={120} radius={radii.xl} style={styles.skeleton} />
      ) : (
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Collected so far</Text>
          <Text style={styles.heroValue}>{formatINR(stats.paidTotal)}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <View style={styles.heroFoot}>
            <Text style={styles.heroPaid}>{percent}% collected</Text>
            <Text style={styles.heroDue}>
              {formatINR(stats.pendingTotal)} to collect
            </Text>
          </View>
        </View>
      )}

      <View style={styles.search}>
        <SearchIcon size={18} color={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search customer, phone or service"
          placeholderTextColor={theme.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search payments"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clear}
          >
            <CloseIcon size={12} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <SegmentedControl
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.methodRow}
        keyboardShouldPersistTaps="handled"
      >
        {METHOD_OPTIONS.map(m => {
          const active = m.value === method;
          return (
            <Pressable
              key={m.value}
              onPress={() => setMethod(m.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.method, active && styles.methodActive]}
            >
              <Text
                style={[styles.methodText, active && styles.methodTextActive]}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.flex}>
      <CrmBackgroundWash />
      <CrmScreen scroll={false} transparent>
        <SectionList
          sections={loading ? [] : sections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.section}>{section.title.toUpperCase()}</Text>
          )}
          renderItem={({ item, index, section }) => {
            const paid = item.paymentStatus === 'paid';
            const first = index === 0;
            const last = index === section.data.length - 1;
            return (
              <View
                style={[
                  styles.group,
                  first && styles.groupFirst,
                  last && styles.groupLast,
                ]}
              >
                <Pressable
                  onPress={() =>
                    navigation.navigate('CrmLeadDetail', { leadId: item.id })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${item.customerName}, ${formatINR(
                    item.amount,
                  )}, ${paid ? 'paid' : 'pending'}`}
                  style={({ pressed }) => [
                    styles.row,
                    !first && styles.rowDivider,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      paid ? styles.iconPaid : styles.iconPending,
                    ]}
                  >
                    <PaymentIcon
                      method={item.paymentMethod}
                      color={paid ? theme.successText : theme.warningText}
                    />
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.customerName}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {methodLabel(item.paymentMethod)} ·{' '}
                      {timeLabel(item.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text
                      style={paid ? styles.amountPaid : styles.amountPending}
                    >
                      {paid ? '+' : ''}
                      {formatINR(item.amount)}
                    </Text>
                    <Text
                      style={[
                        styles.rowState,
                        paid ? styles.statePaid : styles.statePending,
                      ]}
                    >
                      {paid ? 'Received' : 'Due'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <View>
                <CrmSkeleton
                  height={64}
                  radius={radii.lg}
                  style={styles.skeleton}
                />
                <CrmSkeleton
                  height={64}
                  radius={radii.lg}
                  style={styles.skeleton}
                />
                <CrmSkeleton
                  height={64}
                  radius={radii.lg}
                  style={styles.skeleton}
                />
              </View>
            ) : filtering ? (
              <CrmEmptyState
                title="No matching payments"
                subtitle="Try a different search or clear the filters."
                icon={<SearchIcon size={30} color={theme.textMuted} />}
              />
            ) : (
              <CrmEmptyState
                title="No payments yet"
                subtitle="Payments show up here once you add leads."
                icon={<WalletIcon size={30} color={theme.textMuted} />}
              />
            )
          }
        />
      </CrmScreen>
    </View>
  );
}
