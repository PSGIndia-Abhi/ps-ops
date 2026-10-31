import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/icons';
import { colors, radii, spacing, typography } from '../theme';
import type { AreaStatus, AuditStatus, RiskLevelCode } from './api';
import { AREA_STATUS_STYLE, AUDIT_STATUS_STYLE, RISK_STYLE, fmtDate } from './format';
import { ag } from './theme';

// ---- badges -----------------------------------------------------------------

export function RiskBadge({ level }: { level: RiskLevelCode | null | undefined }) {
  if (!level) return null;
  const s = RISK_STYLE[level];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label} risk</Text>
    </View>
  );
}

/** Risk as coloured text ("Medium risk"), as in the area list. */
export function RiskText({ level }: { level: RiskLevelCode | null | undefined }) {
  if (!level) return null;
  const color = level === 'CRITICAL' || level === 'HIGH' ? ag.redText : level === 'MEDIUM' ? ag.amberText : ag.greenDark;
  return <Text style={[styles.riskText, { color }]}>{RISK_STYLE[level].label} risk</Text>;
}

export function AuditStatusPill({ status }: { status: AuditStatus }) {
  const s = status === 'SUBMITTED' ? { label: 'Completed', bg: ag.greenSoft, fg: ag.greenDark } : AUDIT_STATUS_STYLE[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export function AreaStatusPill({ status }: { status: AreaStatus }) {
  const s = status === 'COMPLETED' ? { label: 'Completed', bg: ag.greenSoft, fg: ag.greenDark } : AREA_STATUS_STYLE[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

// ---- buttons ----------------------------------------------------------------

export function GreenButton({
  label, onPress, variant = 'solid', loading, disabled, style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'outline' | 'link';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        variant === 'solid' && styles.btnSolid,
        variant === 'outline' && styles.btnOutline,
        variant === 'link' && styles.btnLink,
        pressed && variant === 'solid' && styles.btnSolidPressed,
        pressed && variant !== 'solid' && styles.btnGhostPressed,
        off && styles.btnOff,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'solid' ? colors.textOnPrimary : ag.green} />
      ) : (
        <Text style={[styles.btnText, variant === 'solid' ? styles.btnTextSolid : styles.btnTextGreen]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Button pinned to the bottom of a screen (the tab bar below already handles the safe area). */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return <View style={[styles.bottomBar, styles.bottomBarPad]}>{children}</View>;
}

// ---- form fields --------------------------------------------------------------

export function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text}
      {required ? <Text style={styles.req}> *</Text> : null}
    </Text>
  );
}

export function Input({
  label, required, value, onChangeText, placeholder, multiline, editable = true, keyboardType, maxLength,
}: {
  label?: string;
  required?: boolean;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel text={label} required={required} /> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        editable={editable}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={[styles.input, multiline && styles.inputMulti, !editable && styles.inputReadonly]}
      />
    </View>
  );
}

/** Looks like a dropdown; opens a bottom-sheet list. */
export function SelectField({
  label, required, value, placeholder = 'Select', onPress, disabled,
}: {
  label?: string;
  required?: boolean;
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel text={label} required={required} /> : null}
      <Pressable onPress={onPress} disabled={disabled} style={[styles.input, styles.select, disabled && styles.inputReadonly]}>
        <Text style={[styles.selectText, !value && styles.placeholder]} numberOfLines={1}>{value || placeholder}</Text>
        <View style={styles.chevDown}><ChevronRightIcon size={16} color={colors.textMuted} /></View>
      </Pressable>
    </View>
  );
}

export interface PickOption {
  value: string;
  label: string;
  sub?: string | null;
}

/** Bottom sheet list picker (single or multi select, optional search). */
export function PickerSheet({
  visible, title, options, selected, multi, onSelect, onClose, searchable, onSearch, emptyText,
}: {
  visible: boolean;
  title: string;
  options: PickOption[];
  selected: string[];
  multi?: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
  searchable?: boolean;
  onSearch?: (q: string) => void;
  emptyText?: string;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const shown = useMemo(
    () => (searchable && !onSearch && q ? options.filter(o => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q.toLowerCase())) : options),
    [options, q, searchable, onSearch],
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.done}>{multi ? 'Done' : 'Close'}</Text></Pressable>
        </View>
        {searchable ? (
          <TextInput
            value={q}
            onChangeText={t => { setQ(t); onSearch?.(t); }}
            placeholder="Search…"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.sheetSearch]}
          />
        ) : null}
        <FlatList
          data={shown}
          keyExtractor={o => o.value}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>{emptyText || 'Nothing found'}</Text>}
          renderItem={({ item }) => {
            const on = selected.includes(item.value);
            return (
              <Pressable
                onPress={() => { onSelect(item.value); if (!multi) onClose(); }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <View style={styles.flex}>
                  <Text style={[styles.optionText, on && styles.optionOn]}>{item.label}</Text>
                  {item.sub ? <Text style={styles.optionSub} numberOfLines={1}>{item.sub}</Text> : null}
                </View>
                {on ? <CheckCircleIcon size={20} color={ag.green} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

// ---- date ---------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

export function DateField({
  label, required, value, onChange, placeholder = 'Select date',
}: {
  label: string;
  required?: boolean;
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel text={label} required={required} />
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.select]}>
        <Text style={[styles.selectText, !value && styles.placeholder]}>{value ? fmtDate(value) : placeholder}</Text>
        <CalendarIcon size={18} color={colors.textMuted} />
      </Pressable>
      <CalendarSheet visible={open} value={value} onClose={() => setOpen(false)} onPick={d => { onChange(d); setOpen(false); }} />
    </View>
  );
}

function CalendarSheet({ visible, value, onPick, onClose }: { visible: boolean; value: string | null; onPick: (iso: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const start = value ? new Date(`${value}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const first = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = new Date();
  const iso = (d: number) => `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
  const move = (delta: number) => setCursor(c => {
    const n = new Date(c.y, c.m + delta, 1);
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.sheetHead}>
          <Pressable onPress={() => move(-1)} hitSlop={10}><ChevronLeftIcon size={22} color={ag.green} /></Pressable>
          <Text style={styles.sheetTitle}>{MONTHS[cursor.m]} {cursor.y}</Text>
          <Pressable onPress={() => move(1)} hitSlop={10}><ChevronRightIcon size={22} color={ag.green} /></Pressable>
        </View>
        <View style={styles.calGrid}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={`h${i}`} style={styles.calHead}>{d}</Text>)}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.calCell} />;
            const on = value === iso(d);
            const isToday = today.getFullYear() === cursor.y && today.getMonth() === cursor.m && today.getDate() === d;
            return (
              <Pressable key={iso(d)} onPress={() => onPick(iso(d))} style={[styles.calCell, on && styles.calOn]}>
                <Text style={[styles.calText, isToday && styles.calToday, on && styles.calTextOn]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

// ---- stepper + tabs -------------------------------------------------------------

export function Stepper({ steps, current, onPress }: { steps: string[]; current: number; onPress?: (i: number) => void }) {
  return (
    <View style={styles.stepper}>
      {steps.map((s, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <React.Fragment key={s}>
            {i > 0 ? <View style={[styles.stepLine, (done || on) && styles.stepLineOn]} /> : null}
            <Pressable onPress={() => onPress?.(i)} style={styles.step} hitSlop={6}>
              <View style={[styles.stepDot, (done || on) && styles.stepDotOn]}>
                <Text style={[styles.stepNum, (done || on) && styles.stepNumOn]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, on && styles.stepLabelOn]}>{s}</Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

export function SegTabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(o => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segBtn, value === o.value && styles.segOn]}>
          <Text style={[styles.segText, value === o.value && styles.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Low / Medium / High / Critical segmented choice. */
export function RiskSegment({ levels, value, onChange }: { levels: { code: RiskLevelCode; label: string }[]; value: RiskLevelCode; onChange: (v: RiskLevelCode) => void }) {
  const order: RiskLevelCode[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const list = order.map(c => levels.find(l => l.code === c)).filter((l): l is { code: RiskLevelCode; label: string } => !!l);
  return (
    <View style={styles.riskRow}>
      {list.map(l => {
        const on = value === l.code;
        const s = RISK_STYLE[l.code];
        return (
          <Pressable key={l.code} onPress={() => onChange(l.code)} style={[styles.riskBtn, on && { backgroundColor: s.bg, borderColor: s.bg }]}>
            <Text style={[styles.riskBtnText, on && { color: s.fg }]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- confirm dialog ---------------------------------------------------------------

/**
 * Styled confirmation for the audit screens (instead of the plain Android alert):
 * icon, title, message, and two full-width buttons.
 */
export function ConfirmDialog({
  visible, icon, tone = 'danger', title, message, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel,
}: {
  visible: boolean;
  icon?: React.ReactNode;
  tone?: 'danger' | 'green';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.dlgOverlay} onPress={onCancel}>
        <Pressable style={styles.dlgCard} onPress={e => e.stopPropagation()} accessibilityRole="alert">
          {icon ? <View style={[styles.dlgIcon, danger ? styles.dlgIconDanger : styles.dlgIconGreen]}>{icon}</View> : null}
          <Text style={styles.dlgTitle}>{title}</Text>
          <Text style={styles.dlgMsg}>{message}</Text>
          <View style={styles.dlgBtns}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.dlgBtn, styles.dlgCancel, pressed && styles.dlgCancelPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.dlgCancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [styles.dlgBtn, danger ? styles.dlgDanger : styles.dlgGreen, pressed && styles.dlgPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.dlgConfirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---- messages -------------------------------------------------------------------

/** Row of selectable chips (single or multi select). */
export function ChipRow<T extends string>({
  label, options, selected, onToggle,
}: {
  label?: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel text={label} /> : null}
      <View style={styles.chipRow}>
        {options.map(o => {
          const on = selected.includes(o.value);
          return (
            <Pressable key={o.value} onPress={() => onToggle(o.value)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MessageBox({ tone, title, lines }: { tone: 'error' | 'warn' | 'ok'; title: string; lines?: string[] }) {
  const t = tone === 'error'
    ? { bg: colors.dangerBg, fg: colors.dangerText }
    : tone === 'warn'
    ? { bg: colors.warningBg, fg: colors.warningText }
    : { bg: ag.greenSoft, fg: ag.greenDark };
  return (
    <View style={[styles.msg, { backgroundColor: t.bg }]}>
      <Text style={[styles.msgTitle, { color: t.fg }]}>{title}</Text>
      {lines?.map(l => (
        <Text key={l} style={[styles.msgLine, { color: t.fg }]}>• {l}</Text>
      ))}
    </View>
  );
}

export const auditStyles = StyleSheet.create({
  h1: { ...typography.title, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textMuted },
  strong: { ...typography.bodyMedium, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textMuted },
  label: { ...typography.captionMedium, color: colors.textSecondary, marginBottom: spacing.xxs },
  section: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  badge: { alignSelf: 'flex-start', borderRadius: radii.sm, paddingHorizontal: spacing.xs, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  riskText: { fontSize: 12, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },

  btn: { minHeight: 50, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  btnSolid: { backgroundColor: ag.green },
  btnSolidPressed: { backgroundColor: ag.greenPressed },
  btnOutline: { borderWidth: 1.5, borderColor: ag.green, backgroundColor: colors.surface },
  btnLink: { minHeight: 40 },
  btnGhostPressed: { backgroundColor: ag.greenSofter },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 16, fontWeight: '700' },
  btnTextSolid: { color: colors.textOnPrimary },
  btnTextGreen: { color: ag.green },
  bottomBarPad: { paddingBottom: spacing.sm },
  bottomBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },

  field: { marginBottom: spacing.md },
  fieldLabel: { ...typography.captionMedium, color: colors.textSecondary, marginBottom: 6 },
  req: { color: ag.red },
  input: {
    minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm, color: colors.textPrimary, fontSize: 15,
  },
  inputMulti: { minHeight: 96, paddingTop: spacing.sm, textAlignVertical: 'top' },
  inputReadonly: { backgroundColor: colors.surfaceAlt, color: colors.textMuted },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  placeholder: { color: colors.textMuted },
  chevDown: { transform: [{ rotate: '90deg' }] },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, maxHeight: '75%', paddingHorizontal: spacing.lg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  sheetTitle: { ...typography.subtitle, color: colors.textPrimary },
  sheetSearch: { marginBottom: spacing.sm },
  done: { color: ag.green, fontWeight: '700', fontSize: 15 },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  optionPressed: { backgroundColor: ag.greenSofter },
  optionText: { fontSize: 15, color: colors.textPrimary },
  optionOn: { color: ag.greenDark, fontWeight: '700' },
  optionSub: { ...typography.caption, color: colors.textMuted },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.lg, textAlign: 'center' },

  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calHead: { width: `${100 / 7}%`, textAlign: 'center', ...typography.captionMedium, color: colors.textMuted, paddingVertical: 6 },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  calOn: { backgroundColor: ag.green },
  calText: { fontSize: 15, color: colors.textPrimary },
  calToday: { color: ag.green, fontWeight: '700' },
  calTextOn: { color: colors.textOnPrimary, fontWeight: '700' },

  stepper: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  step: { alignItems: 'center', width: 64 },
  stepDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepDotOn: { backgroundColor: ag.green, borderColor: ag.green },
  stepNum: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  stepNumOn: { color: colors.textOnPrimary },
  stepLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  stepLabelOn: { color: ag.greenDark, fontWeight: '700' },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginTop: 14 },
  stepLineOn: { backgroundColor: ag.green },

  seg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: 3, marginBottom: spacing.md },
  segBtn: { flex: 1, minHeight: 38, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: ag.greenBorder },
  segText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  segTextOn: { color: ag.greenDark },

  riskRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  riskBtn: { flex: 1, minHeight: 42, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  riskBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 36, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  chipOn: { borderColor: ag.green, backgroundColor: ag.greenSofter },
  chipText: { ...typography.captionMedium, color: colors.textSecondary },
  chipTextOn: { color: ag.greenDark },

  dlgOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dlgCard: {
    width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: radii.xl, paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl, paddingBottom: spacing.lg, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  dlgIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  dlgIconDanger: { backgroundColor: colors.dangerBg },
  dlgIconGreen: { backgroundColor: ag.greenSoft },
  dlgTitle: { ...typography.title, fontSize: 20, color: colors.textPrimary, textAlign: 'center' },
  dlgMsg: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, lineHeight: 21 },
  dlgBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' },
  dlgBtn: { flex: 1, minHeight: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  dlgCancel: { backgroundColor: colors.surfaceAlt },
  dlgCancelPressed: { backgroundColor: colors.border },
  dlgCancelText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  dlgDanger: { backgroundColor: ag.red },
  dlgGreen: { backgroundColor: ag.green },
  dlgPressed: { opacity: 0.85 },
  dlgConfirmText: { fontSize: 16, fontWeight: '700', color: colors.textOnPrimary },

  msg: { borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.md, gap: 2 },
  msgTitle: { ...typography.bodyMedium },
  msgLine: { ...typography.caption },
});
