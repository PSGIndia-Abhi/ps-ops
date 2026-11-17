import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentIcon,
  InboxIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  ShieldIcon,
  SparkleIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { ActionSheet, DateSheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { getClientDashboard, type ClientDashboard } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { PERIODS, RISK_STYLE, SUPPORT_CONTACT, formatDate, formatDateTime, periodRange, relativeDay, serviceLabel, type PeriodKey } from '../format';
import type { ClientStackParamList, ClientTabParamList } from '../navigation';
import { OutletSheet } from '../ui/OutletPicker';

type Nav = NavigationProp<ClientTabParamList & ClientStackParamList>;
type IconType = React.ComponentType<{ size?: number; color?: string }>;

/** Google-style tonal pairs: soft circle + strong icon colour. */
const TONES = {
  blue: { bg: '#E8F0FE', fg: '#1A73E8' },
  amber: { bg: '#FEF3C7', fg: '#D97706' },
  violet: { bg: '#F3E8FF', fg: '#7C3AED' },
  green: { bg: '#DCFCE7', fg: '#16A34A' },
  teal: { bg: '#CCFBF1', fg: '#0D9488' },
  rose: { bg: '#FFE4E6', fg: '#E11D48' },
  indigo: { bg: '#E0E7FF', fg: '#4F46E5' },
  orange: { bg: '#FFEDD5', fg: '#EA580C' },
} as const;

function activityText(message = '') {
  const m = /status changed from\s+(\w+)\s+to\s+(\w+)/i.exec(message);
  if (!m) return message;
  const label = ({ COMPLETED: 'Completed', IN_PROGRESS: 'In progress', NOT_STARTED: 'Scheduled' } as Record<string, string>)[m[2].toUpperCase()] || m[2];
  return `Status changed to ${label}`;
}

function activityMeta(message: string): { Icon: IconType; tone: keyof typeof TONES } {
  const m = message.toLowerCase();
  if (m.includes('photo')) return { Icon: CameraIcon, tone: 'violet' };
  if (m.includes('complaint')) return { Icon: AlertTriangleIcon, tone: 'amber' };
  if (m.includes('completed')) return { Icon: CheckCircleIcon, tone: 'green' };
  if (m.includes('status')) return { Icon: ClockIcon, tone: 'blue' };
  return { Icon: SparkleIcon, tone: 'teal' };
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.isDark ? t.background : '#FFFFFF' },
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  // Fixed header
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  logo: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? '#FFFFFF' : 'transparent' },
  headerText: { flex: 1 },
  company: { ...typography.subtitle, fontSize: 17, color: t.textPrimary },
  greeting: { ...typography.caption, color: t.textMuted },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 15 },
  content: { paddingBottom: spacing.xxxl },
  // Search-like outlet bar
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderRadius: 28,
    backgroundColor: t.isDark ? t.surfaceAlt : '#F1F3F4',
  },
  barTitle: { ...typography.bodyMedium, color: t.textPrimary },
  barSub: { ...typography.caption, color: t.textMuted },
  barCaret: { transform: [{ rotate: '90deg' }] },
  // Round actions
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, paddingHorizontal: spacing.sm, marginTop: spacing.lg },
  action: { width: '25%' as const, alignItems: 'center' as const, paddingVertical: spacing.sm },
  actionCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center' as const, justifyContent: 'center' as const },
  actionLabel: { ...typography.caption, fontSize: 12.5, color: t.textPrimary, marginTop: 8, textAlign: 'center' as const },
  // Sections
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.sm },
  sectionTitle: { ...typography.subtitle, fontSize: 18, color: t.textPrimary, flex: 1 },
  sectionLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, paddingVertical: 4 },
  sectionLinkText: { ...typography.captionMedium, fontSize: 13.5, color: t.primary },
  rule: { height: 8, backgroundColor: t.isDark ? t.surfaceAlt : '#F6F7F9', marginTop: spacing.xl },
  // Next visit
  next: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  nextDate: { width: 54, height: 58, borderRadius: 14, backgroundColor: TONES.blue.bg, alignItems: 'center' as const, justifyContent: 'center' as const },
  nextDay: { fontSize: 21, lineHeight: 24, fontWeight: '800' as const, color: TONES.blue.fg },
  nextMonth: { fontSize: 11, fontWeight: '700' as const, color: TONES.blue.fg, textTransform: 'uppercase' as const },
  nextLabel: { ...typography.overline, fontSize: 10, color: t.textMuted },
  nextTitle: { ...typography.bodyMedium, fontSize: 16, color: t.textPrimary, marginTop: 1 },
  nextSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  nextWhen: { ...typography.captionMedium, color: TONES.blue.fg },
  // Stats
  periodLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: t.isDark ? t.surfaceAlt : '#F1F3F4' },
  periodText: { ...typography.captionMedium, fontSize: 12.5, color: t.textPrimary },
  stats: { flexDirection: 'row' as const, borderRadius: 20, borderWidth: 1, borderColor: t.border, paddingVertical: spacing.md },
  stat: { flex: 1, alignItems: 'center' as const },
  statDivider: { width: 1, backgroundColor: t.border, marginVertical: 4 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const, color: t.textPrimary },
  statLabel: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  health: { marginTop: spacing.md },
  healthRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8 },
  healthLabel: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  healthValue: { ...typography.bodyMedium, color: TONES.green.fg },
  track: { height: 8, borderRadius: 4, backgroundColor: t.isDark ? t.surfaceAlt : '#EEF0F3', flexDirection: 'row' as const, overflow: 'hidden' as const },
  healthNote: { ...typography.caption, color: t.textMuted, marginTop: 8 },
  // People-style outlet row
  people: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  person: { width: 68, alignItems: 'center' as const },
  personCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center' as const, justifyContent: 'center' as const },
  personRing: { borderWidth: 2.5, borderColor: t.primary },
  personText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 18 },
  personDot: { position: 'absolute' as const, right: 1, top: 1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF' },
  personName: { ...typography.caption, fontSize: 12, color: t.textPrimary, marginTop: 6, textAlign: 'center' as const },
  // Lists
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.sm + 2 },
  rowIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowDate: { width: 44, height: 44, borderRadius: 22, backgroundColor: TONES.blue.bg, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowDateDay: { fontSize: 15, lineHeight: 17, fontWeight: '800' as const, color: TONES.blue.fg },
  rowDateMonth: { fontSize: 9, fontWeight: '700' as const, color: TONES.blue.fg, textTransform: 'uppercase' as const },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  rowRight: { ...typography.caption, color: t.textMuted },
  empty: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.sm },
  emptyText: { ...typography.body, color: t.textMuted, flex: 1 },
  footer: { alignItems: 'center' as const, marginTop: spacing.xxl, gap: 4 },
  footerText: { ...typography.caption, color: t.textMuted },
});

export function ClientDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const { portal, outlets, outletId, setOutletId, outletName, companyName } = useClientPortal();

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [custom, setCustom] = useState(() => periodRange('30d'));
  const [periodSheet, setPeriodSheet] = useState(false);
  const [outletSheet, setOutletSheet] = useState(false);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  const [data, setData] = useState<ClientDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getClientDashboard({ from: range.from, to: range.to, siteId: outletId || undefined })
      .then((body) => {
        if (!alive) return;
        setData(body);
        setError(null);
      })
      .catch((err: Error) => alive && setError(err.message || 'Failed to load your dashboard'))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to, outletId, reloadKey]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((n) => n + 1);
  }, []);

  const k = data?.kpis;
  const nextVisit = data?.upcoming_visits?.[0];
  const userName = portal?.user?.name || '';
  const first = userName.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const periodLabel =
    period === 'custom'
      ? `${formatDate(range.from, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, { day: 'numeric', month: 'short' })}`
      : PERIODS.find((p) => p.key === period)?.label || '';
  const multi = outlets.length > 1;
  const single = outlets[0];

  const openJob = (jobId: string) => navigation.navigate('ClientJobDetail', { jobId });

  const actions: { key: string; label: string; Icon: IconType; tone: keyof typeof TONES; onPress: () => void }[] = [
    { key: 'request', label: 'Request', Icon: PlusIcon, tone: 'blue', onPress: () => navigation.navigate('ClientRequestService') },
    { key: 'complaint', label: 'Complaint', Icon: AlertTriangleIcon, tone: 'amber', onPress: () => navigation.navigate('Complaints') },
    { key: 'jobs', label: 'Jobs', Icon: BriefcaseIcon, tone: 'indigo', onPress: () => navigation.navigate('Jobs') },
    { key: 'docs', label: 'Documents', Icon: DocumentIcon, tone: 'violet', onPress: () => navigation.navigate('ClientDocuments') },
    { key: 'audits', label: 'Audits', Icon: ShieldIcon, tone: 'green', onPress: () => navigation.navigate('ClientAudits') },
    { key: 'outlets', label: 'Outlets', Icon: PinIcon, tone: 'teal', onPress: () => navigation.navigate('ClientOutlets') },
    { key: 'calendar', label: 'Visits', Icon: CalendarIcon, tone: 'rose', onPress: () => navigation.navigate('Jobs') },
    { key: 'support', label: 'Support', Icon: PhoneIcon, tone: 'orange', onPress: () => Linking.openURL(`tel:${SUPPORT_CONTACT.phone}`) },
  ];

  const finished = (k?.visits_done ?? 0) + (k?.visits_missed ?? 0);
  const rate = k && finished > 0 ? Math.round((k.visits_done / finished) * 100) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Fixed header */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <BrandMark size={30} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.company} numberOfLines={1}>
            {companyName}
          </Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {hello}
            {first ? `, ${first}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('ClientProfile')}
          style={({ pressed }) => [styles.avatar, { backgroundColor: avatarColor(portal?.user?.id ?? userName) }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <Text style={styles.avatarText}>{initials(userName)}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {/* Search-like outlet bar */}
        <Pressable
          onPress={() => (multi ? setOutletSheet(true) : navigation.navigate('ClientOutlets'))}
          style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={multi ? 'Choose outlet' : 'Your outlet'}
        >
          <PinIcon size={20} color={theme.primary} />
          <View style={styles.flex1}>
            <Text style={styles.barTitle} numberOfLines={1}>
              {multi ? (outletId ? outletName(outletId) : 'All outlets') : single?.name || 'Your outlet'}
            </Text>
            <Text style={styles.barSub} numberOfLines={1}>
              {multi ? (outletId ? 'Tap to change outlet' : `${outlets.length} outlets · tap to choose one`) : [single?.address, single?.city].filter(Boolean).join(', ') || 'Outlet details'}
            </Text>
          </View>
          <View style={multi ? styles.barCaret : undefined}>
            <ChevronRightIcon size={18} color={theme.textMuted} />
          </View>
        </Pressable>

        {/* Round actions, two rows of four */}
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a.key} onPress={a.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={a.label}>
              <View style={[styles.actionCircle, { backgroundColor: TONES[a.tone].bg }]}>
                <a.Icon size={24} color={TONES[a.tone].fg} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={2}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {!!error && (
          <View style={styles.section}>
            <CrmErrorBanner message={error} onRetry={() => setReloadKey((n) => n + 1)} />
          </View>
        )}

        {/* Next visit */}
        {loading && !data ? (
          <View style={styles.section}>
            <CrmSkeleton height={84} radius={20} />
          </View>
        ) : nextVisit ? (
          <Pressable onPress={() => openJob(nextVisit.job_id)} style={({ pressed }) => [styles.next, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.nextDate}>
              <Text style={styles.nextDay}>{formatDate(nextVisit.scheduled_date, { day: '2-digit' })}</Text>
              <Text style={styles.nextMonth}>{formatDate(nextVisit.scheduled_date, { month: 'short' })}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.nextLabel}>NEXT VISIT</Text>
              <Text style={styles.nextTitle} numberOfLines={1}>
                {serviceLabel(nextVisit.service_type)}
              </Text>
              <Text style={styles.nextSub} numberOfLines={1}>
                {nextVisit.site_name || '—'}
              </Text>
            </View>
            <Text style={styles.nextWhen}>{relativeDay(nextVisit.scheduled_date)}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => navigation.navigate('ClientRequestService')} style={({ pressed }) => [styles.next, pressed && styles.pressed]} accessibilityRole="button">
            <View style={[styles.nextDate, { backgroundColor: theme.isDark ? theme.surfaceAlt : '#F1F3F4' }]}>
              <CalendarIcon size={22} color={theme.textMuted} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.nextLabel}>NEXT VISIT</Text>
              <Text style={styles.nextTitle}>Nothing scheduled</Text>
              <Text style={styles.nextSub}>Tap to request a service</Text>
            </View>
            <ChevronRightIcon size={18} color={theme.textMuted} />
          </Pressable>
        )}

        <View style={styles.rule} />

        {/* This period at a glance */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>At a glance</Text>
            <Pressable onPress={() => setPeriodSheet(true)} style={({ pressed }) => [styles.periodLink, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Period: ${periodLabel}`}>
              <Text style={styles.periodText}>{periodLabel}</Text>
              <View style={styles.barCaret}>
                <ChevronRightIcon size={13} color={theme.textMuted} />
              </View>
            </Pressable>
          </View>
          {loading && !data ? (
            <CrmSkeleton height={150} radius={20} />
          ) : k ? (
            <>
              <View style={styles.stats}>
                <Pressable style={styles.stat} onPress={() => navigation.navigate('Jobs')} accessibilityRole="button">
                  <Text style={styles.statValue}>{k.jobs_in_period}</Text>
                  <Text style={styles.statLabel}>Jobs</Text>
                </Pressable>
                <View style={styles.statDivider} />
                <Pressable style={styles.stat} onPress={() => navigation.navigate('Jobs')} accessibilityRole="button">
                  <Text style={styles.statValue}>{k.visits_done}</Text>
                  <Text style={styles.statLabel}>Visits done</Text>
                </Pressable>
                <View style={styles.statDivider} />
                <Pressable style={styles.stat} onPress={() => navigation.navigate('Complaints')} accessibilityRole="button">
                  <Text style={[styles.statValue, k.open_complaints > 0 && { color: TONES.amber.fg }]}>{k.open_complaints}</Text>
                  <Text style={styles.statLabel}>Open issues</Text>
                </Pressable>
              </View>
              <View style={styles.health}>
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Visits on schedule</Text>
                  <Text style={styles.healthValue}>{rate != null ? `${rate}%` : '—'}</Text>
                </View>
                <View style={styles.track}>
                  {k.visits_done > 0 && <View style={{ flex: k.visits_done, backgroundColor: TONES.green.fg }} />}
                  {k.visits_missed > 0 && <View style={{ flex: k.visits_missed, backgroundColor: '#EF4444' }} />}
                  {k.upcoming_visits + k.visits_in_progress > 0 && <View style={{ flex: k.upcoming_visits + k.visits_in_progress, backgroundColor: TONES.blue.bg }} />}
                </View>
                <Text style={styles.healthNote}>
                  {k.visits_total > 0
                    ? `${k.visits_done} done · ${k.visits_missed} missed · ${k.upcoming_visits + k.visits_in_progress} still to come`
                    : 'No visits planned in this period'}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Outlets, like Google Pay's People row */}
        {data && data.outlets.length > 1 && (
          <>
            <View style={[styles.section, styles.sectionHead]}>
              <Text style={styles.sectionTitle}>Your outlets</Text>
              <Pressable onPress={() => navigation.navigate('ClientOutlets')} style={styles.sectionLink} hitSlop={8} accessibilityRole="button">
                <Text style={styles.sectionLinkText}>See all</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
              {data.outlets.map((o) => {
                const active = outletId === o.id;
                const risk = RISK_STYLE[String(o.audit_risk || '').toUpperCase()];
                const dot = o.open_complaints > 0 ? TONES.amber.fg : risk?.tone === 'danger' ? '#EF4444' : null;
                return (
                  <Pressable key={o.id} onPress={() => setOutletId(active ? '' : o.id)} style={({ pressed }) => [styles.person, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                    <View style={[styles.personCircle, { backgroundColor: avatarColor(o.id) }, active && styles.personRing]}>
                      <Text style={styles.personText}>{initials(o.name || o.id)}</Text>
                      {!!dot && <View style={[styles.personDot, { backgroundColor: dot }]} />}
                    </View>
                    <Text style={styles.personName} numberOfLines={2}>
                      {o.name || o.id}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Upcoming visits */}
        {data && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Upcoming visits</Text>
              {data.upcoming_visits.length > 0 && (
                <Pressable onPress={() => navigation.navigate('Jobs')} style={styles.sectionLink} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.sectionLinkText}>See all</Text>
                </Pressable>
              )}
            </View>
            {data.upcoming_visits.length === 0 ? (
              <View style={styles.empty}>
                <View style={[styles.rowIcon, { backgroundColor: theme.isDark ? theme.surfaceAlt : '#F1F3F4' }]}>
                  <CalendarIcon size={20} color={theme.textMuted} />
                </View>
                <Text style={styles.emptyText}>New visits show up here as soon as they are planned.</Text>
              </View>
            ) : (
              data.upcoming_visits.slice(0, 4).map((v) => (
                <Pressable key={v.id} onPress={() => openJob(v.job_id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                  <View style={styles.rowDate}>
                    <Text style={styles.rowDateDay}>{formatDate(v.scheduled_date, { day: '2-digit' })}</Text>
                    <Text style={styles.rowDateMonth}>{formatDate(v.scheduled_date, { month: 'short' })}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {serviceLabel(v.service_type)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {v.site_name || '—'}
                    </Text>
                  </View>
                  <Text style={styles.rowRight}>{relativeDay(v.scheduled_date)}</Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* Recent activity */}
        {data && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recent activity</Text>
            </View>
            {data.activity.length === 0 ? (
              <View style={styles.empty}>
                <View style={[styles.rowIcon, { backgroundColor: theme.isDark ? theme.surfaceAlt : '#F1F3F4' }]}>
                  <InboxIcon size={20} color={theme.textMuted} />
                </View>
                <Text style={styles.emptyText}>All quiet. Updates on your jobs will appear here.</Text>
              </View>
            ) : (
              data.activity.slice(0, 5).map((a) => {
                const meta = activityMeta(a.message);
                return (
                  <Pressable key={a.id} onPress={() => openJob(a.job_id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                    <View style={[styles.rowIcon, { backgroundColor: TONES[meta.tone].bg }]}>
                      <meta.Icon size={19} color={TONES[meta.tone].fg} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {activityText(a.message)}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {a.site_name || '—'} · {serviceLabel(a.service_type)}
                      </Text>
                    </View>
                    <Text style={styles.rowRight}>{formatDateTime(a.created_at).split(',')[0]}</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Serviced by BestServe</Text>
        </View>
      </ScrollView>

      <OutletSheet visible={outletSheet} onClose={() => setOutletSheet(false)} outlets={outlets} value={outletId} onChange={setOutletId} />
      <ActionSheet
        visible={periodSheet}
        onClose={() => setPeriodSheet(false)}
        title="Show data for"
        actions={PERIODS.map((p) => ({
          key: p.key,
          label: p.label,
          sub: p.key === 'custom' ? 'Pick your own dates' : undefined,
          selected: period === p.key,
          icon: <CalendarIcon size={18} color={theme.primary} />,
          onPress: () => {
            setPeriodSheet(false);
            if (p.key === 'custom') {
              setCustom(range);
              setPicking('from');
            } else setPeriod(p.key);
          },
        }))}
      />
      <DateSheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'from' ? 'Start date' : 'End date'}
        value={picking === 'from' ? custom.from : custom.to}
        minDate={picking === 'to' ? custom.from : undefined}
        onPick={(date) => {
          if (picking === 'from') {
            setCustom((c) => ({ from: date, to: date > c.to ? date : c.to }));
            setPicking('to');
          } else {
            setCustom((c) => ({ from: c.from, to: date < c.from ? c.from : date }));
            setPeriod('custom');
            setPicking(null);
          }
        }}
      />
    </SafeAreaView>
  );
}
