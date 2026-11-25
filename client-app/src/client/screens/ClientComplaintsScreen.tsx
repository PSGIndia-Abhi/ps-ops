import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { CheckCircleIcon, CloseIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { listComplaints, type ClientComplaint, type ComplaintListResponse, type ComplaintStatusFilter } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { formatDate, relativeDay } from '../format';
import type { ClientStackParamList } from '../navigation';
import { OutletPicker } from '../ui/OutletPicker';
import { ClientPage } from '../ui/page';

const TABS: { key: ComplaintStatusFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const PRIORITY: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Low', color: '#5F6368' },
  MEDIUM: { label: 'Normal', color: '#0B57D0' },
  HIGH: { label: 'High', color: '#B06000' },
  URGENT: { label: 'Urgent', color: '#B3261E' },
};

const palette = (t: CrmTheme) => ({
  page: t.isDark ? t.background : '#FFFFFF',
  ink: t.isDark ? '#E6E7EA' : '#1B1C1F',
  sub: t.isDark ? '#A3A7AE' : '#5E6470',
  faint: t.isDark ? '#6E737C' : '#9AA1AD',
  blue: t.isDark ? '#A8C7FA' : '#0B57D0',
  blueSoft: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD',
  tint: t.isDark ? t.surfaceAlt : '#F2F5FB',
  white: t.isDark ? t.surface : '#FFFFFF',
  amber: t.isDark ? '#FDD663' : '#B06000',
  amberSoft: t.isDark ? 'rgba(253,214,99,0.14)' : '#FEF3E0',
  green: t.isDark ? '#81C995' : '#188038',
  greenSoft: t.isDark ? 'rgba(129,201,149,0.14)' : '#E6F4EA',
});

const factory = (t: CrmTheme) => {
  const c = palette(t);
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.65 },
    head: { paddingHorizontal: 16 },
    stats: { flexDirection: 'row' as const, gap: 10, marginTop: 4 },
    stat: { flex: 1, borderRadius: 20, padding: 14, borderWidth: 1.5, borderColor: 'transparent' },
    statOn: { borderColor: c.blue },
    statTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    statValue: { fontSize: 26, fontWeight: '600' as const, color: c.ink },
    statLabel: { fontSize: 13.5, color: c.sub, marginTop: 2 },
    statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.white },
    search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 50, paddingHorizontal: 16, borderRadius: 25, backgroundColor: c.tint, marginTop: 6 },
    searchInput: { flex: 1, fontSize: 15, color: c.ink, paddingVertical: 0 },
    outlet: { marginTop: 12 },
    tabs: { flexDirection: 'row' as const, padding: 4, borderRadius: 999, backgroundColor: c.tint, marginTop: 14, marginBottom: 6 },
    tab: { flex: 1, minHeight: 38, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 6 },
    tabOn: { backgroundColor: c.white, ...t.cardShadow },
    tabText: { fontSize: 14, fontWeight: '500' as const, color: c.sub },
    tabTextOn: { color: c.ink, fontWeight: '700' as const },
    tabCount: { fontSize: 12.5, color: c.faint },
    tabCountOn: { color: c.blue, fontWeight: '700' as const },
    error: { marginTop: 10 },
    list: { paddingBottom: 120 },
    card: { marginHorizontal: 16, marginTop: 10, backgroundColor: c.tint, borderRadius: 22, padding: 14 },
    cardTop: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12 },
    cardIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center' as const, justifyContent: 'center' as const },
    title: { fontSize: 15.5, fontWeight: '600' as const, color: c.ink, lineHeight: 21 },
    meta: { fontSize: 13, color: c.sub, marginTop: 3 },
    when: { fontSize: 12.5, color: c.faint, marginTop: 2 },
    tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 12, marginLeft: 54 },
    tag: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.white },
    tagDot: { width: 7, height: 7, borderRadius: 4 },
    tagText: { fontSize: 12.5, fontWeight: '600' as const },
    reply: { backgroundColor: c.blue },
    replyText: { color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
    empty: { alignItems: 'center' as const, paddingTop: 48, paddingHorizontal: 28 },
    emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: c.greenSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
    emptyTitle: { fontSize: 18, fontWeight: '600' as const, color: c.ink, marginTop: 16 },
    emptySub: { fontSize: 14.5, color: c.sub, textAlign: 'center' as const, marginTop: 6, lineHeight: 21 },
    footer: { paddingVertical: 18, alignItems: 'center' as const },
    footerText: { fontSize: 12.5, color: c.faint },
    skeleton: { marginHorizontal: 16, marginTop: 10 },
    fab: {
      position: 'absolute' as const,
      right: 18,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingLeft: 18,
      paddingRight: 22,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.blue,
      shadowColor: '#0B3A8C',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 14,
      elevation: 10,
    },
    fabText: { fontSize: 15.5, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
  };
};

/** The complaint mark: a speech bubble with "!" (open), "..." (in progress) or a tick (resolved). */
function ComplaintIcon({ state, color }: { state: 'open' | 'progress' | 'done'; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M6 4h12a3 3 0 0 1 3 3v7.5a3 3 0 0 1-3 3h-5.2l-4.3 3.2c-.4.3-1 0-1-.5v-2.7H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" {...s} />
      {state === 'open' && (
        <>
          <Path d="M12 7.7v3.8" {...s} strokeWidth={2.2} />
          <Circle cx="12" cy="14.2" r="1.15" fill={color} />
        </>
      )}
      {state === 'progress' && (
        <>
          <Circle cx="8.3" cy="10.8" r="1.25" fill={color} />
          <Circle cx="12" cy="10.8" r="1.25" fill={color} />
          <Circle cx="15.7" cy="10.8" r="1.25" fill={color} />
        </>
      )}
      {state === 'done' && <Path d="M8.3 10.9l2.5 2.4 4.9-5" {...s} strokeWidth={2.2} />}
    </Svg>
  );
}

function SearchGlass({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="6.5" fill="none" stroke={color} strokeWidth={2} />
      <Path d="M16 16l4.5 4.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Complaints (web: PortalComplaints) - summary, search, Open / Resolved / All, and a raise button. */
export function ClientComplaintsScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
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
  const raise = () => navigation.navigate('ClientNewComplaint', {});

  const header = (
    <View style={styles.head}>
      <View style={styles.search}>
        <SearchGlass color={c.sub} />
        <TextInput value={searchInput} onChangeText={setSearchInput} placeholder="Search complaints" placeholderTextColor={c.faint} style={styles.searchInput} returnKeyType="search" />
        {!!searchInput && (
          <Pressable onPress={() => setSearchInput('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <CloseIcon size={16} color={c.sub} />
          </Pressable>
        )}
      </View>

      {outlets.length > 1 && (
        <View style={styles.outlet}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </View>
      )}

      <View style={styles.tabs}>
        {TABS.map((tb) => {
          const on = status === tb.key;
          const count = meta.counts[tb.key];
          return (
            <Pressable key={tb.key} onPress={() => setStatus(tb.key)} style={[styles.tab, on && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{tb.label}</Text>
              {count != null && <Text style={[styles.tabCount, on && styles.tabCountOn]}>{count}</Text>}
            </Pressable>
          );
        })}
      </View>

      {!!error && (
        <View style={styles.error}>
          <CrmErrorBanner message={error} onRetry={() => setReloadKey((n) => n + 1)} />
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: cp }: { item: ClientComplaint }) => {
    const open = cp.status === 'OPEN' || cp.status === 'IN_PROGRESS';
    const statusLabel = cp.status === 'IN_PROGRESS' ? 'In progress' : open ? 'Open' : cp.status === 'CLOSED' ? 'Closed' : 'Resolved';
    const progress = cp.status === 'IN_PROGRESS';
    const stColor = progress ? c.blue : open ? c.amber : c.green;
    const pr = cp.priority ? PRIORITY[cp.priority] : null;
    return (
      <Pressable onPress={() => navigation.navigate('ClientComplaintDetail', { complaintId: cp.id })} style={({ pressed }) => [styles.card, pressed && styles.pressed]} accessibilityRole="button">
        <View style={styles.cardTop}>
          <View style={[styles.cardIcon, { backgroundColor: progress ? c.blueSoft : open ? c.amberSoft : c.greenSoft }]}>
            <ComplaintIcon state={progress ? 'progress' : open ? 'open' : 'done'} color={progress ? c.blue : open ? c.amber : c.green} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.title} numberOfLines={2}>
              {cp.subject}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[cp.site_name, cp.job_code ? `Job #${cp.job_code}` : null, formatDate(cp.created_at, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={styles.when}>{relativeDay(cp.last_message_at || cp.updated_at || cp.created_at)}</Text>
        </View>
        <View style={styles.tags}>
          <View style={styles.tag}>
            <View style={[styles.tagDot, { backgroundColor: stColor }]} />
            <Text style={[styles.tagText, { color: stColor }]}>{statusLabel}</Text>
          </View>
          {!!pr && open && (
            <View style={styles.tag}>
              <Text style={[styles.tagText, { color: theme.isDark ? c.sub : pr.color }]}>{pr.label}</Text>
            </View>
          )}
          {open && cp.awaiting_you && (
            <View style={[styles.tag, styles.reply]}>
              <Text style={[styles.tagText, styles.replyText]}>New reply</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <ClientPage back title="Complaints" subtitle={outletId ? outletName(outletId) : outlets.length > 1 ? 'All outlets' : outlets[0]?.name || undefined}>
      <FlatList
        data={firstLoad ? [] : items}
        keyExtractor={(cp) => cp.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <RefreshBanner refreshing={refreshing} />
            {header}
          </>
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => canLoadMore && setPage((p) => p + 1)}
        refreshControl={brandRefreshControl(refreshing, onRefresh)}
        ListEmptyComponent={
          firstLoad ? (
            <View>
              {Array.from({ length: 4 }).map((_, i) => (
                <CrmSkeleton key={i} height={104} radius={22} style={styles.skeleton} />
              ))}
            </View>
          ) : error ? undefined : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <CheckCircleIcon size={36} color={c.green} />
              </View>
              <Text style={styles.emptyTitle}>{search ? 'No matches' : status === 'open' ? 'All clear' : 'Nothing here yet'}</Text>
              <Text style={styles.emptySub}>
                {search ? 'Nothing matches your search.' : status === 'open' ? 'No open complaints. If something is not right, let us know.' : 'Complaints you raise will be listed here.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            <View style={styles.footer}>
              {loading && page > 1 ? (
                <ActivityIndicator color={c.blue} />
              ) : (
                <Text style={styles.footerText}>
                  {items.length} of {meta.total}
                </Text>
              )}
            </View>
          ) : undefined
        }
      />

      <Pressable onPress={raise} style={({ pressed }) => [styles.fab, { bottom: Math.max(insets.bottom, 12) + 14 }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Raise a complaint">
        <PlusIcon size={22} color={theme.isDark ? '#0B1B3A' : '#FFFFFF'} />
        <Text style={styles.fabText}>Raise complaint</Text>
      </Pressable>
    </ClientPage>
  );
}
