import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, CheckCircleIcon, InboxIcon, PencilIcon, PhoneIcon, PlusIcon } from '../../components/icons';
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
  cancelNumberRequest,
  closeTicket,
  errorText,
  finishCall,
  getCall,
  getTicket,
  raiseTicket,
  recordAttempt,
  recordFollowUp,
  saveFeedback,
  sendFormLink,
  sendNumberRequest,
  updateContact,
} from '../api';
import { useFeedback } from '../FeedbackContext';
import { CALL_OUTCOMES, PRIORITY, callStatusMeta, TICKET_STATUS, chosenAnswers, formatDateTime, formatDay, modeBody, modeCounts, questionsFor, type QuestionMode, monthLabel, nowStamp, periodText, suggestedPriority, waPhoneProblem } from '../format';
import { HeroHeader, HeroPill } from '../Hero';
import { MessagesPanel, type CustomerMessage } from '../MessagesPanel';
import type { FeedbackStackParamList } from '../navigation';
import { FEEDBACK_FEATURES } from '../featureFlags';
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
  lockBox: { backgroundColor: t.warningBg, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm },
  lockTitle: { ...typography.captionMedium, fontWeight: '800' as const, color: t.warningText },
  lockText: { ...typography.caption, color: t.warningText, marginTop: 2 },
  locked: { opacity: 0.4 },
  choice: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.md, borderRadius: 16, borderWidth: 1.5, marginBottom: spacing.sm },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  choiceTitle: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.textPrimary },
  earlier: { backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.md },
  earlierHead: { ...typography.captionMedium, fontWeight: '700' as const, color: t.warningText, marginBottom: spacing.xs },
  earlierLabel: { ...typography.overline, fontSize: 10, color: t.textMuted },
  contactNew: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  nameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  newTag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' as const, backgroundColor: '#16A34A', color: '#FFFFFF', fontSize: 10, fontWeight: '800' as const },
  nrWait: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  nrWaitText: { ...typography.caption, color: '#92400E' },
  nrAsk: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  nrAskText: { ...typography.caption, color: '#991B1B' },
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
  // The saved-numbers card: the picked number, a dropdown of the site's other numbers, Call and Edit.
  saved: { borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: spacing.sm, marginBottom: spacing.xs, backgroundColor: t.surface },
  savedOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg, borderWidth: 1.5 },
  savedHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarOff: { backgroundColor: t.textMuted },
  avatarText: { ...typography.captionMedium, fontWeight: '800' as const, color: t.textOnPrimary },
  savedActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: spacing.xs },
  callWide: { flex: 1, minHeight: 44, borderRadius: radii.md, backgroundColor: t.primary, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingHorizontal: spacing.sm },
  editSquare: { width: 44, minHeight: 44, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  another: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: t.border, borderRadius: 16, padding: spacing.sm, marginBottom: spacing.xs },
  anotherOn: { borderStyle: 'solid' as const, borderColor: t.primary, backgroundColor: t.primarySoftBg },
  plus: { width: 32, height: 32, borderRadius: 10, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  savedHint: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs },
  waProblem: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  waProblemText: { ...typography.caption, color: '#991B1B' },
  noteInput: { minHeight: 64, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, padding: spacing.sm, color: t.textPrimary, textAlignVertical: 'top' as const, marginBottom: spacing.sm, ...typography.body },
});

// Each call result in its own colour once picked.
const OUTCOME_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  ANSWERED: { bg: '#DCFCE7', fg: '#15803D', border: '#86EFAC' },
  NO_ANSWER: { bg: '#FEF3C7', fg: '#B45309', border: '#FCD34D' },
  BUSY: { bg: '#FFEDD5', fg: '#C2410C', border: '#FDBA74' },
  WRONG_NUMBER: { bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5' },
};

/** "RK" for "Ravi Kumar". */
function initialsOf(name: string | null | undefined): string {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

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
  const [requestNote, setRequestNote] = useState('');
  const setNotice = (message: string) => setToast({ message, variant: 'success' });
  const [saving, setSaving] = useState(false);

  // calling
  const [contactKey, setContactKey] = useState<string>('');
  // The result being saved right now (picking one saves it); null = show the last saved one.
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  // The saved number last picked, so the saved card keeps it while "Another number" is open.
  const [lastSavedKey, setLastSavedKey] = useState('');
  // A WhatsApp problem (e.g. a number WhatsApp can't use), shown under the WhatsApp button.
  const [waError, setWaError] = useState<string | null>(null);
  const [closeNote, setCloseNote] = useState('');
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
  // ticket = raise with the answers on this screen; later = a ticket on feedback already saved;
  // choice = Raise new ticket (new feedback, or a ticket without feedback).
  const [sheet, setSheet] = useState<'ticket' | 'later' | 'choice' | 'no-ticket' | 'close' | null>(null);
  // New feedback on a call already done (Raise new ticket > Take new feedback).
  const [newRound, setNewRound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getCall(callId);
      setCall(c);
      // A right number just added by the service coordinator is the one to call next.
      const added = freshAddedContact(c);
      const primary = c.contacts.find((x) => x.is_primary) || c.contacts[0];
      setContactKey((k) => added || k || primary?.id || OTHER);
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
  // No service in the period: the site's last service before it decides the Service questions; a site
  // with no service at all gets every Service question (the server accepts answers to any active question).
  const monthServices = useMemo(() => {
    const inPeriod = [...new Set((call?.visits || []).map((v) => v.service).filter((x): x is string => !!x))];
    if (inPeriod.length) return inPeriod;
    if (call?.earlier_visit?.service) return [call.earlier_visit.service];
    return [...new Set(questions.filter((q) => q.question_type === 'SERVICE').flatMap((q) => q.services || []))];
  }, [call, questions]);
  // The customer card shows only the last service given (newest visit in the period, else the last one
  // before it). monthServices above still decides which Service questions are asked.
  const lastServiceText = useMemo(() => {
    const withService = (call?.visits || []).filter((v) => v.service);
    const latestVisit = [...withService].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
      || (call?.earlier_visit?.service ? call.earlier_visit : null);
    if (!latestVisit?.service) return null;
    return latestVisit.date ? `${latestVisit.service} · ${formatDay(latestVisit.date)}` : latestVisit.service;
  }, [call]);
  const asked = useMemo(() => questionsFor(questions, qMode, monthServices), [questions, qMode, monthServices]);
  const counts = useMemo(() => modeCounts(questions, monthServices, []), [questions, monthServices]);
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
  // A wrong number: ask the service coordinator for the right one (web: Feedback Desk > Requests).
  const numberRequests = call.number_requests || [];
  const openRequest = numberRequests.find((q) => q.status === 'OPEN');
  const lastDone = numberRequests.find((q) => q.status === 'DONE');
  // Shown under the call result when Wrong number is picked; the right number, once added and not called yet.
  const lastCallAt = call.call_attempts[0]?.called_at;
  // The questions open only after a call saved as Answered; No answer / Busy / Wrong number keep them closed.
  const lastOutcome = call.call_attempts[0]?.outcome || null;
  const feedbackLock = lastOutcome !== 'ANSWERED';
  const wrongLock = lastOutcome === 'WRONG_NUMBER';
  const freshNumber = !openRequest && !!lastDone && (!lastCallAt || new Date(lastCallAt) < new Date(lastDone.resolved_at || 0));
  // Not again right after the coordinator added the number - only after that one is wrong too.
  const canAskNumber = canWork && lastOutcome === 'WRONG_NUMBER' && !openRequest && (call.status === 'WRONG_NUMBER' || !freshNumber);
  // The right number from the coordinator (not called yet): under the wrong one, marked New.
  const newContactId = freshNumber ? lastDone?.right?.contact_id ?? null : null;
  const primaryId = call.contacts.find((x) => x.is_primary)?.id;
  const contactsShown = (() => {
    const added = call.contacts.find((c) => c.id === newContactId);
    if (!added) return call.contacts;
    const rest = call.contacts.filter((c) => c.id !== newContactId);
    const at = rest.findIndex((c) => c.id === lastDone?.wrong.contact_id);
    return at < 0 ? [...rest, added] : [...rest.slice(0, at + 1), added, ...rest.slice(at + 1)];
  })();
  async function askNumber() {
    setSaving(true);
    try {
      // The wrong number is saved first when it isn't the saved result yet.
      if (call!.status !== 'WRONG_NUMBER') {
        if (!contact) throw new Error('Pick the contact you called');
        await recordAttempt(call!.id, { contact_id: contact.id, outcome: 'WRONG_NUMBER' });
      }
      await sendNumberRequest(call!.id, requestNote.trim() || null);
      setRequestNote('');
      setNotice('Wrong number saved and the request sent to the service coordinator.');
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }
  async function cancelAsk() {
    if (!openRequest) return;
    setSaving(true);
    try {
      await cancelNumberRequest(openRequest.id);
      setNotice('Request cancelled.');
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }
  const formReceived = call.status === 'FORM_RECEIVED';
  const contact = call.contacts.find((c) => c.id === contactKey) || null;
  // The dropdown's order: the coordinator's new number, the primary, then the rest.
  const contactOptions = [
    ...contactsShown.filter((c) => c.id === newContactId),
    ...contactsShown.filter((c) => c.id !== newContactId && c.id === primaryId),
    ...contactsShown.filter((c) => c.id !== newContactId && c.id !== primaryId),
  ];
  const savedContact = contactOptions.find((c) => c.id === contactKey) || contactOptions.find((c) => c.id === lastSavedKey) || contactOptions[0] || null;
  // The result shown: the one being saved, else the last saved one when it was for this contact.
  const savedForThis = !!contact && call.call_attempts[0]?.contact_id === contact.id;
  const shownOutcome = outcome ?? (savedForThis ? lastOutcome : null);
  const latest = call.submissions.find((s) => s.is_latest) || call.submissions[0] || null;
  const firstTicket = call.tickets[0] || null; // the call's first ticket (a new complaint gets its own)
  // The ticket to open from the call: the latest still open, else the latest.
  const lastTicket = call.tickets.length ? [...call.tickets].reverse().find((t) => t.status !== 'CLOSED') || call.tickets[call.tickets.length - 1] : null;
  const canRaiseLater = call.status === 'DONE' && call.submissions.length > 0 && (mine || can('FEEDBACK_MANAGE'));
  // A round of feedback after the first ticket: a new complaint (saved with another ticket), one
  // department's questions (the optional call after that team finished), or a follow-up call.
  const roundTitle = (s: (typeof call.submissions)[number], n: number) => {
    const raised = call.tickets.find((t) => t.id !== firstTicket?.id && Math.abs(new Date(t.created_at).getTime() - new Date(s.submitted_at).getTime()) < 5000);
    if (raised) return `New complaint · ${raised.ticket_number}`;
    const qs = (s.responses || []).map((r) => questions.find((q) => q.id === r.question_id));
    const dept = qs.length && qs.every((q) => q?.question_type === 'DEPARTMENT') ? qs[0]?.departments?.[0] : null;
    if (dept) {
      const label = call.tickets.flatMap((t) => t.parts || []).find((p) => p.kind === dept)?.label || dept;
      return `${label} feedback · ${s.has_issue ? 'Not happy' : 'All good'}`;
    }
    return `Follow-up call ${n} · ${s.has_issue ? 'Not resolved' : 'Resolved'}`;
  };
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
      ...modeBody(qMode),
      ...(newRound ? { new_round: true } : {}),
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

  function pickContact(id: string) {
    setContactKey(id);
    setWaError(null);
    if (id !== OTHER) setLastSavedKey(id);
  }

  async function dial(phone: string | null, id: string) {
    pickContact(id);
    if (phone) await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
  }

  async function saveAttempt(picked: CallOutcome) {
    if (saving) return;
    if (!contact) {
      setToast({ message: 'Pick the contact you called', variant: 'error' });
      return;
    }
    setOutcome(picked);
    setSaving(true);
    try {
      const res = await recordAttempt(call!.id, { contact_id: contact.id, outcome: picked });
      setNotice(
        picked === 'ANSWERED'
          ? 'Call saved. Ask the questions below.'
          : picked === 'WRONG_NUMBER'
          ? 'Saved as wrong number. Send a request for the right one below.'
          : res.offer_form_link
          ? "Call saved. The customer didn't answer - you can send the form on WhatsApp."
          : 'Call saved.',
      );
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setOutcome(null);
      setSaving(false);
    }
  }

  const saveContact = () =>
    run(async () => {
      const c = await addContact(call.id, { name: newName.trim(), phone: newPhone.trim(), role: newRole.trim() || null, email: newEmail.trim() || null });
      pickContact(c.id);
      setNewPhone('');
      setNewName('');
      setNewRole('');
      setNewEmail('');
      return c.created ? `${c.name} saved to ${call.site.name}'s contacts.` : `This number is already saved as ${c.name}.`;
    });

  async function formLink() {
    if (!contact?.phone) {
      setWaError('Pick a contact with a phone number to send the form link to.');
      return;
    }
    const problem = waPhoneProblem(contact);
    if (problem) {
      setWaError(problem);
      return;
    }
    setWaError(null);
    setSaving(true);
    try {
      const res = await sendFormLink(call!.id, contact.id);
      if (res.whatsapp?.wa_me_url) await openWhatsapp(res.whatsapp.wa_me_url);
      setNotice(`Form link made for ${contact.name}. Press Send in WhatsApp.`);
      await load();
    } catch (err) {
      const text = errorText(err);
      setWaError(/not a phone number whatsapp can use/i.test(text) ? waPhoneProblem(contact) || text : text);
    } finally {
      setSaving(false);
    }
  }

  // The work is done: close the follow-up ticket without the customer's feedback.
  const closeWithoutFeedback = () =>
    run(async () => {
      const fresh = await getTicket(followUpTicket!.id);
      await closeTicket(followUpTicket!.id, fresh.row_version ?? 0, closeNote.trim() || null);
      setCloseNote('');
      setSheet(null);
      return `${followUpTicket!.ticket_number} is closed.`;
    });

  const saveGood = (noTicket = false) =>
    run(async () => {
      await saveFeedback(call.id, { ...body(), ...(noTicket ? { no_ticket: true } : {}) });
      resetAnswers();
      setSheet(null);
      const was = newRound;
      setNewRound(false);
      return was ? 'New feedback saved.' : 'Feedback saved. The call is done.';
    });

  async function submitTicket(ticket: NewTicket) {
    const later = sheet === 'later' || (formReceived && !!latest);
    const res = later && latest ? await raiseTicket(call!.id, { submission_id: latest.id, ...ticket }) : await saveFeedback(call!.id, { ...body(), ticket });
    const done = call!.status === 'DONE';
    resetAnswers();
    setSheet(null);
    setNewRound(false);
    setNotice(`Ticket ${res.ticket?.ticket_number} raised.${done ? '' : ' The call is done.'}`);
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

  // The saved-numbers card: the picked number (the primary by default), the site's other numbers in a
  // dropdown, and Call / Edit. Used on the call, the follow-up call and new feedback.
  const savedOn = contactKey !== OTHER;
  const savedCard =
    !savedContact ? null : editId === savedContact.id ? (
      <View style={styles.editBox}>
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
      <View style={[styles.saved, savedOn && styles.savedOn, savedOn && savedContact.id === newContactId && styles.contactNew]}>
        <Pressable onPress={() => pickContact(savedContact.id)} style={styles.savedHead} accessibilityRole="radio" accessibilityState={{ checked: savedOn }}>
          <View style={[styles.dot, savedOn && styles.dotOn]} />
          <View style={[styles.avatar, !savedOn && styles.avatarOff]}>
            <Text style={styles.avatarText}>{initialsOf(savedContact.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {savedContact.name}
              </Text>
              {savedContact.id === newContactId && <Text style={styles.newTag}>NEW</Text>}
            </View>
            <Text style={styles.small} numberOfLines={2}>
              {[savedContact.phone?.trim() || 'No phone number', savedContact.role, savedContact.id === primaryId ? 'Primary' : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
        {contactOptions.length > 1 && (
          <SelectField
            label={`Saved numbers · ${contactOptions.length}`}
            placeholder="Choose a number"
            sheetTitle="Which number?"
            options={contactOptions.map((c) => ({
              value: c.id,
              label: `${c.name} · ${c.phone?.trim() || 'No phone'}${c.id === primaryId ? ' (Primary)' : ''}${c.id === newContactId ? ' · New' : ''}`,
            }))}
            value={savedContact.id}
            onChange={pickContact}
          />
        )}
        <View style={styles.savedActions}>
          {!!savedContact.phone?.trim() && (
            <Pressable onPress={() => dial(savedContact.phone, savedContact.id)} style={styles.callWide} accessibilityRole="button" accessibilityLabel={`Call ${savedContact.name}`}>
              <PhoneIcon size={16} color={theme.textOnPrimary} />
              <Text style={styles.callText} numberOfLines={1}>
                Call {savedContact.phone.trim()}
              </Text>
            </Pressable>
          )}
          {canMessage && (
            <Pressable onPress={() => startEdit(savedContact.id)} style={styles.editSquare} accessibilityRole="button" accessibilityLabel={`Edit ${savedContact.name}`}>
              <PencilIcon size={16} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    );

  return (
    <View style={styles.screen}>
      <HeroHeader eyebrow={call.due_date ? `Feedback call · due ${formatDay(call.due_date)}${call.period_start ? ` · services ${periodText(call.period_start, call.period_end)}` : ''}` : `Feedback call · ${monthLabel(call.month)}`} title={call.customer.name} subtitle={[call.site.name, call.site.city].filter(Boolean).join(" · ")} onBack={() => navigation.goBack()}>
        <HeroPill label={callStatusMeta(call.display_status || call.status, call.result).label} tone={callStatusMeta(call.display_status || call.status, call.result).tone} />
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
          lastService={lastServiceText}
          by={call.collector?.name ? `Call taken by ${call.collector.name}` : null}
        />
        {/* No service in this period: the site's last service before it. */}
        {call.visits.length === 0 && (
          <View style={styles.earlier}>
            <Text style={styles.earlierHead}>No service in this period</Text>
            {call.earlier_visit ? (
              <>
                <Text style={styles.earlierLabel}>LAST SERVICE BEFORE</Text>
                <Text style={styles.name}>{call.earlier_visit.service || 'Service'}</Text>
                <Text style={styles.small}>
                  {[formatDay(call.earlier_visit.date), `Job ${call.earlier_visit.job_code}`, call.earlier_visit.technicians].filter(Boolean).join(' · ')}
                </Text>
              </>
            ) : (
              <Text style={styles.small}>This site has had no service yet.</Text>
            )}
          </View>
        )}
        <CrmErrorBanner message={error} />

        {/* ---- working the call ---- */}
        {canWork && !formReceived && (
          <>
            <Panel title="Call the customer" icon={<PhoneIcon size={17} color={theme.primary} />}>
              {savedCard}
              <Pressable onPress={() => pickContact(OTHER)} style={[styles.another, contactKey === OTHER && styles.anotherOn]} accessibilityRole="radio" accessibilityState={{ checked: contactKey === OTHER }}>
                <View style={[styles.dot, contactKey === OTHER && styles.dotOn]} />
                <View style={styles.plus}>
                  <PlusIcon size={16} color={theme.primary} />
                </View>
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
                    {CALL_OUTCOMES.map((o) => {
                      const on = shownOutcome === o.value;
                      const c = OUTCOME_COLORS[o.value];
                      return (
                        <Pressable
                          key={o.value}
                          onPress={() => saveAttempt(o.value)}
                          disabled={saving}
                          style={[styles.outcome, on && { backgroundColor: c.bg, borderColor: c.border }]}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on, disabled: saving }}
                        >
                          <Text style={[styles.outcomeText, on && { color: c.fg, fontWeight: '800' }]} numberOfLines={1}>
                            {o.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {/* Picking a result saves it straight away. */}
                  {saving && outcome ? (
                    <Text style={styles.savedHint}>Saving…</Text>
                  ) : call.call_attempts[0] ? (
                    <Text style={styles.savedHint}>
                      Saved: {CALL_OUTCOMES.find((o) => o.value === call.call_attempts[0].outcome)?.label || call.call_attempts[0].outcome} · {call.call_attempts[0].contact_name || call.call_attempts[0].phone} · {formatDateTime(call.call_attempts[0].called_at)}
                    </Text>
                  ) : null}
                  {/* Wrong number: ask the service coordinator for the right one (web: Feedback Desk > Requests). */}
                  {openRequest ? (
                    <View style={styles.nrWait}>
                      <Text style={styles.nrWaitText}>
                        Request sent - waiting for the service coordinator (wrong: {[openRequest.wrong.name, openRequest.wrong.phone].filter(Boolean).join(' · ') || 'not recorded'}, {formatDateTime(openRequest.requested_at)}).
                      </Text>
                      <PrimaryButton label="Cancel request" variant="secondary" onPress={cancelAsk} loading={saving} style={{ marginTop: spacing.xs }} />
                    </View>
                  ) : canAskNumber ? (
                    <View style={styles.nrAsk}>
                      <Text style={styles.nrAskText}>Ask the service coordinator for the right number. The call comes back to you when they add it.</Text>
                      <TextInput style={styles.input} placeholder="Note (optional)" placeholderTextColor={theme.textMuted} value={requestNote} onChangeText={setRequestNote} maxLength={500} />
                      <PrimaryButton label={call.status === 'WRONG_NUMBER' ? 'Send request' : 'Save & send request'} onPress={askNumber} loading={saving} style={{ marginTop: spacing.xs }} />
                    </View>
                  ) : null}
                  {freshNumber && (
                    <Text style={[styles.small, { marginTop: spacing.xs, color: theme.success }]}>
                      ✓ Right number from {lastDone!.resolved_by?.name || 'the coordinator'}: {lastDone!.right?.name} · {lastDone!.right?.phone}
                      {lastDone!.resolve_note ? ` · "${lastDone!.resolve_note}"` : ''}. It is added above, marked NEW - call it now.
                    </Text>
                  )}
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
                <Text style={styles.waText} numberOfLines={1}>
                  Form link{contact ? ` to ${contact.name}` : ''}
                </Text>
              </Pressable>
              {!!waError && (
                <View style={styles.waProblem}>
                  <Text style={styles.waProblemText}>{waError}</Text>
                </View>
              )}
            </Panel>

            {/* Hidden in the app (featureFlags.feedbackQuestions): the questions are answered on the website. */}
            {FEEDBACK_FEATURES.feedbackQuestions && (
            <Panel title="Feedback from the call" icon={<ClipboardIcon size={17} color={theme.primary} />}>
              {feedbackLock && (
                <View style={styles.lockBox}>
                  <Text style={styles.lockTitle}>{wrongLock ? 'Wrong number' : lastOutcome ? "The customer didn't answer" : 'Call the customer first'}</Text>
                  <Text style={styles.lockText}>
                    {wrongLock
                      ? 'The questions open once you call the right number and pick Answered. Send a request for the number, or call another contact.'
                      : lastOutcome
                      ? 'Call again and pick Answered to open the questions, or send the feedback form on WhatsApp.'
                      : 'Call the customer and pick Answered above to open the questions.'}
                  </Text>
                </View>
              )}
              <View pointerEvents={feedbackLock ? 'none' : 'auto'} style={feedbackLock ? styles.locked : undefined}>
              {spokeField}
              <QuestionForm
                questions={asked}
                mode={qMode}
                onMode={setQMode}
                counts={counts}
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
                  <PrimaryButton label="Raise ticket" variant="brand" style={{ flex: 1 }} onPress={() => { try { body(); setSheet('ticket'); } catch (err) { setToast({ message: errorText(err), variant: 'error' }); } }} disabled={saving || !chosen.length || feedbackLock} />
                </View>
              ) : (
                // All good: still let them raise a ticket for any other complaint.
                <View style={styles.row}>
                  <PrimaryButton label="Raise ticket" variant="secondary" style={{ flex: 1 }} onPress={() => { try { body(); setSheet('ticket'); } catch (err) { setToast({ message: errorText(err), variant: 'error' }); } }} disabled={saving || !chosen.length || feedbackLock} />
                  <PrimaryButton label="Save · Done (Good)" style={{ flex: 1 }} onPress={() => saveGood()} loading={saving} disabled={!chosen.length || feedbackLock} />
                </View>
              )}
              </View>
            </Panel>
            )}
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

        {/* ---- follow-up call after the re-visit (hidden in the app: featureFlags.followUpCall) ---- */}
        {FEEDBACK_FEATURES.followUpCall && call.status === 'DONE' && canFollowUp && followUpTicket && (
          <Panel title={`Follow-up call · ${followUpTicket.ticket_number}`} icon={<PhoneIcon size={17} color={theme.primary} />}>
            <Text style={styles.small}>The work is done. Call the customer and ask the questions again (satisfied: the ticket closes), or close it without the call.</Text>
            <PrimaryButton label="Close without feedback" variant="secondary" onPress={() => setSheet('close')} disabled={saving} style={{ marginTop: spacing.sm }} />
            <View style={{ marginTop: spacing.sm }}>{savedCard}</View>
            {spokeField}
            <QuestionForm
              questions={asked}
              mode={qMode}
              onMode={setQMode}
              counts={counts}
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
                title={roundTitle(s, n + 1)}
                submission={s}
                meta={[s.spoke_with_name, formatDateTime(s.submitted_at)].filter(Boolean).join(' · ')}
              />
            ))}
            {canRaiseLater && !newRound && (
              <View style={styles.row}>
                {lastTicket && (
                  <PrimaryButton
                    label={lastTicket.status === 'CLOSED' ? `Reopen ${lastTicket.ticket_number}` : `Open ${lastTicket.ticket_number}`}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => navigation.navigate('FeedbackTicket', { ticketId: lastTicket.id, reopen: lastTicket.status === 'CLOSED' })}
                  />
                )}
                {/* With "new feedback" hidden, the choice sheet would have one option: go straight to it. */}
                <PrimaryButton label={lastTicket ? 'Raise new ticket' : 'Raise ticket'} variant="brand" style={{ flex: 1 }} onPress={() => setSheet(lastTicket && FEEDBACK_FEATURES.newFeedbackRound ? 'choice' : 'later')} />
              </View>
            )}
          </Panel>
        )}

        {/* ---- new feedback on a done call: a new complaint (hidden in the app: featureFlags.newFeedbackRound) ---- */}
        {FEEDBACK_FEATURES.newFeedbackRound && call.status === 'DONE' && newRound && canRaiseLater && (
          <Panel title="New feedback · new complaint" icon={<ClipboardIcon size={17} color={theme.primary} />}>
            <Text style={styles.small}>Call the customer and ask the questions again; then raise the ticket from their answers.</Text>
            <View style={{ marginTop: spacing.sm }}>{savedCard}</View>
            {spokeField}
            <QuestionForm
              questions={asked}
              mode={qMode}
              onMode={setQMode}
              counts={counts}
              onSkip={skip}
              answers={answers}
              onAnswer={answer}
              other={other}
              onOther={setOther}
              otherEnabled={otherEnabled}
            />
            <View style={styles.row}>
              <PrimaryButton label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => { resetAnswers(); setNewRound(false); }} disabled={saving} />
              <PrimaryButton label="No ticket" variant="secondary" style={{ flex: 1 }} onPress={() => saveGood(true)} disabled={saving || !chosen.length} />
            </View>
            <PrimaryButton label="Save & raise ticket" variant="brand" onPress={() => { try { body(); setSheet('ticket'); } catch (err) { setToast({ message: errorText(err), variant: 'error' }); } }} disabled={saving || !chosen.length} style={{ marginTop: spacing.xs }} />
          </Panel>
        )}

        {call.tickets.length > 0 && (
          <Panel title={call.tickets.length > 1 ? 'Tickets' : 'Ticket'} icon={<AlertTriangleIcon size={17} color={theme.primary} />}>
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
            defaultContactId={contact?.id}
            messages={messages}
            info={{ customer: call.customer.name, site: call.site.name, month: call.month }}
            onSent={setNotice}
            onError={(message) => setToast({ message, variant: 'error' })}
          />
        )}
      </ScrollView>

      {(sheet === 'ticket' || sheet === 'later') && (
        <RaiseTicketSheet
          visible
          callId={call.id}
          visits={call.visits}
          suggested={sheet === 'later' ? (lastTicket ? 'MEDIUM' : suggestedPriority(latest?.responses || [])) : suggestedPriority(formReceived && latest ? latest.responses : bad)}
          defaultSummary={sheet === 'later' ? (lastTicket ? '' : latest?.other_feedback || '') : (formReceived ? latest?.other_feedback : other.trim()) || ''}
          submitLabel={sheet === 'later' || formReceived ? 'Raise ticket' : 'Save & raise ticket'}
          onSubmit={submitTicket}
          onClose={() => setSheet(null)}
        />
      )}
      <Sheet visible={sheet === 'choice'} onClose={() => setSheet(null)} title="Raise a new ticket">
        {FEEDBACK_FEATURES.newFeedbackRound && (
        <Pressable
          onPress={() => {
            resetAnswers();
            setSheet(null);
            setNewRound(true);
          }}
          style={[styles.choice, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}
          accessibilityRole="button"
        >
          <View style={[styles.choiceIcon, { backgroundColor: '#2563EB' }]}>
            <ClipboardIcon size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.choiceTitle}>Take new feedback & raise a ticket</Text>
            <Text style={styles.small}>Call the customer, ask the questions again, then raise the ticket from their answers.</Text>
          </View>
        </Pressable>
        )}
        <Pressable onPress={() => setSheet('later')} style={[styles.choice, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]} accessibilityRole="button">
          <View style={[styles.choiceIcon, { backgroundColor: '#DC2626' }]}>
            <AlertTriangleIcon size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.choiceTitle}>Raise a ticket without feedback</Text>
            <Text style={styles.small}>The customer told you the new problem already. Describe it and raise the ticket.</Text>
          </View>
        </Pressable>
      </Sheet>
      <Sheet visible={sheet === 'no-ticket'} onClose={() => setSheet(null)} title="Finish without a ticket?">
        <Text style={styles.sheetText}>Some answers show an issue. Save the feedback and end the call without raising a ticket?</Text>
        <View style={styles.row}>
          <PrimaryButton label="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setSheet(null)} />
          <PrimaryButton label="Yes, no ticket" style={{ flex: 1 }} onPress={() => saveGood(true)} loading={saving} />
        </View>
      </Sheet>
      <Sheet visible={sheet === 'close'} onClose={() => setSheet(null)} title={followUpTicket ? `Close ${followUpTicket.ticket_number}?` : 'Close the ticket?'}>
        <Text style={styles.sheetText}>Every team has finished its work. The ticket closes without the follow-up call; it can be reopened later.</Text>
        <TextInput style={styles.noteInput} placeholder="Note (optional), e.g. Customer said on WhatsApp it is sorted" placeholderTextColor={theme.textMuted} value={closeNote} onChangeText={setCloseNote} multiline maxLength={400} />
        <View style={styles.row}>
          <PrimaryButton label="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setSheet(null)} />
          <PrimaryButton label="Close the ticket" style={{ flex: 1 }} onPress={closeWithoutFeedback} loading={saving} />
        </View>
      </Sheet>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}

/** The contact the service coordinator just added as the right number (not called yet), or null. */
function freshAddedContact(c: Call): string | null {
  const done = (c.number_requests || []).find((q) => q.status === 'DONE');
  const id = done?.right?.contact_id;
  if (!id || !c.contacts.some((x) => x.id === id)) return null;
  const lastCall = c.call_attempts[0]?.called_at;
  return !lastCall || new Date(lastCall) < new Date(done.resolved_at || 0) ? id : null;
}
