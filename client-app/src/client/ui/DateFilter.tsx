import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { CloseIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { toDateStr, todayStr } from '../../tasks/format';
import { DateSheet } from '../../tasks/ui/sheets';
import { formatDate } from '../format';
import { Popup } from './Popup';

/**
 * Date filter: a round calendar button (solid blue while a range is on), a removable chip with
 * the range, and a popup with quick choices (This month, Last 3 months, This year) or a custom
 * From / To. Same look as the Documents page.
 */

export type DatePreset = 'any' | 'month' | '3m' | 'year' | 'custom';
export interface DateRange {
  preset: DatePreset;
  from: string;
  to: string;
}
export const ANY_TIME: DateRange = { preset: 'any', from: '', to: '' };

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: 'month', label: 'This month' },
  { key: '3m', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

function presetRange(p: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = todayStr();
  if (p === 'month') return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (p === '3m') return { from: toDateStr(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), to: today };
  if (p === 'year') return { from: toDateStr(new Date(now.getFullYear(), 0, 1)), to: today };
  return { from: '', to: '' };
}

const shortDate = (s: string) => formatDate(s, { day: 'numeric', month: 'short' });

export function rangeLabel(r: DateRange): string {
  if (r.preset === 'any') return '';
  if (r.preset === 'custom') return `${shortDate(r.from)} – ${shortDate(r.to)}`;
  return PRESETS.find((p) => p.key === r.preset)!.label;
}

const BLUE = '#0B57D0';

const factory = (t: CrmTheme) => {
  const ink = t.isDark ? '#E6E7EA' : '#1B1C1F';
  const sub = t.isDark ? '#A3A7AE' : '#5E6470';
  const faint = t.isDark ? '#6E737C' : '#9AA1AD';
  const blue = t.isDark ? '#A8C7FA' : BLUE;
  return {
    pressed: { opacity: 0.7 },
    btn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1.5, borderColor: t.isDark ? 'rgba(168,199,250,0.35)' : '#A9C4F5' },
    btnOn: { backgroundColor: blue, borderColor: blue },
    chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, alignSelf: 'flex-start' as const, paddingLeft: 12, paddingRight: 8, height: 32, borderRadius: 16, backgroundColor: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD' },
    chipText: { fontSize: 13, fontWeight: '600' as const, color: blue },
    presets: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    preset: { paddingHorizontal: 14, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB', borderWidth: 1.5, borderColor: 'transparent' },
    presetOn: { backgroundColor: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD', borderColor: blue },
    presetText: { fontSize: 14, fontWeight: '500' as const, color: ink },
    presetTextOn: { color: blue, fontWeight: '700' as const },
    range: { flexDirection: 'row' as const, gap: 10, marginTop: 16 },
    rangeBox: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB' },
    rangeLabel: { fontSize: 12, fontWeight: '600' as const, color: sub },
    rangeValue: { fontSize: 15, fontWeight: '700' as const, color: ink, marginTop: 2 },
    rangePlaceholder: { color: faint, fontWeight: '500' as const },
    actions: { flexDirection: 'row' as const, gap: 10, marginTop: 20 },
    ghostBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB' },
    ghostText: { fontSize: 15, fontWeight: '600' as const, color: ink },
    primaryBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: blue },
    primaryText: { fontSize: 15, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
    off: { opacity: 0.4 },
  };
};

function CalendarGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke={color} strokeWidth={1.9} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx="8.5" cy="14.5" r="1.1" fill={color} />
      <Circle cx="12" cy="14.5" r="1.1" fill={color} />
    </Svg>
  );
}

/** The round calendar button; opens the date popup. */
export function DateFilterButton({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const on = value.preset !== 'any';
  const blue = theme.isDark ? '#A8C7FA' : BLUE;

  const choose = (p: DatePreset) => setDraft(p === 'custom' ? { preset: 'custom', from: draft.from, to: draft.to } : { preset: p, ...presetRange(p) });
  const ready = draft.preset !== 'custom' || (!!draft.from && !!draft.to);

  return (
    <>
      <Pressable
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        style={({ pressed }) => [styles.btn, on && styles.btnOn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Filter by date"
      >
        <CalendarGlyph color={on ? (theme.isDark ? '#0B1B3A' : '#FFFFFF') : blue} />
      </Pressable>

      <Popup visible={open && !picking} onClose={() => setOpen(false)} title="Filter by date">
        <View style={styles.presets}>
          {PRESETS.map((p) => {
            const sel = draft.preset === p.key;
            return (
              <Pressable key={p.key} onPress={() => choose(p.key)} style={({ pressed }) => [styles.preset, sel && styles.presetOn, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: sel }}>
                <Text style={[styles.presetText, sel && styles.presetTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {draft.preset === 'custom' && (
          <View style={styles.range}>
            {(['from', 'to'] as const).map((which) => (
              <Pressable key={which} onPress={() => setPicking(which)} style={({ pressed }) => [styles.rangeBox, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.rangeLabel}>{which === 'from' ? 'From' : 'To'}</Text>
                <Text style={[styles.rangeValue, !draft[which] && styles.rangePlaceholder]}>
                  {draft[which] ? formatDate(draft[which], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick date'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.actions}>
          <Pressable onPress={() => setDraft(ANY_TIME)} style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onChange(draft.preset === 'custom' || draft.preset === 'any' ? draft : { preset: draft.preset, ...presetRange(draft.preset) });
              setOpen(false);
            }}
            disabled={!ready}
            style={({ pressed }) => [styles.primaryBtn, !ready && styles.off, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Apply</Text>
          </Pressable>
        </View>
      </Popup>
      <DateSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={picking === 'to' ? 'To date' : 'From date'}
        value={(picking && draft[picking]) || null}
        minDate={picking === 'to' && draft.from ? draft.from : undefined}
        onPick={(d) => {
          setDraft((cur) => {
            const next = { ...cur, [picking as 'from' | 'to']: d };
            if (next.from && next.to && next.from > next.to) next.to = next.from;
            return next;
          });
          setPicking(null);
        }}
      />
    </>
  );
}

/** The applied range as a removable chip (renders nothing for "Any time"). */
export function DateFilterChip({ value, onClear, style }: { value: DateRange; onClear: () => void; style?: object }) {
  const { styles, theme } = useCrmStyles(factory);
  const label = rangeLabel(value);
  if (!label) return null;
  return (
    <Pressable onPress={onClear} style={({ pressed }) => [styles.chip, style, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Remove date filter ${label}`}>
      <Text style={styles.chipText}>{label}</Text>
      <CloseIcon size={14} color={theme.isDark ? '#A8C7FA' : BLUE} />
    </Pressable>
  );
}
