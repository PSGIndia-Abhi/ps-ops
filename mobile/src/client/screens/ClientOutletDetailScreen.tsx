import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import {
  AlertTriangleIcon,
  ChartIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  EmailIcon,
  ExternalLinkIcon,
  PhoneIcon,
  PlusIcon,
  ShieldIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { radii, spacing, typography } from '../../theme';
import { getOutlet, type OutletDetail } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { RISK_STYLE, formatDate, relativeDay, serviceLabel, statusInfo } from '../format';
import type { ClientStackParamList, ClientTabParamList } from '../navigation';
import { ClientPage, SOFT, TONES, type ToneKey } from '../ui/page';
import { STATUS_TONE, serviceIcon } from './ClientJobsScreen';

type IconType = React.ComponentType<{ size?: number; color?: string }>;

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center' as const, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { color: '#FFFFFF', fontWeight: '800' as const, fontSize: 26 },
  name: { ...typography.title, fontSize: 22, color: t.textPrimary, marginTop: spacing.md, textAlign: 'center' as const },
  addr: { ...typography.body, color: t.textMuted, marginTop: 4, textAlign: 'center' as const },
  branch: { ...typography.caption, color: t.textMuted, marginTop: 4 },
  actions: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: spacing.lg, marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  action: { alignItems: 'center' as const, width: 72 },
  actionCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center' as const, justifyContent: 'center' as const },
  actionLabel: { ...typography.caption, fontSize: 12, color: t.textPrimary, marginTop: 6, textAlign: 'center' as const },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: 20, borderWidth: 1, borderColor: t.border, paddingVertical: spacing.xs },
  cell: { width: '33.33%' as const, alignItems: 'center' as const, paddingVertical: spacing.sm, paddingHorizontal: 4 },
  cellValue: { ...typography.subtitle, color: t.textPrimary, textAlign: 'center' as const },
  cellLabel: { ...typography.caption, fontSize: 11.5, color: t.textMuted, marginTop: 2, textAlign: 'center' as const },
  rule: { height: 8, backgroundColor: SOFT(t), marginTop: spacing.xl, opacity: t.isDark ? 1 : 0.6 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.xs },
  sectionTitle: { ...typography.subtitle, fontSize: 18, color: t.textPrimary, flex: 1 },
  sectionLink: { ...typography.captionMedium, fontSize: 13.5, color: TONES.blue.fg },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.sm },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  date: { width: 40, height: 40, borderRadius: 20, backgroundColor: TONES.blue.bg, alignItems: 'center' as const, justifyContent: 'center' as const },
  dateDay: { fontSize: 14, lineHeight: 16, fontWeight: '800' as const, color: TONES.blue.fg },
  dateMonth: { fontSize: 8.5, fontWeight: '700' as const, color: TONES.blue.fg, textTransform: 'uppercase' as const },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  rowRight: { ...typography.captionMedium, fontSize: 12.5 },
  empty: { ...typography.body, color: t.textMuted, paddingVertical: spacing.xs },
  primary: { marginLeft: 6, paddingHorizontal: 8, paddingVertical: 1, borderRadius: radii.pill, backgroundColor: TONES.blue.bg },
  primaryText: { fontSize: 10.5, fontWeight: '700' as const, color: TONES.blue.fg },
  contactBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: SOFT(t) },
  loading: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' as const },
});

export function ClientOutletDetailScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList & ClientTabParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientOutletDetail'>>();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, setOutletId } = useClientPortal();
  const [data, setData] = useState<OutletDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getOutlet(params.siteId));
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Could not load this outlet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params.siteId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <ClientPage title="Outlet" back>
        {loading ? (
          <View style={styles.loading}>
            <CrmSkeleton width={76} height={76} radius={38} />
            <CrmSkeleton width="60%" height={22} />
            <CrmSkeleton height={140} radius={20} />
          </View>
        ) : (
          <View style={styles.loading}>
            <CrmErrorBanner message={error || 'Could not load this outlet'} onRetry={load} />
          </View>
        )}
      </ClientPage>
    );
  }

  const { outlet, stats } = data;
  const risk = RISK_STYLE[String(stats.audit_risk || '').toUpperCase()];
  const mapsUrl =
    outlet.latitude != null && outlet.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${outlet.latitude},${outlet.longitude}`
      : outlet.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(outlet.address)}`
      : null;

  const actions: { key: string; label: string; Icon: IconType; tone: ToneKey; onPress: () => void }[] = [
    ...(mapsUrl ? [{ key: 'map', label: 'Directions', Icon: ExternalLinkIcon, tone: 'blue' as ToneKey, onPress: () => Linking.openURL(mapsUrl) }] : []),
    { key: 'request', label: 'Request', Icon: PlusIcon, tone: 'indigo', onPress: () => navigation.navigate('ClientRequestService', { siteId: outlet.id }) },
    { key: 'complaint', label: 'Complaint', Icon: AlertTriangleIcon, tone: 'amber', onPress: () => navigation.navigate('ClientNewComplaint', { siteId: outlet.id }) },
    ...(outlets.length > 1
      ? [
          {
            key: 'focus',
            label: 'Dashboard',
            Icon: ChartIcon,
            tone: 'teal' as ToneKey,
            onPress: () => {
              setOutletId(outlet.id);
              navigation.navigate('ClientTabs', { screen: 'Dashboard' });
            },
          },
        ]
      : []),
  ];

  const cells = [
    { label: 'Active jobs', value: String(stats.active_jobs) },
    { label: 'Services done', value: String(stats.visits_done) },
    { label: 'Open issues', value: String(stats.open_complaints), color: stats.open_complaints > 0 ? TONES.amber.fg : undefined },
    { label: stats.next_visit ? `Next · ${relativeDay(stats.next_visit)}` : 'Next visit', value: stats.next_visit ? formatDate(stats.next_visit, { day: 'numeric', month: 'short' }) : '—' },
    { label: stats.last_visit ? `Last · ${relativeDay(stats.last_visit)}` : 'Last visit', value: stats.last_visit ? formatDate(stats.last_visit, { day: 'numeric', month: 'short' }) : '—' },
    {
      label: stats.audit_date ? `Audit · ${formatDate(stats.audit_date, { day: 'numeric', month: 'short' })}` : 'Audit risk',
      value: risk ? risk.label : '—',
      color: risk ? TONES[STATUS_TONE[risk.tone] || 'slate'].fg : undefined,
    },
  ];

  return (
    <ClientPage title={outlet.name || 'Outlet'} back>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={brandRefreshControl(refreshing, () => {
              setRefreshing(true);
              load();
            })}
      >
        <RefreshBanner refreshing={refreshing} />
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: avatarColor(outlet.id) }]}>
            <Text style={styles.avatarText}>{initials(outlet.name || outlet.id)}</Text>
          </View>
          <Text style={styles.name}>{outlet.name || outlet.id}</Text>
          <Text style={styles.addr}>{outlet.formatted_address || outlet.address || 'No address on file'}</Text>
          {!!outlet.branch_name && <Text style={styles.branch}>Served by BestServe {outlet.branch_name}</Text>}
        </View>

        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a.key} onPress={a.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={a.label}>
              <View style={[styles.actionCircle, { backgroundColor: TONES[a.tone].bg }]}>
                <a.Icon size={22} color={TONES[a.tone].fg} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((c) => (
            <View key={c.label} style={styles.cell}>
              <Text style={[styles.cellValue, c.color ? { color: c.color } : null]}>{c.value}</Text>
              <Text style={styles.cellLabel} numberOfLines={1}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.rule} />

        {/* Services */}
        {data.services.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Services here</Text>
            </View>
            {data.services.map((s) => {
              const svc = serviceIcon(s.service_type);
              return (
                <View key={String(s.service_type)} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: TONES[svc.tone].bg }]}>
                    <svc.Icon size={18} color={TONES[svc.tone].fg} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle}>{serviceLabel(s.service_type)}</Text>
                    <Text style={styles.rowSub}>
                      {s.jobs} job{s.jobs === 1 ? '' : 's'} · last done {s.last_done ? formatDate(s.last_done, { day: 'numeric', month: 'short' }) : '—'}
                    </Text>
                  </View>
                  <Text style={[styles.rowRight, { color: theme.textMuted }]}>{s.next_due ? `Next ${relativeDay(s.next_due).toLowerCase()}` : ''}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Upcoming visits */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Upcoming visits</Text>
          </View>
          {data.upcoming_visits.length === 0 ? (
            <Text style={styles.empty}>No visits scheduled.</Text>
          ) : (
            data.upcoming_visits.map((v) => (
              <Pressable key={v.id} onPress={() => navigation.navigate('ClientJobDetail', { jobId: v.job_id })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                <View style={styles.date}>
                  <Text style={styles.dateDay}>{formatDate(v.scheduled_date, { day: '2-digit' })}</Text>
                  <Text style={styles.dateMonth}>{formatDate(v.scheduled_date, { month: 'short' })}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowTitle}>{serviceLabel(v.service_type)}</Text>
                  <Text style={styles.rowSub}>
                    Visit {v.visit_number || ''} · #{v.job_code || '—'}
                  </Text>
                </View>
                <Text style={[styles.rowRight, { color: TONES.blue.fg }]}>{relativeDay(v.scheduled_date)}</Text>
              </Pressable>
            ))
          )}
        </View>

        {/* Recent visits */}
        {data.recent_visits.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recent visits</Text>
            </View>
            {data.recent_visits.map((v) => {
              const st = statusInfo(v.status);
              const tone = TONES[STATUS_TONE[st.tone] || 'slate'];
              return (
                <Pressable key={v.id} onPress={() => navigation.navigate('ClientJobDetail', { jobId: v.job_id })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                  <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
                    {v.status === 'COMPLETED' ? <CheckCircleIcon size={18} color={tone.fg} /> : <ClockIcon size={18} color={tone.fg} />}
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle}>{serviceLabel(v.service_type)}</Text>
                    <Text style={styles.rowSub}>
                      {formatDate(v.completed_at || v.scheduled_date, { day: 'numeric', month: 'short', year: 'numeric' })} · #{v.job_code || '—'}
                    </Text>
                  </View>
                  <Text style={[styles.rowRight, { color: tone.fg }]}>{st.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Complaints */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Complaints</Text>
          </View>
          {data.complaints.length === 0 ? (
            <Text style={styles.empty}>No complaints raised for this outlet.</Text>
          ) : (
            data.complaints.map((c) => {
              const open = c.status === 'OPEN' || c.status === 'IN_PROGRESS';
              const tone = open ? TONES.amber : TONES.green;
              return (
                <Pressable key={c.id} onPress={() => navigation.navigate('ClientComplaintDetail', { complaintId: c.id })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                  <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
                    {open ? <AlertTriangleIcon size={18} color={tone.fg} /> : <CheckCircleIcon size={18} color={tone.fg} />}
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {c.subject}
                    </Text>
                    <Text style={styles.rowSub}>{formatDate(c.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <Text style={[styles.rowRight, { color: tone.fg }]}>{open ? 'Open' : 'Resolved'}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Audits */}
        {data.audits.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Audits</Text>
              <Pressable onPress={() => navigation.navigate('ClientAudits')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.sectionLink}>See all</Text>
              </Pressable>
            </View>
            {data.audits.map((a) => {
              const r = RISK_STYLE[String(a.risk || '').toUpperCase()];
              const tone = r ? TONES[STATUS_TONE[r.tone] || 'slate'] : TONES.slate;
              return (
                <View key={a.id} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: TONES.green.bg }]}>
                    <ShieldIcon size={18} color={TONES.green.fg} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle}>{a.audit_number || 'Audit'}</Text>
                    <Text style={styles.rowSub}>
                      {formatDate(a.audit_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {a.audit_type ? ` · ${a.audit_type}` : ''}
                    </Text>
                  </View>
                  {!!r && <Text style={[styles.rowRight, { color: tone.fg }]}>{r.label}</Text>}
                </View>
              );
            })}
          </View>
        )}

        {/* Contacts */}
        {data.contacts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Your contacts here</Text>
            </View>
            {data.contacts.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: avatarColor(c.id) }]}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{initials(c.name)}</Text>
                </View>
                <View style={styles.flex1}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {c.is_primary && (
                      <View style={styles.primary}>
                        <Text style={styles.primaryText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  {!!(c.role || c.phone) && <Text style={styles.rowSub}>{[c.role, c.phone].filter(Boolean).join(' · ')}</Text>}
                </View>
                {!!c.phone && (
                  <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)} style={({ pressed }) => [styles.contactBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Call ${c.name}`}>
                    <PhoneIcon size={16} color={TONES.green.fg} />
                  </Pressable>
                )}
                {!!c.email && (
                  <Pressable onPress={() => Linking.openURL(`mailto:${c.email}`)} style={({ pressed }) => [styles.contactBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Email ${c.name}`}>
                    <EmailIcon size={16} color={TONES.blue.fg} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Recent jobs */}
        {data.recent_jobs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recent jobs</Text>
            </View>
            {data.recent_jobs.map((j) => {
              const st = statusInfo(j.status);
              const tone = TONES[STATUS_TONE[st.tone] || 'slate'];
              const svc = serviceIcon(j.service_type);
              return (
                <Pressable key={j.id} onPress={() => navigation.navigate('ClientJobDetail', { jobId: j.id })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                  <View style={[styles.rowIcon, { backgroundColor: TONES[svc.tone].bg }]}>
                    <svc.Icon size={18} color={TONES[svc.tone].fg} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {serviceLabel(j.service_type)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      #{j.code || '—'}
                      {j.sub_service ? ` · ${j.sub_service}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.rowRight, { color: tone.fg }]}>{st.label}</Text>
                  <ChevronRightIcon size={15} color={theme.textMuted} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ClientPage>
  );
}
