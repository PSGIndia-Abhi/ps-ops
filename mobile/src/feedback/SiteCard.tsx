import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CalendarIcon, ChevronRightIcon, ClockIcon, PhoneIcon } from '../components/icons';
import { initialsOf } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { StatusBadge, toneColors } from '../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../theme';
import { callStatusMeta, formatDateTime, formatDay, isPast } from './format';
import type { CallRow } from './types';

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  card: { flexDirection: 'row' as const, backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, marginBottom: spacing.sm, overflow: 'hidden' as const, ...t.cardShadow },
  strip: { width: 5 },
  body: { flex: 1, padding: spacing.md },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  initial: { width: 42, height: 42, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  initialText: { ...typography.subtitle, fontWeight: '800' as const },
  siteName: { ...typography.subtitle, color: t.textPrimary },
  city: { ...typography.caption, color: t.textMuted },
  cust: { ...typography.caption, color: t.textSecondary, marginTop: 1 },
  // Every card has the same rows (services: one line; facts: two lines), so all cards are the same height.
  services: { flexDirection: 'row' as const, flexWrap: 'nowrap' as const, gap: 6, marginTop: spacing.sm, overflow: 'hidden' as const },
  svc: { flexShrink: 1, backgroundColor: t.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  svcMore: { flexShrink: 0 },
  svcNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.border, borderStyle: 'dashed' as const },
  svcText: { ...typography.caption, fontSize: 11.5, color: t.textSecondary },
  svcTextNone: { color: t.textMuted },
  added: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: '#DCFCE7' },
  addedText: { color: '#166534', fontSize: 11, fontWeight: '800' as const },
  facts: { marginTop: spacing.sm, gap: 4 },
  factsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  fact: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, flexShrink: 1 },
  factText: { ...typography.caption, color: t.textMuted, flexShrink: 1 },
  foot: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.surfaceAlt, gap: spacing.sm },
  footText: { ...typography.captionMedium, color: t.textMuted, flex: 1 },
  footLate: { color: t.dangerText },
  btn: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 6, borderWidth: 1, borderColor: t.primary },
  btnSolid: { backgroundColor: t.primary },
  btnText: { ...typography.captionMedium, color: t.primary },
  btnTextSolid: { color: t.textOnPrimary },
  pressed: { opacity: 0.8 },
  // Compact card (Home "Needs attention"): name, site, due and the action - nothing else.
  cBody: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cInitial: { width: 36, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  cInitialText: { ...typography.captionMedium, fontWeight: '800' as const },
  cName: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  cFoot: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm, marginTop: 6, paddingLeft: 36 + spacing.sm },
  cDue: { ...typography.caption, color: t.textMuted, flexShrink: 1 },
  cLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  cLinkText: { ...typography.captionMedium, color: t.primary, fontWeight: '700' as const },
  cTake: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: spacing.sm, height: 30, borderRadius: radii.pill, backgroundColor: t.primary },
  cTakeText: { ...typography.captionMedium, color: t.textOnPrimary, fontWeight: '700' as const },
});

/** "General Pest Control, Mosquito Fogging, Ant Treatment" -> two chips and "+1". */
function serviceChips(services: string | null): string[] {
  const all = (services || '').split(',').map((s) => s.trim()).filter(Boolean);
  return all.length > 2 ? [...all.slice(0, 2), `+${all.length - 2}`] : all;
}

/**
 * One site's call for a month: a coloured status strip and badge, the site and customer, services,
 * last visit, and Take call / Open / Review form. onOpen opens a taken call; onTake takes it.
 */
export function SiteCard({
  row,
  myId,
  busy,
  onOpen,
  onTake,
  numberAdded,
  compact = false,
}: {
  row: CallRow;
  myId: number;
  busy?: boolean;
  onOpen: () => void;
  onTake: () => void;
  numberAdded?: boolean;
  /** A small card (Home "Needs attention"): customer, site, due and the action only. */
  compact?: boolean;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const someoneElse = !!row.collector && row.collector.id !== myId;
  const callBack = row.next_call_at && row.status !== 'DONE';
  const late = !!callBack && isPast(row.next_call_at);
  const meta = callStatusMeta(row.status, row.result);
  const tint = toneColors(theme, meta.tone);
  const accent = meta.tone === 'neutral' ? theme.primary : tint.fg;
  const chips = serviceChips(row.services);

  if (compact) {
    const due = callBack
      ? `Call back ${formatDateTime(row.next_call_at)}`
      : !row.due_date
      ? 'No due date'
      : row.overdue
      ? `Overdue · due ${formatDay(row.due_date)}`
      : `Due ${formatDay(row.due_date)}`;
    const dueRed = late || (!callBack && row.overdue);
    return (
      <Pressable onPress={row.collector ? onOpen : undefined} style={({ pressed }) => [styles.card, pressed && row.collector ? styles.pressed : null]}>
        <View style={[styles.strip, { backgroundColor: accent }]} />
        <View style={styles.cBody}>
          <View style={styles.top}>
            <View style={[styles.cInitial, { backgroundColor: tint.bg }]}>
              <Text style={[styles.cInitialText, { color: accent }]}>{initialsOf(row.customer.name)}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.cName} numberOfLines={1}>
                {row.customer.name}
              </Text>
              <Text style={styles.cust} numberOfLines={1}>
                {row.site.name}
                {row.site.city ? ` · ${row.site.city}` : ''}
              </Text>
            </View>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </View>
          <View style={styles.cFoot}>
            <Text style={[styles.cDue, dueRed && { color: theme.dangerText, fontWeight: '700' }]} numberOfLines={1}>
              {due}
            </Text>
            {row.collector ? (
              <View style={styles.cLink}>
                <Text style={styles.cLinkText}>{row.status === 'FORM_RECEIVED' ? 'Review form' : row.status === 'DONE' || someoneElse ? 'View' : 'Open'}</Text>
                <ChevronRightIcon size={14} color={theme.primary} />
              </View>
            ) : (
              <Pressable onPress={onTake} disabled={busy} style={({ pressed }) => [styles.cTake, pressed && styles.pressed]} accessibilityRole="button">
                {busy ? (
                  <ActivityIndicator size="small" color={theme.textOnPrimary} />
                ) : (
                  <>
                    <PhoneIcon size={12} color={theme.textOnPrimary} />
                    <Text style={styles.cTakeText}>Take call</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={row.collector ? onOpen : undefined} style={({ pressed }) => [styles.card, pressed && row.collector ? styles.pressed : null]}>
      <View style={[styles.strip, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={[styles.initial, { backgroundColor: tint.bg }]}>
            <Text style={[styles.initialText, { color: accent }]}>{initialsOf(row.customer.name)}</Text>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.siteName} numberOfLines={1}>
              {row.customer.name}
            </Text>
            <Text style={styles.cust} numberOfLines={1}>
              {row.site.name}
              {row.site.city ? ` · ${row.site.city}` : ''}
            </Text>
          </View>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </View>
        {/* Services: always one line (an empty site says so), so every card is the same height. */}
        <View style={styles.services}>
          {/* The service coordinator added the right number and nobody has called it yet. */}
          {numberAdded && (
            <View style={styles.added}>
              <Text style={styles.addedText} numberOfLines={1}>● Number added</Text>
            </View>
          )}
          {chips.length > 0 ? (
            chips.map((s) => (
              <View key={s} style={[styles.svc, s.startsWith('+') && styles.svcMore]}>
                <Text style={styles.svcText} numberOfLines={1}>
                  {s}
                </Text>
              </View>
            ))
          ) : (
            <View style={[styles.svc, styles.svcNone]}>
              <Text style={[styles.svcText, styles.svcTextNone]} numberOfLines={1}>
                No service this month
              </Text>
            </View>
          )}
        </View>

        {/* Facts: always two lines - due + visits, then the last visit. */}
        <View style={styles.facts}>
          <View style={styles.factsRow}>
            <View style={styles.fact}>
              <CalendarIcon size={14} color={row.overdue ? theme.dangerText : theme.textMuted} />
              <Text style={[styles.factText, row.overdue && { color: theme.dangerText, fontWeight: '700' }]} numberOfLines={1}>
                {!row.due_date ? 'No due date' : row.overdue ? `Overdue · due ${formatDay(row.due_date)}` : `Due ${formatDay(row.due_date)}`}
              </Text>
            </View>
            <View style={[styles.fact, { flexShrink: 0 }]}>
              <ClockIcon size={14} color={theme.textMuted} />
              <Text style={styles.factText} numberOfLines={1}>
                {row.visit_count} visit{row.visit_count === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          <View style={styles.fact}>
            <CalendarIcon size={14} color={theme.textMuted} />
            <Text style={styles.factText} numberOfLines={1}>
              {row.last_visit_date ? `Last visit ${formatDay(row.last_visit_date)}` : row.earlier_visit ? `Earlier visit ${formatDay(row.earlier_visit.date)}` : 'No service yet'}
            </Text>
          </View>
        </View>

        <View style={styles.foot}>
          <Text style={[styles.footText, late && styles.footLate]} numberOfLines={1}>
            {callBack ? `Call back ${formatDateTime(row.next_call_at)}` : row.collector ? (someoneElse ? `Taken by ${row.collector.name}` : 'Your call') : 'Not taken yet'}
          </Text>
          {row.collector ? (
            <View style={[styles.btn, row.status === 'FORM_RECEIVED' && styles.btnSolid]}>
              <Text style={[styles.btnText, row.status === 'FORM_RECEIVED' && styles.btnTextSolid]}>
                {row.status === 'FORM_RECEIVED' ? 'Review form' : row.status === 'DONE' || someoneElse ? 'View' : 'Open'}
              </Text>
              <ChevronRightIcon size={14} color={row.status === 'FORM_RECEIVED' ? theme.textOnPrimary : theme.primary} />
            </View>
          ) : (
            <Pressable onPress={onTake} disabled={busy} style={({ pressed }) => [styles.btn, styles.btnSolid, pressed && styles.pressed]} accessibilityRole="button">
              {busy ? (
                <ActivityIndicator color={theme.textOnPrimary} />
              ) : (
                <>
                  <PhoneIcon size={14} color={theme.textOnPrimary} />
                  <Text style={[styles.btnText, styles.btnTextSolid]}>Take call</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}
