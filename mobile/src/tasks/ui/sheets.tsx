import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { radii, spacing, typography } from '../../theme';
import { MONTHS_LONG, parseDate, toDateStr, todayStr, WEEKDAYS } from '../format';
import type { TeamMember } from '../types';
import { Avatar } from './parts';
import { CheckIcon, SearchIcon } from './taskIcons';

/**
 * Bottom sheets in the app's own style. Date/time are picked with in-app
 * sheets rather than a new native date-picker dependency.
 */
/** Time-wheel row height and how many rows show (the middle one is the chosen row). */
const WHEEL_ITEM = 46;
const WHEEL_ROWS = 5;

const factory = (t: CrmTheme) => ({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: t.overlay },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    maxHeight: '88%' as const,
  },
  grabber: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginVertical: spacing.sm },
  title: { ...typography.subtitle, color: t.textPrimary, marginBottom: spacing.md },
  actionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 56, borderRadius: radii.md, paddingHorizontal: spacing.xxs },
  actionIcon: { width: 40, height: 40, borderRadius: radii.pill, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  actionIconDanger: { backgroundColor: t.dangerBg },
  // No flex on the label: inside its column it would stretch and push the
  // count line down into the next row.
  actionLabel: { ...typography.bodyMedium, color: t.textPrimary },
  actionLabelOn: { color: t.primary },
  actionSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  actionRowOn: { backgroundColor: t.primarySoftBg },
  actionList: { flexGrow: 0 },
  dangerText: { color: t.dangerText },
  pressedRow: { backgroundColor: t.surfaceAlt },
  monthBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.xs },
  monthNav: { width: 40, height: 40, borderRadius: radii.pill, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  monthLabel: { ...typography.subtitle, color: t.textPrimary },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  cell: { width: `${100 / 7}%` as const, height: 46, alignItems: 'center' as const, justifyContent: 'center' as const },
  weekday: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const },
  day: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  dayToday: { borderWidth: 1.5, borderColor: t.primary },
  daySelected: { backgroundColor: t.primary },
  dayText: { ...typography.body, color: t.textPrimary },
  dayDisabled: { color: t.border },
  onPrimary: { color: t.textOnPrimary },
  todayLink: { alignSelf: 'center' as const, padding: spacing.sm },
  todayText: { ...typography.bodyMedium, color: t.primary },
  timePreview: { ...typography.display, fontSize: 36, color: t.textPrimary, textAlign: 'center' as const, marginBottom: spacing.sm },
  // Time picker: three scroll wheels (hour, minute, AM/PM) over one highlighted row.
  wheels: { flexDirection: 'row' as const, justifyContent: 'center' as const, alignItems: 'center' as const, gap: spacing.xs, height: WHEEL_ITEM * WHEEL_ROWS },
  wheelBand: {
    position: 'absolute' as const, left: 0, right: 0, top: WHEEL_ITEM * Math.floor(WHEEL_ROWS / 2), height: WHEEL_ITEM,
    borderRadius: radii.md, backgroundColor: t.primarySoftBg,
  },
  wheel: { width: 76, height: WHEEL_ITEM * WHEEL_ROWS },
  wheelItem: { height: WHEEL_ITEM, alignItems: 'center' as const, justifyContent: 'center' as const },
  wheelText: { ...typography.subtitle, fontSize: 20, color: t.textMuted },
  wheelTextOn: { fontSize: 24, fontWeight: '700' as const, color: t.primary },
  wheelColon: { ...typography.subtitle, fontSize: 24, fontWeight: '700' as const, color: t.primary },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, minHeight: 46, ...typography.body, color: t.textPrimary },
  peopleList: { maxHeight: 440 },
  personRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 60, borderRadius: radii.md, paddingHorizontal: spacing.xxs },
  personName: { ...typography.bodyMedium, color: t.textPrimary },
  personRole: { ...typography.caption, color: t.textMuted },
  noPeople: { ...typography.body, textAlign: 'center' as const, color: t.textMuted, padding: spacing.lg },
});

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { styles } = useCrmStyles(factory);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          {!!title && <Text style={styles.title}>{title}</Text>}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SheetAction {
  key: string;
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  /** Tint behind the icon (defaults to the soft primary blue). */
  iconBg?: string;
  danger?: boolean;
  /** The option currently in use - shown with a blue check instead of the chevron. */
  selected?: boolean;
  onPress: () => void;
}

export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={styles.actionList} showsVerticalScrollIndicator={false}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => {
              onClose();
              a.onPress();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: !!a.selected }}
            style={({ pressed }) => [styles.actionRow, a.selected && styles.actionRowOn, pressed && styles.pressedRow]}
          >
            <View style={[styles.actionIcon, !!a.iconBg && { backgroundColor: a.iconBg }, a.danger && styles.actionIconDanger]}>{a.icon}</View>
            <View style={styles.flex}>
              <Text style={[styles.actionLabel, a.selected && styles.actionLabelOn, a.danger && styles.dangerText]}>{a.label}</Text>
              {!!a.sub && <Text style={styles.actionSub}>{a.sub}</Text>}
            </View>
            {a.selected ? <CheckIcon size={18} color={theme.primary} /> : !a.danger && <ChevronRightIcon size={16} color={theme.textMuted} />}
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

export function DateSheet({
  visible,
  onClose,
  value,
  onPick,
  minDate,
  title = 'Pick a date',
}: {
  visible: boolean;
  onClose: () => void;
  value: string | null;
  onPick: (date: string) => void;
  minDate?: string;
  title?: string;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const base = parseDate(value || todayStr());
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const today = todayStr();

  useEffect(() => {
    if (!visible) return;
    const d = parseDate(value || todayStr());
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }, [visible, value]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const daysIn = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const blanks = Array.from({ length: first.getDay() }, () => null);
    const days = Array.from({ length: daysIn }, (_, i) => toDateStr(new Date(cursor.y, cursor.m, i + 1)));
    return [...blanks, ...days];
  }, [cursor]);

  const shift = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.monthBar}>
        <Pressable onPress={() => shift(-1)} style={styles.monthNav} accessibilityLabel="Previous month">
          <ChevronLeftIcon size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTHS_LONG[cursor.m]} {cursor.y}
        </Text>
        <Pressable onPress={() => shift(1)} style={styles.monthNav} accessibilityLabel="Next month">
          <ChevronRightIcon size={20} color={theme.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={styles.cell}>
            <Text style={styles.weekday}>{w.slice(0, 2)}</Text>
          </View>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={styles.cell} />;
          const disabled = !!minDate && d < minDate;
          const selected = d === value;
          return (
            <Pressable
              key={d}
              disabled={disabled}
              onPress={() => {
                onPick(d);
                onClose();
              }}
              style={styles.cell}
              accessibilityRole="button"
              accessibilityLabel={d}
            >
              <View style={[styles.day, d === today && styles.dayToday, selected && styles.daySelected]}>
                <Text style={[styles.dayText, disabled && styles.dayDisabled, selected && styles.onPrimary]}>{Number(d.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => {
          onPick(today);
          onClose();
        }}
        style={styles.todayLink}
      >
        <Text style={styles.todayText}>Today</Text>
      </Pressable>
    </Sheet>
  );
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const MERIDIEM = ['AM', 'PM'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * One scroll wheel: the row in the middle band is the chosen one. It snaps row by row, a tap on a
 * row scrolls it into the middle, and it follows `index` when that is changed from outside.
 */
function Wheel({ items, index, onChange, label }: { items: string[]; index: number; onChange: (i: number) => void; label: string }) {
  const { styles } = useCrmStyles(factory);
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const shown = useRef(index); // the row the wheel is on now
  const [ready, setReady] = useState(false);
  const edge = WHEEL_ITEM * Math.floor(WHEEL_ROWS / 2); // empty space above the first row and below the last

  useEffect(() => {
    if (ready && index !== shown.current) {
      shown.current = index;
      ref.current?.scrollTo({ y: index * WHEEL_ITEM, animated: false });
    }
  }, [index, ready]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM)));
    if (i !== shown.current) {
      shown.current = i;
      onChange(i);
    }
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      contentContainerStyle={{ paddingVertical: edge }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      onScroll={onScroll}
      onLayout={() => {
        ref.current?.scrollTo({ y: index * WHEEL_ITEM, animated: false });
        shown.current = index;
        setReady(true);
      }}
      accessibilityLabel={label}
    >
      {items.map((text, i) => (
        <Pressable key={text} style={styles.wheelItem} onPress={() => ref.current?.scrollTo({ y: i * WHEEL_ITEM, animated: true })} accessibilityRole="button" accessibilityLabel={`${label} ${text}`}>
          <Text style={[styles.wheelText, i === index && styles.wheelTextOn]}>{text}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** value/onPick use 'HH:MM' (24h) or null for "no specific time". */
export function TimeSheet({
  visible,
  onClose,
  value,
  onPick,
  allowNone = true,
}: {
  visible: boolean;
  onClose: () => void;
  value: string | null;
  onPick: (time: string | null) => void;
  allowNone?: boolean;
}) {
  const { styles } = useCrmStyles(factory);
  const [h24, m] = (value || '10:00').split(':').map(Number);
  const [hour, setHour] = useState(h24 % 12 || 12);
  const [minute, setMinute] = useState(m);
  const [pm, setPm] = useState(h24 >= 12);

  useEffect(() => {
    if (!visible) return;
    const [vh, vm] = (value || '10:00').split(':').map(Number);
    setHour(vh % 12 || 12);
    setMinute(vm);
    setPm(vh >= 12);
  }, [visible, value]);

  function confirm() {
    onPick(`${pad2((hour % 12) + (pm ? 12 : 0))}:${pad2(minute)}`);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a time">
      <Text style={styles.timePreview}>
        {hour}:{pad2(minute)} {pm ? 'PM' : 'AM'}
      </Text>
      <View style={styles.wheels}>
        <View style={styles.wheelBand} pointerEvents="none" />
        <Wheel label="Hour" items={HOURS.map(String)} index={HOURS.indexOf(hour)} onChange={(i) => setHour(HOURS[i])} />
        <Text style={styles.wheelColon}>:</Text>
        <Wheel label="Minute" items={MINUTES.map(pad2)} index={minute} onChange={setMinute} />
        <Wheel label="AM or PM" items={MERIDIEM} index={pm ? 1 : 0} onChange={(i) => setPm(i === 1)} />
      </View>
      <View style={styles.sheetButtons}>
        {allowNone && (
          <PrimaryButton
            label="No time"
            variant="secondary"
            style={styles.flex}
            onPress={() => {
              onPick(null);
              onClose();
            }}
          />
        )}
        <PrimaryButton label="Set time" style={styles.flex} onPress={confirm} />
      </View>
    </Sheet>
  );
}

/** A searchable person list with a radio - used by Create Task's "Assign To". */
export function PeopleList({
  people,
  selectedId,
  meId,
  onPick,
  search = true,
}: {
  people: TeamMember[];
  selectedId: number | null;
  meId: number;
  onPick: (p: TeamMember) => void;
  search?: boolean;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [q, setQ] = useState('');
  const shown = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {search && (
        <View style={styles.search}>
          <SearchIcon size={18} color={theme.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search team members..." placeholderTextColor={theme.textMuted} style={styles.searchInput} />
        </View>
      )}
      {shown.map((p) => {
        const on = p.id === selectedId;
        return (
          <Pressable
            key={p.id}
            onPress={() => onPick(p)}
            style={({ pressed }) => [styles.personRow, pressed && styles.pressedRow]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Avatar name={p.name} id={p.id} size={40} />
            <View style={styles.flex}>
              <Text style={styles.personName}>
                {p.name}
                {p.id === meId ? ' (you)' : ''}
              </Text>
              {!!(p.designation || p.role) && <Text style={styles.personRole}>{p.designation || p.role}</Text>}
            </View>
            <RadioDot on={on} />
          </Pressable>
        );
      })}
      {shown.length === 0 && <Text style={styles.noPeople}>No one matches “{q}”.</Text>}
    </>
  );
}

export function RadioDot({ on }: { on: boolean }) {
  const { theme } = useCrmStyles(factory);
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: on ? theme.primary : theme.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: theme.primary }} />}
    </View>
  );
}

export function PeopleSheet({
  visible,
  onClose,
  people,
  selectedId,
  meId,
  onPick,
  title = 'Assign to',
}: {
  visible: boolean;
  onClose: () => void;
  people: TeamMember[];
  selectedId: number | null;
  meId: number;
  onPick: (person: TeamMember) => void;
  title?: string;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={styles.peopleList} keyboardShouldPersistTaps="handled">
        <PeopleList
          people={people}
          selectedId={selectedId}
          meId={meId}
          search={people.length > 6}
          onPick={(p) => {
            onPick(p);
            onClose();
          }}
        />
      </ScrollView>
    </Sheet>
  );
}

