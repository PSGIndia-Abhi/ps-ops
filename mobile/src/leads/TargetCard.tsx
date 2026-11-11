import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { ChartIcon, ChevronRightIcon } from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { MONTHS_LONG } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import * as api from './api';
import { Badge, Card, NameChip } from './QuotationDialogs';
import { ProgressRing } from './TeamReportParts';
import { errorMessage, GradientFill } from './ui';

const factory = (t: CrmTheme) => ({
  wrap: { marginTop: spacing.sm, marginBottom: spacing.md },
  // All / One-time / AMC inside the blue card: a darker track, the chosen one a white pill.
  tabs: { flexDirection: 'row' as const, backgroundColor: 'rgba(10,30,90,0.28)', borderRadius: radii.pill, padding: 3, marginBottom: spacing.md },
  tab: { flex: 1, minHeight: 28, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  tabOn: { backgroundColor: '#fff' },
  tabText: { ...typography.captionMedium, color: 'rgba(255,255,255,0.85)' },
  tabTextOn: { color: '#1D4ED8', fontWeight: '700' as const },
  // The card itself: blue like the Team report's top card (the colour is drawn by GradientFill).
  // backgroundColor: Android needs one for the rounded corners and the shadow (the gradient sits over it).
  card: { borderRadius: radii.xl, padding: spacing.md, overflow: 'hidden' as const, backgroundColor: '#2563EB', ...t.raisedShadow },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm },
  title: { ...typography.overline, color: 'rgba(255,255,255,0.8)', flexShrink: 1 },
  set: { minHeight: 28, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center' as const },
  setText: { ...typography.captionMedium, color: '#fff' },
  main: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  pct: { ...typography.subtitle, fontWeight: '800' as const, color: '#fff' },
  body: { flex: 1 },
  amount: { ...typography.title, fontSize: 22, lineHeight: 28, fontWeight: '800' as const, color: '#fff' },
  sub: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  stats: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 6, marginTop: spacing.xs },
  stat: { ...typography.captionMedium, color: '#fff' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)' },
  note: { ...typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: spacing.sm },
  history: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  historyText: { ...typography.captionMedium, color: '#fff', flex: 1 },
  kindLoading: { marginVertical: spacing.md },
  // Set-target popup (a month's target; only shown on the Month filter), in the app's popup style
  dTitle: { ...typography.title, color: t.textPrimary, textAlign: 'center' as const },
  dSub: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xs },
  amountBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    minHeight: 58,
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
  },
  rupee: { ...typography.title, color: t.textMuted, marginRight: spacing.xs },
  input: { ...typography.title, flex: 1, color: t.textPrimary, paddingVertical: 0 },
  error: { ...typography.caption, color: t.danger, textAlign: 'center' as const, marginTop: spacing.xs },
  actions: { flexDirection: 'row' as const, gap: spacing.sm, alignSelf: 'stretch' as const, marginTop: spacing.lg, marginBottom: spacing.xs },
  btn: { flex: 1, minHeight: 50, borderRadius: radii.lg, alignItems: 'center' as const, justifyContent: 'center' as const },
  btnGhost: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
  btnPrimary: { backgroundColor: t.success },
  saving: { opacity: 0.7 },
  btnText: { ...typography.button, color: t.textPrimary },
  btnTextPrimary: { ...typography.button, color: '#fff' },
});

export const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
};

/** Achieved against target as a whole percentage (null when there is no target). */
export const targetPercent = (t: Pick<api.SalesTarget, 'target' | 'achieved'>) =>
  t.target ? Math.round((t.achieved / t.target) * 100) : null;

/** Which conversions the card counts: all of them, or only one-time / AMC customers. */
export type ContractKind = 'ALL' | 'ONE_TIME' | 'AMC';
const KINDS: { value: ContractKind; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ONE_TIME', label: 'One-time' },
  { value: 'AMC', label: 'AMC' },
];

/** What the card shows for a chosen period (Today / 7 days / Lifetime) instead of the month. */
export interface PeriodFigures {
  /** e.g. "TODAY", "LAST 7 DAYS", "LIFETIME". */
  title: string;
  /** The month target's share for the period (or all monthly targets added up); null = none set. */
  target: number | null;
  achieved: number;
  converted: number;
  /** "this month", "today", "in the last 7 days", "so far". */
  when: string;
  /** Under the bar, e.g. "7 days' share of ₹1,00,000". */
  note?: string;
}

/**
 * One sales person's target: target, achieved (the amounts of the leads they converted), and how
 * far along they are - for the month, or for `period` (the performance filter: today, 7 days,
 * lifetime). `canSet` (the sales manager) adds "Change target" (the month's target);
 * `onHistory` adds "View achievement history". `onKindChange` adds the All / One-time / AMC tabs:
 * with a type picked, `kindFigures` (what that type's conversions are worth) replace Achieved and the
 * count; the target stays the month's (or the period's) one target.
 */
export function TargetCard({
  target,
  canSet,
  onChanged,
  period,
  onHistory,
  kind = 'ALL',
  onKindChange,
  kindFigures,
}: {
  target: api.SalesTarget;
  canSet?: boolean;
  onChanged?: () => void;
  period?: PeriodFigures;
  onHistory?: () => void;
  kind?: ContractKind;
  onKindChange?: (kind: ContractKind) => void;
  kindFigures?: { achieved: number; converted: number } | null;
}) {
  const { styles } = useCrmStyles(factory);
  const [editing, setEditing] = useState(false);
  const base = period
    ? { target: period.target, achieved: period.achieved, converted: period.converted }
    : { target: target.target, achieved: target.achieved, converted: target.converted };
  const typed = kind !== 'ALL';
  const shown = typed ? { ...base, achieved: kindFigures?.achieved ?? 0, converted: kindFigures?.converted ?? 0 } : base;
  const kindWord = kind === 'AMC' ? 'AMC ' : kind === 'ONE_TIME' ? 'one-time ' : '';
  const pct = targetPercent(shown);
  const hasTarget = !!shown.target;
  const toGo = hasTarget ? (shown.target as number) - shown.achieved : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <GradientFill from="#3B82F6" to="#1D4ED8" />
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>
            TARGET · {period ? period.title : monthName(target.month).toUpperCase()}
          </Text>
          {canSet && !period && (
            <Pressable onPress={() => setEditing(true)} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.set, pressed && { opacity: 0.8 }]}>
              <Text style={styles.setText}>{target.target ? 'Change' : 'Set target'}</Text>
            </Pressable>
          )}
        </View>

        {/* All / One-time / AMC: which conversions the card counts. */}
        {!!onKindChange && (
          <View style={styles.tabs} accessibilityRole="tablist">
            {KINDS.map((k) => {
              const on = k.value === kind;
              return (
                <Pressable
                  key={k.value}
                  onPress={() => onKindChange(k.value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.tab, on && styles.tabOn]}
                >
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{k.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {typed && kindFigures === undefined ? (
          <ActivityIndicator color="#fff" style={styles.kindLoading} />
        ) : (
          // Like the Team card: how far along in a ring, the amount achieved large, the target under it.
          <View style={styles.main}>
            <ProgressRing size={60} stroke={7} pct={pct ?? 0} color={pct !== null && pct >= 100 ? '#4ADE80' : '#fff'} track="rgba(255,255,255,0.25)">
              <Text style={styles.pct}>{pct === null ? '-' : `${pct}%`}</Text>
            </ProgressRing>
            <View style={styles.body}>
              <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(shown.achieved)}
              </Text>
              <Text style={styles.sub}>
                {hasTarget ? `of ${formatINR(shown.target as number)} ${kindWord}target` : `${kindWord}converted · no target set${period ? '' : ' for this month'}`}
              </Text>
              <View style={styles.stats}>
                <Text style={styles.stat}>{shown.converted} won</Text>
                {hasTarget && (
                  <>
                    <View style={styles.dot} />
                    <Text style={styles.stat}>{toGo > 0 ? `${formatINR(toGo)} to go` : 'Target reached'}</Text>
                  </>
                )}
              </View>
            </View>
          </View>
        )}
        {!!period?.note && hasTarget && <Text style={styles.note}>{period.note}</Text>}

        {!!onHistory && (
          <Pressable onPress={onHistory} accessibilityRole="button" style={({ pressed }) => [styles.history, pressed && { opacity: 0.8 }]}>
            <ChartIcon size={16} color="#fff" />
            <Text style={styles.historyText}>View achievement history</Text>
            <ChevronRightIcon size={16} color="#fff" />
          </Pressable>
        )}
      </View>
      {editing && <SetTargetDialog target={target} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged?.(); }} />}
    </View>
  );
}

function SetTargetDialog({ target, onClose, onSaved }: { target: api.SalesTarget; onClose: () => void; onSaved: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [amount, setAmount] = useState(target.target ? String(Math.round(target.target)) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.setTarget(target.userId, target.month, amount ? Number(amount) : 0);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the target.'));
      setSaving(false);
    }
  };
  return (
    <Card onClose={saving ? () => undefined : onClose}>
      <Badge color={theme.success} icon={<ChartIcon size={24} color="#fff" />} />
      <Text style={styles.dTitle}>Set target</Text>
      <NameChip name={`${target.name} · ${monthName(target.month)}`} />
      <View style={styles.amountBox}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.textMuted}
          style={styles.input}
          autoFocus
        />
      </View>
      <Text style={styles.dSub}>Leave empty to remove the target.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <Pressable onPress={onClose} disabled={saving} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.saving]} accessibilityRole="button">
          <Text style={styles.btnText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.btn, styles.btnPrimary, (saving || pressed) && styles.saving]} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTextPrimary}>Save target</Text>}
        </Pressable>
      </View>
    </Card>
  );
}
