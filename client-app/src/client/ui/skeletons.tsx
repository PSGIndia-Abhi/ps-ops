import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Bone, SkeletonGroup } from '../../components/Shimmer';
import { useCrmTheme } from '../../crm/theme';
import { shadows, spacing } from '../../theme';

/**
 * Loading placeholders in the shape of each client screen's real content, so nothing jumps when
 * the data arrives. Built from the shared shimmer kit (components/Shimmer).
 */

/** Home: the bento overview - tall next-visit card + two small cards, health card, two small cards. */
export function BentoSkeleton({ withHealth = true }: { withHealth?: boolean }) {
  const theme = useCrmTheme();
  const card = {
    backgroundColor: theme.surface,
    borderColor: theme.isDark ? theme.border : '#ECEEF3',
  };
  const small = (key: string) => (
    <View key={key} style={[styles.bentoSmall, card]}>
      <SkeletonGroup>
        <Bone width={36} height={36} radius={12} />
        <Bone width="62%" height={16} radius={6} style={styles.gap12} />
        <Bone width="44%" height={10} style={styles.gap8} />
      </SkeletonGroup>
    </View>
  );
  return (
    <View>
      <SkeletonGroup>
        <Bone width={96} height={17} radius={6} />
      </SkeletonGroup>
      <View style={[styles.bentoRow, styles.gap16]}>
        <View style={[styles.bentoTall, card]}>
          <SkeletonGroup>
            <Bone width={70} height={10} />
            <Bone width={64} height={36} radius={8} style={styles.gap16} />
            <Bone width="85%" height={14} style={styles.gap12} />
            <Bone width="55%" height={10} style={styles.gap8} />
          </SkeletonGroup>
        </View>
        <View style={styles.bentoCol}>
          {small('a')}
          {small('b')}
        </View>
      </View>
      {withHealth && (
        <View style={styles.gap12}>
          <GlanceSkeleton />
        </View>
      )}
      {withHealth && (
        <View style={[styles.bentoRow, styles.gap12]}>
          {[small('c'), small('d')].map((el, i) => (
            <View key={i} style={styles.flex1}>
              {el}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Home: the service-health card - title + verdict, range chips, donut + legend, two figures. */
export function GlanceSkeleton() {
  const theme = useCrmTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: theme.isDark ? 1 : 0,
        },
      ]}
    >
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
            {[0, 1, 2].map(i => (
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
export function RowsSkeleton({
  count = 3,
  lead = 'circle',
  inset = false,
}: {
  count?: number;
  lead?: 'date' | 'circle' | 'tile';
  inset?: boolean;
}) {
  const r = lead === 'tile' ? 14 : 22;
  return (
    <SkeletonGroup style={inset ? styles.inset : undefined}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, styles.listRow]}>
          <Bone width={44} height={44} radius={r} />
          <View style={styles.flex1}>
            <Bone width={i % 2 ? '58%' : '70%'} height={14} />
            <Bone
              width={i % 2 ? '36%' : '44%'}
              height={11}
              style={styles.gap8}
            />
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
      <View
        style={styles.hero}
        onLayout={e =>
          setHero({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
      >
        {!!hero && (
          <Svg
            style={styles.heroBg}
            width={hero.w}
            height={hero.h}
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient id="skeletonHero" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={top} stopOpacity="1" />
                <Stop offset="1" stopColor={bottom} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={hero.w}
              height={hero.h}
              fill="url(#skeletonHero)"
            />
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
                <Bone
                  width={130}
                  height={30}
                  radius={15}
                  style={styles.gap16}
                />
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
      <View style={[styles.inset, styles.gap16]}>
        <BentoSkeleton withHealth={false} />
      </View>
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.lg,
  },
  action: { width: '25%', alignItems: 'center', paddingVertical: spacing.sm },
  bentoRow: { flexDirection: 'row', gap: 12 },
  bentoCol: { flex: 1, gap: 12 },
  bentoTall: {
    flex: 1.08,
    height: 236,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  bentoSmall: { height: 112, borderRadius: 22, borderWidth: 1, padding: 14 },
  card: { borderRadius: 24, padding: spacing.lg, ...shadows.card },
  chipsGap: { gap: 6 },
  listRow: { paddingVertical: spacing.sm + 2 },
  inset: { paddingHorizontal: spacing.lg },
  gap8: { marginTop: 8 },
  gap12: { marginTop: 12 },
  gap16: { marginTop: spacing.md },
});
