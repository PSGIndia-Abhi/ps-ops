import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Bone, SkeletonGroup } from '../../components/Shimmer';
import { useCrmTheme } from '../../crm/theme';
import { shadows, spacing } from '../../theme';

/**
 * Loading placeholders in the shape of each client screen's real content, so nothing jumps when
 * the data arrives. Built from the shared shimmer kit (components/Shimmer).
 */

/** Home: the row of shortcut pills (next visit, complaints, invoices). */
export function ShortcutsSkeleton() {
  const theme = useCrmTheme();
  return (
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.pill, { borderColor: theme.border }]}>
          <SkeletonGroup style={styles.pillInner}>
            <Bone width={42} height={42} radius={21} />
            <View>
              <Bone width={70} height={10} />
              <Bone width={104} height={13} style={styles.gap8} />
            </View>
          </SkeletonGroup>
        </View>
      ))}
    </ScrollView>
  );
}

/** Home: the service-health card - title + verdict, range chips, donut + legend, two figures. */
export function GlanceSkeleton() {
  const theme = useCrmTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: theme.isDark ? 1 : 0 }]}>
      <SkeletonGroup>
        <View style={styles.row}>
          <Bone width={130} height={16} radius={6} />
          <View style={styles.flex1} />
          <Bone width={96} height={24} radius={12} />
        </View>
        <View style={[styles.row, styles.gap16, styles.chipsGap]}>
          {[38, 44, 58, 50, 74].map((w, i) => (
            <Bone key={i} width={w} height={32} radius={16} />
          ))}
        </View>
        <Bone width={120} height={10} style={styles.gap8} />
        <View style={[styles.row, styles.gap16]}>
          <Bone width={136} height={136} radius={68} />
          <View style={styles.flex1}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.row, i > 0 && styles.gap12]}>
                <Bone width={10} height={10} radius={5} />
                <Bone width="55%" height={12} />
                <View style={styles.flex1} />
                <Bone width={18} height={14} radius={5} />
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.row, styles.gap16]}>
          <Bone height={62} radius={16} style={styles.flex1} />
          <Bone height={62} radius={16} style={styles.flex1} />
        </View>
      </SkeletonGroup>
    </View>
  );
}

/**
 * A list of simple rows: a leading shape, two lines, a short label on the right.
 * `lead`: "date" (rounded date chip), "circle" (icon), "tile" (rounded square, e.g. a document).
 */
export function RowsSkeleton({ count = 3, lead = 'circle', inset = false }: { count?: number; lead?: 'date' | 'circle' | 'tile'; inset?: boolean }) {
  const r = lead === 'tile' ? 14 : 22;
  return (
    <SkeletonGroup style={inset ? styles.inset : undefined}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, styles.listRow]}>
          <Bone width={44} height={44} radius={r} />
          <View style={styles.flex1}>
            <Bone width={i % 2 ? '58%' : '70%'} height={14} />
            <Bone width={i % 2 ? '36%' : '44%'} height={11} style={styles.gap8} />
          </View>
          <Bone width={40} height={11} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/**
 * The whole Home page as a skeleton - shown while the app opens a client account (GET /me), so the
 * app opens straight into the shape of Home (same sky-blue hero) instead of a loading screen.
 */
export function ClientHomeSkeletonScreen() {
  const theme = useCrmTheme();
  const [hero, setHero] = useState<{ w: number; h: number } | null>(null);
  const page = theme.isDark ? theme.background : '#FFFFFF';
  const top = theme.isDark ? '#1B2B4A' : '#C4DAFE';
  const bottom = theme.isDark ? '#121B2E' : '#E6EFFF';
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: page }]} edges={[]}>
      <View style={styles.hero} onLayout={(e) => setHero({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {!!hero && (
          <Svg style={styles.heroBg} width={hero.w} height={hero.h} pointerEvents="none">
            <Defs>
              <LinearGradient id="skeletonHero" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={top} stopOpacity="1" />
                <Stop offset="1" stopColor={bottom} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={hero.w} height={hero.h} fill="url(#skeletonHero)" />
          </Svg>
        )}
        <SafeAreaView edges={['top']}>
          <SkeletonGroup style={styles.inset}>
            <View style={[styles.row, styles.topRow]}>
              <Bone height={56} radius={28} style={styles.flex1} />
              <Bone width={50} height={50} radius={16} />
            </View>
            <View style={[styles.row, styles.banner]}>
              <View style={styles.flex1}>
                <Bone width={140} height={11} />
                <Bone width="80%" height={24} radius={8} style={styles.gap12} />
                <Bone width="55%" height={13} style={styles.gap8} />
                <Bone width={130} height={30} radius={15} style={styles.gap16} />
              </View>
              <Bone width={130} height={104} radius={20} />
            </View>
          </SkeletonGroup>
        </SafeAreaView>
      </View>
      <SkeletonGroup style={styles.actions}>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={styles.action}>
            <Bone width={64} height={64} radius={22} />
            <Bone width={52} height={10} style={styles.gap8} />
          </View>
        ))}
      </SkeletonGroup>
      <ShortcutsSkeleton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hero: { paddingBottom: spacing.lg },
  heroBg: { position: 'absolute', top: 0, left: 0 },
  topRow: { paddingTop: spacing.sm },
  banner: { marginTop: spacing.xl, alignItems: 'flex-end' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.sm, marginTop: spacing.lg },
  action: { width: '25%', alignItems: 'center', paddingVertical: spacing.sm },
  pills: { gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  pill: { borderRadius: 32, borderWidth: 1, paddingVertical: 10, paddingLeft: 10, paddingRight: 18, minWidth: 168 },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { borderRadius: 24, padding: spacing.lg, ...shadows.card },
  chipsGap: { gap: 6 },
  listRow: { paddingVertical: spacing.sm + 2 },
  inset: { paddingHorizontal: spacing.lg },
  gap8: { marginTop: 8 },
  gap12: { marginTop: 12 },
  gap16: { marginTop: spacing.md },
});
