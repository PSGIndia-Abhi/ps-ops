import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, CheckCircleIcon, InboxIcon, PencilIcon, PhoneIcon } from '../../components/icons';
import { ClipboardIcon } from '../../tasks/ui/taskIcons';
import { Toast, type ToastMessage } from '../../components/Toast';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { WhatsAppIcon } from '../../crm/ui/crmIcons';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { SelectField } from '../../crm/ui/SelectField';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import {
  addContact,
  errorText,
  finishCall,
  getCall,
  raiseTicket,
  recordAttempt,
  recordFollowUp,
  saveFeedback,
  sendFormLink,
  updateContact,
} from '../api';
import { useFeedback } from '../FeedbackContext';
import { CALL_OUTCOMES, CALL_STATUS, PRIORITY, TICKET_STATUS, chosenAnswers, formatDateTime, questionsFor, type QuestionMode, monthLabel, nowStamp, suggestedPriority } from '../format';
import { HeroHeader, HeroPill } from '../Hero';
import { MessagesPanel, type CustomerMessage } from '../MessagesPanel';
import type { FeedbackStackParamList } from '../navigation';
import { RaiseTicketSheet } from '../RaiseTicketSheet';
import type { Call, CallOutcome, FeedbackBody, NewTicket } from '../types';
import { AnswersList, CustomerCard, FeedbackRound, Panel, QuestionForm } from '../ui';

const OTHER = 'OTHER';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' as const },
  sub: { ...typography.caption, color: t.textMuted, flex: 1 },
  contact: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.xs },
  contactOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.textMuted },
  dotOn: { borderWidth: 6, borderColor: t.primary },
  name: { ...typography.bodyMedium, color: t.textPrimary },
  small: { ...typography.caption, color: t.textMuted },
  callBtn: { width: 88, minHeight: 40, borderRadius: radii.md, backgroundColor: t.primary, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 },
  callText: { ...typography.captionMedium, color: t.textOnPrimary },
  input: { minHeight: 46, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingHorizontal: spacing.sm, color: t.textPrimary, backgroundColor: t.surface, marginBottom: spacing.xs, ...typography.body },
  label: { ...typography.captionMedium, color: t.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.sm },
  wa: { minHeight: 48, borderRadius: radii.lg, backgroundColor: '#1FAA53', flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.xs, marginTop: spacing.xs },
  waText: { ...typography.button, color: '#FFFFFF' },
  ticket: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.surfaceAlt, gap: spacing.xs },
  ticketNo: { ...typography.bodyMedium, color: t.primary, fontWeight: '700' as const },
  section: { ...typography.bodyMedium, color: t.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs },
  // Call result: four equal buttons, two per row, so they always fit the phone's width.
  outcomes: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
  outcome: { width: '48.5%' as const, minHeight: 44, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: spacing.xs },
  outcomeOn: { backgroundColor: t.primary, borderColor: t.primary },
  outcomeText: { ...typography.captionMedium, color: t.textSecondary },
  outcomeTextOn: { color: t.textOnPrimary },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  editBtn: { width: 40, minHeight: 40, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  editBox: { borderWidth: 1, borderColor: t.primary, borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.xs, backgroundColor: t.primarySoftBg },
  fieldError: { ...typography.caption, color: t.dangerText, marginBottom: spacing.xs },
});

/** WhatsApp messages open the WhatsApp app with the text ready; the person presses Send there. */
async function openWhatsapp(url: string) {
  await Linking.openURL(url);
}

/**
 * A site's call for the month. While it is open: call a contact (dials from the phone), save what
 * happened, ask the questions and save - good answers end it, bad ones raise a ticket. A form the
 * customer sent back is reviewed the same way. Once a ticket's re-visit is done, the follow-up call
 * asks the questions again on the same ticket: all good closes it, otherwise it stays open.
 */
export function FeedbackCallScreen() {
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  const { callId } = useRoute<RouteProp<FeedbackStackParamList, 'FeedbackCall'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { userId, can, questions, otherEnabled } = useFeedback();

  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const setNotice = (message: string) => setToast({ message, variant: 'success' });
  const [saving, setSaving] = useState(false);

  // calling
  const [contactKey, setContactKey] = useState<string>('');
  const [outcome, setOutcome] = useState<CallOutcome>('ANSWERED');
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newEmail, setNewEmail] = useState('');
  // correcting a saved contact (wrong number or name)
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', phone: '', role: '', email: '' });

  // feedback
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [qMode, setQMode] = useState<QuestionMode>('BOTH');
  const [other, setOther] = useState('');
  const [spokeWith, setSpokeWith] = useState('');
  const [spokeKey, setSpokeKey] = useState(''); // '' = the contact being called
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'ticket' | 'no-ticket' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getCall(callId);
      setCall(c);
      setContactKey((k) => k || c.contacts[0]?.id || OTHER);
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Could not load the call.'));
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // The questions asked: general, for the month's services, or both. Optional ones can be skipped.
  const monthServices = useMemo(() => [...new Set((call?.visits || []).map((v) => v.service).filter((x): x is string => !!x))], [call]);
  const asked = useMemo(() => questionsFor(questions, qMode, monthServices), [questions, qMode, monthServices]);
  const modeCounts = useMemo(
    () => ({
      GENERAL: questionsFor(questions, 'GENERAL', monthServices).length,
      SERVICE: questionsFor(questions, 'SERVICE', monthServices).length,
      BOTH: questionsFor(questions, 'BOTH', monthServices).length,
    }),
    [questions, monthServices],
  );
  const chosen = useMemo(() => chosenAnswers(asked, answers), [asked, answers]);
  const bad = chosen.filter((r) => r.is_bad);
  const missing = asked.filter((q) => q.is_required && !answers[q.id]);

  if (!call) {
    return (
      <View style={styles.screen}>
        <HeroHeader eyebrow="Feedback call" title="Loading…" onBack={() => navigation.goBack()} />
        {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} /> : <CrmErrorBanner message={error} onRetry={load} />}
      </View>
    );
  }

  const mine = call.collector?.id === userId;
  const canWork = call.status !== 'DONE' && (mine || can('FEEDBACK_MANAGE'));
  const formReceived = call.status === 'FORM_RECEIVED';
  const contact = call.contacts.find((c) => c.id === contactKey) || null;
  const latest = call.submissions.find((s) => s.is_latest) || call.submissions[0] || null;
  const firstTicket = call.tickets[0] || null; // a call has one ticket
  const followUpTicket = call.tickets.find((t) => t.follow_up_due) || null;
  const canFollowUp = !!followUpTicket && (mine || can('FEEDBACK_MANAGE'));
  // Feedback given after the ticket was raised = the follow-up calls; before = the first call.
  const ticketAt = firstTicket ? new Date(firstTicket.created_at).getTime() : Infinity;
  const bySubmitted = [...call.submissions].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
  const followUps = bySubmitted.filter((s) => new Date(s.submitted_at).getTime() > ticketAt);
  const firstFeedback = bySubmitted.filter((s) => new Date(s.submitted_at).getTime() <= ticketAt).pop() || null;
  const canMessage = mine || can('FEEDBACK_MANAGE');

  function answer(questionId: number, optionId: number) {
    if (!startedAt) setStartedAt(nowStamp());
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
  }

  function skip(questionId: number) {
    setAnswers((a) => {
      const next = { ...a };
      delete next[questionId];
      return next;
    });
  }

  function resetAnswers() {
    setAnswers({});
    setOther('');
    setSpokeWith('');
    setSpokeKey('');
    setStartedAt(null);
  }

  // "Spoke with": one of the site's contacts (the one called, unless another is picked) or someone else, typed.
  const spokeValue = spokeKey || (contact ? contact.id : OTHER);
  const spokenContact = call.contacts.find((c) => c.id === spokeValue) || null;

  function body(): FeedbackBody {
    const who = spokenContact ? spokenContact.name : spokeWith.trim();
    if (!who) throw new Error('Choose or type who gave the feedback');
    if (missing.length) throw new Error(`Answer "${missing[0].question_text}"`);
    return {
      ...(spokenContact ? { contact_id: spokenContact.id } : {}),
      spoke_with_name: who,
      responses: chosen.map((r) => ({ question_id: r.question_id, option_id: r.option_id })),
      other_feedback: otherEnabled ? other.trim() || null : null,
      started_at: startedAt,
      question_mode: qMode,
    };
  }

  async function run(task: () => Promise<string | void>) {
    setSaving(true);
    setError(null);
    try {
      const msg = await task();
      if (msg) setNotice(msg);
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function dial(phone: string | null, id: string) {
    setContactKey(id);
    if (phone) await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
  }

  const saveAttempt = () =>
    run(async () => {
      if (!contact) throw new Error('Pick the contact you called');
      const res = await recordAttempt(call.id, { contact_id: contact.id, outcome });
      return outcome === 'ANSWERED'
        ? 'Call saved. Ask the questions below.'
        : res.offer_form_link
        ? "Call saved. The customer didn't answer - you can send the form on WhatsApp."
        : 'Call saved.';
    });

  const saveContact = () =>
    run(async () => {
      const c = await addContact(call.id, { name: newName.trim(), phone: newPhone.trim(), role: newRole.trim() || null, email: newEmail.trim() || null });
      setContactKey(c.id);
      setNewPhone('');
      setNewName('');
      setNewRole('');
      setNewEmail('');
      return c.created ? `${c.name} saved to ${call.site.name}'s contacts.` : `This number is already saved as ${c.name}.`;
    });

  const formLink = () =>
    run(async () => {
      if (!contact?.phone) throw new Error('Pick a contact with a phone number');
      const res = await sendFormLink(call.id, contact.id);
      if (res.whatsapp?.wa_me_url) await openWhatsapp(res.whatsapp.wa_me_url);
      return `Form link made for ${contact.name}. Press Send in WhatsApp.`;
    });

  const saveGood = (noTicket = false) =>
    run(async () => {
      await saveFeedback(call.id, { ...body(), ...(noTicket ? { no_ticket: true } : {}) });
      resetAnswers();
      setSheet(null);
      return 'Feedback saved. The call is done.';
    });

  async function submitTicket(ticket: NewTicket) {
    const res = formReceived && latest ? await raiseTicket(call!.id, { submission_id: latest.id, ...ticket }) : await saveFeedback(call!.id, { ...body(), ticket });
    resetAnswers();
    setSheet(null);
    setNotice(`Ticket ${res.ticket?.ticket_number} raised. The call is done.`);
    await load();
  }

  const saveFollowUp = (closeAnyway = false) =>
    run(async () => {
      const res = await recordFollowUp(followUpTicket!.id, { ...body(), close_anyway: closeAnyway });
      resetAnswers();
      return res.resolved
        ? `The customer is satisfied. ${res.ticket_number} is closed.`
        : res.closed
        ? `${res.ticket_number} is closed, with the answers saved.`
        : `Not resolved yet. ${res.ticket_number} stays open for another re-visit.`;
    });

  function startEdit(id: string) {
    const c = call!.contacts.find((x) => x.id === id);
    if (!c) return;
    setEditId(id);
    setEdit({ name: c.name || '', phone: (c.phone || '').replace(/\D/g, '').slice(-10), role: c.role || '', email: c.email || '' });
  }

  const editPhoneOk = /^\d{10}$/.test(edit.phone);
  const saveEdit = () =>
    run(async () => {
      const c = await updateContact(call.id, editId!, { name: edit.name.trim(), phone: edit.phone, role: edit.role.trim() || null, email: edit.email.trim() || null });
      setEditId(null);
      return `${c.name || edit.name.trim()}'s details are updated.`;
    });

  // Messages to the customer: thanks for good feedback; for a ticket, raised / re-visit booked / resolved.
  const messages: CustomerMessage[] = [];
  if (call.status === 'DONE' && call.result === 'GOOD') messages.push({ key: 'thanks', label: 'Thank you for the feedback', whatsapp: 'THANK_YOU', email: 'THANK_YOU' });
  for (const t of call.tickets) {
    const base = { ticketId: t.id, ticketNumber: t.ticket_number, issue: t.issue_summary };
    if (t.status === 'CLOSED') {
      messages.push({ key: `${t.id}-done`, label: `${t.ticket_number} · Issue resolved`, whatsapp: 'ISSUE_RESOLVED', email: 'ISSUE_RESOLVED', ...base });
    } else {
      messages.push({ key: `${t.id}-raised`, label: `${t.ticket_number} · Ticket raised`, whatsapp: 'TICKET_RAISED', email: 'ISSUE_RECEIVED', ...base });
      if (t.has_revisit) messages.push({ key: `${t.id}-revisit`, label: `${t.ticket_number} · Re-visit booked`, whatsapp: 'REVISIT_BOOKED', ...base });
    }
  }

  const spokeField = (
    <>
      <SelectField
        label="Spoke with"
        placeholder="Choose who gave the feedback"
        sheetTitle="Who gave the feedback?"
        options={[...call.contacts.map((c) => ({ value: c.id, label: c.role ? `${c.name} · ${c.role}` : c.name })), { value: OTHER, label: 'Someone else' }]}
        value={spokeValue}
        onChange={setSpokeKey}
      />
      {spokeValue === OTHER && (
        <TextInput style={styles.input} placeholder="Name of the person" placeholderTextColor={theme.textMuted} value={spokeWith} onChangeText={setSpokeWith} maxLength={150} />
      )}
    </>
  );

  const contactsList = (
    <>
      {call.contacts.map((c, i) =>
        editId === c.id ? (
          <View key={c.id} style={styles.editBox}>
            <Text style={[styles.name, { marginBottom: spacing.xs }]}>Edit contact</Text>
            <TextInput style={styles.input} placeholder="Name *" placeholderTextColor={theme.textMuted} value={edit.name} onChangeText={(v) => setEdit((e) => ({ ...e, name: v }))} maxLength={150} />
            <TextInput style={styles.input} placeholder="10-digit phone *" placeholderTextColor={theme.textMuted} keyboardType="number-pad" value={edit.phone} onChangeText={(v) => setEdit((e) => ({ ...e, phone: v.replace(/\D/g, '').slice(0, 10) }))} maxLength={10} />
            {!!edit.phone && !editPhoneOk && <Text style={styles.fieldError}>Phone must be 10 digits ({edit.phone.length} entered).</Text>}
            <TextInput style={styles.input} placeholder="Position (optional)" placeholderTextColor={theme.textMuted} value={edit.role} onChangeText={(v) => setEdit((e) => ({ ...e, role: v }))} maxLength={100} />
            <TextInput style={styles.input} placeholder="Email (optional)" placeholderTextColor={theme.textMuted} keyboardType="email-address" autoCapitalize="none" value={edit.email} onChangeText={(v) => setEdit((e) => ({ ...e, email: v }))} maxLength={150} />
            <View style={styles.row}>
              <PrimaryButton label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setEditId(null)} disabled={saving} />
              <PrimaryButton label="Save" style={{ flex: 1 }} onPress={saveEdit} loading={saving} disabled={!edit.name.trim() || !editPhoneOk} />
            </View>
          </View>
        ) : (
        <Pressable key={c.id} onPress={() => setContactKey(c.id)} style={[styles.contact, contactKey === c.id && styles.contactOn]}>
          <View style={[styles.dot, contactKey === c.id && styles.dotOn]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.small}>
              {[c.role, c.phone?.trim() || 'No phone number', c.is_primary && call.contacts.findIndex((x) => x.is_primary) === i ? 'Primary' : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {!!c.phone?.trim() && (
            <Pressable onPress={() => dial(c.phone, c.id)} style={styles.callBtn} accessibilityRole="button" accessibilityLabel={`Call ${c.name}`}>
              <PhoneIcon size={16} color={theme.textOnPrimary} />
              <Text style={styles.callText}>Call</Text>
            </Pressable>
          )}
          {canMessage && (
            <Pressable onPress={() => startEdit(c.id)} style={styles.editBtn} accessibilityRole="button" accessibilityLabel={`Edit ${c.name}`}>
              <PencilIcon size={16} color={theme.textSecondary} />
            </Pressable>
          )}
        </Pressable>
        ),
      )}
    </>
  );

  return (
    <View style={styles.screen}>
      <HeroHeader eyebrow={`Feedback call · ${monthLabel(call.month)}`} title={call.site.name} subtitle={call.customer.name} onBack={() => navigation.goBack()}>
        <HeroPill label={CALL_STATUS[call.display_status || call.status]?.label || call.status} tone={CALL_STATUS[call.display_status || call.status]?.tone || 'neutral'} />
        <HeroPill label={`${call.visits.length} service${call.visits.length === 1 ? '' : 's'}`} tone="info" />
        {call.calls_summary.total > 0 && <HeroPill label={`${call.calls_summary.total} call${call.calls_summary.total === 1 ? '' : 's'} made`} tone="accent" />}
      </HeroHeader>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <CustomerCard
          customer={call.customer.name}
          site={call.site.name}
          place={[call.site.city, call.site.address].filter(Boolean).join(' · ')}
          services={monthServices}
          by={call.collector?.name ? `Call taken by ${call.collector.name}` : null}
        />
        <CrmErrorBanner message={error} />

        {/* ---- working the call ---- */}
        {canWork && !formReceived && (
          <>
            <Panel title="Call the customer" icon={<PhoneIcon size={17} color={theme.primary} />}>
              {contactsList}
              <Pressable onPress={() => setContactKey(OTHER)} style={[styles.contact, contactKey === OTHER && styles.contactOn]}>
                <View style={[styles.dot, contactKey === OTHER && styles.dotOn]} />
                <Text style={styles.name}>Another number</Text>
              </Pressable>
              {contactKey === OTHER && (
                <View>
                  <TextInput style={styles.input} placeholder="10-digit phone *" placeholderTextColor={theme.textMuted} keyboardType="number-pad" value={newPhone} onChangeText={(v) => setNewPhone(v.replace(/\D/g, '').slice(0, 10))} maxLength={10} />
                  <TextInput style={styles.input} placeholder="Name *" placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} maxLength={150} />
                  <TextInput style={styles.input} placeholder="Position (optional)" placeholderTextColor={theme.textMuted} value={newRole} onChangeText={setNewRole} maxLength={100} />
                  <TextInput style={styles.input} placeholder="Email (optional)" placeholderTextColor={theme.textMuted} keyboardType="email-address" autoCapitalize="none" value={newEmail} onChangeText={setNewEmail} maxLength={150} />
                  <Text style={styles.small}>Saved to {call.site.name}'s contacts.</Text>
                  <PrimaryButton label="Save contact" onPress={saveContact} loading={saving} disabled={newPhone.length !== 10 || !newName.trim()} style={{ marginTop: spacing.xs }} />
                </View>
              )}
              {contactKey !== OTHER && (
                <>
                  <Text style={styles.label}>What happened on this call?</Text>
                  <View style={styles.outcomes} accessibilityRole="radiogroup">
                    {CALL_OUTCOMES.map((o) => (
                      <Pressable
                        key={o.value}
                        onPress={() => setOutcome(o.value)}
                        style={[styles.outcome, outcome === o.value && styles.outcomeOn]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: outcome === o.value }}
                      >
                        <Text style={[styles.outcomeText, outcome === o.value && styles.outcomeTextOn]} numberOfLines={1}>
                          {o.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <PrimaryButton label="Save call result" onPress={saveAttempt} loading={saving} style={{ marginTop: spacing.sm }} />
                  {call.calls_summary.total > 0 && (
                    <Text style={[styles.small, { marginTop: spacing.xs }]}>
                      {call.calls_summary.total} call{call.calls_summary.total === 1 ? '' : 's'} so far · {call.calls_summary.missed} not answered
                    </Text>
                  )}
                </>
              )}
            </Panel>

            <Panel title="Customer can't talk now?" icon={<WhatsAppIcon size={17} color="#1FAA53" />}>
              <Text style={styles.small}>Send the feedback form on WhatsApp; they answer the same questions.</Text>
              <Pressable onPress={formLink} disabled={!contact?.phone || saving} style={[styles.wa, !contact?.phone && { opacity: 0.5 }]} accessibilityRole="button">
                <WhatsAppIcon size={18} />
                <Text style={styles.waText}>Form link{contact ? ` to ${contact.name}` : ''}</Text>
              </Pressable>
            </Panel>

            <Panel title="Feedback from the call" icon={<ClipboardIcon size={17} color={theme.primary} />}>
              {spokeField}
              <QuestionForm
                questions={asked}
                mode={qMode}
                onMode={setQMode}
                counts={modeCounts}
                onSkip={skip}
                answers={answers}
                onAnswer={answer}
                other={other}
                onOther={setOther}
                otherEnabled={otherEnabled}
              />
              {bad.length > 0 ? (
                <View style={styles.row}>
                  <PrimaryButton label="No ticket · Done" variant="secondary" style={{ flex: 1 }} onPress={() => setSheet('no-ticket')} disabled={saving || !chosen.length} />
                  <PrimaryButton label="Raise ticket" variant="brand" style={{ flex: 1 }} onPress={() => { try { body(); setSheet('ticket'); } catch (err) { setToast({ message: errorText(err), variant: 'error' }); } }} disabled={saving || !chosen.length} />
                </View>
              ) : (
                <PrimaryButton label="Save · Done (Good)" onPress={() => saveGood()} loading={saving} disabled={!chosen.length} style={{ marginTop: spacing.sm }} />
              )}
            </Panel>
          </>
        )}

        {/* ---- the customer's form ---- */}
        {canWork && formReceived && latest && (
          <Panel title="The customer sent the form" icon={<InboxIcon size={17} color={theme.primary} />}>
            <Text style={styles.small}>{[latest.spoke_with_name, formatDateTime(latest.submitted_at)].filter(Boolean).join(' · ')}</Text>
            <AnswersList submission={latest} />
            {latest.has_issue ? (
              <View style={styles.row}>
                <PrimaryButton label="No ticket · Done" variant="secondary" style={{ flex: 1 }} onPress={() => run(async () => { await finishCall(call.id); return 'The call is done.'; })} disabled={saving} />
                <PrimaryButton label="Raise ticket" variant="brand" style={{ flex: 1 }} onPress={() => setSheet('ticket')} disabled={saving} />
              </View>
            ) : (
              <PrimaryButton label="All good · Done" onPress={() => run(async () => { await finishCall(call.id); return 'The call is done.'; })} loading={saving} style={{ marginTop: spacing.sm }} />
            )}
          </Panel>
        )}

        {/* ---- follow-up call after the re-visit ---- */}
        {call.status === 'DONE' && canFollowUp && followUpTicket && (
          <Panel title={`Follow-up call · ${followUpTicket.ticket_number}`} icon={<PhoneIcon size={17} color={theme.primary} />}>
            <Text style={styles.small}>The re-visit is done. Call the customer and ask the questions again.</Text>
            <View style={{ marginTop: spacing.sm }}>{contactsList}</View>
            {spokeField}
            <QuestionForm
              questions={asked}
              mode={qMode}
              onMode={setQMode}
              counts={modeCounts}
              onSkip={skip}
              answers={answers}
              onAnswer={answer}
              other={other}
              onOther={setOther}
              otherEnabled={otherEnabled}
            />
            {bad.length > 0 ? (
              <View style={styles.row}>
                <PrimaryButton label="Close the ticket" variant="secondary" style={{ flex: 1 }} onPress={() => saveFollowUp(true)} disabled={saving || !chosen.length} />
                <PrimaryButton label="Stays open" variant="brand" style={{ flex: 1 }} onPress={() => saveFollowUp()} loading={saving} disabled={!chosen.length} />
              </View>
            ) : (
              <PrimaryButton label={`Satisfied · close ${followUpTicket.ticket_number}`} onPress={() => saveFollowUp()} loading={saving} disabled={!chosen.length} style={{ marginTop: spacing.sm }} />
            )}
          </Panel>
        )}

        {/* ---- result ---- */}
        {call.status === 'DONE' && (
          <Panel title="Result" icon={<CheckCircleIcon size={17} color={theme.primary} />}>
            {firstFeedback ? (
              <FeedbackRound
                title={firstFeedback.source === 'FORM' ? "Customer's form" : 'First call'}
                submission={firstFeedback}
                meta={[firstFeedback.spoke_with_name, formatDateTime(firstFeedback.submitted_at)].filter(Boolean).join(' · ')}
              />
            ) : (
              <Text style={styles.small}>No feedback was received this month.</Text>
            )}
            {followUps.map((s, n) => (
              <FeedbackRound
                key={s.id}
                title={`Follow-up call ${n + 1} · ${s.has_issue ? 'Not resolved' : 'Resolved'}`}
                submission={s}
                meta={[s.spoke_with_name, formatDateTime(s.submitted_at)].filter(Boolean).join(' · ')}
              />
            ))}
          </Panel>
        )}

        {call.tickets.length > 0 && (
          <Panel title="Ticket" icon={<AlertTriangleIcon size={17} color={theme.primary} />}>
            {call.tickets.map((t) => (
              <Pressable key={t.id} onPress={() => navigation.navigate('FeedbackTicket', { ticketId: t.id })} style={styles.ticket}>
                <Text style={styles.ticketNo}>{t.ticket_number}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <StatusBadge label={PRIORITY[t.priority].label} tone={PRIORITY[t.priority].tone} dot={false} />
                  <StatusBadge label={TICKET_STATUS[t.status].label} tone={TICKET_STATUS[t.status].tone} dot={false} />
                </View>
              </Pressable>
            ))}
          </Panel>
        )}

        {/* ---- WhatsApp / email to the customer ---- */}
        {canMessage && (
          <MessagesPanel
            callId={call.id}
            contacts={call.contacts}
            messages={messages}
            info={{ customer: call.customer.name, site: call.site.name, month: call.month }}
            onSent={setNotice}
            onError={(message) => setToast({ message, variant: 'error' })}
          />
        )}
      </ScrollView>

      {sheet === 'ticket' && (
        <RaiseTicketSheet
          visible
          visits={call.visits}
          suggested={suggestedPriority(formReceived && latest ? latest.responses : bad)}
          defaultSummary={(formReceived ? latest?.other_feedback : other.trim()) || ''}
          submitLabel={formReceived ? 'Raise ticket' : 'Save & raise ticket'}
          onSubmit={submitTicket}
          onClose={() => setSheet(null)}
        />
      )}
      <Sheet visible={sheet === 'no-ticket'} onClose={() => setSheet(null)} title="Finish without a ticket?">
        <Text style={styles.sheetText}>Some answers show an issue. Save the feedback and end the call without raising a ticket?</Text>
        <View style={styles.row}>
          <PrimaryButton label="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setSheet(null)} />
          <PrimaryButton label="Yes, no ticket" style={{ flex: 1 }} onPress={() => saveGood(true)} loading={saving} />
        </View>
      </Sheet>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}
