import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { ChartIcon, ChevronRightIcon } from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { MONTHS_LONG } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import * as api from './api';
import { Badge, Card, NameChip } from './QuotationDialogs';
import { errorMessage } from './ui';

const factory = (t: CrmTheme) => ({
  card: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.md },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm },
  title: { ...typography.overline, color: t.textMuted },
  set: { minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: t.primary, justifyContent: 'center' as const },
  setText: { ...typography.captionMedium, color: t.primary },
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  cell: { flex: 1 },
  label: { ...typography.caption, color: t.textMuted },
  value: { ...typography.title, color: t.textPrimary },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: t.surfaceAlt, overflow: 'hidden' as const, marginTop: spacing.sm },
  barFill: { height: 10, borderRadius: 5 },
  foot: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs },
  none: { ...typography.body, color: t.textSecondary },
  history: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
    minHeight: 36,
  },
  historyText: { ...typography.bodyMedium, color: t.primary },
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
 * `onHistory` adds "View achievement history".
 */
export function TargetCard({
  target,
  canSet,
  onChanged,
  period,
  onHistory,
}: {
  target: api.SalesTarget;
  canSet?: boolean;
  onChanged?: () => void;
  period?: PeriodFigures;
  onHistory?: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [editing, setEditing] = useState(false);
  const shown = period
    ? { target: period.target, achieved: period.achieved, converted: period.converted }
    : { target: target.target, achieved: target.achieved, converted: target.converted };
  const when = period?.when ?? 'this month';
  const pct = targetPercent(shown);
  const fill = pct === null ? 0 : Math.min(100, pct);
  const tone = pct === null ? theme.textMuted : pct >= 100 ? theme.success : pct >= 50 ? theme.primary : theme.warning;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>TARGET · {period ? period.title : monthName(target.month).toUpperCase()}</Text>
        {canSet && !period && (
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button" style={({ pressed }) => [styles.set, pressed && { opacity: 0.85 }]}>
            <Text style={styles.setText}>{target.target ? 'Change target' : 'Set target'}</Text>
          </Pressable>
        )}
      </View>
      {shown.target ? (
        <>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Text style={styles.label}>Target</Text>
              <Text style={styles.value}>{formatINR(shown.target)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Achieved</Text>
              <Text style={[styles.value, { color: tone }]}>{formatINR(shown.achieved)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Done</Text>
              <Text style={[styles.value, { color: tone }]}>{pct}%</Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${fill}%`, backgroundColor: tone }]} />
          </View>
          <Text style={styles.foot}>
            {shown.converted} lead{shown.converted === 1 ? '' : 's'} converted {when}
            {shown.achieved < shown.target ? ` · ${formatINR(shown.target - shown.achieved)} to go` : ' · target reached'}
          </Text>
          {!!period?.note && <Text style={styles.foot}>{period.note}</Text>}
        </>
      ) : (
        <Text style={styles.none}>
          No target set{period ? '' : ' for this month'}.
          {shown.achieved > 0 ? ` Converted ${when}: ${formatINR(shown.achieved)}.` : ''}
        </Text>
      )}
      {!!onHistory && (
        <Pressable onPress={onHistory} accessibilityRole="button" style={({ pressed }) => [styles.history, pressed && { opacity: 0.7 }]}>
          <Text style={styles.historyText}>View achievement history</Text>
          <ChevronRightIcon size={16} color={theme.primary} />
        </Pressable>
      )}
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
