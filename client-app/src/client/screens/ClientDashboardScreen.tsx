import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
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
import { getClientDashboard, getUnreadNotificationCount, type ClientDashboard } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { RISK_STYLE, SUPPORT_CONTACT, periodRange } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ICON_DEEP, SearchGlyph } from '../ui/ClientIcons';
import { CompanyMonogram } from '../ui/CompanyMonogram';
import { UserAvatar } from '../ui/UserAvatar';
import { AuditArt, BookServiceArt, HomeHeroArt, ComplaintArt, DocumentsArt, JobsArt, OutletArt, SupportArt, VisitsArt } from '../ui/IllustratedIcons';
import { OutletSheet } from '../ui/OutletPicker';
import { PAGE_BG, TONES } from '../ui/page';
import { HomeOverview, HomeOverviewSkeleton } from '../ui/HomeOverview';

type Nav = NavigationProp<ClientStackParamList>;
type Art = React.ComponentType<{ size?: number }>;

/** Hero colours: top, bottom, and a soft lavender glow (light and dark). */
const HERO = {
  light: ['#C9DCFF', '#EEF3FF', '#E4D9FF'],
  dark: ['#1B2B4A', '#121B2E', '#2A2350'],
} as const;
/** Height of the curved edge at the bottom of the hero. */
const HERO_CURVE = 26;

/** Notification bell (line icon). */
function BellGlyph({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.6c.4.4.1 1-.4 1H4.8c-.5 0-.8-.6-.4-1z" fill="none" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="M10 21.2a2.2 2.2 0 0 0 4 0" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** Filter / sliders icon for the search bar. */
function FilterGlyph({ color }: { color: string }) {
  const s = { stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h4M12 12h8" {...s} />
      <Circle cx="16" cy="7" r="2" fill="none" {...s} />
      <Circle cx="8" cy="17" r="2" fill="none" {...s} />
      <Circle cx="10" cy="12" r="2" fill="none" {...s} />
    </Svg>
  );
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: PAGE_BG(t) },
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  statusStrip: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    backgroundColor: PAGE_BG(t),
    borderBottomWidth: 1,
    borderBottomColor: t.isDark ? 'rgba(255,255,255,0.06)' : '#EEF1F6',
    shadowColor: '#0B1230',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  statusFrost: {
    backgroundColor: t.isDark ? 'rgba(18,27,46,0.9)' : 'rgba(244,247,255,0.9)',
    borderBottomWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  statusFade: { position: 'absolute' as const, left: 0, right: 0, bottom: -14 },

  // Hero
  hero: { paddingBottom: spacing.xs + HERO_CURVE },
  heroBg: { position: 'absolute' as const, top: 0, left: 0 },
  topRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  logoDisc: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: '#1A3A7A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  brandName: { fontSize: 22, fontWeight: '800' as const, color: t.isDark ? '#E6E9F2' : '#16224A', letterSpacing: 0.2 },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  bellDot: { position: 'absolute' as const, top: 9, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5484D', borderWidth: 2, borderColor: t.isDark ? '#1B2B4A' : '#D3E3FF' },
  searchRow: { paddingHorizontal: spacing.lg, marginTop: 14 },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    height: 56,
    borderRadius: 28,
    paddingLeft: 18,
    paddingRight: 8,
    backgroundColor: t.isDark ? t.surface : '#FFFFFF',
    ...shadows.card,
  },
  searchText: { ...typography.body, fontSize: 16, color: t.textMuted, flex: 1 },
  filterBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center' as const, justifyContent: 'center' as const },
  tileRing: { borderRadius: 999, borderWidth: 2.5, borderColor: t.isDark ? t.surface : '#FFFFFF', overflow: 'hidden' as const },
  banner: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, paddingLeft: spacing.lg, paddingRight: spacing.sm, marginTop: spacing.lg },
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
  const [unread, setUnread] = useState(0);
  const [pastHero, setPastHero] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // The bell's red dot: unread notifications, refreshed whenever Home is shown again.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getUnreadNotificationCount()
        .then((n) => alive && setUnread(n))
        .catch(() => alive && setUnread(0));
      return () => {
        alive = false;
      };
    }, []),
  );

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
      {/* The hero runs behind the status bar and scrolls away naturally. Once the page is scrolled
          past it, a white bar sits behind the clock so content never runs under it. */}
      {scrolled && (
        <View style={[styles.statusStrip, !pastHero && styles.statusFrost, { height: insets.top }]} pointerEvents="none">
          {/* A short fade under the frosted bar, so it has no hard edge over the hero. */}
          {!pastHero && (
            <Svg style={styles.statusFade} width="100%" height={14}>
              <Defs>
                <LinearGradient id="statusFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={theme.isDark ? '#121B2E' : '#F4F7FF'} stopOpacity="0.9" />
                  <Stop offset="1" stopColor={theme.isDark ? '#121B2E' : '#F4F7FF'} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d="M0 0 H2000 V14 H0 Z" fill="url(#statusFade)" />
            </Svg>
          )}
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 48) + spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={brandRefreshControl(refreshing, onRefresh)}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const past = !!heroSize && y > heroSize.h - insets.top - 12;
          if (past !== pastHero) setPastHero(past);
          const moved = y > 6;
          if (moved !== scrolled) setScrolled(moved);
        }}
      >
        {/* Hero: search, company, illustration */}
        <View style={[styles.hero, { paddingTop: insets.top }]} onLayout={(e) => setHeroSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
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

          {/* Brand row: logo + name, notifications, profile */}
          <View style={styles.topRow}>
            <View style={styles.logoDisc}>
              <BrandMark size={32} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.brandName}>BestServe</Text>
            </View>
            <Pressable onPress={() => navigation.navigate('ClientNotifications')} style={({ pressed }) => [styles.bell, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} new` : 'Notifications'} hitSlop={4}>
              <BellGlyph color={theme.isDark ? '#E6E9F2' : '#16224A'} />
              {unread > 0 && <View style={styles.bellDot} />}
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ClientProfile')} style={({ pressed }) => [styles.tileRing, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Profile">
              <UserAvatar size={44} fallback={<CompanyMonogram name={companyName} colorKey={portal?.companies?.[0]?.id} size={44} style={{ borderRadius: 22 }} />} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={styles.searchRow}>
            <Pressable onPress={() => navigation.navigate('ClientSearch')} style={({ pressed }) => [styles.search, pressed && styles.pressed]} accessibilityRole="search" accessibilityLabel="Search jobs, services and documents">
              <SearchGlyph size={22} color={theme.textPrimary} />
              <Text style={styles.searchText} numberOfLines={1}>
                Search jobs, services...
              </Text>
              <View style={styles.filterBtn}>
                <FilterGlyph color={theme.isDark ? '#E6E9F2' : '#16224A'} />
              </View>
            </Pressable>
          </View>

          <View style={styles.banner}>
            <View style={[styles.flex1, { paddingBottom: spacing.sm }]}>
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

        {/* Overview - complaints, audit, documents, and the next visit */}
        <View style={styles.section}>
          {firstLoad ? (
            <HomeOverviewSkeleton />
          ) : k ? (
            <HomeOverview
              openComplaints={k.open_complaints}
              auditRisk={auditRisk}
              pendingInvoices={k.pending_invoices}
              overdueInvoices={k.overdue_invoices}
              pendingAmount={k.pending_amount}
              nextVisit={nextVisit}
              onViewAll={openOutlet}
              onComplaints={() => navigation.navigate('Complaints')}
              onAudits={() => navigation.navigate('ClientAudits')}
              onInvoices={() => navigation.navigate('ClientDocuments', { kind: 'invoice' })}
              onOpenJob={(jobId) => navigation.navigate('ClientJobDetail', { jobId })}
              onBook={() => navigation.navigate('ClientRequestService')}
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

