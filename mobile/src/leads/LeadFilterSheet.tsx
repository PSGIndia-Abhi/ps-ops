import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { CalendarIcon, CloseIcon, PersonIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { SearchIcon } from '../crm/ui/crmIcons';
import { addDays, fmtDateShort, todayStr } from '../tasks/format';
import { DateSheet, Sheet } from '../tasks/ui/sheets';
import { ChevronDownIcon } from '../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../theme';

// The Leads screen's filters, behind one icon next to the search: whose leads (sales manager only)
// and the day they were added. The sheet edits a draft; "Show N leads" applies it. What is applied
// shows as small removable chips under the search (ActiveFilterChips).

export type WhenKind = 'any' | 'today' | 'yesterday' | 'range';
export interface WhenFilter {
  kind: WhenKind;
  /** 'YYYY-MM-DD', for kind 'range' (both ends included; from = to is a single day). */
  from?: string;
  to?: string;
}
export const ANY_TIME: WhenFilter = { kind: 'any' };

/** The days a When filter stands for ('YYYY-MM-DD', both included), or null for any day. */
export function whenRange(w: WhenFilter): { from: string; to: string } | null {
  if (w.kind === 'today') return { from: todayStr(), to: todayStr() };
  if (w.kind === 'yesterday') {
    const y = addDays(todayStr(), -1);
    return { from: y, to: y };
  }
  if (w.kind === 'range' && w.from && w.to) return { from: w.from, to: w.to };
  return null;
}

/** The single day a When filter stands for, or null (any time, or a range of several days). */
export function whenDay(w: WhenFilter): string | null {
  const r = whenRange(w);
  return r && r.from === r.to ? r.from : null;
}

const shortDay = (d: string) => fmtDateShort(d).replace(/, \d{4}$/, '');
export function whenLabel(w: WhenFilter): string {
  if (w.kind === 'today') return 'Today';
  if (w.kind === 'yesterday') return 'Yesterday';
  if (w.kind === 'range' && w.from && w.to) {
    return w.from === w.to ? shortDay(w.from) : `${shortDay(w.from)} - ${shortDay(w.to)}`;
  }
  return 'Any time';
}

export interface WhoOption {
  key: string;
  label: string;
  /** Initials on a tint for a person; a group option has none. */
  avatar?: { text: string; bg: string; fg: string };
}

/** Sliders - the filter icon, same 24-grid line style as components/icons. */
function FilterIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7h10M18 7h2M4 17h4M12 17h8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={16} cy={7} r={2} stroke={color} strokeWidth={1.8} />
      <Circle cx={10} cy={17} r={2} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

/** The square button at the end of the search row; the badge counts the filters in use. */
export function FilterButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const on = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={on ? `Filters, ${count} on` : 'Filters'}
      style={({ pressed }) => [
        styles.button,
        on && styles.buttonOn,
        pressed && styles.pressed,
      ]}
    >
      <FilterIcon color={on ? theme.textOnPrimary : theme.textPrimary} />
      {on && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** The filters in use, under the search: each one a chip with an ✕ that removes just that filter. */
export function ActiveFilterChips({
  items,
}: {
  items: { key: string; label: string; onRemove: () => void }[];
}) {
  const { styles, theme } = useCrmStyles(factory);
  if (!items.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.activeRow}
      contentContainerStyle={styles.active}
    >
      {items.map(it => (
        <Pressable
          key={it.key}
          onPress={it.onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${it.label}`}
          style={({ pressed }) => [
            styles.activeChip,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.activeText} numberOfLines={1}>
            {it.label}
          </Text>
          <CloseIcon size={13} color={theme.primary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function LeadFilterSheet({
  visible,
  onClose,
  showWho,
  whoOptions,
  who,
  when,
  countWith,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  /** Sales manager only. */
  showWho: boolean;
  whoOptions: WhoOption[];
  who: string;
  when: WhenFilter;
  /** How many leads a choice would show (for the counts and the button). */
  countWith: (who: string, when: WhenFilter) => number;
  onApply: (who: string, when: WhenFilter) => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [draftWho, setDraftWho] = useState(who);
  const [draftWhen, setDraftWhen] = useState<WhenFilter>(when);
  // Which end of the date range the calendar is open for.
  const [calendar, setCalendar] = useState<'from' | 'to' | null>(null);
  const [q, setQ] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  // Group choices (Everyone / Added by me / Unassigned) have no avatar; people do.
  const groups = whoOptions.filter(o => !o.avatar);
  const people = whoOptions.filter(o => !!o.avatar);
  const needle = q.trim().toLowerCase();
  const shownPeople = needle
    ? people.filter(o => o.label.toLowerCase().includes(needle))
    : people;
  const picked = people.find(o => o.key === draftWho);

  // Each time it opens it starts from what is applied now.
  useEffect(() => {
    if (visible) {
      setDraftWho(who);
      setDraftWhen(when);
      setQ('');
      setDropOpen(false);
    }
  }, [visible, who, when]);

  const total = countWith(draftWho, draftWhen);
  const WHEN_KINDS: WhenKind[] = ['any', 'today', 'yesterday'];

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>Filters</Text>
        <Pressable
          onPress={() => {
            setDraftWho('all');
            setDraftWhen(ANY_TIME);
          }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={styles.reset}>Reset</Text>
        </Pressable>
      </View>

      <View>
        {showWho && (
          <>
            <Text style={styles.section}>WHOSE LEADS</Text>
            {/* The three group choices, side by side. */}
            <View style={styles.quick}>
              {groups.map(o => {
                const on = draftWho === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => setDraftWho(o.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      styles.quickItem,
                      on && styles.pillOn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.quickCount, on && styles.pillTextOn]}>
                      {countWith(o.key, draftWhen)}
                    </Text>
                    <Text
                      style={[styles.quickLabel, on && styles.pillTextOn]}
                      numberOfLines={1}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Each sales person, in a dropdown: the field shows who is picked; tapping it opens the
                list (searchable, a few rows tall however big the team is) right below. */}
            {people.length > 0 && (
              <>
                <Text style={styles.section}>SALES PERSON</Text>
                <Pressable
                  onPress={() => {
                    setDropOpen(v => !v);
                    setQ('');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: dropOpen }}
                  accessibilityLabel={`Sales person: ${
                    picked ? picked.label : 'Any'
                  }`}
                  style={({ pressed }) => [
                    styles.drop,
                    (dropOpen || !!picked) && styles.dropOn,
                    pressed && styles.pressed,
                  ]}
                >
                  {picked ? (
                    <View
                      style={[
                        styles.avatarSmall,
                        { backgroundColor: picked.avatar?.bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          { color: picked.avatar?.fg },
                        ]}
                      >
                        {picked.avatar?.text}
                      </Text>
                    </View>
                  ) : (
                    <PersonIcon size={18} color={theme.textMuted} />
                  )}
                  <Text
                    style={[styles.dropText, !picked && styles.dropPlaceholder]}
                    numberOfLines={1}
                  >
                    {picked ? picked.label : 'Any sales person'}
                  </Text>
                  {!!picked && (
                    <Text style={styles.personCount}>
                      {countWith(picked.key, draftWhen)}
                    </Text>
                  )}
                  <View style={dropOpen ? styles.chevronUp : undefined}>
                    <ChevronDownIcon size={18} color={theme.textMuted} />
                  </View>
                </Pressable>
                {dropOpen && (
                  <View style={styles.people}>
                    {people.length > 5 && (
                      <View style={styles.search}>
                        <SearchIcon size={16} color={theme.textMuted} />
                        <TextInput
                          value={q}
                          onChangeText={setQ}
                          placeholder="Search sales person…"
                          placeholderTextColor={theme.textMuted}
                          style={styles.searchInput}
                          autoCorrect={false}
                        />
                      </View>
                    )}
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      style={styles.peopleScroll}
                    >
                      {shownPeople.map((o, i) => {
                        const on = draftWho === o.key;
                        return (
                          <Pressable
                            key={o.key}
                            onPress={() => {
                              setDraftWho(on ? 'all' : o.key);
                              setDropOpen(false);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                            style={({ pressed }) => [
                              styles.person,
                              i > 0 && styles.personDivider,
                              on && styles.personOn,
                              pressed && styles.pressed,
                            ]}
                          >
                            <View
                              style={[
                                styles.avatar,
                                { backgroundColor: o.avatar?.bg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.avatarText,
                                  { color: o.avatar?.fg },
                                ]}
                              >
                                {o.avatar?.text}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.personName,
                                on && styles.personNameOn,
                              ]}
                              numberOfLines={1}
                            >
                              {o.label}
                            </Text>
                            <Text style={styles.personCount}>
                              {countWith(o.key, draftWhen)}
                            </Text>
                            <View style={[styles.radio, on && styles.radioOn]}>
                              {on && <View style={styles.radioDot} />}
                            </View>
                          </Pressable>
                        );
                      })}
                      {shownPeople.length === 0 && (
                        <Text style={styles.noMatch}>
                          No one matches “{q}”.
                        </Text>
                      )}
                    </ScrollView>
                  </View>
                )}
              </>
            )}
          </>
        )}

        <Text style={styles.section}>ADDED</Text>
        <View style={styles.wrap}>
          {WHEN_KINDS.map(k => {
            const on = draftWhen.kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => setDraftWhen({ kind: k })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.pill,
                  on && styles.pillOn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.pillText, on && styles.pillTextOn]}>
                  {whenLabel({ kind: k })}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Or a date range: From and To (both included). */}
        <View style={styles.rangeRow}>
          {(['from', 'to'] as const).map(end => {
            const value = draftWhen.kind === 'range' ? draftWhen[end] : undefined;
            const on = !!value;
            return (
              <Pressable
                key={end}
                onPress={() => setCalendar(end)}
                accessibilityRole="button"
                accessibilityLabel={`${end === 'from' ? 'From' : 'To'} date${value ? `, ${shortDay(value)}` : ''}`}
                style={({ pressed }) => [styles.rangeBox, on && styles.rangeBoxOn, pressed && styles.pressed]}
              >
                <CalendarIcon size={16} color={on ? theme.primary : theme.textMuted} />
                <View style={styles.rangeText}>
                  <Text style={styles.rangeLabel}>{end === 'from' ? 'FROM' : 'TO'}</Text>
                  <Text style={[styles.rangeValue, !on && styles.rangePlaceholder]} numberOfLines={1}>
                    {value ? fmtDateShort(value) : 'Select date'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() => {
          onApply(draftWho, draftWhen);
          onClose();
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.apply, pressed && styles.pressed]}
      >
        <Text style={styles.applyText}>{`Show ${total} lead${
          total === 1 ? '' : 's'
        }`}</Text>
      </Pressable>

      <DateSheet
        visible={calendar !== null}
        onClose={() => setCalendar(null)}
        value={calendar && draftWhen.kind === 'range' ? draftWhen[calendar] ?? null : null}
        minDate={calendar === 'to' && draftWhen.kind === 'range' ? draftWhen.from : undefined}
        title={calendar === 'to' ? 'Added up to' : 'Added from'}
        onPick={d => {
          // Picking one end alone gives a one-day range; a From after the To moves the To along.
          const cur: WhenFilter = draftWhen.kind === 'range' ? draftWhen : ANY_TIME;
          let from = calendar === 'from' ? d : cur.from ?? d;
          let to = calendar === 'to' ? d : cur.to ?? d;
          if (from > to) {
            if (calendar === 'from') to = from;
            else from = to;
          }
          setDraftWhen({ kind: 'range', from, to });
          setCalendar(null);
        }}
      />
    </Sheet>
  );
}

const factory = (t: CrmTheme) => ({
  pressed: { opacity: 0.75 },
  button: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonOn: { backgroundColor: t.primary, borderColor: t.primary },
  badge: {
    position: 'absolute' as const,
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: t.crestRed,
    borderWidth: 2,
    borderColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badgeText: { fontSize: 10, fontWeight: '800' as const, color: '#fff' },

  // A horizontal ScrollView grows to fill a column unless told not to.
  activeRow: { flexGrow: 0, flexShrink: 0 },
  active: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    alignItems: 'center' as const,
  },
  activeChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
  },
  activeText: { ...typography.captionMedium, color: t.primary, maxWidth: 160 },

  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.sm,
  },
  headTitle: { ...typography.title, color: t.textPrimary },
  reset: { ...typography.captionMedium, color: t.primary },
  section: {
    ...typography.overline,
    color: t.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  wrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
  },
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  pillOn: { backgroundColor: t.primary, borderColor: t.primary },
  pillText: { ...typography.captionMedium, fontSize: 14, color: t.textPrimary },
  pillTextOn: { color: '#fff' },
  rangeRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.sm },
  rangeBox: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  rangeBoxOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  rangeText: { flex: 1, minWidth: 0 },
  rangeLabel: { ...typography.overline, fontSize: 10, color: t.textMuted },
  rangeValue: { ...typography.bodyMedium, fontSize: 14, color: t.textPrimary },
  rangePlaceholder: { color: t.textMuted, fontWeight: '400' as const },
  pillCount: { ...typography.caption, color: t.textMuted },
  quick: { flexDirection: 'row' as const, gap: spacing.xs },
  quickItem: {
    flex: 1,
    minHeight: 58,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  quickCount: { ...typography.subtitle, color: t.textPrimary },
  quickLabel: { ...typography.caption, color: t.textSecondary },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: t.surfaceAlt,
    marginBottom: spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: t.textPrimary,
    paddingVertical: 0,
  },
  drop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  dropOn: { borderColor: t.primary },
  dropText: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  dropPlaceholder: { color: t.textMuted, fontWeight: '400' as const },
  chevronUp: { transform: [{ rotate: '180deg' }] },
  avatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  people: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.lg,
    overflow: 'hidden' as const,
    marginTop: spacing.xs,
    padding: spacing.xs,
  },
  // About four and a half rows, so a long team scrolls inside the list.
  peopleScroll: { maxHeight: 236 },
  person: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  personDivider: { borderTopWidth: 1, borderTopColor: t.border },
  personOn: { backgroundColor: t.primarySoftBg },
  personName: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  personNameOn: { color: t.primary },
  personCount: { ...typography.captionMedium, color: t.textMuted },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioOn: { borderColor: t.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: t.primary,
  },
  noMatch: {
    ...typography.caption,
    color: t.textMuted,
    padding: spacing.md,
    textAlign: 'center' as const,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { fontSize: 11, fontWeight: '700' as const },
  apply: {
    marginTop: spacing.lg,
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  applyText: { ...typography.button, color: '#fff' },
});
