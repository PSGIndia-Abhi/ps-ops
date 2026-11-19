import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { BriefcaseIcon, CalendarIcon, CloseIcon, PersonIcon, PinIcon, ShieldIcon, SparkleIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { ActionSheet } from '../../tasks/ui/sheets';
import { spacing, typography } from '../../theme';
import { listJobs, listVisits, type ClientJob, type ClientVisit, type JobListResponse, type JobStatusFilter, type VisitListResponse, type VisitStatusFilter } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { formatDate, relativeDay, serviceLabel, statusInfo } from '../format';
import type { ClientStackParamList } from '../navigation';
import { FilterPill } from '../ui/home';
import { OutletPicker } from '../ui/OutletPicker';
import { ChipRow, ClientPage, Segmented, SOFT, TONES, type ToneKey } from '../ui/page';
import { useFloatingBarSpace } from '../ui/FloatingTabBar';

type Tab = 'jobs' | 'visits';
const JOB_CHIPS: { key: JobStatusFilter; label: string; count: keyof JobListResponse['counts'] }[] = [
  { key: 'active', label: 'Active', count: 'active' },
  { key: 'in_progress', label: 'In progress', count: 'in_progress' },
  { key: 'completed', label: 'Completed', count: 'completed' },
  { key: '', label: 'All', count: 'all' },
];
const VISIT_CHIPS: { key: VisitStatusFilter; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'missed', label: 'Missed' },
  { key: 'all', label: 'All' },
];

/** Status tone -> Google-style tonal colour. */
export const STATUS_TONE: Record<string, ToneKey> = { info: 'blue', warning: 'amber', success: 'green', danger: 'red', neutral: 'slate', accent: 'violet' };

export function serviceIcon(code: string | null | undefined): { Icon: React.ComponentType<{ size?: number; color?: string }>; tone: ToneKey } {
  const c = String(code || '').toUpperCase();
  if (c === 'PEST') return { Icon: ShieldIcon, tone: 'green' };
  if (c === 'DEEP') return { Icon: SparkleIcon, tone: 'teal' };
  if (c === 'BOTH') return { Icon: SparkleIcon, tone: 'indigo' };
  return { Icon: BriefcaseIcon, tone: 'blue' };
}

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 24,
    backgroundColor: SOFT(t),
  },
  searchInput: { flex: 1, ...typography.body, color: t.textPrimary, paddingVertical: 0 },
  filters: { flexDirection: 'row' as const, gap: spacing.xs, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  list: { paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: 1, backgroundColor: t.border, marginLeft: spacing.lg + 44 + spacing.md },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  date: { width: 44, height: 44, borderRadius: 22, backgroundColor: TONES.blue.bg, alignItems: 'center' as const, justifyContent: 'center' as const },
  dateDay: { fontSize: 15, lineHeight: 17, fontWeight: '800' as const, color: TONES.blue.fg },
  dateMonth: { fontSize: 9, fontWeight: '700' as const, color: TONES.blue.fg, textTransform: 'uppercase' as const },
  title: { ...typography.bodyMedium, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 6 },
  track: { width: 64, height: 5, borderRadius: 3, backgroundColor: SOFT(t), overflow: 'hidden' as const },
  fill: { height: 5, borderRadius: 3, backgroundColor: TONES.green.fg },
  metaText: { ...typography.caption, fontSize: 12, color: t.textSecondary },
  right: { alignItems: 'flex-end' as const, gap: 4 },
  status: { ...typography.captionMedium, fontSize: 12.5 },
  when: { ...typography.caption, fontSize: 12, color: t.textMuted },
  empty: { alignItems: 'center' as const, paddingTop: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: SOFT(t), alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary },
  emptySub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' as const },
  footerText: { ...typography.caption, color: t.textMuted },
  skeletonRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  error: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
});

export function ClientJobsScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const barSpace = useFloatingBarSpace();
  const { outlets, outletId, setOutletId, outletName } = useClientPortal();

  const [tab, setTab] = useState<Tab>('jobs');
  const [jobStatus, setJobStatus] = useState<JobStatusFilter>('active');
  const [visitStatus, setVisitStatus] = useState<VisitStatusFilter>('upcoming');
  const [service, setService] = useState('');
  const [serviceSheet, setServiceSheet] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [visits, setVisits] = useState<ClientVisit[]>([]);
  const [jobMeta, setJobMeta] = useState<{ total: number; counts: Partial<JobListResponse['counts']>; services: string[] }>({ total: 0, counts: {}, services: [] });
  const [visitMeta, setVisitMeta] = useState<{ total: number; counts: Partial<VisitListResponse['counts']> }>({ total: 0, counts: {} });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change starts again from page 1.
  const filterKey = `${tab}|${jobStatus}|${visitStatus}|${service}|${search}|${outletId}|${reloadKey}`;
  const lastKey = useRef(filterKey);
  if (lastKey.current !== filterKey) {
    lastKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const siteId = outletId || undefined;
    const req =
      tab === 'jobs'
        ? listJobs({ page, siteId, status: jobStatus, service, search }).then((body) => {
            if (!alive) return;
            setJobs((prev) => (page === 1 ? body.jobs : [...prev, ...body.jobs]));
            setJobMeta({ total: body.total, counts: body.counts, services: body.services });
          })
        : listVisits({ page, siteId, status: visitStatus }).then((body) => {
            if (!alive) return;
            setVisits((prev) => (page === 1 ? body.visits : [...prev, ...body.visits]));
            setVisitMeta({ total: body.total, counts: body.counts });
          });
    req
      .then(() => alive && setError(null))
      .catch((err: Error) => alive && setError(err.message || 'Could not load'))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [filterKey, page, tab, jobStatus, visitStatus, service, search, outletId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((n) => n + 1);
  }, []);

  const items: (ClientJob | ClientVisit)[] = tab === 'jobs' ? jobs : visits;
  const total = tab === 'jobs' ? jobMeta.total : visitMeta.total;
  const canLoadMore = !loading && items.length < total;
  const openJob = (jobId: string) => navigation.navigate('ClientJobDetail', { jobId });

  const header = (
    <View>
      <Segmented
        options={[
          { key: 'jobs', label: 'Jobs' },
          { key: 'visits', label: 'Visits' },
        ]}
        value={tab}
        onChange={(t) => setTab(t)}
      />
      {tab === 'jobs' && (
        <View style={styles.search}>
          <BriefcaseIcon size={18} color={theme.textMuted} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search job number, service or outlet"
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
      )}
      {(outlets.length > 1 || (tab === 'jobs' && jobMeta.services.length > 1)) && (
        <View style={styles.filters}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
          {tab === 'jobs' && jobMeta.services.length > 1 && (
            <FilterPill label={service ? serviceLabel(service) : 'All services'} onPress={() => setServiceSheet(true)} />
          )}
        </View>
      )}
      {tab === 'jobs' ? (
        <ChipRow options={JOB_CHIPS.map((c) => ({ key: c.key, label: c.label, count: jobMeta.counts[c.count] }))} value={jobStatus} onChange={setJobStatus} style={{ marginTop: spacing.sm }} />
      ) : (
        <ChipRow
          options={VISIT_CHIPS.map((c) => ({ key: c.key, label: c.label, count: visitMeta.counts[c.key] }))}
          value={visitStatus}
          onChange={setVisitStatus}
          style={{ marginTop: spacing.sm }}
        />
      )}
      {!!error && (
        <View style={styles.error}>
          <CrmErrorBanner message={error} onRetry={() => setReloadKey((n) => n + 1)} />
        </View>
      )}
    </View>
  );

  const renderJob = (j: ClientJob) => {
    const st = statusInfo(j.status);
    const tone = TONES[STATUS_TONE[st.tone] || 'slate'];
    const svc = serviceIcon(j.service_type);
    const pct = j.visits_total ? Math.round((j.visits_done / j.visits_total) * 100) : 0;
    return (
      <Pressable onPress={() => openJob(j.id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
        <View style={[styles.circle, { backgroundColor: TONES[svc.tone].bg }]}>
          <svc.Icon size={20} color={TONES[svc.tone].fg} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.title} numberOfLines={1}>
            {serviceLabel(j.service_type)}
            {j.sub_service ? ` · ${j.sub_service}` : ''}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            #{j.code || '—'} · {j.site_name || '—'}
          </Text>
          {j.visits_total > 0 && (
            <View style={styles.meta}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.metaText}>
                {j.visits_done}/{j.visits_total} visits
              </Text>
            </View>
          )}
        </View>
        <View style={styles.right}>
          <Text style={[styles.status, { color: tone.fg }]}>{st.label}</Text>
          <Text style={styles.when}>
            {j.status === 'COMPLETED' ? formatDate(j.completed_at || j.last_visit, { day: 'numeric', month: 'short' }) : j.next_visit ? relativeDay(j.next_visit) : 'No visit yet'}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderVisit = (v: ClientVisit) => {
    const st = statusInfo(v.status);
    const tone = TONES[STATUS_TONE[st.tone] || 'slate'];
    return (
      <Pressable onPress={() => openJob(v.job_id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
        <View style={styles.date}>
          <Text style={styles.dateDay}>{formatDate(v.scheduled_date, { day: '2-digit' })}</Text>
          <Text style={styles.dateMonth}>{formatDate(v.scheduled_date, { month: 'short' })}</Text>
        </View>
        <View style={styles.flex1}>
          <Text style={styles.title} numberOfLines={1}>
            {serviceLabel(v.service_type)}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            Visit {v.visit_number || ''} · {v.site_name || '—'}
          </Text>
          {v.technicians.length > 0 && (
            <View style={styles.meta}>
              <PersonIcon size={12} color={theme.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {v.technicians.join(', ')}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.right}>
          <Text style={[styles.status, { color: tone.fg }]}>{st.label}</Text>
          <Text style={styles.when}>{v.status === 'COMPLETED' ? formatDate(v.completed_at, { day: 'numeric', month: 'short' }) : relativeDay(v.scheduled_date)}</Text>
        </View>
      </Pressable>
    );
  };

  const firstLoad = loading && page === 1 && items.length === 0;

  return (
    <ClientPage title="Jobs & visits" subtitle={outletId ? outletName(outletId) : outlets.length > 1 ? 'All outlets' : outlets[0]?.name || undefined}>
      <FlatList
        data={firstLoad ? [] : items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (tab === 'jobs' ? renderJob(item as ClientJob) : renderVisit(item as ClientVisit))}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={
          <>
            <RefreshBanner refreshing={refreshing} />
            {header}
          </>
        }
        contentContainerStyle={[styles.list, { paddingBottom: barSpace }]}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => canLoadMore && setPage((p) => p + 1)}
        refreshControl={brandRefreshControl(refreshing, onRefresh)}
        ListEmptyComponent={
          firstLoad ? (
            <View>
              {Array.from({ length: 6 }).map((_, i) => (
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
              <View style={styles.emptyCircle}>{tab === 'jobs' ? <BriefcaseIcon size={28} color={theme.textMuted} /> : <CalendarIcon size={28} color={theme.textMuted} />}</View>
              <Text style={styles.emptyTitle}>{tab === 'jobs' ? 'No jobs here' : 'No visits here'}</Text>
              <Text style={styles.emptySub}>
                {search ? 'Nothing matches your search.' : tab === 'jobs' ? 'Try another filter, or request a new service.' : 'Try another filter to see more visits.'}
              </Text>
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
                  {items.length} of {total}
                </Text>
              )}
            </View>
          ) : undefined
        }
      />

      <ActionSheet
        visible={serviceSheet}
        onClose={() => setServiceSheet(false)}
        title="Service"
        actions={[
          { key: '', label: 'All services', selected: !service, icon: <PinIcon size={18} color={theme.primary} />, onPress: () => (setService(''), setServiceSheet(false)) },
          ...jobMeta.services.map((s) => {
            const svc = serviceIcon(s);
            return {
              key: s,
              label: serviceLabel(s),
              selected: service === s,
              icon: <svc.Icon size={18} color={TONES[svc.tone].fg} />,
              iconBg: TONES[svc.tone].bg,
              onPress: () => {
                setService(s);
                setServiceSheet(false);
              },
            };
          }),
        ]}
      />
    </ClientPage>
  );
}
