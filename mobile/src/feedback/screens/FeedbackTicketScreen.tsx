import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, BriefcaseIcon, ClockIcon, PhoneIcon } from '../../components/icons';
import { Toast, type ToastMessage } from '../../components/Toast';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { radii, spacing, typography } from '../../theme';
import { closeTicket, errorText, getTicket, markActionDone, markPartDone } from '../api';
import { useFeedback } from '../FeedbackContext';
import { ACTIONS, OPERATIONS, PRIORITY, TICKET_STATUS, formatDateTime, formatDay, isAssignedAction, monthLabel, rupees } from '../format';
import { HeroHeader, HeroPill } from '../Hero';
import { MessagesPanel, type CustomerMessage } from '../MessagesPanel';
import type { FeedbackStackParamList } from '../navigation';
import type { Ticket, TicketPart } from '../types';
import { AnswersList, CustomerCard, Panel } from '../ui';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  kv: { flexDirection: 'row' as const, paddingVertical: 4, gap: spacing.sm },
  k: { ...typography.caption, color: t.textMuted, width: 110 },
  v: { ...typography.caption, color: t.textPrimary, flex: 1, fontWeight: '500' as const },
  fuRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 5 },
  fuChip: { ...typography.caption, fontWeight: '700' as const, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, overflow: 'hidden' as const },
  fuOk: { color: t.successText, backgroundColor: t.successBg },
  fuBad: { color: t.dangerText, backgroundColor: t.dangerBg },
  fuWarn: { color: t.warningText, backgroundColor: t.warningBg },
  small: { ...typography.caption, color: t.textMuted },
  step: { flexDirection: 'row' as const, gap: spacing.xs, alignItems: 'center' as const, paddingVertical: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepText: { ...typography.caption, color: t.textPrimary, flex: 1 },
  inv: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: t.surfaceAlt, marginTop: spacing.xs },
  invNo: { ...typography.bodyMedium, color: t.textPrimary },
  invAmt: { ...typography.captionMedium, color: t.textSecondary, textAlign: 'right' as const },
  done: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: t.successBg },
  doneText: { ...typography.captionMedium, color: t.successText },
  noteInput: { minHeight: 46, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingHorizontal: spacing.sm, marginTop: spacing.sm, color: t.textPrimary, ...typography.body },
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
  const { can, myDepartments, deptOnly, userId } = useFeedback();
  const [partNotes, setPartNotes] = useState<Record<string, string>>({});
  const [actionNote, setActionNote] = useState('');
  const [saving, setSaving] = useState(false);

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
  const parts = ticket.parts || [];
  // Tickets from before departments have no parts = Operations.
  const hasOps = !parts.length || parts.some((p) => p.kind === OPERATIONS);
  // The other departments' parts, each finished by its own team.
  const others = parts.filter((p) => p.kind !== OPERATIONS);
  // Site audit / Supervisor visit / Sales: done when the assigned person marks it done.
  const assigned = isAssignedAction(ticket.action);
  const opsDone = !hasOps || ticket.action === 'OTHER' || (assigned ? !!ticket.action_done : visit?.status === 'COMPLETED');
  const canFinishAction = open && assigned && !ticket.action_done && (can('FEEDBACK_MANAGE') || ticket.action_owner?.id === userId);
  const ready = open && (ticket.follow_up_due ?? opsDone);
  const canFinish = (p: TicketPart) => open && p.status !== 'DONE' && (can('FEEDBACK_MANAGE') || myDepartments.includes(p.kind));
  const followUps = (ticket.history || []).filter((h) => h.event === 'FOLLOWUP_CALL');
  const steps: [string, boolean][] = [
    [`Raised ${formatDay(ticket.created_at)}`, true],
    ...(hasOps && assigned
      ? ([
          [`${ACTIONS[ticket.action].who}: ${ticket.action_owner?.name || 'not assigned'}`, !!ticket.action_owner],
          [ticket.action_done ? `${ACTIONS[ticket.action].label} done ${formatDay(ticket.action_done.at)}` : `${ACTIONS[ticket.action].label} to be done`, !!ticket.action_done || !open],
        ] as [string, boolean][])
      : hasOps
      ? ([
          [visit ? `Re-visit booked · Job ${visit.job_code}${visit.technicians ? ` · ${visit.technicians}` : ''}` : ticket.action === 'OTHER' ? 'No technician visit (Other)' : 'Re-visit to be booked', !!visit || ticket.action === 'OTHER'],
          [visit?.status === 'COMPLETED' ? `Work done ${formatDay(visit.completed_at || visit.date)}` : 'Work done', visit?.status === 'COMPLETED' || ticket.action === 'OTHER'],
        ] as [string, boolean][])
      : []),
    ...others.map((p) => [p.status === 'DONE' ? `${p.label} done · ${p.done_note || ''}` : `With ${p.label}`, p.status === 'DONE' || !open] as [string, boolean]),
    [open ? 'Customer confirms on the follow-up call' : `Closed ${formatDay(ticket.closed_at)}`, !open],
  ];
  const waitingFor = [
    !opsDone
      ? assigned
        ? `${ticket.action_owner?.name || 'the assigned person'} to finish the ${ACTIONS[ticket.action].label.toLowerCase()}`
        : visit
          ? 'the re-visit to be completed'
          : 'the re-visit to be booked and completed'
      : null, ...others.filter((p) => p.status !== 'DONE').map((p) => p.label)].filter(Boolean);

  // The action is taken (every team finished): close without the follow-up call.
  const canClose = can('FEEDBACK_MANAGE') || ticket.raised_by?.id === userId;
  function askClose() {
    Alert.alert(`Close ${ticket!.ticket_number}?`, 'Every team has finished its work. The ticket closes without the follow-up call; it can be reopened later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close the ticket',
        onPress: async () => {
          setSaving(true);
          try {
            const fresh = await getTicket(ticket!.id);
            await closeTicket(ticket!.id, fresh.row_version ?? 0, null);
            setToast({ message: `${ticket!.ticket_number} is closed.`, variant: 'success' });
            await load();
          } catch (err) {
            setToast({ message: errorText(err), variant: 'error' });
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function finishAction() {
    setSaving(true);
    try {
      await markActionDone(ticket!.id, actionNote.trim());
      setActionNote('');
      setToast({ message: `${ACTIONS[ticket!.action].label} marked done.`, variant: 'success' });
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function finishPart(p: TicketPart) {
    setSaving(true);
    try {
      await markPartDone(ticket!.id, p.kind, (partNotes[p.kind] || '').trim());
      setPartNotes((n) => ({ ...n, [p.kind]: '' }));
      setToast({ message: `${p.label} part marked done.`, variant: 'success' });
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

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
        {parts.map((p) => (
          <HeroPill key={p.kind} label={`${p.label || p.kind}${p.kind !== OPERATIONS && p.status === 'DONE' ? ' ✓' : ''}`} tone={p.kind !== OPERATIONS ? (p.status === 'DONE' ? 'success' : 'warning') : 'accent'} />
        ))}
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

        {others.map((p) => (
          <Panel key={p.kind} title={`${p.label}${p.with_invoices ? ' · invoice issue' : ''}`} icon={<BriefcaseIcon size={17} color={theme.warningText} />}>
            {(p.issues || []).map((i) => (
              <Text key={i.id} style={styles.v}>
                • <Text style={{ fontWeight: '700' }}>{i.name}</Text>
                {i.text ? ` - ${i.text}` : ''}
              </Text>
            ))}
            {(!!p.issue_summary || !(p.issues || []).length) && <Text style={styles.v}>{p.issue_summary || 'No details written.'}</Text>}
            {!!p.priority && (
              <View style={[styles.kv, { marginTop: spacing.xs }]}>
                <Text style={styles.k}>Priority</Text>
                <Text style={styles.v}>{PRIORITY[p.priority].label}</Text>
              </View>
            )}
            {p.invoices.map((i) => (
              <View key={i.id} style={styles.inv}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invNo}>{i.number}</Text>
                  <Text style={styles.small}>{formatDay(i.date)}</Text>
                </View>
                <View>
                  <Text style={styles.invAmt}>{rupees(i.amount)}</Text>
                  <Text style={[styles.small, { textAlign: 'right', color: i.pending > 0 ? theme.dangerText : theme.textMuted }]}>{i.pending > 0 ? `${rupees(i.pending)} due` : 'Paid'}</Text>
                </View>
              </View>
            ))}
            {p.status === 'DONE' ? (
              <View style={styles.done}>
                <Text style={styles.doneText}>✓ Done · {p.done_note}</Text>
                <Text style={styles.small}>{[formatDateTime(p.done_at), p.done_by?.name].filter(Boolean).join(' · ')}</Text>
              </View>
            ) : canFinish(p) ? (
              <>
                <TextInput
                  style={styles.noteInput}
                  value={partNotes[p.kind] || ''}
                  onChangeText={(v) => setPartNotes((n) => ({ ...n, [p.kind]: v }))}
                  maxLength={500}
                  placeholder={p.with_invoices ? 'What was done? e.g. Invoice copy sent' : 'What was done?'}
                  placeholderTextColor={theme.textMuted}
                />
                <PrimaryButton label={`Mark ${p.label} done`} onPress={() => finishPart(p)} loading={saving} disabled={!(partNotes[p.kind] || '').trim()} style={{ marginTop: spacing.xs }} />
              </>
            ) : (
              <Text style={[styles.small, { marginTop: spacing.xs }]}>{open ? `Waiting for ${p.label}.` : 'Closed.'}</Text>
            )}
          </Panel>
        ))}

        {hasOps && (
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
          {assigned && (
            <View style={styles.kv}>
              <Text style={styles.k}>Assigned to</Text>
              <Text style={styles.v}>{ticket.action_owner?.name || '—'}</Text>
            </View>
          )}
          {!!ticket.feedback && <AnswersList submission={ticket.feedback} onlyBad />}
        </Panel>
        )}

        {hasOps && assigned && (
          <Panel title={ACTIONS[ticket.action].label} icon={<BriefcaseIcon size={17} color={theme.primary} />}>
            {ticket.action_done ? (
              <View style={styles.done}>
                <Text style={styles.doneText}>✓ Done · {ticket.action_done.note}</Text>
                <Text style={styles.small}>{[formatDateTime(ticket.action_done.at), ticket.action_done.by?.name].filter(Boolean).join(' · ')}</Text>
              </View>
            ) : canFinishAction ? (
              <>
                {!!ticket.action_note && <Text style={styles.small}>Note: {ticket.action_note}</Text>}
                <TextInput
                  style={styles.noteInput}
                  value={actionNote}
                  onChangeText={setActionNote}
                  maxLength={500}
                  placeholder={`What was done in the ${ACTIONS[ticket.action].label.toLowerCase()}?`}
                  placeholderTextColor={theme.textMuted}
                />
                <PrimaryButton label={`Mark ${ACTIONS[ticket.action].label.toLowerCase()} done`} onPress={finishAction} loading={saving} disabled={!actionNote.trim()} style={{ marginTop: spacing.xs }} />
              </>
            ) : (
              <Text style={styles.small}>{open ? `Waiting for ${ticket.action_owner?.name || 'the assigned person'}.` : 'Closed.'}</Text>
            )}
          </Panel>
        )}

        <Panel title="Follow-up call" icon={<PhoneIcon size={17} color={theme.primary} />}>
          {followUps.map((h) => {
            const closedWithIssues = (h.note || '').startsWith('Closed with issues');
            const resolved = h.to_status === 'CLOSED' && !closedWithIssues;
            return (
              <View key={h.id} style={styles.fuRow}>
                <Text style={[styles.fuChip, resolved ? styles.fuOk : closedWithIssues ? styles.fuWarn : styles.fuBad]}>
                  {resolved ? 'Resolved' : closedWithIssues ? 'Closed' : 'Not resolved'}
                </Text>
                <Text style={styles.small}>{formatDateTime(h.created_at)}</Text>
              </View>
            );
          })}
          {open ? (
            <>
              <Text style={[styles.small, followUps.length > 0 && { marginTop: spacing.xs }]}>
                {ready ? 'Ready to call the customer back.' : `Waiting for ${waitingFor.join(' and ') || 'the work'}.`}
              </Text>
              {!deptOnly && <PrimaryButton label="Open the call" onPress={() => navigation.navigate('FeedbackCall', { callId: ticket.request_id })} disabled={!ready} style={{ marginTop: spacing.sm }} />}
              {!deptOnly && ready && canClose && (
                <PrimaryButton label="Close the ticket" variant="secondary" onPress={askClose} loading={saving} style={{ marginTop: spacing.xs }} />
              )}
            </>
          ) : (
            <Text style={styles.small}>{ticket.close_note || 'Closed.'}</Text>
          )}
        </Panel>

        {!deptOnly && (
        <MessagesPanel
          callId={ticket.request_id}
          contacts={ticket.contacts || []}
          messages={messages}
          info={{ customer: ticket.customer.name, site: ticket.site.name, month: ticket.month }}
          onSent={(message) => setToast({ message, variant: 'success' })}
          onError={(message) => setToast({ message, variant: 'error' })}
        />
        )}

        {!ready && !deptOnly && (
          <PrimaryButton label="View the call" variant="secondary" onPress={() => navigation.navigate('FeedbackCall', { callId: ticket.request_id })} />
        )}
      </ScrollView>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}
