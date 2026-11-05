import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, ClockIcon, PhoneIcon } from '../../components/icons';
import { Toast, type ToastMessage } from '../../components/Toast';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { spacing, typography } from '../../theme';
import { errorText, getTicket } from '../api';
import { ACTIONS, PRIORITY, TICKET_STATUS, formatDateTime, formatDay, monthLabel } from '../format';
import { HeroHeader, HeroPill } from '../Hero';
import { MessagesPanel, type CustomerMessage } from '../MessagesPanel';
import type { FeedbackStackParamList } from '../navigation';
import type { Ticket } from '../types';
import { AnswersList, CustomerCard, Panel } from '../ui';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  kv: { flexDirection: 'row' as const, paddingVertical: 4, gap: spacing.sm },
  k: { ...typography.caption, color: t.textMuted, width: 110 },
  v: { ...typography.caption, color: t.textPrimary, flex: 1, fontWeight: '500' as const },
  small: { ...typography.caption, color: t.textMuted },
  step: { flexDirection: 'row' as const, gap: spacing.xs, alignItems: 'center' as const, paddingVertical: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepText: { ...typography.caption, color: t.textPrimary, flex: 1 },
});

/**
 * A ticket: its problem (the bad answers), the re-visit booked for it, and the follow-up calls.
 * The follow-up is made on the call ("Open the call") once the technician completes the re-visit;
 * all good answers close the ticket. Booking the re-visit is done on the web Feedback Desk.
 */
export function FeedbackTicketScreen() {
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  const { ticketId } = useRoute<RouteProp<FeedbackStackParamList, 'FeedbackTicket'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTicket(await getTicket(ticketId));
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Could not load the ticket.'));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ticket) {
    return (
      <View style={styles.screen}>
        <HeroHeader eyebrow="Ticket" title="Loading…" onBack={() => navigation.goBack()} />
        {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} /> : <CrmErrorBanner message={error} onRetry={load} />}
      </View>
    );
  }

  const open = ticket.status === 'ACTION_PENDING';
  const visit = ticket.revisit;
  const ready = open && (ticket.action === 'OTHER' || visit?.status === 'COMPLETED');
  const followUps = (ticket.history || []).filter((h) => h.event === 'FOLLOWUP_CALL');
  const steps: [string, boolean][] = [
    [`Raised ${formatDay(ticket.created_at)}`, true],
    [visit ? `Re-visit booked · Job ${visit.job_code}${visit.technicians ? ` · ${visit.technicians}` : ''}` : ticket.action === 'OTHER' ? 'No technician visit (Other)' : 'Re-visit to be booked', !!visit || ticket.action === 'OTHER'],
    [visit?.status === 'COMPLETED' ? `Work done ${formatDay(visit.completed_at || visit.date)}` : 'Work done', visit?.status === 'COMPLETED' || ticket.action === 'OTHER'],
    [open ? 'Customer confirms on the follow-up call' : `Closed ${formatDay(ticket.closed_at)}`, !open],
  ];

  // Messages to the customer about this ticket.
  const base = { ticketId: ticket.id, ticketNumber: ticket.ticket_number, issue: ticket.issue_summary, revisitDate: visit?.date || null, closeNote: ticket.close_note };
  const messages: CustomerMessage[] = open
    ? [
        { key: 'raised', label: 'Ticket raised', whatsapp: 'TICKET_RAISED', email: 'ISSUE_RECEIVED', ...base },
        ...(visit ? [{ key: 'revisit', label: 'Re-visit booked', whatsapp: 'REVISIT_BOOKED', ...base }] : []),
      ]
    : [{ key: 'resolved', label: 'Issue resolved', whatsapp: 'ISSUE_RESOLVED', email: 'ISSUE_RESOLVED', ...base }];

  return (
    <View style={styles.screen}>
      <HeroHeader eyebrow={`Ticket · raised ${formatDay(ticket.created_at)}`} title={ticket.ticket_number} subtitle={`${ticket.site.name} · ${ticket.customer.name}`} onBack={() => navigation.goBack()}>
        <HeroPill label={TICKET_STATUS[ticket.status].label} tone={TICKET_STATUS[ticket.status].tone} />
        <HeroPill label={`${PRIORITY[ticket.priority].label} priority`} tone={PRIORITY[ticket.priority].tone} />
      </HeroHeader>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} />}>
        <CustomerCard
          customer={ticket.customer.name}
          site={ticket.site.name}
          place={ticket.site.city}
          services={ticket.service_label ? [ticket.service_label] : []}
          by={`Raised by ${ticket.raised_by?.name || '—'} · ${monthLabel(ticket.month)}`}
        />
        <CrmErrorBanner message={error} />

        <Panel title="Progress" icon={<ClockIcon size={17} color={theme.primary} />}>
          {steps.map(([text, done]) => (
            <View key={text} style={styles.step}>
              <View style={[styles.stepDot, { backgroundColor: done ? theme.success : theme.border }]} />
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}
        </Panel>

        <Panel title="Problem" icon={<AlertTriangleIcon size={17} color={theme.danger} />}>
          <View style={styles.kv}>
            <Text style={styles.k}>Service</Text>
            <Text style={styles.v}>{ticket.service_label || 'Not linked to one visit'}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.k}>Technician</Text>
            <Text style={styles.v}>{ticket.technician?.name || '—'}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.k}>Next step</Text>
            <Text style={styles.v}>{ACTIONS[ticket.action]?.label || ticket.action}{ticket.action === 'OTHER' && ticket.action_note ? `: ${ticket.action_note}` : ''}</Text>
          </View>
          {!!ticket.feedback && <AnswersList submission={ticket.feedback} onlyBad />}
        </Panel>

        <Panel title="Follow-up call" icon={<PhoneIcon size={17} color={theme.primary} />}>
          {followUps.map((h) => (
            <Text key={h.id} style={[styles.small, { marginBottom: 4 }]}>
              {h.to_status === 'CLOSED' ? '✓ ' : '✗ '}
              {h.note} · {formatDateTime(h.created_at)}
            </Text>
          ))}
          {open ? (
            <>
              <Text style={styles.small}>
                {ready ? 'The work is done. Call the customer and ask the questions again: if they are satisfied the ticket closes.' : visit ? 'Opens when the technician completes the re-visit.' : 'Opens once the re-visit is booked and completed.'}
              </Text>
              <PrimaryButton label="Open the call" onPress={() => navigation.navigate('FeedbackCall', { callId: ticket.request_id })} disabled={!ready} style={{ marginTop: spacing.sm }} />
            </>
          ) : (
            <Text style={styles.small}>{ticket.close_note || 'Closed.'}</Text>
          )}
        </Panel>

        <MessagesPanel
          callId={ticket.request_id}
          contacts={ticket.contacts || []}
          messages={messages}
          info={{ customer: ticket.customer.name, site: ticket.site.name, month: ticket.month }}
          onSent={(message) => setToast({ message, variant: 'success' })}
          onError={(message) => setToast({ message, variant: 'error' })}
        />

        {!ready && (
          <PrimaryButton label="View the call" variant="secondary" onPress={() => navigation.navigate('FeedbackCall', { callId: ticket.request_id })} />
        )}
      </ScrollView>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}
