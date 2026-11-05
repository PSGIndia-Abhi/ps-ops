import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import { errorText, listTickets } from '../api';
import { OPERATIONS, PRIORITY, TICKET_STATUS, formatDay } from '../format';
import { useFeedback } from '../FeedbackContext';
import type { FeedbackStackParamList } from '../navigation';
import { useTicketsTab } from '../ticketsTabContext';
import type { DepartmentKind, Ticket } from '../types';
import { HeroHeader, HeroPill } from '../Hero';
import { Chips } from '../ui';
import { ChevronRightIcon } from '../../components/icons';
import { toneColors } from '../../crm/ui/StatusBadge';

const FILTERS: { value: 'OPEN' | 'CLOSED' | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
];

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  filters: { marginBottom: spacing.md },
  filterLabel: { ...typography.captionMedium, color: t.textMuted, marginBottom: spacing.xs },
  deptRow: { flexDirection: 'row' as const, gap: 6, marginTop: spacing.xs, flexWrap: 'wrap' as const },
  deptChip: { ...typography.caption, fontWeight: '700' as const, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, overflow: 'hidden' as const },
  deptOps: { color: t.accentText, backgroundColor: t.accentBg },
  deptAcc: { color: t.warningText, backgroundColor: t.warningBg },
  deptDone: { color: t.successText, backgroundColor: t.successBg },
  stripe: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 5 },
  nextRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.surfaceAlt },
  nextPill: { flexShrink: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  list: { padding: spacing.md, paddingBottom: spacing.xxxl },
  card: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, padding: spacing.md, paddingLeft: spacing.md + 5, marginBottom: spacing.sm, overflow: 'hidden' as const, ...t.cardShadow },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: spacing.xs },
  no: { ...typography.subtitle, color: t.primary },
  badges: { flexDirection: 'row' as const, gap: 4 },
  site: { ...typography.bodyMedium, color: t.textPrimary, marginTop: spacing.xs },
  muted: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  next: { ...typography.captionMedium },
  pressed: { opacity: 0.85 },
});

/** What the ticket is waiting for, in a few words. */
function nextStep(t: Ticket): { text: string; tone: 'ok' | 'wait' | 'todo' } {
  if (t.status === 'CLOSED') return { text: `Closed ${formatDay(t.closed_at)}`, tone: 'ok' };
  if (t.follow_up_due) return { text: 'All work done - call the customer back', tone: 'todo' };
  const others = (t.parts || []).filter((p) => p.kind !== OPERATIONS);
  const ops = !(t.parts || []).length || others.length < (t.parts || []).length;
  if (!ops && others.length) {
    const waiting = others.filter((p) => p.status !== 'DONE');
    return { text: waiting.length ? `With ${waiting.map((p) => p.label).join(', ')}` : `${others.map((p) => p.label).join(', ')} done`, tone: 'wait' };
  }
  if (t.action === 'OTHER') return { text: 'Call the customer back when it is done', tone: 'todo' };
  if (!t.revisit) return { text: 'Waiting for the re-visit to be booked', tone: 'wait' };
  if (t.revisit.status === 'COMPLETED') return { text: 'Re-visit done - call the customer back', tone: 'todo' };
  return { text: `Re-visit ${formatDay(t.revisit.date)}${t.revisit.technicians ? ` · ${t.revisit.technicians}` : ''}`, tone: 'wait' };
}

/** The tickets this user raised (a desk user sees every ticket), open first. */
export function FeedbackTicketsScreen() {
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  // The Tickets tab's badge (in another app's tabs) is brought up to date when the list shows.
  const { refresh: refreshBadge } = useTicketsTab();
  const { styles, theme } = useCrmStyles(factory);
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | ''>('OPEN');
  const { departmentList, deptOnly } = useFeedback();
  const [department, setDepartment] = useState<DepartmentKind | ''>('');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listTickets(status, department));
    } catch (err) {
      setError(errorText(err, 'Could not load the tickets.'));
    } finally {
      setLoading(false);
    }
  }, [status, department]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshBadge();
    }, [load, refreshBadge]),
  );

  return (
    <View style={styles.screen}>
      <HeroHeader eyebrow="Customer Feedback" title={deptOnly ? 'Department tickets' : 'My tickets'} subtitle={deptOnly ? 'Feedback problems for your department' : 'Problems raised from feedback calls'}>
        <HeroPill label={tickets ? `${tickets.length} ${FILTERS.find((f) => f.value === status)?.label.toLowerCase()}` : 'Loading…'} tone={status === 'CLOSED' ? 'success' : 'warning'} />
      </HeroHeader>
      <FlatList
        data={tickets || []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.filters}>
              <Chips options={FILTERS} value={status} onChange={setStatus} />
            </View>
            {!deptOnly && departmentList.length > 0 && (
              <View style={styles.filters}>
                <Text style={styles.filterLabel}>Departments</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Chips
                    options={[{ value: '' as DepartmentKind | '', label: 'All' }, ...departmentList.map((d) => ({ value: d.kind as DepartmentKind | '', label: d.name || d.label }))]}
                    value={department}
                    onChange={setDepartment}
                  />
                </ScrollView>
              </View>
            )}
            <CrmErrorBanner message={error} onRetry={load} />
          </View>
        }
        ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} /> : <CrmEmptyState title="No tickets" subtitle="Tickets you raise from a call show here." />}
        refreshControl={<RefreshControl refreshing={loading && !!tickets} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} />}
        renderItem={({ item: t }) => {
          const next = nextStep(t);
          return (
            <Pressable onPress={() => navigation.navigate('FeedbackTicket', { ticketId: t.id })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={[styles.stripe, { backgroundColor: t.status === 'CLOSED' ? theme.success : toneColors(theme, PRIORITY[t.priority].tone).fg }]} />
              <View style={styles.top}>
                <Text style={styles.no}>{t.ticket_number}</Text>
                <View style={styles.badges}>
                  <StatusBadge label={PRIORITY[t.priority].label} tone={PRIORITY[t.priority].tone} dot={false} />
                  <StatusBadge label={TICKET_STATUS[t.status].label} tone={TICKET_STATUS[t.status].tone} dot={false} />
                </View>
              </View>
              <Text style={styles.site}>
                {t.site.name} <Text style={styles.muted}>· {t.customer.name}</Text>
              </Text>
              <View style={styles.deptRow}>
                {(t.parts?.length ? t.parts : [{ kind: OPERATIONS, label: 'Operations', status: 'PENDING' }]).map((p) => (
                  <Text
                    key={p.kind}
                    style={[styles.deptChip, p.kind !== OPERATIONS ? (p.status === 'DONE' ? styles.deptDone : styles.deptAcc) : styles.deptOps]}
                  >
                    {p.label || p.kind}
                    {p.kind !== OPERATIONS && p.status === 'DONE' ? ' ✓' : ''}
                  </Text>
                ))}
              </View>
              {!!t.issue_summary && (
                <Text style={styles.muted} numberOfLines={2}>
                  {t.issue_summary}
                </Text>
              )}
              <View style={styles.nextRow}>
                <View style={[styles.nextPill, { backgroundColor: next.tone === 'ok' ? theme.successBg : next.tone === 'todo' ? theme.primarySoftBg : theme.surfaceAlt }]}>
                  <Text style={[styles.next, { color: next.tone === 'ok' ? theme.successText : next.tone === 'todo' ? theme.primary : theme.textSecondary }]} numberOfLines={1}>
                    {next.text}
                  </Text>
                </View>
                <ChevronRightIcon size={16} color={theme.textMuted} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
