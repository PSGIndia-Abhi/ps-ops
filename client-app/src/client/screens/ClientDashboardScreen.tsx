import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { BrandMark } from '../../components/BrandMark';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { ChevronRightIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { shadows, spacing, typography } from '../../theme';
import { getClientDashboard, listDocuments, type ClientDashboard } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { RISK_STYLE, SUPPORT_CONTACT, formatMoney, periodRange } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ICON_DEEP, SearchGlyph } from '../ui/ClientIcons';
import { CompanyMonogram } from '../ui/CompanyMonogram';
import { UserAvatar } from '../ui/UserAvatar';
import { AuditArt, BookServiceArt, HomeHeroArt, ComplaintArt, DocumentsArt, JobsArt, OutletArt, SupportArt, VisitsArt } from '../ui/IllustratedIcons';
import { OutletSheet } from '../ui/OutletPicker';
import { PAGE_BG, TONES } from '../ui/page';
import { HomeBento } from '../ui/HomeBento';
import { BentoSkeleton } from '../ui/skeletons';

type Nav = NavigationProp<ClientStackParamList>;
type Art = React.ComponentType<{ size?: number }>;

/** Hero colours: top, bottom, and a soft lavender glow (light and dark). */
const HERO = {
  light: ['#C9DCFF', '#EEF3FF', '#E4D9FF'],
  dark: ['#1B2B4A', '#121B2E', '#2A2350'],
} as const;
/** Height of the curved edge at the bottom of the hero. */
const HERO_CURVE = 26;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: PAGE_BG(t) },
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  statusStrip: { position: 'absolute' as const, top: 0, left: 0, right: 0, zIndex: 2 },

  // Hero
  hero: { paddingBottom: spacing.xs + HERO_CURVE },
  heroBg: { position: 'absolute' as const, top: 0, left: 0 },
  topRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  search: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 18,
    backgroundColor: t.isDark ? t.surface : '#FFFFFF',
    ...shadows.card,
  },
  searchText: { ...typography.body, fontSize: 16, color: t.textMuted, flex: 1 },
  tileRing: { borderRadius: 999, borderWidth: 2.5, borderColor: t.isDark ? t.surface : '#FFFFFF', overflow: 'hidden' as const },
  banner: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, paddingLeft: spacing.lg, paddingRight: spacing.sm, marginTop: spacing.xl },
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, alignSelf: 'flex-start' as const, paddingLeft: 6, paddingRight: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)' },
  brandText: { ...typography.captionMedium, fontSize: 12, color: t.textSecondary },
  company: { fontSize: 25, lineHeight: 31, fontWeight: '800' as const, color: t.textPrimary, marginTop: 6 },
  outlet: { ...typography.body, fontSize: 15, color: t.textSecondary, flexShrink: 1 },
  outletRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginTop: 4 },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginTop: spacing.md, alignSelf: 'flex-start' as const },
  linkText: { fontSize: 16, fontWeight: '600' as const, color: t.isDark ? '#8AB4F8' : ICON_DEEP },
  linkCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.isDark ? '#8AB4F8' : ICON_DEEP, alignItems: 'center' as const, justifyContent: 'center' as const },

  // Actions
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, paddingHorizontal: spacing.sm, marginTop: spacing.lg },
  action: { width: '25%' as const, alignItems: 'center' as const, paddingVertical: spacing.sm },
  artTile: { width: 66, height: 66, borderRadius: 33, backgroundColor: t.isDark ? 'rgba(138,180,248,0.12)' : '#EEF3FD', alignItems: 'center' as const, justifyContent: 'center' as const },
  actionLabel: { ...typography.body, fontSize: 13.5, lineHeight: 17, color: t.textPrimary, marginTop: 8, textAlign: 'center' as const },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.md },
  sectionTitle: { ...typography.subtitle, fontSize: 19, color: t.textPrimary, flex: 1 },
  seeAll: { ...typography.captionMedium, fontSize: 14, color: t.isDark ? '#8AB4F8' : ICON_DEEP, paddingVertical: 4 },

  // Outlets row
  people: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  person: { width: 72, alignItems: 'center' as const },
  personCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center' as const, justifyContent: 'center' as const },
  personRing: { borderWidth: 3, borderColor: ICON_DEEP },
  personText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 20 },
  personDot: { position: 'absolute' as const, right: 1, top: 1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF' },
  personName: { ...typography.caption, fontSize: 12.5, color: t.textPrimary, marginTop: 6, textAlign: 'center' as const },

  footer: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, marginTop: spacing.xxl },
  footerText: { ...typography.caption, color: t.textMuted },
});

export function ClientDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const { portal, outlets, outletId, setOutletId, outletName, companyName } = useClientPortal();

  const [outletSheet, setOutletSheet] = useState(false);
  // Home always covers the last 30 days (the "Service health" card with its period picker was removed).
  const range = useMemo(() => periodRange('30d'), []);

  const [data, setData] = useState<ClientDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [heroSize, setHeroSize] = useState<{ w: number; h: number } | null>(null);
  const [expiring, setExpiring] = useState<number | null>(null);

  // Certificates expiring within 30 days (the documents API counts them); best effort.
  useEffect(() => {
    let alive = true;
    listDocuments({ kind: 'shared', siteId: outletId || undefined })
      .then((body) => alive && setExpiring(body.expiring_soon ?? 0))
      .catch(() => alive && setExpiring(null));
    return () => {
      alive = false;
    };
  }, [outletId, reloadKey]);

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
  const multi = outlets.length > 1;
  const single = outlets[0];
  const firstLoad = loading && !data;
  const heroColors = theme.isDark ? HERO.dark : HERO.light;
  // Worst audit risk across the outlets in view.
  const RISK_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const risks = (data?.outlets || [])
    .filter((o) => !outletId || o.id === outletId)
    .map((o) => String(o.audit_risk || '').toUpperCase())
    .filter((r) => RISK_ORDER.includes(r));
  const worst = risks.sort((x, y) => RISK_ORDER.indexOf(x) - RISK_ORDER.indexOf(y))[0];
  const auditRisk = worst ? RISK_STYLE[worst]?.label || null : null;

  const outletTitle = multi ? (outletId ? outletName(outletId) : `All ${outlets.length} outlets`) : [single?.name, single?.city].filter(Boolean).join(', ') || 'Your outlet';
  const openOutlet = () => (multi ? setOutletSheet(true) : single ? navigation.navigate('ClientOutletDetail', { siteId: single.id }) : navigation.navigate('ClientOutlets'));

  const actions: { key: string; label: string; Icon: Art; onPress: () => void }[] = [
    { key: 'request', label: 'Book a\nservice', Icon: BookServiceArt, onPress: () => navigation.navigate('ClientRequestService') },
    { key: 'complaint', label: 'Complaints', Icon: ComplaintArt, onPress: () => navigation.navigate('Complaints') },
    { key: 'jobs', label: 'Jobs', Icon: JobsArt, onPress: () => navigation.navigate('Jobs') },
    { key: 'docs', label: 'Documents', Icon: DocumentsArt, onPress: () => navigation.navigate('ClientDocuments') },
    { key: 'audits', label: 'Audit\nreports', Icon: AuditArt, onPress: () => navigation.navigate('ClientAudits') },
    { key: 'outlets', label: 'Outlets', Icon: OutletArt, onPress: () => navigation.navigate('ClientOutlets') },
    { key: 'visits', label: 'Visits', Icon: VisitsArt, onPress: () => navigation.navigate('Jobs') },
    { key: 'support', label: 'Support', Icon: SupportArt, onPress: () => Linking.openURL(`tel:${SUPPORT_CONTACT.phone}`) },
  ];


  return (
    <View style={styles.screen}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      {/* Status bar strip in the hero's top colour, so scrolled content never runs under the clock */}
      <View style={[styles.statusStrip, { height: insets.top, backgroundColor: heroColors[0] }]} />

      <ScrollView
        style={{ marginTop: insets.top }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 48) + spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={brandRefreshControl(refreshing, onRefresh)}
      >
        {/* Hero: search, company, illustration */}
        <View style={styles.hero} onLayout={(e) => setHeroSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {!!heroSize && (
            <Svg style={styles.heroBg} width={heroSize.w} height={heroSize.h} pointerEvents="none">
              <Defs>
                <LinearGradient id="homeHero" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={heroColors[0]} stopOpacity="1" />
                  <Stop offset="1" stopColor={heroColors[1]} stopOpacity="1" />
                </LinearGradient>
                <RadialGradient id="homeGlow" cx="0.85" cy="0.78" r="0.55">
                  <Stop offset="0" stopColor={heroColors[2]} stopOpacity="0.9" />
                  <Stop offset="1" stopColor={heroColors[2]} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              {/* The hero, with a gentle curve into the white page at the bottom. */}
              <Path
                d={`M0 0 H${heroSize.w} V${heroSize.h - HERO_CURVE} Q${heroSize.w * 0.5} ${heroSize.h + HERO_CURVE * 0.6} 0 ${heroSize.h - HERO_CURVE} Z`}
                fill="url(#homeHero)"
              />
              <Path
                d={`M0 0 H${heroSize.w} V${heroSize.h - HERO_CURVE} Q${heroSize.w * 0.5} ${heroSize.h + HERO_CURVE * 0.6} 0 ${heroSize.h - HERO_CURVE} Z`}
                fill="url(#homeGlow)"
              />
              {/* soft decorative bubbles and rings */}
              <Circle cx={heroSize.w * 0.95} cy={heroSize.h * 0.5} r={64} fill="#FFFFFF" fillOpacity={theme.isDark ? 0.03 : 0.22} />
              <Circle cx={heroSize.w * 0.95} cy={heroSize.h * 0.5} r={96} fill="none" stroke="#FFFFFF" strokeOpacity={theme.isDark ? 0.05 : 0.35} strokeWidth={1.2} />
              <Circle cx={heroSize.w * 0.06} cy={heroSize.h * 0.62} r={34} fill="#FFFFFF" fillOpacity={theme.isDark ? 0.03 : 0.18} />
            </Svg>
          )}
          <RefreshBanner refreshing={refreshing} />

          <View style={styles.topRow}>
            <Pressable onPress={() => navigation.navigate('ClientSearch')} style={({ pressed }) => [styles.search, pressed && styles.pressed]} accessibilityRole="search" accessibilityLabel="Search jobs, complaints and documents">
              <SearchGlyph size={22} color={theme.textPrimary} />
              <Text style={styles.searchText} numberOfLines={1}>
                Search jobs, documents
              </Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ClientProfile')} style={({ pressed }) => [styles.tileRing, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Profile">
              <UserAvatar size={46} fallback={<CompanyMonogram name={companyName} colorKey={portal?.companies?.[0]?.id} size={46} style={{ borderRadius: 23 }} />} />
            </Pressable>
          </View>

          <View style={styles.banner}>
            <View style={[styles.flex1, { paddingBottom: spacing.sm }]}>
              <View style={styles.brandRow}>
                <BrandMark size={18} />
                <Text style={styles.brandText}>Serviced by BestServe</Text>
              </View>
              <Text style={styles.company} numberOfLines={2}>
                {companyName}
              </Text>
              <View style={styles.outletRow}>
                <PinIcon size={15} color={theme.isDark ? '#A8C7FA' : ICON_DEEP} />
                <Text style={styles.outlet} numberOfLines={1}>
                  {outletTitle}
                </Text>
              </View>
              <Pressable onPress={openOutlet} style={({ pressed }) => [styles.link, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.linkText}>{multi ? 'Change outlet' : 'View outlet'}</Text>
                <View style={styles.linkCircle}>
                  <ChevronRightIcon size={17} color={theme.isDark ? '#0B1220' : '#FFFFFF'} />
                </View>
              </Pressable>
            </View>
            <HomeHeroArt width={146} height={118} />
          </View>
        </View>

        {/* Quick actions - BestServe illustrated icons on soft circles */}
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a.key} onPress={a.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={a.label.replace('\n', ' ')}>
              <View style={styles.artTile}>
                <a.Icon size={50} />
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

        {/* Overview - bento grid */}
        <View style={styles.section}>
          {firstLoad ? (
            <BentoSkeleton withHealth={false} />
          ) : k ? (
            <HomeBento
              nextVisit={nextVisit}
              openComplaints={k.open_complaints}
              pendingInvoices={k.pending_invoices}
              pendingAmountText={formatMoney(k.pending_amount)}
              expiring={expiring}
              auditRisk={auditRisk}
              onOpenJob={(jobId) => navigation.navigate('ClientJobDetail', { jobId })}
              onBook={() => navigation.navigate('ClientRequestService')}
              onComplaints={() => navigation.navigate('Complaints')}
              onDocuments={() => navigation.navigate('ClientDocuments')}
              onAudits={() => navigation.navigate('ClientAudits')}
            />
          ) : null}
        </View>

        {/* Outlets row (company heads with several outlets) */}
        {data && data.outlets.length > 1 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Your outlets</Text>
              <Pressable onPress={() => navigation.navigate('ClientOutlets')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people} style={{ marginHorizontal: -spacing.lg }}>
              {data.outlets.map((o) => {
                const active = outletId === o.id;
                const risk = RISK_STYLE[String(o.audit_risk || '').toUpperCase()];
                const dot = o.open_complaints > 0 ? TONES.amber.fg : risk?.tone === 'danger' ? '#D93025' : null;
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
          </View>
        )}

        <View style={styles.footer}>
          <BrandMark size={16} />
          <Text style={styles.footerText}>Serviced by BestServe</Text>
        </View>
      </ScrollView>

      <OutletSheet visible={outletSheet} onClose={() => setOutletSheet(false)} outlets={outlets} value={outletId} onChange={setOutletId} />
    </View>
  );
}

