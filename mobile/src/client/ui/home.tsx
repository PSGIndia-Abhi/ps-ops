import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BrandMark } from '../../components/BrandMark';
import { GlossyBadge } from '../../components/GlossyBadge';
import { ChevronRightIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { initials } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';

/**
 * Building blocks of the client Home - the same visual family as the Lead /
 * Task Management homes (leads/homeParts.tsx): a curved blue band, tiles that
 * float over its edge, glossy section headings.
 */

/** How far the stat tiles hang below the band. */
export const CLIENT_TILE_OVERLAP = 56;

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.75 },
  band: {
    paddingHorizontal: spacing.lg,
    paddingBottom: CLIENT_TILE_OVERLAP + spacing.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden' as const,
  },
  ident: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  hi: { ...typography.caption, color: 'rgba(255,255,255,0.82)' },
  name: { ...typography.title, fontSize: 20, lineHeight: 25, color: '#FFFFFF' },
  me: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  meText: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.primary },
  company: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  companyName: { ...typography.bodyMedium, color: '#FFFFFF', flexShrink: 1 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipText: { ...typography.overline, fontSize: 10, color: '#FFFFFF' },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm + 2, marginBottom: spacing.md },
  sectionTitle: { ...typography.subtitle, fontSize: 18, fontWeight: '800' as const, color: t.textPrimary },
  sectionSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  sectionAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    minHeight: 34,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
  },
  sectionActionText: { ...typography.captionMedium, fontSize: 13, color: t.primary },
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    ...t.cardShadow,
  },
  pillText: { ...typography.captionMedium, fontSize: 13, color: t.textPrimary, flexShrink: 1 },
  caret: { transform: [{ rotate: '90deg' }] },
});

/** The band's blue gradient with soft decorative circles (as on the Lead home). */
function BandBackground() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const id = useRef(`clientBand${Math.round(Math.random() * 1e9)}`).current;
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
          <Circle cx={-size.w * 0.05} cy={size.h * 0.75} r={size.w * 0.2} fill="#FFFFFF" fillOpacity={0.07} />
        </Svg>
      )}
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Header band: logo, greeting + name, avatar (opens Profile), then the company and the login's access. */
export function ClientBand({
  name,
  company,
  access,
  topInset,
  onProfile,
}: {
  name: string;
  company: string;
  access: string;
  topInset: number;
  onProfile: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  const first = name.trim().split(/\s+/)[0];
  return (
    <View style={[styles.band, { paddingTop: topInset + spacing.md }]}>
      <BandBackground />
      <View style={styles.ident}>
        <View style={styles.logo}>
          <BrandMark size={34} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.hi}>{greeting()}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {first || 'there'}
          </Text>
        </View>
        <Pressable onPress={onProfile} style={({ pressed }) => [styles.me, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Profile">
          <Text style={styles.meText}>{initials(name)}</Text>
        </Pressable>
      </View>
      <View style={styles.company}>
        <Text style={styles.companyName} numberOfLines={1}>
          {company}
        </Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{access.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

/** Section heading: glossy icon, title + subtitle, optional "View all" pill. */
export function ClientSection({
  title,
  subtitle,
  color,
  icon: Icon,
  onViewAll,
  actionLabel = 'View all',
}: {
  title: string;
  subtitle?: string;
  color: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onViewAll?: () => void;
  actionLabel?: string;
}) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.sectionRow}>
      <GlossyBadge color={color} size={36} icon={<Icon size={17} color="#fff" />} />
      <View style={styles.flex1}>
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.sectionSub} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!onViewAll && (
        <Pressable style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]} onPress={onViewAll} hitSlop={6} accessibilityRole="button">
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <ChevronRightIcon size={15} color={theme.primary} />
        </Pressable>
      )}
    </View>
  );
}

/** A small white filter pill ("📍 All outlets ▾") that opens a bottom sheet. */
export function FilterPill({ icon, label, onPress, style }: { icon?: React.ReactNode; label: string; onPress: () => void; style?: object }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, style, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}>
      {icon}
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.caret}>
        <ChevronRightIcon size={14} color={theme.textMuted} />
      </View>
    </Pressable>
  );
}
