import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons';
import { MONTHS_LONG, parseDate, toDateStr, todayStr, WEEKDAYS } from '../format';
import { font, radius, t } from '../theme';
import type { TeamMember } from '../types';
import { Avatar, PrimaryButton } from './primitives';
import { CheckIcon, SearchIcon } from './taskIcons';

/**
 * Bottom sheets. Date/time are picked with in-app sheets rather than a new
 * native date-picker dependency - small, on-brand, and one less native module.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
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
  icon?: React.ReactNode;
  danger?: boolean;
  onPress: () => void;
}

export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {actions.map((a) => (
        <Pressable
          key={a.key}
          onPress={() => {
            onClose();
            a.onPress();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: '#F4F3F6' }]}
        >
          <View style={[styles.actionIcon, a.danger && { backgroundColor: t.dangerSoft }]}>{a.icon}</View>
          <Text style={[styles.actionLabel, a.danger && { color: t.danger }]}>{a.label}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

// ---- date ------------------------------------------------------------------

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
          <ChevronLeftIcon size={20} color={t.ink} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTHS_LONG[cursor.m]} {cursor.y}
        </Text>
        <Pressable onPress={() => shift(1)} style={styles.monthNav} accessibilityLabel="Next month">
          <ChevronRightIcon size={20} color={t.ink} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[styles.cell, styles.weekday]}>
            {w.slice(0, 2)}
          </Text>
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
                <Text style={[styles.dayText, disabled && { color: '#C9C9CE' }, selected && { color: t.onInk }]}>
                  {Number(d.slice(8))}
                </Text>
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

// ---- time ------------------------------------------------------------------

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

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
  const [h24, m] = (value || '10:00').split(':').map(Number);
  const [hour, setHour] = useState(h24 % 12 || 12);
  const [minute, setMinute] = useState(m - (m % 5));
  const [pm, setPm] = useState(h24 >= 12);
  const pad = (n: number) => String(n).padStart(2, '0');

  useEffect(() => {
    if (!visible) return;
    const [vh, vm] = (value || '10:00').split(':').map(Number);
    setHour(vh % 12 || 12);
    setMinute(vm - (vm % 5));
    setPm(vh >= 12);
  }, [visible, value]);

  function confirm() {
    const hh = (hour % 12) + (pm ? 12 : 0);
    onPick(`${pad(hh)}:${pad(minute)}`);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a time">
      <Text style={styles.timePreview}>
        {hour}:{pad(minute)} {pm ? 'PM' : 'AM'}
      </Text>
      <View style={styles.ampm}>
        {['AM', 'PM'].map((x) => {
          const on = (x === 'PM') === pm;
          return (
            <Pressable key={x} onPress={() => setPm(x === 'PM')} style={[styles.ampmBtn, on && styles.ampmOn]}>
              <Text style={[styles.ampmText, on && { color: t.onInk }]}>{x}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.timeLabel}>Hour</Text>
      <View style={styles.timeGrid}>
        {HOURS.map((h) => (
          <Pressable key={h} onPress={() => setHour(h)} style={[styles.timeCell, hour === h && styles.timeCellOn]}>
            <Text style={[styles.timeCellText, hour === h && { color: t.onInk }]}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.timeLabel}>Minute</Text>
      <View style={styles.timeGrid}>
        {MINUTES.map((x) => (
          <Pressable key={x} onPress={() => setMinute(x)} style={[styles.timeCell, minute === x && styles.timeCellOn]}>
            <Text style={[styles.timeCellText, minute === x && { color: t.onInk }]}>{pad(x)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sheetButtons}>
        {allowNone && (
          <PrimaryButton
            label="No time"
            tone="outline"
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

// ---- people ------------------------------------------------------------------

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
  const [q, setQ] = useState('');
  const shown = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {people.length > 6 && (
        <View style={styles.search}>
          <SearchIcon size={18} color={t.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search people"
            placeholderTextColor={t.textMuted}
            style={styles.searchInput}
          />
        </View>
      )}
      <ScrollView style={styles.peopleList} keyboardShouldPersistTaps="handled">
        {shown.map((p) => {
          const on = p.id === selectedId;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                onPick(p);
                onClose();
              }}
              style={({ pressed }) => [styles.personRow, pressed && { backgroundColor: '#F4F3F6' }]}
              accessibilityRole="button"
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
              {on && <CheckIcon size={20} color={t.ink} />}
            </Pressable>
          );
        })}
        {shown.length === 0 && <Text style={styles.noPeople}>No one matches “{q}”.</Text>}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: t.overlay },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '88%',
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#DDDCE1', marginBottom: 14 },
  title: { fontSize: 20, fontFamily: font.medium, color: t.text, marginBottom: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 6 },
  actionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F2F1F4', alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 16, color: t.text, fontFamily: font.regular },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthNav: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2F1F4', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 17, fontFamily: font.medium, color: t.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 12, color: t.textMuted, textAlign: 'center', textAlignVertical: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: t.lime },
  daySelected: { backgroundColor: t.ink, borderColor: t.ink },
  dayText: { fontSize: 15, color: t.text, fontFamily: font.regular },
  todayLink: { alignSelf: 'center', padding: 12 },
  todayText: { fontSize: 15, color: t.ink, fontFamily: font.medium, textDecorationLine: 'underline' },
  timePreview: { fontSize: 38, fontFamily: font.light, color: t.text, textAlign: 'center', marginBottom: 12 },
  ampm: { flexDirection: 'row', alignSelf: 'center', backgroundColor: '#F2F1F4', borderRadius: radius.pill, padding: 4, marginBottom: 6 },
  ampmBtn: { paddingHorizontal: 26, paddingVertical: 10, borderRadius: radius.pill },
  ampmOn: { backgroundColor: t.ink },
  ampmText: { fontSize: 14, fontFamily: font.medium, color: t.text },
  timeLabel: { fontSize: 13, color: t.textMuted, marginTop: 12, marginBottom: 8 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeCell: { width: '14.5%', height: 42, borderRadius: 21, backgroundColor: '#F2F1F4', alignItems: 'center', justifyContent: 'center' },
  timeCellOn: { backgroundColor: t.ink },
  timeCellText: { fontSize: 15, color: t.text, fontFamily: font.medium },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F1F4',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: { flex: 1, minHeight: 48, fontSize: 15, color: t.text },
  peopleList: { maxHeight: 440 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, borderRadius: 16, paddingHorizontal: 6 },
  personName: { fontSize: 15, fontFamily: font.medium, color: t.text },
  personRole: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  noPeople: { textAlign: 'center', color: t.textMuted, padding: 20 },
});
