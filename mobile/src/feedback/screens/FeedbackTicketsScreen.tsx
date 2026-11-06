import React, { useCallback, useContext, useState } from 'react';
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
import { TicketsBackContext, useTicketsTab } from '../ticketsTabContext';
import type { DepartmentKind, Ticket } from '../types';
import { HeroHeader } from '../Hero';
import { Dropdown } from '../Dropdown';
import { ClipboardListIcon } from '../../crm/ui/crmIcons';
import { Chips } from '../ui';
import { ChevronRightIcon } from '../../components/icons';
import { toneColors } from '../../crm/ui/StatusBadge';


const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  filters: { marginBottom: spacing.md },
  filterRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.xs, marginBottom: spacing.md },
  filterNow: { ...typography.captionMedium, color: t.textMuted },
  filterLabel: { ...typography.captionMedium, color: t.textMuted, marginBottom: spacing.xs },
  deptRow: { flexDirection: 'row' as const, gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' as const },
  deptChip: { ...typography.caption, fontWeight: '700' as const, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, overflow: 'hidden' as const },
  deptOps: { color: t.accentText, backgroundColor: t.accentBg },
  deptAcc: { color: t.info, backgroundColor: t.infoBg },
  deptDone: { color: t.successText, backgroundColor: t.successBg },
  stripe: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 5 },
  nextRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.surfaceAlt },
  nextPill: { flexShrink: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  list: { padding: spacing.md, paddingBottom: spacing.xxxl },
  card: { backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.md, overflow: 'hidden' as const, ...t.cardShadow },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  flex1: { flex: 1, minWidth: 0 },
  customer: { ...typography.caption, color: t.textMuted },
  summary: { ...typography.caption, color: t.textSecondary, marginTop: spacing.sm, lineHeight: 18 },
  nextBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.xs, marginTop: spacing.md, marginHorizontal: -spacing.md, marginBottom: -spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  no: { ...typography.subtitle, fontWeight: '800' as const, color: t.textPrimary },
  badges: { flexDirection: 'row' as const, gap: 4 },
  site: { ...typography.captionMedium, color: t.textSecondary, marginTop: 1 },
  muted: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  next: { ...typography.captionMedium, fontWeight: '700' as const, flexShrink: 1 },
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
  // Opened from More: a back arrow to return there.
  const goBack = useContext(TicketsBackContext);
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
      <HeroHeader icon={ClipboardListIcon} onBack={goBack || undefined} title={deptOnly ? 'Tickets' : 'My tickets'} subtitle={deptOnly ? 'Customer feedback tickets for you and your team' : 'Problems raised from feedback calls'} />
      <FlatList
        data={tickets || []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {/* Open / Closed / All behind the filter button. */}
            <View style={styles.filterRow}>
              <Dropdown
                caption="Show"
                value={status}
                options={[
                  { value: 'OPEN' as const, label: 'Open tickets' },
                  { value: 'CLOSED' as const, label: 'Closed tickets' },
                  { value: '' as const, label: 'All tickets' },
                ]}
                onChange={setStatus}
                highlight={status !== 'OPEN'}
              />
              <Text style={styles.filterNow}>{tickets ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}` : ''}</Text>
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
        ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} /> : <CrmEmptyState title="No tickets" subtitle={deptOnly ? 'Tickets for you or your team show here.' : 'Tickets you raise from a call show here.'} />}
        refreshControl={<RefreshControl refreshing={loading && !!tickets} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} />}
        renderItem={({ item: t }) => {
          const next = nextStep(t);
          // The ticket's colour: its priority while open, green once closed.
          const tone = t.status === 'CLOSED' ? toneColors(theme, 'success') : toneColors(theme, PRIORITY[t.priority].tone);
          const nextBg = next.tone === 'ok' ? theme.successBg : next.tone === 'todo' ? theme.primarySoftBg : theme.surfaceAlt;
          const nextFg = next.tone === 'ok' ? theme.successText : next.tone === 'todo' ? theme.primary : theme.textSecondary;
          return (
            <Pressable onPress={() => navigation.navigate('FeedbackTicket', { ticketId: t.id })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={styles.top}>
                <View style={[styles.tile, { backgroundColor: tone.bg }]}>
                  <ClipboardListIcon size={20} color={tone.fg} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.no}>{t.ticket_number}</Text>
                  <Text style={styles.site} numberOfLines={1}>
                    {t.customer.name}
                    <Text style={styles.customer}> · {t.site.name}</Text>
                  </Text>
                </View>
                <StatusBadge label={TICKET_STATUS[t.status].label} tone={TICKET_STATUS[t.status].tone} dot={false} />
              </View>
              <View style={styles.deptRow}>
                <Text style={[styles.deptChip, { color: tone.fg, backgroundColor: tone.bg }]}>● {PRIORITY[t.priority].label}</Text>
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
                <Text style={styles.summary} numberOfLines={2}>
                  {t.issue_summary}
                </Text>
              )}
              {/* What happens next, as a coloured strip across the bottom of the card. */}
              <View style={[styles.nextBar, { backgroundColor: nextBg }]}>
                <Text style={[styles.next, { color: nextFg }]} numberOfLines={1}>
                  {next.text}
                </Text>
                <ChevronRightIcon size={16} color={nextFg} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
