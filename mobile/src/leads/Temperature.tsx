import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';
import { fmtDateShort } from '../tasks/format';
import type { LeadTemperature, PipelineLead } from './types';

// Hot / Warm / Cold - how interested the customer is (separate from the stage). Set by the people
// who own leads: a sales executive on their own leads; the sales manager, MD, PA and admin on any.
// Optional; every change lands in the lead's history.

export const TEMPERATURES: LeadTemperature[] = ['HOT', 'WARM', 'COLD'];
export const TEMPERATURE_LABEL: Record<LeadTemperature, string> = { HOT: 'Hot', WARM: 'Warm', COLD: 'Cold' };
/** Login roles that may set it (the server checks the same, plus own-leads-only for a sales executive). */
const SETTER_ROLES = ['Sales Executive', 'sales_manager', 'Managing Director', 'Personal Assistant', 'admin'];
const HEAD_ROLES = ['sales_manager', 'Managing Director', 'Personal Assistant', 'admin'];
const CLOSED = ['CONVERTED', 'WON', 'NOT_GENUINE', 'LOST', 'CANCELLED'];

/** True when this person may set it on this lead. */
export function canSetTemperature(lead: PipelineLead, role: string | undefined | null, myId: string): boolean {
  if (!role || !SETTER_ROLES.includes(role) || CLOSED.includes(lead.stage)) return false;
  if (HEAD_ROLES.includes(role)) return true;
  return [lead.createdById, lead.salesEmployeeId].some((id) => !!id && id === myId);
}

const colorsOf = (t: CrmTheme, k: LeadTemperature) =>
  k === 'HOT' ? { fg: t.dangerText, bg: t.dangerBg, dot: t.danger } : k === 'WARM' ? { fg: t.warningText, bg: t.warningBg, dot: t.warning } : { fg: t.info, bg: t.infoBg, dot: t.info };

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: { ...typography.bodyMedium, color: t.textPrimary },
  setBy: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  row: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: t.border,
    backgroundColor: t.surface,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
  },
  btnText: { ...typography.bodyMedium, color: t.textPrimary },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pressed: { opacity: 0.7 },
  off: { opacity: 0.5 },
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { ...typography.captionMedium, fontSize: 11 },
});

/** The small coloured tag on a lead card. Nothing when not set. */
export function TemperatureChip({ value }: { value?: LeadTemperature | null }) {
  const { styles, theme } = useCrmStyles(factory);
  if (!value) return null;
  const c = colorsOf(theme, value);
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]} accessibilityLabel={`${TEMPERATURE_LABEL[value]} lead`}>
      <View style={[styles.chipDot, { backgroundColor: c.dot }]} />
      <Text style={[styles.chipText, { color: c.fg }]}>{TEMPERATURE_LABEL[value].toUpperCase()}</Text>
    </View>
  );
}

/**
 * The three big buttons on the Manage lead screen. Tapping the chosen one again clears it.
 * Read-only (just the current tag) for someone who may not change it; hidden when not set and not settable.
 */
export function TemperaturePicker({
  lead,
  canSet,
  saving,
  onPick,
}: {
  lead: PipelineLead;
  canSet: boolean;
  saving: LeadTemperature | null;
  onPick: (next: LeadTemperature | null) => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const current = lead.temperature ?? null;
  if (!canSet && !current) return null;
  const setBy = current && lead.temperatureBy ? `Set by ${lead.temperatureBy}${lead.temperatureAt ? ` · ${fmtDateShort(lead.temperatureAt.slice(0, 10))}` : ''}` : '';
  return (
    <View style={styles.card}>
      <Text style={styles.title}>How interested is the customer?</Text>
      {!!setBy && <Text style={styles.setBy}>{setBy}</Text>}
      <View style={styles.row} accessibilityRole="radiogroup">
        {TEMPERATURES.filter((k) => canSet || k === current).map((k) => {
          const on = current === k;
          const c = colorsOf(theme, k);
          return (
            <Pressable
              key={k}
              onPress={() => onPick(on ? null : k)}
              disabled={!canSet || saving !== null}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: !canSet }}
              accessibilityLabel={on && canSet ? `${TEMPERATURE_LABEL[k]}, tap again to clear` : TEMPERATURE_LABEL[k]}
              style={({ pressed }) => [
                styles.btn,
                on && { backgroundColor: c.bg, borderColor: c.dot },
                pressed && styles.pressed,
                saving !== null && saving !== k && styles.off,
              ]}
            >
              <View style={[styles.dot, { backgroundColor: c.dot }]} />
              <Text style={[styles.btnText, on && { color: c.fg }]}>{saving === k ? 'Saving...' : TEMPERATURE_LABEL[k]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
