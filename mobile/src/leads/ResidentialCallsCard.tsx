import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, CheckCircleIcon, ClockIcon, PhoneIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { fmtDateShort, fmtTime, fmtTimestamp, todayStr } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import * as api from './api';
import type { LeadStackParamList } from './navigation';

const SHOWN = 4;

/** "Next call 2026-10-16 10:00" (as the server records it) -> "Next call Oct 16, 2026, 10:00 AM". */
const readable = (note: string) =>
  note.replace(/(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::\d{2})?)?/, (_m, d: string, t?: string) => `${fmtDateShort(d)}${t ? `, ${fmtTime(t)}` : ''}`);

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm },
  next: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  nextIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  nextBody: { flex: 1, gap: 2 },
  nextLabel: { ...typography.caption, color: t.textMuted },
  nextWhen: { ...typography.subtitle, color: t.textPrimary },
  nextLate: { color: t.danger },
  closed: { ...typography.body, color: t.textSecondary },
  logBtn: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  logText: { ...typography.button, color: t.textOnPrimary },
  convertBtn: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: t.successBg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  convertText: { ...typography.button, color: t.successText },
  pressed: { opacity: 0.85 },
  histTitle: { ...typography.captionMedium, color: t.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row' as const, gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 2 },
  rowBody: { flex: 1 },
  rowNote: { ...typography.body, color: t.textPrimary },
  rowMeta: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  more: { ...typography.captionMedium, color: t.primary, paddingTop: spacing.xs },
  empty: { ...typography.caption, color: t.textMuted, marginTop: spacing.sm },
});

/**
 * Residential leads are followed up by phone only, until they are converted: the next call (it
 * rings on the phone like any follow-up), a "Log call" button, and the calls so far. Shown on the
 * residential lead's details in the Lead Management app.
 */
export function ResidentialCallsCard({ leadId, name, leadStatus, amount = 0 }: { leadId: string; name: string; leadStatus: string; amount?: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const [data, setData] = useState<api.ResidentialCalls | null>(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api
        .residentialCalls(leadId)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
      return () => {
        alive = false;
      };
    }, [leadId]),
  );

  const status = data?.leadStatus ?? leadStatus;
  const closed = status === 'converted' || status === 'lost';
  const next = data?.open[0];
  const late = !!next && next.dueDate < todayStr();
  const history = data?.history ?? [];
  const shown = all ? history : history.slice(0, SHOWN);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>CALL FOLLOW-UP</Text>
      {!data && !failed ? (
        <ActivityIndicator color={theme.primary} />
      ) : closed ? (
        <Text style={styles.closed}>
          {status === 'converted' ? 'Converted to a customer - no more follow-up calls.' : 'Closed - the customer is not interested.'}
        </Text>
      ) : (
        <>
          <View style={styles.next}>
            <View style={[styles.nextIcon, { backgroundColor: late ? theme.dangerBg : theme.warningBg }]}>
              <CalendarIcon size={20} color={late ? theme.danger : theme.warning} />
            </View>
            <View style={styles.nextBody}>
              <Text style={styles.nextLabel}>{late ? 'Next call (overdue)' : 'Next call'}</Text>
              <Text style={[styles.nextWhen, late && styles.nextLate]}>
                {next ? `${fmtDateShort(next.dueDate)}${next.dueTime ? `, ${fmtTime(next.dueTime)}` : ''}` : 'Not set yet'}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('LeadResidentialCall', { leadId, name })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.logBtn, pressed && styles.pressed]}
            testID="residential-log-call"
          >
            <PhoneIcon size={18} color={theme.textOnPrimary} />
            <Text style={styles.logText}>{next ? 'Log call & set next' : 'Log call'}</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('LeadResidentialConvert', { leadId, name, amount })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.convertBtn, pressed && styles.pressed]}
            testID="residential-convert"
          >
            <CheckCircleIcon size={18} color={theme.successText} />
            <Text style={styles.convertText}>Convert to customer</Text>
          </Pressable>
        </>
      )}
      {failed && !data && <Text style={styles.empty}>Could not load the calls. Pull down to try again.</Text>}

      {history.length > 0 && (
        <>
          <Text style={styles.histTitle}>Calls so far</Text>
          {shown.map((h) => {
            const call = h.action === 'CALL_LOGGED';
            return (
              <View key={h.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: call ? theme.accentBg : theme.warningBg }]}>
                  {call ? <PhoneIcon size={14} color={theme.accent} /> : <ClockIcon size={14} color={theme.warning} />}
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowNote}>{h.note ? readable(h.note) : call ? 'Call logged' : 'Next call set'}</Text>
                  <Text style={styles.rowMeta}>
                    {fmtTimestamp(h.at)}
                    {h.by ? ` · ${h.by}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
          {history.length > SHOWN && (
            <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.more}>{all ? 'Show less' : `Show all ${history.length}`}</Text>
            </Pressable>
          )}
        </>
      )}
      {!!data && history.length === 0 && !closed && <Text style={styles.empty}>No calls logged yet.</Text>}
    </View>
  );
}
