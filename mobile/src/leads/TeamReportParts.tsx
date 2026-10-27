import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ChevronRightIcon, PinIcon } from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { toneColors } from '../crm/ui/StatusBadge';
import { initials } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import type { SalesTarget } from './api';
import { targetPercent } from './TargetCard';
import { GradientFill, personTone } from './ui';

// The sales manager's Team report: the whole team's month in a coloured header, then each person
// ranked by how much of their monthly target they have reached.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 'YYYY-MM' -> 'October 2026' (this month when missing). */
export function monthLabel(month?: string) {
  const [y, m] = (month || '').split('-').map(Number);
  const d = new Date();
  return y && m ? `${MONTHS[m - 1]} ${y}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** A circular progress ring with whatever is passed in its middle. */
export function ProgressRing({ size, stroke, pct, color, track, children }: { size: number; stroke: number; pct: number; color: string; track: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {shown > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * shown) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}

export function TeamSummary({
  month,
  achieved,
  targetAchieved,
  target,
  converted,
  visitsToday,
  onVisits,
}: {
  month?: string;
  /** Everyone's converted amount this month. */
  achieved: number;
  /** The part of it by people who have a target - what the team's target % is made of. */
  targetAchieved: number;
  target: number;
  converted: number;
  visitsToday: number;
  onVisits: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  const pct = target > 0 ? Math.round((targetAchieved / target) * 100) : 0;
  const others = achieved - targetAchieved; // converted by people without a target
  return (
    <View style={styles.summary}>
      <GradientFill from="#3B82F6" to="#1D4ED8" />
      <Text style={styles.summaryMonth}>{monthLabel(month).toUpperCase()} · TEAM</Text>
      <View style={styles.summaryRow}>
        <ProgressRing size={84} stroke={9} pct={pct} color="#fff" track="rgba(255,255,255,0.25)">
          <Text style={styles.summaryPct}>{target > 0 ? `${pct}%` : '-'}</Text>
        </ProgressRing>
        <View style={styles.summaryBody}>
          <Text style={styles.summaryAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(target > 0 ? targetAchieved : achieved)}
          </Text>
          <Text style={styles.summarySub}>{target > 0 ? `of ${formatINR(target)} target` : 'converted - no team target set'}</Text>
          <View style={styles.summaryStats}>
            <Text style={styles.summaryStat}>{converted} won</Text>
            {target > 0 && others > 0 && (
              <>
                <View style={styles.summaryDot} />
                <Text style={styles.summaryStat}>{formatINR(achieved)} total</Text>
              </>
            )}
            <View style={styles.summaryDot} />
            <Text style={styles.summaryStat}>
              {visitsToday} visit{visitsToday === 1 ? '' : 's'} today
            </Text>
          </View>
        </View>
      </View>
      <Pressable onPress={onVisits} accessibilityRole="button" style={({ pressed }) => [styles.summaryButton, pressed && { opacity: 0.8 }]}>
        <PinIcon size={16} color="#fff" />
        <Text style={styles.summaryButtonText}>Team visits - who went where today</Text>
        <ChevronRightIcon size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

const MEDALS = ['#F5B301', '#A7B1BE', '#CD7F32'];

export function TeamMemberRow({
  rank,
  name,
  role,
  target,
  visitsToday,
  onPress,
}: {
  /** 1-based place among the people with a target; null when they have none. */
  rank: number | null;
  name: string;
  role: string;
  target: SalesTarget | null;
  visitsToday: number;
  onPress: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const avatar = toneColors(theme, personTone(name));
  const pct = target?.target ? targetPercent(target) ?? 0 : null;
  const ringColor = pct === null ? theme.border : pct >= 100 ? theme.success : pct >= 50 ? theme.primary : theme.warning;
  const medal = rank !== null && rank <= 3 ? MEDALS[rank - 1] : null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.member, pressed && { opacity: 0.8 }]}>
      <View style={styles.rankCol}>
        {rank !== null && (
          <View style={[styles.rank, medal ? { backgroundColor: medal } : { backgroundColor: theme.surfaceAlt }]}>
            <Text style={[styles.rankText, { color: medal ? '#fff' : theme.textMuted }]}>{rank}</Text>
          </View>
        )}
      </View>
      <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
        <Text style={[styles.avatarText, { color: avatar.fg }]}>{initials(name)}</Text>
      </View>
      <View style={styles.memberBody}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
        </Text>
        {!!role && <Text style={styles.memberRole}>{role}</Text>}
        {pct !== null && target ? (
          <Text style={styles.memberAmount} numberOfLines={1}>
            {formatINR(target.achieved)} <Text style={styles.memberOf}>of {formatINR(target.target ?? 0)}</Text>
          </Text>
        ) : target ? (
          <Text style={styles.memberSet}>No target this month · tap to set</Text>
        ) : null}
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: theme.successBg }]}>
            <Text style={[styles.chipText, { color: theme.successText }]}>{target?.converted ?? 0} won</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: theme.accentBg }]}>
            <Text style={[styles.chipText, { color: theme.accentText }]}>
              {visitsToday} visit{visitsToday === 1 ? '' : 's'} today
            </Text>
          </View>
        </View>
      </View>
      {pct !== null ? (
        <ProgressRing size={52} stroke={6} pct={pct} color={ringColor} track={theme.surfaceAlt}>
          <Text style={[styles.ringText, { color: ringColor }]}>{pct}%</Text>
        </ProgressRing>
      ) : (
        <ChevronRightIcon size={16} color={theme.textMuted} />
      )}
    </Pressable>
  );
}

const factory = (t: CrmTheme) => ({
  summary: { borderRadius: radii.xl, padding: spacing.lg, marginBottom: spacing.lg, overflow: 'hidden' as const, ...t.raisedShadow },
  summaryMonth: { ...typography.overline, color: 'rgba(255,255,255,0.8)', marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.lg },
  summaryPct: { ...typography.title, color: '#fff' },
  summaryBody: { flex: 1 },
  summaryAmount: { ...typography.display, fontSize: 26, color: '#fff' },
  summarySub: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  summaryStats: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 6, marginTop: spacing.sm },
  summaryStat: { ...typography.captionMedium, color: '#fff' },
  summaryDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' },
  summaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  summaryButtonText: { ...typography.captionMedium, color: '#fff', flex: 1 },

  member: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...t.cardShadow,
  },
  rankCol: { width: 22, alignItems: 'center' as const },
  rank: { width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
  rankText: { fontSize: 11, fontWeight: '800' as const },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.bodyMedium },
  memberBody: { flex: 1, minWidth: 0 },
  memberName: { ...typography.bodyMedium, color: t.textPrimary },
  memberRole: { ...typography.caption, color: t.textMuted },
  memberAmount: { ...typography.captionMedium, color: t.textPrimary, marginTop: 4 },
  memberOf: { ...typography.caption, color: t.textMuted },
  memberSet: { ...typography.captionMedium, color: t.primary, marginTop: 4 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  chip: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { ...typography.caption, fontSize: 11, fontWeight: '600' as const },
  ringText: { fontSize: 12, fontWeight: '800' as const },
});
