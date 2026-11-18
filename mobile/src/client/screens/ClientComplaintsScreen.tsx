import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { AlertTriangleIcon, CheckCircleIcon, CloseIcon, InboxIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { spacing, typography } from '../../theme';
import { listComplaints, type ClientComplaint, type ComplaintListResponse, type ComplaintStatusFilter } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { formatDate, relativeDay, statusInfo } from '../format';
import type { ClientStackParamList } from '../navigation';
import { OutletPicker } from '../ui/OutletPicker';
import { ChipRow, ClientPage, SOFT, TONES } from '../ui/page';

const CHIPS: { key: ComplaintStatusFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  cta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: TONES.amber.bg,
  },
  ctaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  ctaTitle: { ...typography.bodyMedium, fontSize: 16, color: '#92400E' },
  ctaSub: { ...typography.caption, color: '#B45309', marginTop: 1 },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 24,
    backgroundColor: SOFT(t),
  },
  searchInput: { flex: 1, ...typography.body, color: t.textPrimary, paddingVertical: 0 },
  filters: { flexDirection: 'row' as const, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  list: { paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: 1, backgroundColor: t.border, marginLeft: spacing.lg + 44 + spacing.md },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { ...typography.bodyMedium, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  reply: { alignSelf: 'flex-start' as const, marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: TONES.blue.bg },
  replyText: { ...typography.caption, fontSize: 11.5, fontWeight: '700' as const, color: TONES.blue.fg },
  right: { alignItems: 'flex-end' as const, gap: 4 },
  status: { ...typography.captionMedium, fontSize: 12.5 },
  when: { ...typography.caption, fontSize: 12, color: t.textMuted },
  empty: { alignItems: 'center' as const, paddingTop: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: SOFT(t), alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary },
  emptySub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' as const },
  footerText: { ...typography.caption, color: t.textMuted },
  skeletonRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  error: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
});

export function ClientComplaintsScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, outletId, setOutletId, outletName } = useClientPortal();

  const [status, setStatus] = useState<ComplaintStatusFilter>('open');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ClientComplaint[]>([]);
  const [meta, setMeta] = useState<{ total: number; counts: Partial<ComplaintListResponse['counts']> }>({ total: 0, counts: {} });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterKey = `${status}|${search}|${outletId}|${reloadKey}`;
  const lastKey = useRef(filterKey);
  if (lastKey.current !== filterKey) {
    lastKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listComplaints({ page, siteId: outletId || undefined, status, search })
      .then((body) => {
        if (!alive) return;
        setItems((prev) => (page === 1 ? body.complaints : [...prev, ...body.complaints]));
        setMeta({ total: body.total, counts: body.counts });
        setError(null);
      })
      .catch((err: Error) => alive && setError(err.message || 'Could not load complaints'))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [filterKey, page, status, search, outletId]);

  // Back from a complaint (a reply, closed, a new one): show the latest.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      setReloadKey((n) => n + 1);
    }, []),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((n) => n + 1);
  }, []);

  const firstLoad = loading && page === 1 && items.length === 0;
  const canLoadMore = !loading && items.length < meta.total;

  const header = (
    <View>
      <Pressable onPress={() => navigation.navigate('ClientNewComplaint', {})} style={({ pressed }) => [styles.cta, pressed && styles.pressed]} accessibilityRole="button">
        <View style={styles.ctaIcon}>
          <PlusIcon size={22} color={TONES.amber.fg} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.ctaTitle}>Raise a complaint</Text>
          <Text style={styles.ctaSub}>Tell us what went wrong - add photos if you can</Text>
        </View>
      </Pressable>
      <View style={styles.search}>
        <InboxIcon size={18} color={theme.textMuted} />
        <TextInput value={searchInput} onChangeText={setSearchInput} placeholder="Search complaints" placeholderTextColor={theme.textMuted} style={styles.searchInput} returnKeyType="search" />
        {!!searchInput && (
          <Pressable onPress={() => setSearchInput('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <CloseIcon size={16} color={theme.textMuted} />
          </Pressable>
        )}
      </View>
      {outlets.length > 1 && (
        <View style={styles.filters}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </View>
      )}
      <ChipRow options={CHIPS.map((c) => ({ key: c.key, label: c.label, count: meta.counts[c.key] }))} value={status} onChange={setStatus} style={{ marginTop: spacing.sm }} />
      {!!error && (
        <View style={styles.error}>
          <CrmErrorBanner message={error} onRetry={() => setReloadKey((n) => n + 1)} />
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: c }: { item: ClientComplaint }) => {
    const st = statusInfo(c.status);
    const open = c.status === 'OPEN' || c.status === 'IN_PROGRESS';
    const tone = open ? TONES.amber : TONES.green;
    return (
      <Pressable onPress={() => navigation.navigate('ClientComplaintDetail', { complaintId: c.id })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
        <View style={[styles.circle, { backgroundColor: tone.bg }]}>
          {open ? <AlertTriangleIcon size={19} color={tone.fg} /> : <CheckCircleIcon size={19} color={tone.fg} />}
        </View>
        <View style={styles.flex1}>
          <Text style={styles.title} numberOfLines={1}>
            {c.subject}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[c.site_name, c.job_code ? `#${c.job_code}` : null, formatDate(c.created_at, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
          </Text>
          {open && c.awaiting_you && (
            <View style={styles.reply}>
              <Text style={styles.replyText}>New reply from BestServe</Text>
            </View>
          )}
        </View>
        <View style={styles.right}>
          <Text style={[styles.status, { color: tone.fg }]}>{c.status === 'IN_PROGRESS' ? 'In progress' : st.label}</Text>
          <Text style={styles.when}>{relativeDay(c.last_message_at || c.updated_at || c.created_at)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ClientPage title="Complaints" subtitle={outletId ? outletName(outletId) : outlets.length > 1 ? 'All outlets' : outlets[0]?.name || undefined}>
      <FlatList
        data={firstLoad ? [] : items}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => canLoadMore && setPage((p) => p + 1)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListEmptyComponent={
          firstLoad ? (
            <View>
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <CrmSkeleton width={44} height={44} radius={22} />
                  <View style={styles.flex1}>
                    <CrmSkeleton height={14} width="70%" />
                    <CrmSkeleton height={12} width="45%" style={{ marginTop: 8 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : error ? undefined : (
            <View style={styles.empty}>
              <View style={styles.emptyCircle}>
                <CheckCircleIcon size={30} color={TONES.green.fg} />
              </View>
              <Text style={styles.emptyTitle}>{status === 'open' ? 'No open complaints' : 'Nothing here'}</Text>
              <Text style={styles.emptySub}>{search ? 'Nothing matches your search.' : status === 'open' ? 'Everything looks good. If something is wrong, raise a complaint above.' : 'Complaints you raise will be listed here.'}</Text>
            </View>
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            <View style={styles.footer}>
              {loading && page > 1 ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <Text style={styles.footerText}>
                  {items.length} of {meta.total}
                </Text>
              )}
            </View>
          ) : undefined
        }
      />
    </ClientPage>
  );
}
