import React, { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
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
  // Set-target dialog
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

/**
 * This month's target for one sales person: target, achieved (the amounts of the leads they
 * converted this month), and how far along they are. `canSet` (the sales manager) adds "Set target".
 */
export function TargetCard({ target, canSet, onChanged }: { target: api.SalesTarget; canSet?: boolean; onChanged?: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [editing, setEditing] = useState(false);
  const pct = targetPercent(target);
  const fill = pct === null ? 0 : Math.min(100, pct);
  const tone = pct === null ? theme.textMuted : pct >= 100 ? theme.success : pct >= 50 ? theme.primary : theme.warning;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>TARGET · {monthName(target.month).toUpperCase()}</Text>
        {canSet && (
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button" style={({ pressed }) => [styles.set, pressed && { opacity: 0.85 }]}>
            <Text style={styles.setText}>{target.target ? 'Change target' : 'Set target'}</Text>
          </Pressable>
        )}
      </View>
      {target.target ? (
        <>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Text style={styles.label}>Target</Text>
              <Text style={styles.value}>{formatINR(target.target)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.label}>Achieved</Text>
              <Text style={[styles.value, { color: tone }]}>{formatINR(target.achieved)}</Text>
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
            {target.converted} lead{target.converted === 1 ? '' : 's'} converted this month
            {target.achieved < target.target ? ` · ${formatINR(target.target - target.achieved)} to go` : ' · target reached'}
          </Text>
        </>
      ) : (
        <Text style={styles.none}>
          No target set for this month.{target.achieved > 0 ? ` Converted so far: ${formatINR(target.achieved)}.` : ''}
        </Text>
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
            <Pressable onPress={save} disabled={saving} style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.6 }]} accessibilityRole="button">
              <Text style={styles.btnTextPrimary}>{saving ? 'Saving…' : 'Save target'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
