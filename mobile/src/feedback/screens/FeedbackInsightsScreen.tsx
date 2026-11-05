import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { toneColors } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import { errorText, listCalls, listTickets } from '../api';
import { CALL_STATUS, defaultPeriod, periodLabel, periodQuery, type Period } from '../format';
import type { CallList, CallStatus, Ticket } from '../types';
import { HeroHeader, HeroPill } from '../Hero';
import { PeriodPicker } from '../ui';

const STATUSES: CallStatus[] = ['TO_CALL', 'NOT_ANSWERED', 'WRONG_NUMBER', 'FORM_SENT', 'FORM_RECEIVED', 'TICKET_OPEN', 'DONE'];

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  body: { padding: spacing.md, paddingBottom: spacing.xxxl },
  card: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginTop: spacing.md, ...t.cardShadow },
  cardTitle: { ...typography.subtitle, color: t.textPrimary, marginBottom: spacing.sm },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-end' as const },
  label: { ...typography.caption, color: t.textSecondary },
  big: { ...typography.title, color: t.textPrimary },
  pct: { ...typography.title, color: t.success },
  track: { height: 10, borderRadius: 5, backgroundColor: t.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' as const, flexDirection: 'row' as const },
  note: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: { ...typography.body, color: t.textPrimary, width: 120 },
  rowTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: 'hidden' as const },
  rowValue: { ...typography.bodyMedium, color: t.textPrimary, width: 32, textAlign: 'right' as const },
  pair: { flexDirection: 'row' as const, gap: spacing.sm },
  box: { flex: 1, borderRadius: radii.md, padding: spacing.sm },
  boxValue: { ...typography.title },
  boxLabel: { ...typography.caption, color: t.textSecondary },
  skeleton: { marginTop: spacing.md },
});

/**
 * How the month (or the dates) went: how many calls are done, every status, the feedback result
 * (good / issue), and the tickets raised.
 */
export function FeedbackInsightsScreen() {
  const { styles, theme } = useCrmStyles(factory);
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const [data, setData] = useState<CallList | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calls, t] = await Promise.all([listCalls({ ...periodQuery(period), status: '' }), listTickets('')]);
      setData(calls);
      setTickets(t);
    } catch (err) {
      setError(errorText(err, 'Could not load the insights.'));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const counts = data?.status_counts || {};
  const n = (s: string) => Number(counts[s] || 0);
  const total = STATUSES.reduce((sum, s) => sum + n(s), 0);
  const done = n('DONE');
  const pct = total ? Math.round((done / total) * 100) : 0;
  const colorOf = (s: CallStatus) => (s === 'TO_CALL' ? theme.primary : toneColors(theme, CALL_STATUS[s].tone).fg);
  const good = (data?.sites || []).filter((r) => r.result === 'GOOD').length;
  const issue = (data?.sites || []).filter((r) => r.result === 'ISSUE').length;
  const openTickets = (tickets || []).filter((t) => t.status === 'ACTION_PENDING').length;
  const closedTickets = (tickets || []).filter((t) => t.status === 'CLOSED').length;

  return (
    <View style={styles.screen}>
      <HeroHeader eyebrow="Customer Feedback" title="Insights" subtitle={periodLabel(period)}>
        {!!data && <HeroPill label={`${pct}% done`} tone="success" />}
        {!!data && <HeroPill label={`${good} good · ${issue} issue`} tone="info" />}
      </HeroHeader>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} />}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <CrmErrorBanner message={error} onRetry={load} />

        {!data ? (
          <>
            <CrmSkeleton height={130} radius={16} style={styles.skeleton} />
            <CrmSkeleton height={200} radius={16} style={styles.skeleton} />
          </>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.top}>
                <View>
                  <Text style={styles.label}>Calls · {periodLabel(period)}</Text>
                  <Text style={styles.big}>
                    {done} of {total} done
                  </Text>
                </View>
                <Text style={styles.pct}>{pct}%</Text>
              </View>
              <View style={styles.track}>
                {total > 0 && [...STATUSES].reverse().map((s) => (n(s) ? <View key={s} style={{ flex: n(s) / total, backgroundColor: s === 'TO_CALL' ? 'transparent' : colorOf(s) }} /> : null))}
              </View>
              <Text style={styles.note}>
                {n('FORM_SENT')} form{n('FORM_SENT') === 1 ? '' : 's'} out · {n('FORM_RECEIVED')} back to review
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Calls by status</Text>
              {STATUSES.map((s) => (
                <View key={s} style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: colorOf(s) }]} />
                  <Text style={styles.rowLabel}>{CALL_STATUS[s].label}</Text>
                  <View style={styles.rowTrack}>
                    <View style={{ width: `${total ? (n(s) / total) * 100 : 0}%`, height: '100%', backgroundColor: colorOf(s) }} />
                  </View>
                  <Text style={styles.rowValue}>{n(s)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Feedback result</Text>
              <View style={styles.pair}>
                <View style={[styles.box, { backgroundColor: theme.successBg }]}>
                  <Text style={[styles.boxValue, { color: theme.successText }]}>{good}</Text>
                  <Text style={styles.boxLabel}>Good · no issue</Text>
                </View>
                <View style={[styles.box, { backgroundColor: theme.dangerBg }]}>
                  <Text style={[styles.boxValue, { color: theme.dangerText }]}>{issue}</Text>
                  <Text style={styles.boxLabel}>Issue · ticket raised</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>My tickets</Text>
              <View style={styles.pair}>
                <View style={[styles.box, { backgroundColor: theme.warningBg }]}>
                  <Text style={[styles.boxValue, { color: theme.warningText }]}>{openTickets}</Text>
                  <Text style={styles.boxLabel}>Open</Text>
                </View>
                <View style={[styles.box, { backgroundColor: theme.successBg }]}>
                  <Text style={[styles.boxValue, { color: theme.successText }]}>{closedTickets}</Text>
                  <Text style={styles.boxLabel}>Closed</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
