import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, CameraIcon, CheckCircleIcon, ClockIcon, PersonIcon, PinIcon, PlusIcon, SparkleIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import { getJob, jobAttachmentPath, type ClientJobDetail, type JobTimelineEntry } from '../api';
import { formatDate, formatDateTime, relativeDay, serviceLabel, statusInfo } from '../format';
import type { ClientStackParamList, ClientTabParamList } from '../navigation';
import { ClientPage, PhotoViewer, PortalImage, SOFT, TONES, type ToneKey } from '../ui/page';
import { STATUS_TONE, serviceIcon } from './ClientJobsScreen';

type IconType = React.ComponentType<{ size?: number; color?: string }>;

/** Raw history entry -> short client-friendly text (same as the web). */
function describe(e: JobTimelineEntry): { text: string; Icon: IconType; tone: ToneKey } {
  if (e.action === 'CREATED') return { text: 'Job created', Icon: PlusIcon, tone: 'blue' };
  if (e.action === 'BEFORE_PHOTOS') return { text: 'Before-work photos added', Icon: CameraIcon, tone: 'violet' };
  if (e.action === 'AFTER_PHOTOS') return { text: 'After-work photos added', Icon: CameraIcon, tone: 'violet' };
  if (e.action === 'STATUS_CHANGED') {
    const m = /from\s+(\w+)\s+to\s+(\w+)/i.exec(e.message || '');
    if (m) {
      const to = statusInfo(m[2]);
      return { text: `Status changed to ${to.label}`, Icon: to.tone === 'success' ? CheckCircleIcon : ClockIcon, tone: to.tone === 'success' ? 'green' : 'blue' };
    }
  }
  return { text: e.message || 'Update', Icon: SparkleIcon, tone: 'teal' };
}

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center' as const, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
  heroTitle: { ...typography.title, fontSize: 22, color: t.textPrimary, marginTop: spacing.md, textAlign: 'center' as const },
  heroSub: { ...typography.body, color: t.textMuted, marginTop: 2, textAlign: 'center' as const },
  statusPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: spacing.sm, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typography.captionMedium, fontSize: 13 },
  outlet: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: SOFT(t),
  },
  outletName: { ...typography.bodyMedium, color: t.textPrimary },
  outletAddr: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: spacing.md },
  progressRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 10 },
  progressLabel: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  progressPct: { ...typography.bodyMedium, color: TONES.green.fg },
  track: { height: 8, borderRadius: 4, backgroundColor: SOFT(t), overflow: 'hidden' as const },
  fill: { height: 8, borderRadius: 4, backgroundColor: TONES.green.fg },
  facts: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginTop: spacing.md },
  fact: { width: '50%' as const, paddingVertical: spacing.xs },
  factLabel: { ...typography.caption, color: t.textMuted },
  factValue: { ...typography.bodyMedium, color: t.textPrimary, marginTop: 2 },
  issue: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.border,
  },
  issueText: { ...typography.bodyMedium, color: TONES.amber.fg },
  rule: { height: 8, backgroundColor: SOFT(t), marginTop: spacing.xl, opacity: t.isDark ? 1 : 0.6 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, marginBottom: spacing.sm },
  sectionTitle: { ...typography.subtitle, fontSize: 18, color: t.textPrimary, flex: 1 },
  sectionCount: { ...typography.caption, color: t.textMuted },
  step: { flexDirection: 'row' as const, gap: spacing.md },
  stepRail: { alignItems: 'center' as const, width: 24 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepLine: { flex: 1, width: 2, backgroundColor: t.border, marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: spacing.lg },
  stepTop: { flexDirection: 'row' as const, alignItems: 'center' as const },
  stepTitle: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  stepStatus: { ...typography.captionMedium, fontSize: 12.5 },
  stepSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  stepTech: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 4 },
  stepTechText: { ...typography.caption, color: t.textSecondary },
  photos: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
  photoWrap: { alignItems: 'center' as const },
  photoTag: { position: 'absolute' as const, left: 6, bottom: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  photoTagText: { fontSize: 10.5, fontWeight: '700' as const, color: '#FFFFFF' },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.sm },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  emptyText: { ...typography.body, color: t.textMuted, paddingVertical: spacing.sm },
  loading: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' as const },
  errorWrap: { padding: spacing.lg },
});

export function ClientJobDetailScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList & ClientTabParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientJobDetail'>>();
  const { styles, theme } = useCrmStyles(factory);
  const { width } = useWindowDimensions();
  const [data, setData] = useState<ClientJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewer, setViewer] = useState<{ path: string; caption: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getJob(params.jobId)
      .then((body) => {
        if (!alive) return;
        setData(body);
        setError(null);
      })
      .catch((err: Error) => alive && setError(err.message || 'Could not load this job'))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [params.jobId, reloadKey]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((n) => n + 1);
  }, []);

  if (!data) {
    return (
      <ClientPage title="Job" back>
        {loading ? (
          <View style={styles.loading}>
            <CrmSkeleton width={72} height={72} radius={36} />
            <CrmSkeleton width="60%" height={20} />
            <CrmSkeleton height={120} radius={20} />
            <CrmSkeleton height={200} radius={20} />
          </View>
        ) : (
          <View style={styles.errorWrap}>
            <CrmErrorBanner message={error || 'Could not load this job'} onRetry={() => setReloadKey((n) => n + 1)} />
          </View>
        )}
      </ClientPage>
    );
  }

  const { job, visits, timeline } = data;
  const st = statusInfo(job.status);
  const tone = TONES[STATUS_TONE[st.tone] || 'slate'];
  const svc = serviceIcon(job.service_type);
  const done = visits.filter((v) => v.status === 'COMPLETED').length;
  const pct = visits.length ? Math.round((done / visits.length) * 100) : 0;
  const today = new Date(new Date().toDateString());
  const nextVisit = visits.find((v) => v.status === 'SCHEDULED' && new Date(v.scheduled_date) >= today);
  const photos = timeline.flatMap((e) => e.attachments.map((a) => ({ ...a, action: e.action })));
  const photoSize = Math.floor((width - spacing.lg * 2 - spacing.xs * 2) / 3);
  const facts = [
    { label: 'Start date', value: formatDate(job.start_date || job.created_at) },
    { label: 'Due date', value: formatDate(job.due_date) },
    { label: 'Next visit', value: nextVisit ? `${formatDate(nextVisit.scheduled_date, { day: 'numeric', month: 'short' })} · ${relativeDay(nextVisit.scheduled_date)}` : '—' },
    { label: 'Completed', value: formatDate(job.completed_at) },
  ];

  return (
    <ClientPage title={`Job #${job.code || job.id}`} back>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {/* Summary */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: TONES[svc.tone].bg }]}>
            <svc.Icon size={32} color={TONES[svc.tone].fg} />
          </View>
          <Text style={styles.heroTitle}>{serviceLabel(job.service_type)}</Text>
          {!!job.sub_service && <Text style={styles.heroSub}>{job.sub_service}</Text>}
          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: tone.fg }]} />
            <Text style={[styles.statusText, { color: tone.fg }]}>{st.label}</Text>
          </View>
        </View>

        <View style={styles.outlet}>
          <PinIcon size={20} color={theme.primary} />
          <View style={styles.flex1}>
            <Text style={styles.outletName}>{job.site_name || 'Outlet'}</Text>
            {!!(job.site_address || job.address) && (
              <Text style={styles.outletAddr} numberOfLines={2}>
                {job.site_address || job.address}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {done} of {visits.length} visit{visits.length === 1 ? '' : 's'} completed
            </Text>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={styles.factLabel}>{f.label}</Text>
                <Text style={styles.factValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable onPress={() => navigation.navigate('Complaints')} style={({ pressed }) => [styles.issue, pressed && styles.pressed]} accessibilityRole="button">
          <AlertTriangleIcon size={18} color={TONES.amber.fg} />
          <Text style={styles.issueText}>Report an issue with this job</Text>
        </Pressable>

        <View style={styles.rule} />

        {/* Visits */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Visits</Text>
            <Text style={styles.sectionCount}>{visits.length} total</Text>
          </View>
          {visits.length === 0 ? (
            <Text style={styles.emptyText}>No visits planned yet.</Text>
          ) : (
            visits.map((v, i) => {
              const vs = statusInfo(v.status);
              const vt = TONES[STATUS_TONE[vs.tone] || 'slate'];
              const last = i === visits.length - 1;
              return (
                <View key={v.id} style={styles.step}>
                  <View style={styles.stepRail}>
                    <View style={[styles.stepDot, { backgroundColor: vt.bg }]}>
                      {v.status === 'COMPLETED' ? <CheckCircleIcon size={14} color={vt.fg} /> : <ClockIcon size={13} color={vt.fg} />}
                    </View>
                    {!last && <View style={styles.stepLine} />}
                  </View>
                  <View style={[styles.stepBody, last && { paddingBottom: 0 }]}>
                    <View style={styles.stepTop}>
                      <Text style={styles.stepTitle}>Visit {v.visit_number || i + 1}</Text>
                      <Text style={[styles.stepStatus, { color: vt.fg }]}>{vs.label}</Text>
                    </View>
                    <Text style={styles.stepSub}>
                      {v.status === 'COMPLETED' && v.completed_at
                        ? `Completed ${formatDateTime(v.completed_at)}`
                        : `${formatDate(v.scheduled_date)} · ${relativeDay(v.scheduled_date)}`}
                    </Text>
                    {v.technicians.length > 0 && (
                      <View style={styles.stepTech}>
                        <PersonIcon size={12} color={theme.textMuted} />
                        <Text style={styles.stepTechText}>{v.technicians.join(', ')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Service photos</Text>
            <Text style={styles.sectionCount}>{photos.length}</Text>
          </View>
          {photos.length === 0 ? (
            <Text style={styles.emptyText}>No photos shared for this job yet.</Text>
          ) : (
            <View style={styles.photos}>
              {photos.map((p) => {
                const tag = p.action === 'BEFORE_PHOTOS' ? 'Before' : p.action === 'AFTER_PHOTOS' ? 'After' : 'Photo';
                const isImage = String(p.file_type || '').startsWith('image/') || p.type === 'IMAGE';
                return (
                  <View key={String(p.id)} style={styles.photoWrap}>
                    <PortalImage
                      path={jobAttachmentPath(p.id)}
                      size={photoSize}
                      isImage={isImage}
                      onPress={isImage ? () => setViewer({ path: jobAttachmentPath(p.id), caption: `${tag} · ${serviceLabel(job.service_type)}` }) : undefined}
                    />
                    <View style={styles.photoTag} pointerEvents="none">
                      <Text style={styles.photoTagText}>{tag}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Updates */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Updates</Text>
            <Text style={styles.sectionCount}>Newest first</Text>
          </View>
          {timeline.length === 0 ? (
            <Text style={styles.emptyText}>No updates yet.</Text>
          ) : (
            timeline.map((e) => {
              const d = describe(e);
              return (
                <View key={String(e.id)} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: TONES[d.tone].bg }]}>
                    <d.Icon size={18} color={TONES[d.tone].fg} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle}>{d.text}</Text>
                    <Text style={styles.rowSub}>
                      {formatDateTime(e.created_at)}
                      {e.attachments.length > 0 ? ` · ${e.attachments.length} photo${e.attachments.length === 1 ? '' : 's'}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <PhotoViewer path={viewer?.path ?? null} caption={viewer?.caption} onClose={() => setViewer(null)} />
    </ClientPage>
  );
}
