import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import {
  brandRefreshControl,
  RefreshBanner,
} from '../../components/BrandRefresh';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  EmailIcon,
  PhoneIcon,
  ShieldIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { getOutlet, type OutletDetail } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import {
  RISK_STYLE,
  formatDate,
  relativeDay,
  serviceLabel,
  statusInfo,
} from '../format';
import { STAGE_TONE, stageLabel, stageOf } from '../complaints';
import type { ClientStackParamList } from '../navigation';
import {
  BookServiceArt,
  ComplaintArt,
  JobsArt,
  MapPinArt,
  OutletArt,
} from '../ui/IllustratedIcons';
import { ClientPage } from '../ui/page';
import { serviceIcon } from './ClientJobsScreen';

type IconType = React.ComponentType<{ size?: number; color?: string }>;
type ArtType = React.ComponentType<{ size?: number }>;

const BLUE = '#0B57D0';

/** Soft tile / pill colours (light theme). */
const TONE = {
  blue: { fg: '#0B57D0', bg: '#EEF3FF' },
  violet: { fg: '#7B3FC4', bg: '#F4EEFD' },
  amber: { fg: '#B06000', bg: '#FEF5E7' },
  green: { fg: '#188038', bg: '#EAF6EC' },
  red: { fg: '#C5221F', bg: '#FDECEA' },
  teal: { fg: '#00796B', bg: '#E6F5F3' },
  slate: { fg: '#5F6368', bg: '#F1F3F4' },
};
type Tone = keyof typeof TONE;
const STATUS_TO_TONE: Record<string, Tone> = {
  info: 'blue',
  warning: 'amber',
  success: 'green',
  danger: 'red',
  neutral: 'slate',
  accent: 'violet',
};

const factory = (t: CrmTheme) => {
  const ink = t.isDark ? '#E6E7EA' : '#1B1C1F';
  const sub = t.isDark ? '#A3A7AE' : '#5E6470';
  const faint = t.isDark ? '#6E737C' : '#9AA1AD';
  const line = t.isDark ? 'rgba(255,255,255,0.10)' : '#E6EBF3';
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.7 },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    // hero
    hero: {
      alignItems: 'center' as const,
      marginTop: 4,
      paddingTop: 22,
      paddingBottom: 20,
      paddingHorizontal: 18,
      borderRadius: 28,
      overflow: 'hidden' as const,
      backgroundColor: t.isDark ? t.surfaceAlt : '#EEF3FF',
      borderWidth: 1,
      borderColor: t.isDark ? line : '#DCE6FB',
    },
    blobA: {
      position: 'absolute' as const,
      right: -50,
      top: -60,
      width: 170,
      height: 170,
      borderRadius: 85,
      backgroundColor: t.isDark
        ? 'rgba(255,255,255,0.03)'
        : 'rgba(255,255,255,0.6)',
    },
    blobB: {
      position: 'absolute' as const,
      left: -40,
      bottom: -70,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: t.isDark
        ? 'rgba(255,255,255,0.02)'
        : 'rgba(221,212,255,0.45)',
    },
    heroArt: {
      width: 84,
      height: 84,
      borderRadius: 42,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
      shadowColor: '#3A4BA0',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 3,
    },
    name: {
      fontSize: 22,
      fontWeight: '800' as const,
      color: ink,
      marginTop: 14,
      textAlign: 'center' as const,
    },
    addr: {
      marginTop: 6,
      paddingHorizontal: 8,
      fontSize: 13.5,
      lineHeight: 19,
      color: sub,
      textAlign: 'center' as const,
    },
    branch: { marginTop: 10 },
    branchText: {
      fontSize: 12.5,
      fontWeight: '600' as const,
      color: t.isDark ? '#A8C7FA' : BLUE,
    },
    // actions
    actions: { flexDirection: 'row' as const, gap: 10, marginTop: 14 },
    action: {
      flex: 1,
      alignItems: 'center' as const,
      paddingTop: 12,
      paddingBottom: 10,
      borderRadius: 20,
      backgroundColor: t.isDark ? t.surface : '#FFFFFF',
      borderWidth: 1,
      borderColor: line,
    },
    actionArt: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#F2F5FB',
    },
    actionLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: ink,
      marginTop: 8,
    },
    actionOff: { opacity: 0.4 },
    // stats
    overview: {
      marginTop: 14,
      borderRadius: 22,
      backgroundColor: t.isDark ? t.surface : '#FFFFFF',
      borderWidth: 1,
      borderColor: line,
      paddingTop: 14,
    },
    overviewTitle: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: ink,
      paddingHorizontal: 16,
      marginBottom: 4,
    },
    statRow: { flexDirection: 'row' as const },
    statRowRule: { height: 1, backgroundColor: line, marginHorizontal: 14 },
    stat: { flex: 1, alignItems: 'center' as const, paddingVertical: 14, paddingHorizontal: 8 },
    statRule: { borderLeftWidth: 1, borderLeftColor: line },
    statTop: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 6,
    },
    statValue: {
      fontSize: 17,
      fontWeight: '800' as const,
      color: ink,
      marginTop: 6,
      textAlign: 'center' as const,
    },
    statLabel: { fontSize: 12, color: sub, flexShrink: 1 },
    // section cards
    card: {
      marginTop: 14,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 6,
      borderRadius: 22,
      backgroundColor: t.isDark ? t.surface : '#FFFFFF',
      borderWidth: 1,
      borderColor: line,
    },
    cardHead: {
      flexDirection: 'row' as const,
      alignItems: 'baseline' as const,
      gap: 8,
      marginBottom: 4,
    },
    cardTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700' as const,
      color: ink,
    },
    cardCount: { fontSize: 13.5, fontWeight: '600' as const, color: faint },
    cardLink: {
      fontSize: 13.5,
      fontWeight: '700' as const,
      color: t.isDark ? '#A8C7FA' : BLUE,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 10,
    },
    divider: { height: 1, backgroundColor: line, marginLeft: 56 },
    rowIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    date: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: t.isDark ? 'rgba(168,199,250,0.14)' : '#EEF3FF',
    },
    dateDay: {
      fontSize: 15,
      lineHeight: 17,
      fontWeight: '800' as const,
      color: t.isDark ? '#A8C7FA' : BLUE,
    },
    dateMonth: {
      fontSize: 9.5,
      fontWeight: '700' as const,
      color: t.isDark ? '#A8C7FA' : BLUE,
      textTransform: 'uppercase' as const,
    },
    rowTitle: { fontSize: 15, fontWeight: '600' as const, color: ink },
    rowSub: { fontSize: 12.5, color: sub, marginTop: 2 },
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      maxWidth: 140,
    },
    pillDot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { fontSize: 12.5, fontWeight: '600' as const },
    empty: { fontSize: 14, color: sub, paddingTop: 4, paddingBottom: 12 },
    primary: {
      marginLeft: 6,
      paddingHorizontal: 8,
      paddingVertical: 1,
      borderRadius: 999,
      backgroundColor: TONE.blue.bg,
    },
    primaryText: { fontSize: 10.5, fontWeight: '700' as const, color: BLUE },
    contactBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    avatarText: { color: '#FFFFFF', fontWeight: '700' as const },
    doneBadge: {
      position: 'absolute' as const,
      right: -2,
      bottom: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: t.isDark ? t.surface : '#FFFFFF',
    },
    loading: { padding: 16, gap: 14 },
  };
};

/** Status: a small coloured dot and coloured text (no background). */
function Pill({
  label,
  tone,
}: {
  label: string;
  tone: { fg: string; bg: string };
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.pillText, { color: tone.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Section({
  title,
  count,
  link,
  children,
}: {
  title: string;
  count?: number;
  link?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>
          {title}
          {count != null && count > 0 ? (
            <Text style={styles.cardCount}>{`  ${count}`}</Text>
          ) : null}
        </Text>
        {!!link && (
          <Pressable
            onPress={link.onPress}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.cardLink}>{link.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/** Rows separated by a hairline divider. */
function Rows({ children }: { children: React.ReactNode[] }) {
  const { styles } = useCrmStyles(factory);
  return (
    <>
      {children.map((c, i) => (
        <View key={i}>
          {i > 0 && <View style={styles.divider} />}
          {c}
        </View>
      ))}
    </>
  );
}

function DateBadge({ date }: { date: string }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.date}>
      <Text style={styles.dateDay}>{formatDate(date, { day: '2-digit' })}</Text>
      <Text style={styles.dateMonth}>
        {formatDate(date, { month: 'short' })}
      </Text>
    </View>
  );
}

export function ClientOutletDetailScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { params } =
    useRoute<RouteProp<ClientStackParamList, 'ClientOutletDetail'>>();
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
            <CrmSkeleton height={230} radius={28} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[0, 1, 2].map(i => (
                <CrmSkeleton
                  key={i}
                  height={96}
                  radius={20}
                  style={styles.flex1}
                />
              ))}
            </View>
            <CrmSkeleton height={190} radius={22} />
            <CrmSkeleton height={140} radius={22} />
          </View>
        ) : (
          <View style={styles.loading}>
            <CrmErrorBanner
              message={error || 'Could not load this outlet'}
              onRetry={load}
            />
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
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          outlet.address,
        )}`
      : null;
  const blue = theme.isDark ? '#A8C7FA' : BLUE;

  const actions: {
    key: string;
    label: string;
    Art: ArtType;
    disabled?: boolean;
    onPress: () => void;
  }[] = [
    {
      key: 'map',
      label: 'Directions',
      Art: MapPinArt,
      disabled: !mapsUrl,
      onPress: () => mapsUrl && Linking.openURL(mapsUrl),
    },
    {
      key: 'request',
      label: 'Request',
      Art: BookServiceArt,
      onPress: () =>
        navigation.navigate('ClientRequestService', { siteId: outlet.id }),
    },
    {
      key: 'complaint',
      label: 'Complaint',
      Art: ComplaintArt,
      onPress: () =>
        navigation.navigate('ClientNewComplaint', { siteId: outlet.id }),
    },
    ...(outlets.length > 1
      ? [
          {
            key: 'focus',
            label: 'Dashboard',
            Art: JobsArt,
            onPress: () => {
              setOutletId(outlet.id);
              navigation.navigate('ClientHome');
            },
          },
        ]
      : []),
  ];

  const dm = (d: string) => formatDate(d, { day: 'numeric', month: 'short' });
  const cells: {
    label: string;
    value: string;
    Icon: IconType;
    tone: Tone;
    strong?: boolean;
  }[] = [
    {
      label: 'Active jobs',
      value: String(stats.active_jobs),
      Icon: BriefcaseIcon,
      tone: 'blue',
    },
    {
      label: 'Services done',
      value: String(stats.visits_done),
      Icon: CheckCircleIcon,
      tone: 'green',
    },
    {
      label: 'Open issues',
      value:
        stats.open_complaints > 0 ? String(stats.open_complaints) : 'All clear',
      Icon: AlertTriangleIcon,
      tone: stats.open_complaints > 0 ? 'amber' : 'green',
      strong: stats.open_complaints > 0,
    },
    {
      label: 'Next visit',
      value: stats.next_visit ? dm(stats.next_visit) : 'Not booked',
      Icon: CalendarIcon,
      tone: 'violet',
    },
    {
      label: 'Last visit',
      value: stats.last_visit ? dm(stats.last_visit) : 'None yet',
      Icon: ClockIcon,
      tone: 'teal',
    },
    {
      label: 'Audit risk',
      value: risk ? risk.label : 'No audit',
      Icon: ShieldIcon,
      tone: risk ? STATUS_TO_TONE[risk.tone] || 'slate' : 'slate',
      strong: !!risk,
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

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.blobA} pointerEvents="none" />
          <View style={styles.blobB} pointerEvents="none" />
          <View style={styles.heroArt}>
            <OutletArt size={56} />
          </View>
          <Text style={styles.name}>{outlet.name || outlet.id}</Text>
          <Text style={styles.addr} numberOfLines={2}>
            {outlet.formatted_address || outlet.address || 'No address on file'}
          </Text>
          {!!outlet.branch_name && (
            <View style={styles.branch}>
              <Text style={styles.branchText}>
                Served by BestServe {outlet.branch_name}
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {actions.map(a => (
            <Pressable
              key={a.key}
              onPress={a.onPress}
              disabled={a.disabled}
              style={({ pressed }) => [
                styles.action,
                a.disabled && styles.actionOff,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ disabled: !!a.disabled }}
            >
              <View style={styles.actionArt}>
                <a.Art size={34} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Overview: 3 x 2 stats, hairline grid */}
        <View style={styles.overview}>
          <Text style={styles.overviewTitle}>Overview</Text>
          {[cells.slice(0, 3), cells.slice(3)].map((row, r) => (
            <View key={r}>
              {r > 0 && <View style={styles.statRowRule} />}
              <View style={styles.statRow}>
                {row.map((c, i) => (
                  <View
                    key={c.label}
                    style={[styles.stat, i > 0 && styles.statRule]}
                    accessibilityLabel={`${c.label}: ${c.value}`}
                  >
                    <View style={styles.statTop}>
                      <c.Icon size={14} color={TONE[c.tone].fg} />
                      <Text style={styles.statLabel} numberOfLines={1}>
                        {c.label}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.statValue,
                        c.strong ? { color: TONE[c.tone].fg } : null,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {c.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Services */}
        {data.services.length > 0 && (
          <Section title="Services here" count={data.services.length}>
            <Rows>
              {data.services.map(s => {
                const svc = serviceIcon(s.service_type);
                return (
                  <View key={String(s.service_type)} style={styles.row}>
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255,255,255,0.08)'
                            : TONE.blue.bg,
                        },
                      ]}
                    >
                      <svc.Icon size={19} color={blue} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle}>
                        {serviceLabel(s.service_type)}
                      </Text>
                      <Text style={styles.rowSub}>
                        {s.jobs} job{s.jobs === 1 ? '' : 's'}
                        {s.last_done ? ` · last done ${dm(s.last_done)}` : ''}
                      </Text>
                    </View>
                    {!!s.next_due && (
                      <Pill
                        label={`Next ${relativeDay(s.next_due).toLowerCase()}`}
                        tone={TONE.violet}
                      />
                    )}
                  </View>
                );
              })}
            </Rows>
          </Section>
        )}

        {/* Upcoming visits */}
        <Section title="Upcoming visits" count={data.upcoming_visits.length}>
          {data.upcoming_visits.length === 0 ? (
            <Text style={styles.empty}>No visits scheduled.</Text>
          ) : (
            <Rows>
              {data.upcoming_visits.map(v => (
                <Pressable
                  key={v.id}
                  onPress={() =>
                    navigation.navigate('ClientJobDetail', { jobId: v.job_id })
                  }
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <DateBadge date={v.scheduled_date} />
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle}>
                      {serviceLabel(v.service_type)}
                    </Text>
                    <Text style={styles.rowSub}>
                      {v.visit_number ? `Visit ${v.visit_number} · ` : ''}#
                      {v.job_code || '—'}
                    </Text>
                  </View>
                  <Pill
                    label={relativeDay(v.scheduled_date)}
                    tone={TONE.blue}
                  />
                </Pressable>
              ))}
            </Rows>
          )}
        </Section>

        {/* Complaints */}
        <Section title="Complaints" count={data.complaints.length}>
          {data.complaints.length === 0 ? (
            <Text style={styles.empty}>
              No complaints raised for this outlet.
            </Text>
          ) : (
            <Rows>
              {data.complaints.map(c => {
                const stage = stageOf(c.status);
                const open =
                  stage === 'OPEN' ||
                  stage === 'IN_PROGRESS' ||
                  stage === 'VISIT_SCHEDULED';
                const tone = STAGE_TONE[stage];
                return (
                  <Pressable
                    key={c.id}
                    onPress={() =>
                      navigation.navigate('ClientComplaintDetail', {
                        complaintId: c.id,
                      })
                    }
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255,255,255,0.08)'
                            : '#FFF5E8',
                        },
                      ]}
                    >
                      <ComplaintArt size={30} />
                      {!open && (
                        <View style={styles.doneBadge}>
                          <CheckCircleIcon size={14} color="#188038" />
                        </View>
                      )}
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {c.subject}
                      </Text>
                      <Text style={styles.rowSub}>
                        {formatDate(c.created_at, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                    <Pill label={stageLabel(stage)} tone={tone} />
                  </Pressable>
                );
              })}
            </Rows>
          )}
        </Section>

        {/* Recent visits */}
        {data.recent_visits.length > 0 && (
          <Section title="Recent visits" count={data.recent_visits.length}>
            <Rows>
              {data.recent_visits.map(v => {
                const st = statusInfo(v.status);
                return (
                  <Pressable
                    key={v.id}
                    onPress={() =>
                      navigation.navigate('ClientJobDetail', {
                        jobId: v.job_id,
                      })
                    }
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                  >
                    <DateBadge date={v.completed_at || v.scheduled_date} />
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle}>
                        {serviceLabel(v.service_type)}
                      </Text>
                      <Text style={styles.rowSub}>#{v.job_code || '—'}</Text>
                    </View>
                    <Pill
                      label={st.label}
                      tone={TONE[STATUS_TO_TONE[st.tone] || 'slate']}
                    />
                  </Pressable>
                );
              })}
            </Rows>
          </Section>
        )}

        {/* Audits */}
        {data.audits.length > 0 && (
          <Section
            title="Audits"
            count={data.audits.length}
            link={{
              label: 'See all',
              onPress: () => navigation.navigate('ClientAudits'),
            }}
          >
            <Rows>
              {data.audits.map(a => {
                const r = RISK_STYLE[String(a.risk || '').toUpperCase()];
                return (
                  <View key={a.id} style={styles.row}>
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255,255,255,0.08)'
                            : TONE.green.bg,
                        },
                      ]}
                    >
                      <ShieldIcon size={19} color={TONE.green.fg} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle}>
                        {a.audit_number || 'Audit'}
                      </Text>
                      <Text style={styles.rowSub}>
                        {formatDate(a.audit_date, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {a.audit_type ? ` · ${a.audit_type}` : ''}
                      </Text>
                    </View>
                    {!!r && (
                      <Pill
                        label={`${r.label} risk`}
                        tone={TONE[STATUS_TO_TONE[r.tone] || 'slate']}
                      />
                    )}
                  </View>
                );
              })}
            </Rows>
          </Section>
        )}

        {/* Contacts */}
        {data.contacts.length > 0 && (
          <Section title="Your contacts here" count={data.contacts.length}>
            <Rows>
              {data.contacts.map(c => (
                <View key={c.id} style={styles.row}>
                  <View
                    style={[
                      styles.rowIcon,
                      { backgroundColor: avatarColor(c.id) },
                    ]}
                  >
                    <Text style={styles.avatarText}>{initials(c.name)}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Text
                        style={[styles.rowTitle, { flexShrink: 1 }]}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      {c.is_primary && (
                        <View style={styles.primary}>
                          <Text style={styles.primaryText}>Primary</Text>
                        </View>
                      )}
                    </View>
                    {!!(c.role || c.phone) && (
                      <Text style={styles.rowSub}>
                        {[c.role, c.phone].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                  {!!c.phone && (
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${c.phone}`)}
                      style={({ pressed }) => [
                        styles.contactBtn,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255,255,255,0.08)'
                            : TONE.green.bg,
                        },
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${c.name}`}
                    >
                      <PhoneIcon size={17} color={TONE.green.fg} />
                    </Pressable>
                  )}
                  {!!c.email && (
                    <Pressable
                      onPress={() => Linking.openURL(`mailto:${c.email}`)}
                      style={({ pressed }) => [
                        styles.contactBtn,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255,255,255,0.08)'
                            : TONE.blue.bg,
                        },
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Email ${c.name}`}
                    >
                      <EmailIcon size={17} color={blue} />
                    </Pressable>
                  )}
                </View>
              ))}
            </Rows>
          </Section>
        )}

        {/* Recent jobs */}
        {data.recent_jobs.length > 0 && (
          <Section title="Recent jobs" count={data.recent_jobs.length}>
            <Rows>
              {data.recent_jobs.map(j => {
                const st = statusInfo(j.status);
                const svc = serviceIcon(j.service_type);
                return (
                  <Pressable
                    key={j.id}
                    onPress={() =>
                      navigation.navigate('ClientJobDetail', { jobId: j.id })
                    }
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255,255,255,0.08)'
                            : TONE.blue.bg,
                        },
                      ]}
                    >
                      <svc.Icon size={19} color={blue} />
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
                    <Pill
                      label={st.label}
                      tone={TONE[STATUS_TO_TONE[st.tone] || 'slate']}
                    />
                    <ChevronRightIcon size={15} color={theme.textMuted} />
                  </Pressable>
                );
              })}
            </Rows>
          </Section>
        )}
      </ScrollView>
    </ClientPage>
  );
}
