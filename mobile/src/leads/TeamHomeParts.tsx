import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronRightIcon, PinIcon } from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { CrmSkeleton } from '../crm/ui/CrmScreen';
import { StarIcon } from '../crm/ui/crmIcons';
import { initials } from '../tasks/format';
import { TONE_GRADIENT } from '../tasks/theme';
import { GradientBlock } from '../tasks/ui/parts';
import { radii, spacing, typography } from '../theme';
import type { SalesTarget } from './api';
import { compactINR } from './AchievementCard';
import { targetPercent } from './TargetCard';
import { monthLabel, ProgressRing } from './TeamReportParts';
import { personTone } from './ui';

/**
 * The sales manager's Home, built from the Team performance page (ReportScreens.tsx): one compact
 * card with the team's month (ring, amount, figures) and a row of the people with their own
 * progress. Lead app only.
 */

const MEDALS: [string, string][] = [
  ['#FCD34D', '#F59E0B'],
  ['#E2E8F0', '#94A3B8'],
  ['#FDBA74', '#C2410C'],
];

const factory = (t: CrmTheme) => ({
  pressed: { opacity: 0.88 },
  flex1: { flex: 1 },

  // team card
  card: {
    backgroundColor: t.surface,
    borderRadius: 22,
    padding: spacing.md,
    ...t.raisedShadow,
  },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  month: { ...typography.overline, fontSize: 10, color: t.textMuted },
  open: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 1 },
  openText: { ...typography.caption, fontWeight: '700' as const, color: t.primary },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, marginTop: spacing.sm },
  pct: { fontSize: 15, fontWeight: '800' as const, color: t.textPrimary },
  amount: { ...typography.title, fontSize: 22, lineHeight: 28, fontWeight: '800' as const, color: t.textPrimary },
  amountSub: { ...typography.caption, color: t.textSecondary },
  bar: { height: 5, borderRadius: 3, backgroundColor: t.surfaceAlt, marginTop: 6, overflow: 'hidden' as const },
  barFill: { height: 5, borderRadius: 3 },
  foot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  stat: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 4, marginRight: spacing.md },
  statValue: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.textPrimary },
  statLabel: { ...typography.caption, color: t.textMuted },
  visits: {
    marginLeft: 'auto' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
  },
  visitsText: { ...typography.caption, fontWeight: '700' as const, color: t.primary },

  // people
  people: { gap: spacing.sm, paddingRight: spacing.md, paddingVertical: 4 },
  person: {
    width: 156,
    backgroundColor: t.surface,
    borderRadius: 20,
    overflow: 'hidden' as const,
    ...t.cardShadow,
  },
  wash: { height: 46 },
  personBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, marginTop: -26 },
  avatarRing: {
    alignSelf: 'flex-start' as const,
    padding: 3,
    borderRadius: 18,
    backgroundColor: t.surface,
  },
  avatarText: { fontSize: 14, fontWeight: '800' as const, color: '#FFFFFF' },
  medal: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden' as const,
  },
  medalText: { fontSize: 10, fontWeight: '800' as const, color: '#FFFFFF' },
  personName: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary, marginTop: spacing.xs },
  personRole: { ...typography.caption, fontSize: 11, color: t.textMuted },
  personRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.sm },
  ringText: { fontSize: 10, fontWeight: '800' as const, color: t.textPrimary },
  personAmount: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.textPrimary },
  personSub: { ...typography.caption, fontSize: 11, color: t.textMuted },
  chip: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  chipText: { ...typography.caption, fontSize: 11, fontWeight: '700' as const },
});

/** The gradient as a soft see-through wash ("#60A5FA" -> "rgba(96,165,250,0.18)"). */
function wash(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(37,99,235,${alpha})`;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------- team card
export function TeamPulseCard({
  month,
  achieved,
  target,
  converted,
  visitsToday,
  people,
  onPress,
  onVisits,
}: {
  month?: string;
  achieved: number;
  target: number;
  converted: number;
  visitsToday: number;
  people: number;
  onPress: () => void;
  onVisits: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const pct = target > 0 ? Math.round((achieved / target) * 100) : null;
  const color = pct === null ? theme.border : pct >= 100 ? theme.success : pct >= 50 ? theme.primary : theme.warning;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Team performance" style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.top}>
        <Text style={styles.month}>{monthLabel(month).toUpperCase()} · TEAM</Text>
        <View style={styles.open}>
          <Text style={styles.openText}>Performance</Text>
          <ChevronRightIcon size={13} color={theme.primary} />
        </View>
      </View>
      <View style={styles.row}>
        <ProgressRing size={64} stroke={7} pct={pct ?? 0} color={color} track={theme.surfaceAlt}>
          <Text style={styles.pct}>{pct === null ? '-' : `${pct}%`}</Text>
        </ProgressRing>
        <View style={styles.flex1}>
          <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatINR(achieved)}
          </Text>
          <Text style={styles.amountSub} numberOfLines={1}>
            {target > 0 ? `of ${formatINR(target)} team target` : 'converted · no team target set'}
          </Text>
          {target > 0 && (
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.min(100, pct ?? 0)}%`, backgroundColor: color }]} />
            </View>
          )}
        </View>
      </View>
      <View style={styles.foot}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{converted}</Text>
          <Text style={styles.statLabel}>won</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{people}</Text>
          <Text style={styles.statLabel}>people</Text>
        </View>
        <Pressable onPress={onVisits} accessibilityRole="button" accessibilityLabel="Team visits today" hitSlop={6} style={({ pressed }) => [styles.visits, pressed && styles.pressed]}>
          <PinIcon size={13} color={theme.primary} />
          <Text style={styles.visitsText}>
            {visitsToday} visit{visitsToday === 1 ? '' : 's'} today
          </Text>
          <ChevronRightIcon size={13} color={theme.primary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export function TeamPulseSkeleton() {
  return <CrmSkeleton height={168} radius={22} />;
}

// ---------------------------------------------------------------------------- people
export interface TeamPerson {
  id: number;
  name: string;
  role?: string;
  target: SalesTarget | null;
  visitsToday: number;
  /** 1-based place among the people who converted something this month; null otherwise. */
  rank: number | null;
}

/** One card per person, side by side: a coloured header, gradient avatar, progress ring, amount, visits today. */
export function TeamPeopleRow({ people, onOpen }: { people: TeamPerson[]; onOpen: (p: TeamPerson) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
      {people.map((p) => {
        const colors = TONE_GRADIENT[personTone(p.name)];
        const pct = p.target?.target ? targetPercent(p.target) ?? 0 : null;
        const ring = pct === null ? theme.border : pct >= 100 ? theme.success : pct >= 50 ? theme.primary : theme.warning;
        const medal = p.rank !== null && p.rank <= 3 ? MEDALS[p.rank - 1] : null;
        const out = p.visitsToday > 0;
        return (
          <Pressable key={p.id} onPress={() => onOpen(p)} accessibilityRole="button" accessibilityLabel={p.name} style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
            <View style={[styles.wash, { backgroundColor: wash(colors[0], 0.22) }]} />
            {!!medal && (
              <View style={[styles.medal, { backgroundColor: medal[1] }]}>
                <StarIcon size={10} color="#FFFFFF" />
                <Text style={styles.medalText}>#{p.rank}</Text>
              </View>
            )}
            <View style={styles.personBody}>
              <View style={styles.avatarRing}>
                <GradientBlock colors={colors} size={44} radius={15} glow>
                  <Text style={styles.avatarText}>{initials(p.name)}</Text>
                </GradientBlock>
              </View>
              <Text style={styles.personName} numberOfLines={1}>
                {p.name}
              </Text>
              {!!p.role && (
                <Text style={styles.personRole} numberOfLines={1}>
                  {p.role}
                </Text>
              )}
              <View style={styles.personRow}>
                <ProgressRing size={40} stroke={5} pct={pct ?? 0} color={ring} track={theme.surfaceAlt}>
                  <Text style={styles.ringText}>{pct === null ? '-' : `${pct}%`}</Text>
                </ProgressRing>
                <View style={styles.flex1}>
                  <Text style={styles.personAmount} numberOfLines={1}>
                    {compactINR(p.target?.achieved ?? 0)}
                  </Text>
                  <Text style={styles.personSub} numberOfLines={1}>
                    {p.target?.target ? `of ${compactINR(p.target.target)}` : 'no target set'}
                  </Text>
                </View>
              </View>
              <View style={[styles.chip, { backgroundColor: out ? theme.successBg : theme.surfaceAlt }]}>
                <PinIcon size={11} color={out ? theme.successText : theme.textMuted} />
                <Text style={[styles.chipText, { color: out ? theme.successText : theme.textMuted }]}>
                  {p.visitsToday} visit{p.visitsToday === 1 ? '' : 's'} today
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
