import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BrandMark } from '../components/BrandMark';
import { BellIcon, ChevronRightIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import type { Tone } from '../crm/ui/StatusBadge';
import { initials } from '../tasks/format';
import { TONE_GRADIENT } from '../tasks/theme';
import { GradientBlock } from '../tasks/ui/parts';
import { radii, spacing, typography } from '../theme';

/**
 * The pieces of the lead Home: a blue header band, stat tiles that float over
 * its edge, section titles and Quick Action shortcuts. Same shape as the Task
 * Management Home (tasks/screens/TaskHomeScreen.tsx), so the two read as one
 * product; the sales executive's CRM Home borrows the tiles and shortcuts.
 */

/** How far the stat tiles hang below the header band. */
export const TILE_OVERLAP = 64;

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.75 },
  band: {
    paddingHorizontal: spacing.lg,
    paddingBottom: TILE_OVERLAP + spacing.lg,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: 'hidden' as const,
  },
  ident: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  hi: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  name: { ...typography.title, fontSize: 20, lineHeight: 25, color: '#FFFFFF' },
  roleChip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
  },
  roleText: { ...typography.overline, fontSize: 10, color: '#FFFFFF' },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#3B6FEA',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badgeText: { fontSize: 10, fontWeight: '700' as const, color: '#FFFFFF' },
  me: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  meText: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.primary },
  tile: {
    flex: 1,
    alignItems: 'center' as const,
    backgroundColor: t.surface,
    borderRadius: 22,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    overflow: 'hidden' as const,
    elevation: 8,
    shadowColor: '#1E40AF',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  tileValue: { ...typography.display, fontSize: 26, lineHeight: 32, color: t.textPrimary, marginTop: spacing.xs },
  tileLabel: { ...typography.caption, color: t.textMuted, paddingHorizontal: 4 },
  tileBar: { position: 'absolute' as const, left: '22%' as const, right: '22%' as const, bottom: 0, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm },
  sectionTitle: { ...typography.subtitle, fontSize: 19, color: t.textPrimary },
  underline: { width: 28, height: 3, borderRadius: 1.5, backgroundColor: t.primary, marginTop: spacing.xs },
  sectionAction: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  sectionActionText: { ...typography.bodyMedium, color: t.primary },
  quick: {
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.surface,
    borderRadius: 20,
    paddingVertical: spacing.md,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: t.border,
    ...t.cardShadow,
  },
  quickLabel: { ...typography.captionMedium, color: t.textPrimary },
  quickCount: {
    position: 'absolute' as const,
    top: -6,
    right: -10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: t.surface,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  quickCountText: { fontSize: 11, fontWeight: '700' as const },
});

/** The header's blue gradient with its soft decorative circles. */
function BandBackground() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const id = useRef(`leadBand${Math.round(Math.random() * 1e9)}`).current;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((p) => (p && p.w === width && p.h === height ? p : { w: width, h: height }));
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {!!size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#5C8DF7" />
              <Stop offset="0.45" stopColor="#2563EB" />
              <Stop offset="1" stopColor="#1E3FBF" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
          <Circle cx={size.w * 0.92} cy={size.h * 0.05} r={size.w * 0.3} fill="#FFFFFF" fillOpacity={0.1} />
          <Circle cx={-size.w * 0.05} cy={size.h * 0.72} r={size.w * 0.2} fill="#FFFFFF" fillOpacity={0.07} />
        </Svg>
      )}
    </View>
  );
}

/**
 * The Home header: logo, "Welcome back" + name + role, a bell with a count and
 * the user's initials. `topInset` is the status-bar height, so the band runs
 * under it.
 */
export function HomeBand({
  name,
  role,
  alerts,
  topInset,
  onBell,
  onProfile,
}: {
  name: string;
  role: string;
  alerts: number;
  topInset: number;
  onBell: () => void;
  onProfile: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={[styles.band, { paddingTop: topInset + spacing.md }]}>
      <BandBackground />
      <View style={styles.ident}>
        <View style={styles.logo}>
          <BrandMark size={38} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.hi}>Welcome back</Text>
          <Text style={styles.name} numberOfLines={1}>
            {name || 'there'}
          </Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleText}>{role.toUpperCase()}</Text>
          </View>
        </View>
        <Pressable
          onPress={onBell}
          style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={alerts ? `Follow-ups due today, ${alerts}` : 'Follow-ups due today'}
        >
          <BellIcon size={20} color="#FFFFFF" />
          {alerts > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{alerts > 9 ? '9+' : alerts}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={onProfile} style={({ pressed }) => [styles.me, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Profile">
          <Text style={styles.meText}>{initials(name)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A number that counts up from 0 when it first appears (and when it changes). */
function CountUp({ value, style }: { value: number; style: object }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(anim, { toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [anim, value]);
  return <Text style={style}>{shown}</Text>;
}

/** Springs its child down a touch while pressed. */
function Springy({ onPress, label, style, children }: { onPress: () => void; label: string; style: object; children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  const scale = useRef(new Animated.Value(1)).current;
  const pressTo = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={[styles.flex1, { transform: [{ scale }] }]}>
      <Pressable onPress={onPress} onPressIn={() => pressTo(0.95)} onPressOut={() => pressTo(1)} style={style} accessibilityRole="button" accessibilityLabel={label}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** A white stat tile: round gradient icon, big number, label, and a coloured bar along the bottom. */
export function HomeTile({ icon, value, label, tone, onPress }: { icon: React.ReactNode; value: number; label: string; tone: Tone; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  const colors = TONE_GRADIENT[tone];
  return (
    <Springy onPress={onPress} label={`${label}, ${value}`} style={styles.tile}>
      <GradientBlock colors={colors} size={40} radius={20} glow>
        {icon}
      </GradientBlock>
      <CountUp value={value} style={styles.tileValue} />
      <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
      <View style={[styles.tileBar, { backgroundColor: colors[1] }]} />
    </Springy>
  );
}

/** One Quick Actions shortcut: gradient icon square (with a count when there is one) and a label, on a white card. */
export function QuickAction({ icon, label, tone, count, onPress }: { icon: React.ReactNode; label: string; tone: Tone; count?: number; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  const colors = TONE_GRADIENT[tone];
  return (
    <Springy onPress={onPress} label={count === undefined ? label : `${label}, ${count}`} style={styles.quick}>
      <View>
        <GradientBlock colors={colors} size={44} radius={14} glow>
          {icon}
        </GradientBlock>
        {count !== undefined && (
          <View style={[styles.quickCount, { borderColor: colors[1] }]}>
            <Text style={[styles.quickCountText, { color: colors[1] }]}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
      </View>
      <Text style={styles.quickLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Springy>
  );
}

/** "Recent Leads" with its short underline, and an optional "View all" on the right. */
export function SectionTitle({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.sectionRow}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.underline} />
      </View>
      {!!onViewAll && (
        <Pressable style={styles.sectionAction} onPress={onViewAll} hitSlop={10} accessibilityRole="button">
          <Text style={styles.sectionActionText}>View all</Text>
          <ChevronRightIcon size={16} color={theme.primary} />
        </Pressable>
      )}
    </View>
  );
}
