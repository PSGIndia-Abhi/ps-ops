import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { CloseIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import {
  listComplaints,
  type ClientComplaint,
  type ComplaintCategory,
  type ComplaintListResponse,
  type ComplaintPriority,
  type ComplaintStage,
  type ComplaintStatusFilter,
} from '../api';
import { CATEGORY_LABEL, PRIORITY_LABEL, STAGE_TONE, stageLabel, stageOf } from '../complaints';
import { Popup } from '../ui/Popup';
import { useClientPortal } from '../ClientPortalContext';
import { useAuth } from '../../auth/AuthContext';
import { getSeenMap, isUnread } from '../seen';
import { relativeDay } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ComplaintArt } from '../ui/IllustratedIcons';
import { OutletPicker } from '../ui/OutletPicker';
import { ClientPage } from '../ui/page';

const BLUE = '#0B57D0';

// Status tabs: count per stage; tap to filter.
const STATUS_TABS: { key: 'all' | ComplaintStage; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'VISIT_SCHEDULED', label: 'Visit scheduled' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CLOSED', label: 'Closed' },
];
const PRIORITIES: (ComplaintPriority | '')[] = ['', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const CATEGORIES: (ComplaintCategory | '')[] = ['', 'SERVICE', 'ACCOUNTS'];

const factory = (t: CrmTheme) => {
  const ink = t.isDark ? '#E6E7EA' : '#1B1C1F';
  const sub = t.isDark ? '#A3A7AE' : '#5E6470';
  const faint = t.isDark ? '#6E737C' : '#9AA1AD';
  const blue = t.isDark ? '#A8C7FA' : BLUE;
  const line = t.isDark ? 'rgba(255,255,255,0.10)' : '#E6EBF3';
  const border = t.isDark ? 'rgba(168,199,250,0.35)' : '#A9C4F5';
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.65 },
    head: { paddingHorizontal: 16 },
    // search + filter (same look as Documents)
    top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginTop: 4 },
    search: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, height: 50, paddingHorizontal: 16, borderRadius: 25, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1.5, borderColor: border },
    searchFocused: { borderColor: blue, shadowColor: BLUE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 },
    searchInput: { flex: 1, fontSize: 15, color: ink, paddingVertical: 0 },
    filterBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1.5, borderColor: border },
    filterBtnOn: { backgroundColor: blue, borderColor: blue },
    outlet: { marginTop: 10 },
    active: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 10 },
    activeChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingLeft: 12, paddingRight: 8, height: 32, borderRadius: 16, backgroundColor: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD' },
    activeText: { fontSize: 13, fontWeight: '600' as const, color: blue },
    // status tabs (underline)
    tabsWrap: { marginTop: 12, borderBottomWidth: 1, borderBottomColor: line },
    tabs: { paddingHorizontal: 12 },
    tab: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    tabText: { fontSize: 14.5, fontWeight: '500' as const, color: sub },
    tabTextOn: { color: ink, fontWeight: '700' as const },
    tabCount: { fontSize: 13, fontWeight: '600' as const, color: faint },
    tabCountOn: { color: blue },
    tabBar: { position: 'absolute' as const, left: 10, right: 10, bottom: -1, height: 3, borderRadius: 2, backgroundColor: blue },
    error: { marginTop: 10, paddingHorizontal: 16 },
    // chat-style rows
    list: { paddingBottom: 120 },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 18, backgroundColor: t.isDark ? t.background : '#FFFFFF' },
    rowPressed: { backgroundColor: t.isDark ? 'rgba(255,255,255,0.05)' : '#F4F6FA' },
    divider: { height: 1, backgroundColor: line, marginLeft: 16 + 58 + 14 },
    avatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 2,
      borderColor: t.isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF',
      overflow: 'hidden' as const,
      shadowColor: '#1A2B5C',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: t.isDark ? 0 : 0.12,
      shadowRadius: 6,
      elevation: 3,
      backgroundColor: t.isDark ? t.surface : '#FFFFFF',
    },
    avatarBg: { position: 'absolute' as const, left: 0, top: 0 },
    rowMain: { flex: 1, minWidth: 0 },
    title: { fontSize: 17, fontWeight: '700' as const, color: ink },
    titleUnread: { fontWeight: '800' as const },
    subRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
    subText: { flexShrink: 1, fontSize: 14.5, color: sub },
    subTextUnread: { color: ink },
    subStatus: { fontWeight: '600' as const },
    rowSide: { alignItems: 'flex-end' as const, gap: 6, minWidth: 56 },
    when: { fontSize: 13, color: faint },
    whenUnread: { color: blue, fontWeight: '700' as const },
    badges: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 20 },
    unread: { width: 12, height: 12, borderRadius: 6, backgroundColor: blue },
    unreadText: { fontSize: 11, fontWeight: '800' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
    urgent: { width: 20, height: 20, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5 },
    urgentText: { fontSize: 11, fontWeight: '900' as const },
    empty: { alignItems: 'center' as const, paddingTop: 40, paddingHorizontal: 28 },
    emptyArt: { width: 104, height: 104, borderRadius: 52, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB', alignItems: 'center' as const, justifyContent: 'center' as const },
    emptyTitle: { fontSize: 18, fontWeight: '700' as const, color: ink, marginTop: 16 },
    emptySub: { fontSize: 14.5, color: sub, textAlign: 'center' as const, marginTop: 6, lineHeight: 21 },
    more: { paddingVertical: 20, alignItems: 'center' as const },
    skeletonRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
    // filter popup
    fGroup: { fontSize: 13, fontWeight: '700' as const, color: sub, letterSpacing: 0.4, marginBottom: 8 },
    fPills: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginBottom: 18 },
    fPill: { paddingHorizontal: 14, minHeight: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB', borderWidth: 1.5, borderColor: 'transparent' },
    fPillOn: { backgroundColor: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD', borderColor: blue },
    fPillText: { fontSize: 14, fontWeight: '500' as const, color: ink },
    fPillTextOn: { color: blue, fontWeight: '700' as const },
    fActions: { flexDirection: 'row' as const, gap: 10 },
    fClear: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB' },
    fClearText: { fontSize: 15, fontWeight: '600' as const, color: ink },
    fDone: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: blue },
    fDoneText: { fontSize: 15, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
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
      backgroundColor: blue,
      shadowColor: '#0B3A8C',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 14,
      elevation: 10,
    },
    fabText: { fontSize: 15.5, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
  };
};

/** The complaint mark: a speech bubble with "!" (open), "..." (in progress), a calendar (visit) or a tick (resolved). */
function ComplaintIcon({ state, color }: { state: 'open' | 'progress' | 'visit' | 'done'; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
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
      {state === 'visit' && (
        <>
          <Path d="M8 8.5h8v6H8z" {...s} strokeWidth={1.7} />
          <Path d="M8 10.6h8M10 7.2v2M14 7.2v2" {...s} strokeWidth={1.7} />
        </>
      )}
    </Svg>
  );
}

function FilterGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="16" cy="7" r="2.2" fill="none" stroke={color} strokeWidth={2} />
      <Circle cx="10" cy="17" r="2.2" fill="none" stroke={color} strokeWidth={2} />
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

/** Complaints (web: PortalComplaints) - search, status tabs, type / priority filter, and a raise button. */
export function ClientComplaintsScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, outletId, setOutletId, outletName, isCompanyAdmin } = useClientPortal();
  const { user, session } = useAuth();
  const seenScope = String(user?.id ?? session?.userId ?? '');
  const [seen, setSeen] = useState<Record<string, number>>({});
  const blue = theme.isDark ? '#A8C7FA' : BLUE;

  const [status, setStatus] = useState<ComplaintStatusFilter>('all');
  const [priority, setPriority] = useState<ComplaintPriority | ''>('');
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
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

  const filterKey = `${status}|${priority}|${category}|${search}|${outletId}|${reloadKey}`;
  const lastKey = useRef(filterKey);
  if (lastKey.current !== filterKey) {
    lastKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listComplaints({ page, siteId: outletId || undefined, status, search, priority, category })
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
  }, [filterKey, page, status, search, outletId, priority, category]);

  // Back from a complaint (a reply, a new one): show the latest, and drop "new" from what was opened.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      getSeenMap(seenScope).then(setSeen);
      if (first.current) {
        first.current = false;
        return;
      }
      setReloadKey((n) => n + 1);
    }, [seenScope]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((n) => n + 1);
  }, []);

  const firstLoad = loading && page === 1 && items.length === 0;
  const canLoadMore = !loading && items.length < meta.total;
  const raise = () => navigation.navigate('ClientNewComplaint', {});
  const filtersOn = !!priority || !!category;

  const header = (
    <View>
      <View style={styles.head}>
        <View style={styles.top}>
          <View style={[styles.search, focused && styles.searchFocused]}>
            <SearchGlass color={focused ? blue : theme.textMuted} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search complaints"
              placeholderTextColor={theme.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {!!searchInput && (
              <Pressable onPress={() => setSearchInput('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <CloseIcon size={16} color={theme.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={({ pressed }) => [styles.filterBtn, filtersOn && styles.filterBtnOn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Filter by type and priority"
          >
            <FilterGlyph color={filtersOn ? (theme.isDark ? '#0B1B3A' : '#FFFFFF') : blue} />
          </Pressable>
        </View>

        {outlets.length > 1 && (
          <View style={styles.outlet}>
            <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
          </View>
        )}

        {filtersOn && (
          <View style={styles.active}>
            {!!category && (
              <Pressable onPress={() => setCategory('')} style={({ pressed }) => [styles.activeChip, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Remove ${CATEGORY_LABEL[category]} filter`}>
                <Text style={styles.activeText}>{CATEGORY_LABEL[category]}</Text>
                <CloseIcon size={14} color={blue} />
              </Pressable>
            )}
            {!!priority && (
              <Pressable onPress={() => setPriority('')} style={({ pressed }) => [styles.activeChip, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Remove ${PRIORITY_LABEL[priority]} filter`}>
                <Text style={styles.activeText}>{PRIORITY_LABEL[priority]} priority</Text>
                <CloseIcon size={14} color={blue} />
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Status tabs with counts */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {STATUS_TABS.map((tb) => {
            const on = status === tb.key;
            const n = meta.counts[tb.key] ?? 0;
            return (
              <Pressable key={tb.key} onPress={() => setStatus(tb.key)} style={({ pressed }) => [styles.tab, pressed && styles.pressed]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${tb.label}, ${n}`}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{tb.label}</Text>
                <Text style={[styles.tabCount, on && styles.tabCountOn]}>{n}</Text>
                {on && <View style={styles.tabBar} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {!!error && (
        <View style={styles.error}>
          <CrmErrorBanner message={error} onRetry={() => setReloadKey((n) => n + 1)} />
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: cp }: { item: ClientComplaint }) => {
    const stage = stageOf(cp.status);
    const tone = STAGE_TONE[stage];
    const open = stage === 'OPEN' || stage === 'IN_PROGRESS' || stage === 'VISIT_SCHEDULED';
    const icon = stage === 'IN_PROGRESS' ? 'progress' : stage === 'VISIT_SCHEDULED' ? 'visit' : open ? 'open' : 'done';
    // New = BestServe wrote last, and after this complaint was last opened on this phone.
    const newReply = cp.awaiting_you && stage !== 'CLOSED' && isUnread(seen, cp.id, cp.last_message_at || cp.updated_at);
    return (
      <Pressable
        onPress={() => navigation.navigate('ClientComplaintDetail', { complaintId: cp.id })}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${cp.subject}, ${stageLabel(stage)}${newReply ? ', new reply from BestServe' : ''}`}
      >
        <View style={styles.avatar}>
          <Svg width={54} height={54} style={styles.avatarBg}>
            <Defs>
              <LinearGradient id={`av-${cp.id}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={theme.isDark ? '#2A3352' : '#FFFFFF'} />
                <Stop offset="1" stopColor={theme.isDark ? '#1C2440' : tone.bg} />
              </LinearGradient>
            </Defs>
            <Circle cx="27" cy="27" r="27" fill={`url(#av-${cp.id})`} />
          </Svg>
          <ComplaintIcon state={icon} color={tone.fg} />
        </View>
        <View style={styles.rowMain}>
          <Text style={[styles.title, newReply && styles.titleUnread]} numberOfLines={1}>
            {cp.subject}
          </Text>
          <Text style={[styles.subText, styles.subRow, newReply && styles.subTextUnread]} numberOfLines={1}>
            <Text style={[styles.subStatus, { color: tone.fg }]}>{stageLabel(stage)}</Text>
            {cp.site_name ? ` · ${cp.site_name}` : ''}
          </Text>
        </View>
        <View style={styles.rowSide}>
          <Text style={[styles.when, newReply && styles.whenUnread]}>{relativeDay(cp.last_message_at || cp.updated_at || cp.created_at)}</Text>
          <View style={styles.badges}>{newReply && <View style={styles.unread} accessibilityLabel="New reply" />}</View>
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
        ItemSeparatorComponent={() => <View style={styles.divider} />}
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
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <CrmSkeleton width={58} height={58} radius={29} />
                  <View style={styles.flex1}>
                    <CrmSkeleton height={15} width="65%" />
                    <CrmSkeleton height={12} width="40%" style={{ marginTop: 8 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : error ? undefined : (
            <View style={styles.empty}>
              <View style={styles.emptyArt}>
                <ComplaintArt size={64} />
              </View>
              <Text style={styles.emptyTitle}>{search || filtersOn || status !== 'all' ? 'No complaints found' : 'No complaints yet'}</Text>
              <Text style={styles.emptySub}>
                {search || filtersOn || status !== 'all' ? 'Try another filter.' : 'Everything looks fine. If something is not right at an outlet, let us know.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={loading && page > 1 ? <View style={styles.more}><ActivityIndicator color={blue} /></View> : undefined}
      />

      <Pressable onPress={raise} style={({ pressed }) => [styles.fab, { bottom: Math.max(insets.bottom, 12) + 14 }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Raise a complaint">
        <PlusIcon size={22} color={theme.isDark ? '#0B1B3A' : '#FFFFFF'} />
        <Text style={styles.fabText}>Raise complaint</Text>
      </Pressable>

      <Popup visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filter complaints">
        <Text style={styles.fGroup}>TYPE</Text>
        <View style={styles.fPills}>
          {CATEGORIES.filter((k) => k !== 'ACCOUNTS' || isCompanyAdmin || category === 'ACCOUNTS').map((k) => {
            const on = category === k;
            return (
              <Pressable key={k || 'all'} onPress={() => setCategory(k)} style={({ pressed }) => [styles.fPill, on && styles.fPillOn, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <Text style={[styles.fPillText, on && styles.fPillTextOn]}>{k ? CATEGORY_LABEL[k] : 'All types'}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.fGroup}>PRIORITY</Text>
        <View style={styles.fPills}>
          {PRIORITIES.map((k) => {
            const on = priority === k;
            return (
              <Pressable key={k || 'all'} onPress={() => setPriority(k)} style={({ pressed }) => [styles.fPill, on && styles.fPillOn, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <Text style={[styles.fPillText, on && styles.fPillTextOn]}>{k ? PRIORITY_LABEL[k] : 'All'}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.fActions}>
          <Pressable
            onPress={() => {
              setCategory('');
              setPriority('');
            }}
            style={({ pressed }) => [styles.fClear, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.fClearText}>Clear</Text>
          </Pressable>
          <Pressable onPress={() => setFilterOpen(false)} style={({ pressed }) => [styles.fDone, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.fDoneText}>Show results</Text>
          </Pressable>
        </View>
      </Popup>
    </ClientPage>
  );
}
