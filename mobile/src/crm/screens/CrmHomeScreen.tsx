import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../../auth/AuthContext';
import { roleLabel, useUserRole } from '../../auth/role';
import { GradientCard } from '../../components/GradientCard';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
  SendIcon,
  SparkleIcon,
} from '../../components/icons';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { formatINR, formatLeadWhen } from '../format';
import { useLeads } from '../LeadsContext';
import { computeMonthlyAchievements } from '../stats';
import type { CrmTabScreenNav } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import type { Lead } from '../types';
import { ClipboardListIcon, RupeeIcon, TrendUpIcon, WalletIcon } from '../ui/crmIcons';
import { AchievementCard } from '../ui/AchievementCard';
import { CrmBackgroundWash } from '../ui/CrmBackgroundWash';
import { CrmHeader } from '../ui/CrmHeader';
import { CrmErrorBanner, CrmScreen, CrmSkeleton, NoticeBanner } from '../ui/CrmScreen';
import { PrimaryButton } from '../ui/PrimaryButton';

/** Recent Leads is a glance (a swipeable preview), not the full list - "View all" opens Leads. */
const RECENT_LIMIT = 5;

const factory = (t: CrmTheme) => ({
  flex: { flex: 1, backgroundColor: t.background },
  homePad: { paddingHorizontal: spacing.xs, paddingTop: spacing.xs },

  // Greeting hero

  // Stat tiles
  dashStatRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.xl },
  dashStatCard: {
    flex: 1,
    alignItems: 'center' as const,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxs,
  },
  dashStatIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.xs,
  },
  dashStatValue: { ...typography.title, color: t.textPrimary, maxWidth: '100%' as const },
  dashStatLabel: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  flex1: { flex: 1 },
  skeletonSlider: { marginBottom: spacing.xl },

  // Section headers
  richHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.sm,
  },
  richHeaderTextCol: { flex: 1, paddingRight: spacing.sm },
  richHeaderTitle: { ...typography.subtitle, color: t.textPrimary },
  richHeaderUnderlineGap: { marginTop: spacing.xs },
  richHeaderUnderlineSolid: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: t.crestRed,
    marginTop: spacing.xs,
  },
  richHeaderAction: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, marginTop: 2 },
  richHeaderActionText: { ...typography.bodyMedium, color: t.primary },

  // Recent leads slider
  sliderWrap: { marginBottom: spacing.xl },
  dotsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 6,
    marginTop: spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.border },
  dotActive: { width: 16, backgroundColor: t.primary },
  leadItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    overflow: 'hidden' as const,
  },
  leadItemNew: { borderColor: t.primary },
  leadItemPressed: { opacity: 0.85 },
  leadAccent: { width: 4, alignSelf: 'stretch' as const, marginRight: spacing.sm },
  leadGhostWrap: { position: 'absolute' as const, top: -10, right: -8, opacity: 0.14 },
  leadAmountCol: { alignItems: 'center' as const, width: 72 },
  leadAmountIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 3,
  },
  leadAmount: { ...typography.bodyMedium, fontSize: 15, fontWeight: '700' as const, maxWidth: 68 },
  leadMethod: { ...typography.caption, color: t.textMuted, marginTop: -2 },
  leadDivider: { width: 1, alignSelf: 'stretch' as const, marginVertical: spacing.xs, marginRight: spacing.sm },
  leadBody: { flex: 1, gap: 1 },
  leadTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  leadName: { ...typography.bodyMedium, fontSize: 15, color: t.textPrimary, flexShrink: 1 },
  leadService: { ...typography.caption, fontSize: 13, color: t.textSecondary },
  leadMeta: { ...typography.caption, color: t.textMuted },
  leadPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    alignSelf: 'flex-start' as const,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  leadBottom: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: 2 },
  leadPillText: { ...typography.captionMedium, fontSize: 11 },
  leadChevron: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: t.isDark ? 1 : 0,
    borderColor: t.border,
    ...t.cardShadow,
  },
  newTag: { backgroundColor: t.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  newTagText: { ...typography.overline, fontSize: 9, color: t.textOnPrimary },

  // Empty
  emptyCard: {
    alignItems: 'center' as const,
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    ...t.cardShadow,
  },
  emptyArt: { width: '100%' as const, height: 90, marginBottom: spacing.sm },
  emptyCalendarWrap: {
    position: 'absolute' as const,
    left: 28,
    top: 4,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptySparkle: { position: 'absolute' as const, top: -4, right: -6 },
  emptyPlaneWrap: {
    position: 'absolute' as const,
    right: 24,
    bottom: 8,
    transform: [{ rotate: '20deg' }],
  },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary, marginBottom: spacing.md },
  emptyAction: { alignSelf: 'stretch' as const },

  // Quick access
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.xl },
  quickTile: {
    flex: 1,
    alignItems: 'center' as const,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxs,
    gap: spacing.xs,
  },
  quickTilePressed: { opacity: 0.85 },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  quickLabel: { ...typography.captionMedium, color: t.textPrimary, textAlign: 'center' as const },

  // Promo
  promoCard: { padding: spacing.lg, overflow: 'hidden' as const },
  promoGlow: {
    position: 'absolute' as const,
    top: -30,
    right: -30,
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  promoTitle: { ...typography.title, color: t.textOnPrimary },
  promoTitleAccent: { color: t.crestRed },
  promoUnderline: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: t.textOnPrimary,
    marginTop: spacing.sm,
  },
});

function RichSectionHeader({
  title,
  actionLabel,
  onAction,
  gradientUnderline,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  gradientUnderline?: boolean;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const gradId = useRef(`crmRichHeader${Math.round(Math.random() * 1e6)}`).current;
  return (
    <View style={styles.richHeaderRow}>
      <View style={styles.richHeaderTextCol}>
        <Text style={styles.richHeaderTitle}>{title}</Text>
        {gradientUnderline ? (
          <Svg width={64} height={4} style={styles.richHeaderUnderlineGap}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={theme.primary} />
                <Stop offset="1" stopColor={theme.primary} stopOpacity={0.15} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={64} height={4} rx={2} fill={`url(#${gradId})`} />
          </Svg>
        ) : (
          <View style={styles.richHeaderUnderlineSolid} />
        )}
      </View>
      {!!actionLabel && (
        <Pressable onPress={onAction} hitSlop={8} style={styles.richHeaderAction} accessibilityRole="button">
          <Text style={styles.richHeaderActionText}>{actionLabel}</Text>
          <ChevronRightIcon size={14} color={theme.primary} />
        </Pressable>
      )}
    </View>
  );
}

/** One of the three summary numbers: its own tinted card with a solid-colour icon circle, number and label. */
function DashStat({
  icon,
  value,
  label,
  accentColor,
  onPress,
}: {
  icon: React.ReactNode;
  value: string | undefined;
  label: string;
  accentColor: string;
  onPress: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.dashStatCard, { backgroundColor: `${accentColor}1F` }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? 'loading'}`}
    >
      <View style={[styles.dashStatIconWrap, { backgroundColor: accentColor }]}>{icon}</View>
      <Text style={styles.dashStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value ?? '–'}
      </Text>
      <Text style={styles.dashStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Pressable>
  );
}

const METHOD_LABEL = { cash: 'Cash', online: 'Online', other: 'Other' } as const;

/** One Recent Leads card - the technician's schedule card treatment (status accent strip, amount block + divider, status pill, ghost glyph, round chevron) carrying a lead's details. */
function RecentLeadItem({ lead, onPress }: { lead: Lead; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const paid = lead.paymentStatus === 'paid';
  const color = paid ? theme.success : theme.warning;
  const pillBg = paid ? theme.successBg : theme.warningBg;
  const pillText = paid ? theme.successText : theme.warningText;
  const isNew = lead.leadStatus === 'new';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${lead.customerName}, ${lead.service}, ${formatINR(lead.amount)}`}
      style={({ pressed }) => [
        styles.leadItem,
        { backgroundColor: `${color}0D` },
        isNew && styles.leadItemNew,
        pressed && styles.leadItemPressed,
      ]}
    >
      <View style={[styles.leadAccent, { backgroundColor: color }]} />
      <View style={styles.leadGhostWrap}>
        <RupeeIcon size={64} color={color} />
      </View>

      <View style={styles.leadAmountCol}>
        <View style={[styles.leadAmountIconWrap, { backgroundColor: pillBg }]}>
          <RupeeIcon size={15} color={color} />
        </View>
        <Text style={[styles.leadAmount, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {formatINR(lead.amount)}
        </Text>
        <Text style={styles.leadMethod}>{METHOD_LABEL[lead.paymentMethod]}</Text>
      </View>

      <View style={[styles.leadDivider, { backgroundColor: `${color}33` }]} />

      <View style={styles.leadBody}>
        <View style={styles.leadTopRow}>
          <Text style={styles.leadName} numberOfLines={1}>
            {lead.customerName}
          </Text>
          {isNew && (
            <View style={styles.newTag}>
              <Text style={styles.newTagText}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={styles.leadService} numberOfLines={1}>
          {lead.service}
        </Text>
        <View style={styles.leadBottom}>
          <View style={[styles.leadPill, { backgroundColor: pillBg }]}>
            {paid ? <CheckCircleIcon size={12} color={pillText} /> : <ClockIcon size={12} color={pillText} />}
            <Text style={[styles.leadPillText, { color: pillText }]}>{paid ? 'Paid' : 'Pending'}</Text>
          </View>
          <Text style={styles.leadMeta} numberOfLines={1}>
            {formatLeadWhen(lead.createdAt)}
          </Text>
        </View>
      </View>

      <View style={styles.leadChevron}>
        <ChevronRightIcon size={16} color={color} />
      </View>
    </Pressable>
  );
}

/** "No leads yet": dashed path from a clipboard+sparkle glyph to a paper plane, then a New Lead button. */
function LeadsEmptyCard({ onNewLead }: { onNewLead: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyArt}>
        <Svg width="100%" height={90} viewBox="0 0 280 90" preserveAspectRatio="none">
          <Path
            d="M46 24 C110 18 150 78 234 62"
            stroke={theme.isDark ? theme.border : colors.primarySoft}
            strokeWidth={2}
            strokeDasharray="6 7"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
        <View style={styles.emptyCalendarWrap}>
          <ClipboardListIcon size={26} color={theme.primary} />
          <View style={styles.emptySparkle}>
            <SparkleIcon size={14} color={theme.warning} />
          </View>
        </View>
        <View style={styles.emptyPlaneWrap}>
          <SendIcon size={18} color={theme.primary} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>No leads yet</Text>
      <PrimaryButton label="Add your first lead" onPress={onNewLead} style={styles.emptyAction} />
    </View>
  );
}

function QuickAccessTile({
  label,
  icon,
  accentColor,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  onPress: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickTile,
        { backgroundColor: `${accentColor}1F` },
        pressed && styles.quickTilePressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.quickIconWrap, { backgroundColor: accentColor }]}>{icon}</View>
      <Text style={styles.quickLabel} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * CRM Home, laid out exactly like the Technician Home: floating header card,
 * greeting hero, three tinted summary tiles, a swipeable "Recent Leads" strip,
 * Quick Access shortcuts and the brand banner - with leads/payments in place
 * of jobs, and light + dark themes.
 */
export function CrmHomeScreen() {
  const navigation = useNavigation<CrmTabScreenNav<'Home'>>();
  const rootNavigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { user } = useAuth();
  const role = useUserRole();
  const { leads, stats, loading, refreshing, refresh, error, notice, noticeTone, dismissNotice } = useLeads();
  const { styles, theme } = useCrmStyles(factory);

  // The slider width is measured (not assumed) so each card is exactly one page wide.
  const [sliderWidth, setSliderWidth] = useState(0);

  // Replays the achievements ring: every time Home comes into view, and when a pull-to-refresh finishes.
  const [replay, setReplay] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setReplay(k => k + 1);
    }, []),
  );
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) setReplay(k => k + 1);
    wasRefreshing.current = refreshing;
  }, [refreshing]);
  const [sliderIndex, setSliderIndex] = useState(0);

  const recent = leads.slice(0, RECENT_LIMIT);
  const achievements = useMemo(() => computeMonthlyAchievements(leads), [leads]);
  const monthLabel = new Date().toLocaleString('en-IN', { month: 'long' });

  function handleSliderEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!sliderWidth) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / sliderWidth);
    setSliderIndex(Math.max(0, Math.min(recent.length - 1, next)));
  }

  return (
    <View style={styles.flex}>
      <CrmBackgroundWash />
      <CrmHeader
        userName={user?.name ?? ''}
        roleLabel={role ? roleLabel(role) : ''}
        onProfilePress={() => navigation.navigate('More')}
        onNotificationsPress={() => rootNavigation.navigate('Notifications')}
      />
      <CrmScreen transparent edges={[]} refreshing={refreshing} onRefresh={refresh}>
        <View style={styles.homePad}>
          <AchievementCard achievements={achievements} monthLabel={monthLabel} replayKey={replay} />

          <NoticeBanner message={notice} tone={noticeTone} onDismiss={dismissNotice} />
          <CrmErrorBanner message={error} onRetry={refresh} />

          <View style={styles.dashStatRow}>
            {loading ? (
              <>
                <CrmSkeleton height={112} radius={radii.lg} style={styles.flex1} />
                <CrmSkeleton height={112} radius={radii.lg} style={styles.flex1} />
                <CrmSkeleton height={112} radius={radii.lg} style={styles.flex1} />
              </>
            ) : (
              <>
                <DashStat
                  icon={<ClipboardListIcon size={17} color={theme.textOnPrimary} />}
                  value={String(stats.todaysLeads)}
                  label="Today's Leads"
                  accentColor={theme.primary}
                  onPress={() => navigation.navigate('Leads', { filter: 'all', at: Date.now() })}
                />
                <DashStat
                  icon={<TrendUpIcon size={17} color={theme.textOnPrimary} />}
                  value={formatINR(stats.paidTotal)}
                  label="Paid"
                  accentColor={theme.success}
                  onPress={() => navigation.navigate('Payments')}
                />
                <DashStat
                  icon={<ClockIcon size={17} color={theme.textOnPrimary} />}
                  value={formatINR(stats.pendingTotal)}
                  label="Payment Pending"
                  accentColor={theme.warning}
                  onPress={() => navigation.navigate('Payments')}
                />
              </>
            )}
          </View>

          <RichSectionHeader
            title="Recent Leads"
            gradientUnderline
            actionLabel={!loading && leads.length > 0 ? 'View all' : undefined}
            onAction={() => navigation.navigate('Leads', { filter: 'all', at: Date.now() })}
          />
          {loading ? (
            <CrmSkeleton height={124} radius={radii.lg} style={styles.skeletonSlider} />
          ) : recent.length === 0 ? (
            <LeadsEmptyCard onNewLead={() => navigation.navigate('CrmNewLead')} />
          ) : (
            <View style={styles.sliderWrap} onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}>
              {!!sliderWidth && (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={handleSliderEnd}
                >
                  {recent.map((lead) => (
                    <View key={lead.id} style={{ width: sliderWidth }}>
                      <RecentLeadItem
                        lead={lead}
                        onPress={() => navigation.navigate('CrmLeadDetail', { leadId: lead.id })}
                      />
                    </View>
                  ))}
                </ScrollView>
              )}
              {recent.length > 1 && (
                <View style={styles.dotsRow}>
                  {recent.map((lead, i) => (
                    <View key={lead.id} style={[styles.dot, i === sliderIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </View>
          )}

          <RichSectionHeader title="Quick Access" />
          <View style={styles.quickRow}>
            <QuickAccessTile
              label="New Lead"
              icon={<PlusIcon size={20} color={theme.textOnPrimary} />}
              accentColor={theme.primary}
              onPress={() => navigation.navigate('CrmNewLead')}
            />
            <QuickAccessTile
              label="Leads"
              icon={<ClipboardListIcon size={20} color={theme.textOnPrimary} />}
              accentColor={theme.warning}
              onPress={() => navigation.navigate('Leads', { filter: 'all', at: Date.now() })}
            />
            <QuickAccessTile
              label="Payments"
              icon={<WalletIcon size={20} color={theme.textOnPrimary} />}
              accentColor={theme.accent}
              onPress={() => navigation.navigate('Payments')}
            />
            <QuickAccessTile
              label="Paid"
              icon={<CheckCircleIcon size={20} color={theme.textOnPrimary} />}
              accentColor={theme.success}
              onPress={() => navigation.navigate('Leads', { filter: 'paid', at: Date.now() })}
            />
          </View>

          <GradientCard color={theme.primary} style={styles.promoCard}>
            <View style={styles.promoGlow} />
            <Text style={styles.promoTitle}>Together for</Text>
            <Text style={[styles.promoTitle, styles.promoTitleAccent]}>Safer Spaces</Text>
            <View style={styles.promoUnderline} />
          </GradientCard>
        </View>
      </CrmScreen>
    </View>
  );
}
