import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CalendarIcon, ChevronRightIcon, ClockIcon, PhoneIcon } from '../components/icons';
import { initialsOf } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { StatusBadge, toneColors } from '../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../theme';
import { CALL_STATUS, formatDateTime, formatDay, isPast } from './format';
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
  services: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: spacing.sm },
  svc: { backgroundColor: t.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  svcText: { ...typography.caption, fontSize: 11.5, color: t.textSecondary },
  facts: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, marginTop: spacing.sm },
  fact: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  factText: { ...typography.caption, color: t.textMuted },
  foot: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.surfaceAlt, gap: spacing.sm },
  footText: { ...typography.captionMedium, color: t.textMuted, flex: 1 },
  footLate: { color: t.dangerText },
  btn: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 6, borderWidth: 1, borderColor: t.primary },
  btnSolid: { backgroundColor: t.primary },
  btnText: { ...typography.captionMedium, color: t.primary },
  btnTextSolid: { color: t.textOnPrimary },
  pressed: { opacity: 0.8 },
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
export function SiteCard({ row, myId, busy, onOpen, onTake }: { row: CallRow; myId: number; busy?: boolean; onOpen: () => void; onTake: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const someoneElse = !!row.collector && row.collector.id !== myId;
  const callBack = row.next_call_at && row.status !== 'DONE';
  const late = !!callBack && isPast(row.next_call_at);
  const meta = CALL_STATUS[row.status] || { label: row.status, tone: 'neutral' as const };
  const tint = toneColors(theme, meta.tone);
  const accent = meta.tone === 'neutral' ? theme.primary : tint.fg;
  const chips = serviceChips(row.services);

  return (
    <Pressable onPress={row.request_id ? onOpen : undefined} style={({ pressed }) => [styles.card, pressed && row.request_id ? styles.pressed : null]}>
      <View style={[styles.strip, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={[styles.initial, { backgroundColor: tint.bg }]}>
            <Text style={[styles.initialText, { color: accent }]}>{initialsOf(row.site.name)}</Text>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.siteName} numberOfLines={1}>
              {row.site.name}
              {!!row.site.city && <Text style={styles.city}>  {row.site.city}</Text>}
            </Text>
            <Text style={styles.cust} numberOfLines={1}>
              {row.customer.name}
            </Text>
          </View>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </View>

        {chips.length > 0 && (
          <View style={styles.services}>
            {chips.map((s) => (
              <View key={s} style={styles.svc}>
                <Text style={styles.svcText} numberOfLines={1}>
                  {s}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.facts}>
          <View style={styles.fact}>
            <CalendarIcon size={14} color={theme.textMuted} />
            <Text style={styles.factText}>Last visit {formatDay(row.last_visit_date)}</Text>
          </View>
          <View style={styles.fact}>
            <ClockIcon size={14} color={theme.textMuted} />
            <Text style={styles.factText}>
              {row.visit_count} visit{row.visit_count === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <View style={styles.foot}>
          <Text style={[styles.footText, late && styles.footLate]} numberOfLines={1}>
            {callBack ? `Call back ${formatDateTime(row.next_call_at)}` : row.collector ? (someoneElse ? `Taken by ${row.collector.name}` : 'Your call') : 'Not taken yet'}
          </Text>
          {row.request_id ? (
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
