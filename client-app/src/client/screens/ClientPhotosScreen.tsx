import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { ChevronRightIcon, CloseIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { jobAttachmentPath, listPhotos, type PhotoJob, type ServicePhoto, type SharedPhoto } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { downloadPortalFile, saveLocalFile } from '../files';
import { formatDate, plural, serviceLabel } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ANY_TIME, DateFilterButton, DateFilterChip, type DateRange } from '../ui/DateFilter';
import { PhotosArt } from '../ui/IllustratedIcons';
import { OutletPicker } from '../ui/OutletPicker';
import { ClientPage, PhotoViewer, PortalImage } from '../ui/page';

const BLUE = '#0B57D0';
const GAP = 8;
const COLS = 3;

const PHASES: { key: ServicePhoto['phase']; label: string; fg: string }[] = [
  { key: 'before', label: 'Before', fg: '#B06000' },
  { key: 'after', label: 'After', fg: '#188038' },
  { key: 'other', label: 'During visit', fg: '#0B57D0' },
];

const factory = (t: CrmTheme) => {
  const ink = t.isDark ? '#E6E7EA' : '#1B1C1F';
  const sub = t.isDark ? '#A3A7AE' : '#5E6470';
  const faint = t.isDark ? '#6E737C' : '#9AA1AD';
  const blue = t.isDark ? '#A8C7FA' : BLUE;
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.7 },
    top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 16, marginTop: 4 },
    search: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, height: 50, paddingHorizontal: 16, borderRadius: 25, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1.5, borderColor: t.isDark ? 'rgba(168,199,250,0.35)' : '#A9C4F5' },
    searchFocused: { borderColor: blue, shadowColor: BLUE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 },
    searchInput: { flex: 1, fontSize: 15, color: ink, paddingVertical: 0 },
    chipRow: { paddingHorizontal: 16, marginTop: 10 },
    outlet: { paddingHorizontal: 16, marginTop: 10 },
    summary: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 22, backgroundColor: t.isDark ? t.surfaceAlt : '#EEF3FF' },
    summaryArt: { width: 54, height: 54, borderRadius: 27, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' },
    summaryValue: { fontSize: 20, fontWeight: '800' as const, color: ink },
    summarySub: { fontSize: 13, color: sub, marginTop: 1 },
    sectionHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8, paddingHorizontal: 20, marginTop: 22, marginBottom: 10 },
    sectionTitle: { fontSize: 16, fontWeight: '700' as const, color: ink },
    sectionCount: { fontSize: 13.5, color: faint, fontWeight: '600' as const },
    grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: GAP },
    card: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 22, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1, borderColor: t.isDark ? 'rgba(255,255,255,0.10)' : '#E6EBF3' },
    cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 4 },
    cardTitle: { fontSize: 15.5, fontWeight: '700' as const, color: ink },
    cardSub: { fontSize: 12.5, color: sub, marginTop: 2 },
    phase: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 12, marginBottom: 8 },
    phaseDot: { width: 8, height: 8, borderRadius: 4 },
    phaseText: { fontSize: 13, fontWeight: '700' as const },
    empty: { alignItems: 'center' as const, paddingTop: 40, paddingHorizontal: 28 },
    emptyArt: { width: 104, height: 104, borderRadius: 52, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB', alignItems: 'center' as const, justifyContent: 'center' as const },
    emptyTitle: { fontSize: 18, fontWeight: '700' as const, color: ink, marginTop: 16 },
    emptySub: { fontSize: 14.5, color: sub, textAlign: 'center' as const, marginTop: 6, lineHeight: 21 },
    more: { paddingVertical: 20, alignItems: 'center' as const },
    error: { paddingHorizontal: 16, marginTop: 10 },
  };
};

function SearchGlass({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="6.5" fill="none" stroke={color} strokeWidth={2} />
      <Path d="M16 16l4.5 4.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Service photos (web: PortalPhotos) - photos BestServe shared, then every visit's before / after photos by job. */
export function ClientPhotosScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, outletId, setOutletId } = useClientPortal();
  const { width } = useWindowDimensions();
  const blue = theme.isDark ? '#A8C7FA' : BLUE;
  // Square tiles, 3 per row: the page grid (16 px sides) and the grid inside a job card (+15 px).
  const pageTile = Math.floor((width - 32 - GAP * (COLS - 1)) / COLS);
  const cardTile = Math.floor((width - 32 - 30 - GAP * (COLS - 1)) / COLS);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [range, setRange] = useState<DateRange>(ANY_TIME);
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [shared, setShared] = useState<SharedPhoto[]>([]);
  const [meta, setMeta] = useState({ total: 0, photos: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewer, setViewer] = useState<{ path: string; name: string; type: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterKey = `${search}|${outletId}|${range.from}|${range.to}|${reloadKey}`;
  const lastKey = useRef(filterKey);
  if (lastKey.current !== filterKey) {
    lastKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listPhotos({ page, siteId: outletId || undefined, search, from: range.from || undefined, to: range.to || undefined })
      .then((body) => {
        if (!alive) return;
        setJobs((prev) => (page === 1 ? body.jobs : [...prev, ...body.jobs]));
        if (page === 1) setShared(body.shared || []);
        setMeta({ total: body.total, photos: body.photo_total });
        setError(null);
      })
      .catch((err: Error) => alive && setError(err.message || 'Could not load photos'))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [filterKey, page, search, outletId, range.from, range.to]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((n) => n + 1);
  }, []);

  /** Saves the open photo to Downloads / BestServe. */
  const downloadOpen = async () => {
    if (!viewer) return false;
    try {
      const local = await downloadPortalFile(viewer.path, viewer.name);
      await saveLocalFile(local, viewer.type);
      return true;
    } catch {
      return false;
    }
  };

  const firstLoad = loading && page === 1 && jobs.length === 0 && shared.length === 0;
  const canLoadMore = !loading && jobs.length < meta.total;
  const nothing = !firstLoad && !error && jobs.length === 0 && shared.length === 0;
  const filtered = !!search || range.preset !== 'any';
  const totalPhotos = meta.photos + shared.length;
  const summarySub = [meta.total ? `From ${plural(meta.total, 'visit job')}` : null, shared.length ? `${shared.length} shared by BestServe` : null].filter(Boolean).join(' · ');

  const header = (
    <View>
      <View style={styles.top}>
        <View style={[styles.search, focused && styles.searchFocused]}>
          <SearchGlass color={focused ? blue : theme.textMuted} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search job, service or outlet"
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
        <DateFilterButton value={range} onChange={setRange} />
      </View>
      {range.preset !== 'any' && (
        <View style={styles.chipRow}>
          <DateFilterChip value={range} onClear={() => setRange(ANY_TIME)} />
        </View>
      )}
      {outlets.length > 1 && (
        <View style={styles.outlet}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </View>
      )}
      {!!error && (
        <View style={styles.error}>
          <CrmErrorBanner message={error} onRetry={() => setReloadKey((n) => n + 1)} />
        </View>
      )}

      {!firstLoad && !nothing && (
        <View style={styles.summary}>
          <View style={styles.summaryArt}>
            <PhotosArt size={38} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.summaryValue}>{plural(totalPhotos, 'photo')}</Text>
            {!!summarySub && <Text style={styles.summarySub}>{summarySub}</Text>}
          </View>
        </View>
      )}

      {shared.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Shared by BestServe</Text>
            <Text style={styles.sectionCount}>{shared.length}</Text>
          </View>
          <View style={[styles.grid, { paddingHorizontal: 16 }]}>
            {shared.map((p) => (
              <PortalImage key={p.id} path={p.path} size={pageTile} radius={16} onPress={() => setViewer({ path: p.path, name: p.file_name || `BestServe-photo-${p.id}.jpg`, type: p.file_type || 'image/jpeg' })} />
            ))}
          </View>
        </>
      )}
      {jobs.length > 0 && (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Visit photos</Text>
          <Text style={styles.sectionCount}>{meta.photos}</Text>
        </View>
      )}
    </View>
  );

  const renderJob = ({ item: j }: { item: PhotoJob }) => (
    <View style={styles.card}>
      <Pressable
        onPress={() => navigation.navigate('ClientJobDetail', { jobId: j.id })}
        style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Open job ${j.code || ''}`}
      >
        <View style={styles.flex1}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {j.sub_service || serviceLabel(j.service_type)}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {[formatDate(j.last_at, { day: 'numeric', month: 'short', year: 'numeric' }), outlets.length > 1 ? j.site_name : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <ChevronRightIcon size={16} color={theme.textMuted} />
      </Pressable>
      {PHASES.map((ph) => {
        const list = j.photos.filter((p) => p.phase === ph.key && !String(p.file_type || '').includes('pdf'));
        if (!list.length) return null;
        return (
          <View key={ph.key}>
            <View style={styles.phase}>
              <View style={[styles.phaseDot, { backgroundColor: ph.fg }]} />
              <Text style={[styles.phaseText, { color: theme.isDark ? theme.textPrimary : ph.fg }]}>{ph.label}</Text>
            </View>
            <View style={styles.grid}>
              {list.map((p) => {
                const path = jobAttachmentPath(p.id);
                return <PortalImage key={String(p.id)} path={path} size={cardTile} radius={14} onPress={() => setViewer({ path, name: p.file_name || `BestServe-photo-${p.id}.jpg`, type: p.file_type || 'image/jpeg' })} />;
              })}
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <ClientPage title="Service photos" back>
      <FlatList
        data={firstLoad ? [] : jobs}
        keyExtractor={(j) => j.id}
        renderItem={renderJob}
        ListHeaderComponent={
          <>
            <RefreshBanner refreshing={refreshing} />
            {header}
          </>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => canLoadMore && setPage((p) => p + 1)}
        refreshControl={brandRefreshControl(refreshing, onRefresh)}
        ListEmptyComponent={
          firstLoad ? (
            <View style={{ paddingHorizontal: 16 }}>
              <CrmSkeleton height={82} radius={22} style={{ marginTop: 16 }} />
              <CrmSkeleton height={18} width={150} radius={8} style={{ marginTop: 22 }} />
              <View style={[styles.grid, { marginTop: 12 }]}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <CrmSkeleton key={i} width={pageTile} height={pageTile} radius={16} />
                ))}
              </View>
            </View>
          ) : nothing ? (
            <View style={styles.empty}>
              <View style={styles.emptyArt}>
                <PhotosArt size={64} />
              </View>
              <Text style={styles.emptyTitle}>{filtered ? 'Nothing found' : 'No photos yet'}</Text>
              <Text style={styles.emptySub}>{filtered ? 'Try another search or date.' : 'Before and after photos from our visits will appear here.'}</Text>
            </View>
          ) : undefined
        }
        ListFooterComponent={loading && page > 1 ? <View style={styles.more}><ActivityIndicator color={blue} /></View> : undefined}
      />
      <PhotoViewer path={viewer?.path ?? null} onClose={() => setViewer(null)} onDownload={downloadOpen} />
    </ClientPage>
  );
}
