import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { CheckCircleIcon, SunIcon } from '../components/icons';
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

// What each one means - shown in the "?" popup.
const MEANING: Record<LeadTemperature, { title: string; text: string; next: string }> = {
  HOT: { title: 'Ready to take the service', text: 'Wants to start soon, asked for the quotation or the price is agreed.', next: 'Call again tomorrow' },
  WARM: { title: 'Interested, not yet ready', text: 'Likes the service but is comparing prices or asked to call back later.', next: 'Call again in 3–7 days' },
  COLD: { title: 'Not interested right now', text: 'Not needed now, no response, or only asking for prices.', next: 'Call again in a month' },
};

// ---- icons (same 24x24 / 1.8 stroke language as components/icons) ----
export function FlameIcon({ size = 20, color = '#6B7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5c.6 3.2 4.8 5.6 4.8 10.4A4.8 4.8 0 0 1 12 17.7a4.8 4.8 0 0 1-4.8-4.8c0-2.2 1.1-3.6 2.2-4.8.3 1.6 1.2 2.6 2.1 3 0-3.1-.4-6 .5-8.6Z"
        fill={color}
      />
      <Path d="M8 20.5h8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
export function SnowIcon({ size = 20, color = '#6B7280' }: { size?: number; color?: string }) {
  const s = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={12} y1={2.5} x2={12} y2={21.5} {...s} />
      <Line x1={3.8} y1={7.25} x2={20.2} y2={16.75} {...s} />
      <Line x1={3.8} y1={16.75} x2={20.2} y2={7.25} {...s} />
      <Path d="M9.5 4.2 12 6.5l2.5-2.3M9.5 19.8 12 17.5l2.5 2.3" {...s} />
    </Svg>
  );
}
function HelpIcon({ size = 18, color = '#6B7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.2} stroke={color} strokeWidth={1.6} />
      <Path d="M9.6 9.4a2.5 2.5 0 0 1 4.85.85c0 1.7-2.45 2.1-2.45 3.6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={12} cy={16.9} r={1} fill={color} />
    </Svg>
  );
}
const ICON: Record<LeadTemperature, (p: { size?: number; color?: string }) => React.ReactElement> = { HOT: FlameIcon, WARM: SunIcon, COLD: SnowIcon };

const colorsOf = (t: CrmTheme, k: LeadTemperature) =>
  k === 'HOT'
    ? { fg: t.dangerText, bg: t.dangerBg, solid: t.danger }
    : k === 'WARM'
    ? { fg: t.warningText, bg: t.warningBg, solid: t.warning }
    : { fg: t.info, bg: t.infoBg, solid: t.info };

const factory = (t: CrmTheme) => ({
  wrap: { marginBottom: spacing.md },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm, marginTop: spacing.xs },
  overline: { ...typography.overline, color: t.textMuted },
  help: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    height: 26,
    paddingLeft: 4,
    paddingRight: 9,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
  },
  helpText: { ...typography.caption, fontSize: 11, fontWeight: '600' as const, color: t.primary },
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  card: {
    flex: 1,
    height: 50,
    borderRadius: radii.md + 2,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    paddingHorizontal: 8,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    ...t.cardShadow,
  },
  cardOn: { borderWidth: 0, ...t.raisedShadow },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const },
  iconBoxOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  name: { ...typography.captionMedium, fontSize: 14, color: t.textPrimary, flex: 1 },
  nameOn: { color: '#FFFFFF' },
  tick: { marginLeft: -2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  dim: { opacity: 0.55 },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.xs, minHeight: 18 },
  setBy: { ...typography.caption, color: t.textMuted },
  saved: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  savedText: { ...typography.captionMedium, color: t.successText },

  // chip on lead cards
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  chipText: { ...typography.captionMedium, fontSize: 11 },

  // "?" popup
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center' as const, padding: spacing.lg },
  sheet: { backgroundColor: t.surface, borderRadius: radii.xl, overflow: 'hidden' as const, ...t.raisedShadow },
  sheetTop: { backgroundColor: t.primary, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  sheetKicker: { ...typography.overline, color: 'rgba(255,255,255,0.8)' },
  sheetTitle: { ...typography.subtitle, color: '#FFFFFF', marginTop: 2 },
  sheetSub: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  item: { flexDirection: 'row' as const, gap: spacing.md, alignItems: 'flex-start' as const },
  itemIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  itemText: { flex: 1 },
  itemName: { ...typography.bodyMedium, color: t.textPrimary },
  itemTitle: { ...typography.captionMedium, marginTop: 1 },
  itemDesc: { ...typography.caption, color: t.textSecondary, marginTop: 3, lineHeight: 18 },
  itemNext: { alignSelf: 'flex-start' as const, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: t.surfaceAlt },
  itemNextText: { ...typography.caption, fontSize: 11, color: t.textSecondary },
  sheetNote: { ...typography.caption, color: t.textMuted, paddingHorizontal: spacing.lg },
  gotIt: {
    margin: spacing.lg,
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  gotItText: { ...typography.bodyMedium, color: '#FFFFFF' },
});

/** The small coloured tag on a lead card. Nothing when not set. */
export function TemperatureChip({ value }: { value?: LeadTemperature | null }) {
  const { styles, theme } = useCrmStyles(factory);
  if (!value) return null;
  const c = colorsOf(theme, value);
  const Icon = ICON[value];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]} accessibilityLabel={`${TEMPERATURE_LABEL[value]} lead`}>
      <Icon size={11} color={c.solid} />
      <Text style={[styles.chipText, { color: c.fg }]}>{TEMPERATURE_LABEL[value].toUpperCase()}</Text>
    </View>
  );
}

/** "?" popup: what Hot, Warm and Cold mean. */
function TemperatureHelp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      rise.setValue(0);
      Animated.spring(rise, { toValue: 1, useNativeDriver: true, friction: 8, tension: 70 }).start();
    }
  }, [visible, rise]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Animated.View
          style={[styles.sheet, { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }, { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}
        >
          {/* A press inside the card must not close it. */}
          <Pressable onPress={() => {}}>
            <View style={styles.sheetTop}>
              <Text style={styles.sheetKicker}>CUSTOMER INTEREST</Text>
              <Text style={styles.sheetTitle}>Hot, Warm or Cold?</Text>
              <Text style={styles.sheetSub}>Mark how ready the customer is to take the service after you talk to them.</Text>
            </View>
            <View style={styles.sheetBody}>
              {TEMPERATURES.map((k) => {
                const c = colorsOf(theme, k);
                const Icon = ICON[k];
                return (
                  <View key={k} style={styles.item}>
                    <View style={[styles.itemIcon, { backgroundColor: c.bg }]}>
                      <Icon size={22} color={c.solid} />
                    </View>
                    <View style={styles.itemText}>
                      <Text style={styles.itemName}>{TEMPERATURE_LABEL[k]}</Text>
                      <Text style={[styles.itemTitle, { color: c.fg }]}>{MEANING[k].title}</Text>
                      <Text style={styles.itemDesc}>{MEANING[k].text}</Text>
                      <View style={styles.itemNext}>
                        <Text style={styles.itemNextText}>{MEANING[k].next}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={styles.sheetNote}>Optional - change it any time. Tap the selected one again to clear it.</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.gotIt, pressed && styles.pressed]}>
              <Text style={styles.gotItText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/**
 * Hot / Warm / Cold on the Manage lead screen: three cards in the style of the step tiles, the chosen one
 * filled with its colour. "?" explains them. Saving shows a spinner on the card, then a small "Saved"
 * that fades. Read-only (just the current one) for someone who may not change it; hidden when not set
 * and not settable. `onPick` resolves true when the server saved it.
 */
export function TemperaturePicker({
  lead,
  canSet,
  onPick,
}: {
  lead: PipelineLead;
  canSet: boolean;
  onPick: (next: LeadTemperature | null) => Promise<boolean>;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [saving, setSaving] = useState<LeadTemperature | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const saved = useRef(new Animated.Value(0)).current;
  const current = lead.temperature ?? null;
  if (!canSet && !current) return null;

  const pick = async (k: LeadTemperature) => {
    setSaving(k);
    const ok = await onPick(current === k ? null : k);
    setSaving(null);
    if (ok) {
      saved.setValue(1);
      Animated.timing(saved, { toValue: 0, duration: 600, delay: 1600, useNativeDriver: true }).start();
    }
  };

  const setBy = current && lead.temperatureBy ? `Set by ${lead.temperatureBy}${lead.temperatureAt ? ` · ${fmtDateShort(lead.temperatureAt.slice(0, 10))}` : ''}` : canSet ? 'Not marked yet' : '';
  const shown = TEMPERATURES.filter((k) => canSet || k === current);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.overline}>CUSTOMER INTEREST</Text>
        <Pressable onPress={() => setHelpOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="What do Hot, Warm and Cold mean?" style={({ pressed }) => [styles.help, pressed && styles.pressed]}>
          <HelpIcon size={18} color={theme.primary} />
          <Text style={styles.helpText}>What's this</Text>
        </Pressable>
      </View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {shown.map((k) => {
          const on = current === k;
          const c = colorsOf(theme, k);
          const Icon = ICON[k];
          return (
            <Pressable
              key={k}
              onPress={() => pick(k)}
              disabled={!canSet || saving !== null}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: !canSet }}
              accessibilityLabel={on && canSet ? `${TEMPERATURE_LABEL[k]}, selected. Tap again to clear` : TEMPERATURE_LABEL[k]}
              style={({ pressed }) => [styles.card, on && [styles.cardOn, { backgroundColor: c.solid }], pressed && styles.pressed, saving !== null && saving !== k && styles.dim]}
            >
              <View style={[styles.iconBox, on ? styles.iconBoxOn : { backgroundColor: c.bg }]}>
                {saving === k ? <ActivityIndicator size="small" color={on ? '#FFFFFF' : c.solid} /> : <Icon size={17} color={on ? '#FFFFFF' : c.solid} />}
              </View>
              <Text style={[styles.name, on && styles.nameOn]}>{TEMPERATURE_LABEL[k]}</Text>
              {on && (
                <View style={styles.tick}>
                  <CheckCircleIcon size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.foot}>
        <Text style={styles.setBy}>{setBy}</Text>
        <Animated.View style={[styles.saved, { opacity: saved }]} pointerEvents="none">
          <CheckCircleIcon size={13} color={theme.successText} />
          <Text style={styles.savedText}>Saved</Text>
        </Animated.View>
      </View>
      <TemperatureHelp visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </View>
  );
}
