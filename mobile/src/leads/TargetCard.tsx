import React, { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { ChevronRightIcon } from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { MONTHS_LONG } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import * as api from './api';
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
  // Set-target dialog (a month's target; only shown on the Month filter)
  backdrop: { flex: 1, backgroundColor: t.overlay, justifyContent: 'center' as const, padding: spacing.lg },
  dialog: { backgroundColor: t.surface, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm },
  dTitle: { ...typography.subtitle, color: t.textPrimary },
  dSub: { ...typography.caption, color: t.textMuted },
  input: { ...typography.title, color: t.textPrimary, borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, minHeight: 54 },
  error: { ...typography.caption, color: t.danger },
  actions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: spacing.sm, marginTop: spacing.xs },
  btn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radii.pill, justifyContent: 'center' as const },
  btnGhost: { borderWidth: 1, borderColor: t.border },
  btnPrimary: { backgroundColor: t.primary },
  saving: { opacity: 0.6 },
  btnText: { ...typography.button, color: t.textPrimary },
  btnTextPrimary: { ...typography.button, color: t.textOnPrimary },
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
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.dTitle}>Target for {target.name}</Text>
          <Text style={styles.dSub}>{monthName(target.month)} - the amount of leads to convert. Leave empty to remove it.</Text>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            placeholder="₹ 0"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            autoFocus
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]} accessibilityRole="button">
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[styles.btn, styles.btnPrimary, saving && styles.saving]} accessibilityRole="button">
              <Text style={styles.btnTextPrimary}>{saving ? 'Saving…' : 'Save target'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
