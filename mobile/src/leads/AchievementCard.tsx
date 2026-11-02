import React, { useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import { ChartIcon } from '../components/icons';
import { ChevronDownIcon } from '../crm/ui/crmIcons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { MONTHS_LONG } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import type * as api from './api';

const CHART = 92; // bar area height
const DASHES = 6; // dashes in a target line

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  // The header row: what it is and the headline numbers; tap to open or close.
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  headIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headText: { flex: 1 },
  headTitle: { ...typography.bodyMedium, color: t.textPrimary },
  headSub: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  headStrong: { color: t.textPrimary, fontWeight: '700' as const },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  bodyOpen: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row' as const, gap: spacing.md },
  cell: { flex: 1 },
  divider: { width: 1, backgroundColor: t.border },
  label: { ...typography.caption, color: t.textMuted },
  value: { ...typography.title, color: t.textPrimary, marginTop: 2 },
  sub: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  chartHead: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  chartTitle: { ...typography.captionMedium, color: t.textSecondary },
  key: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  keyItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  keyBar: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: t.primary,
  },
  keyDash: { flexDirection: 'row' as const, gap: 2 },
  keyDashBit: {
    width: 4,
    height: 2,
    borderRadius: 1,
    backgroundColor: t.textMuted,
  },
  keyText: { ...typography.caption, color: t.textMuted },
  chart: {
    flexDirection: 'row' as const,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  col: { flex: 1, alignItems: 'center' as const },
  area: {
    height: CHART + 30,
    width: '100%' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
  },
  amount: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.textSecondary,
    marginBottom: 3,
  },
  bar: {
    width: '58%' as const,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  barPast: { opacity: 0.45 },
  empty: {
    ...typography.caption,
    color: t.textMuted,
    opacity: 0.5,
    marginBottom: 2,
  },
  target: {
    position: 'absolute' as const,
    left: '6%' as const,
    right: '6%' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  targetText: {
    position: 'absolute' as const,
    alignSelf: 'center' as const,
    ...typography.caption,
    fontSize: 10,
    color: t.textMuted,
  },
  dash: {
    width: '11%' as const,
    height: 2,
    borderRadius: 1,
    backgroundColor: t.textMuted,
  },
  baseline: {
    height: 1,
    backgroundColor: t.border,
    alignSelf: 'stretch' as const,
  },
  month: { ...typography.caption, color: t.textMuted, marginTop: 5 },
  monthNow: { color: t.textPrimary, fontWeight: '700' as const },
});

const shortMonth = (month: string) =>
  MONTHS_LONG[Number(month.slice(5, 7)) - 1]?.slice(0, 3) ?? month;
const monthYear = (iso: string) =>
  `${shortMonth(iso.slice(0, 7))} ${iso.slice(0, 4)}`;

/** ₹27.6K, ₹1.2L - short enough to sit on a bar. */
export function compactINR(n: number): string {
  const trim = (v: number) =>
    String(Math.round(v * 10) / 10).replace(/\.0$/, '');
  if (n >= 10000000) return `₹${trim(n / 10000000)}Cr`;
  if (n >= 100000) return `₹${trim(n / 100000)}L`;
  if (n >= 1000) return `₹${trim(n / 1000)}K`;
  return `₹${Math.round(n)}`;
}

/**
 * One sales person's achievement beyond this month: last month against its target, everything
 * converted so far, and the last six months as bars - the amount on each bar, that month's target as
 * a dashed line. Achieved = what their converted leads are worth (the final quotation amount, else
 * the approximate quote).
 */
export function AchievementCard({
  history,
}: {
  history: api.AchievementHistory;
}) {
  const { styles, theme } = useCrmStyles(factory);
  // Closed to start with: the header already gives the two headline numbers.
  const [open, setOpen] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(o => !o);
  };
  const { months, lifetime } = history;
  const last = months.length >= 2 ? months[months.length - 2] : null;
  const lastPct = last?.target
    ? Math.round((last.achieved / last.target) * 100)
    : null;
  const top = Math.max(
    1,
    ...months.map(m => Math.max(m.achieved, m.target ?? 0)),
  );
  const height = (v: number) => Math.round((v / top) * CHART);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Achievement. Lifetime ${formatINR(
          lifetime.achieved,
        )}, last month ${formatINR(last?.achieved ?? 0)}`}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={styles.headIcon}>
          <ChartIcon size={20} color={theme.primary} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.headTitle}>Achievement</Text>
          <Text style={styles.headSub} numberOfLines={1}>
            Lifetime{' '}
            <Text style={styles.headStrong}>
              {formatINR(lifetime.achieved)}
            </Text>
            {'  ·  '}Last month{' '}
            <Text style={styles.headStrong}>
              {formatINR(last?.achieved ?? 0)}
            </Text>
          </Text>
        </View>
        <View style={[styles.chevron, open && styles.chevronOpen]}>
          <ChevronDownIcon size={18} color={theme.textSecondary} />
        </View>
      </Pressable>

      {open && (
        <View style={styles.bodyOpen}>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Text style={styles.label}>
                Last month{last ? ` (${shortMonth(last.month)})` : ''}
              </Text>
              <Text style={styles.value}>{formatINR(last?.achieved ?? 0)}</Text>
              <Text style={styles.sub}>
                {last?.target
                  ? `of ${formatINR(last.target)} · ${lastPct}%`
                  : 'No target set'}
              </Text>
              <Text style={styles.sub}>{last?.converted ?? 0} converted</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.cell}>
              <Text style={styles.label}>Lifetime</Text>
              <Text style={styles.value}>{formatINR(lifetime.achieved)}</Text>
              <Text style={styles.sub}>{lifetime.converted} converted</Text>
              {!!lifetime.since && (
                <Text style={styles.sub}>
                  since {monthYear(lifetime.since)}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.chartHead}>
            <Text style={styles.chartTitle}>Last 6 months</Text>
            <View style={styles.key}>
              <View style={styles.keyItem}>
                <View style={styles.keyBar} />
                <Text style={styles.keyText}>Achieved</Text>
              </View>
              <View style={styles.keyItem}>
                <View style={styles.keyDash}>
                  <View style={styles.keyDashBit} />
                  <View style={styles.keyDashBit} />
                </View>
                <Text style={styles.keyText}>Target</Text>
              </View>
            </View>
          </View>

          <View style={styles.chart}>
            {months.map((m, i) => {
              const now = i === months.length - 1;
              const hit = !!m.target && m.achieved >= m.target;
              const color = hit ? theme.success : theme.primary;
              return (
                <View
                  key={m.month}
                  style={styles.col}
                  accessibilityLabel={`${shortMonth(m.month)}: ${formatINR(
                    m.achieved,
                  )}${m.target ? ` of ${formatINR(m.target)} target` : ''}, ${
                    m.converted
                  } converted`}
                >
                  <View style={styles.area}>
                    {m.achieved > 0 ? (
                      <>
                        <Text
                          style={[
                            styles.amount,
                            now && { color: theme.textPrimary },
                          ]}
                        >
                          {compactINR(m.achieved)}
                        </Text>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: Math.max(4, height(m.achieved)),
                              backgroundColor: color,
                            },
                            !now && !hit && styles.barPast,
                          ]}
                        />
                      </>
                    ) : (
                      <Text style={styles.empty}>—</Text>
                    )}
                    {/* The target's amount over its line - left out when it would sit on the bar's own amount. */}
                    {!!m.target &&
                      Math.abs(height(m.target) - height(m.achieved)) > 22 && (
                        <Text
                          style={[
                            styles.targetText,
                            { bottom: height(m.target) + 4 },
                          ]}
                        >
                          {compactINR(m.target)}
                        </Text>
                      )}
                    {!!m.target && (
                      <View
                        style={[styles.target, { bottom: height(m.target) }]}
                      >
                        {Array.from({ length: DASHES }, (_, d) => (
                          <View key={d} style={styles.dash} />
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={styles.baseline} />
                  <Text style={[styles.month, now && styles.monthNow]}>
                    {shortMonth(m.month)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
