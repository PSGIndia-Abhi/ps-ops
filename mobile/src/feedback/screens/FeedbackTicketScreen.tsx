import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, BriefcaseIcon, CheckCircleIcon, ClockIcon, CloseIcon, DocumentIcon, GalleryIcon, PhoneIcon } from '../../components/icons';
import { Sheet } from '../../tasks/ui/sheets';
import { Toast, type ToastMessage } from '../../components/Toast';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { radii, spacing, typography } from '../../theme';
import { closeTicket, errorText, getTicket, markActionDone, markPartDone, openPartAttachment, recordPartFeedback, reopenTicket, type PickedFile } from '../api';
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { QuestionsSheet } from '../QuestionsSheet';
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
  ask: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  askTitle: { ...typography.captionMedium, fontWeight: '700' as const, color: '#166534' },
  askText: { ...typography.caption, color: '#15803D' },
  fb: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, borderWidth: 1 },
  fbHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.xs },
  fbTitle: { ...typography.captionMedium, fontWeight: '800' as const },
  fbAgain: { ...typography.captionMedium, color: t.primary, fontWeight: '700' as const },
  filePick: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: spacing.xs, padding: spacing.sm, borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: t.border, backgroundColor: t.surfaceAlt },
  filePickOn: { borderStyle: 'solid' as const, borderColor: t.primary, backgroundColor: t.primarySoftBg },
  filePickText: { ...typography.caption, color: t.textSecondary, flex: 1 },
  fileX: { ...typography.bodyMedium, color: t.primary, paddingHorizontal: 4 },
  fileChip: { alignSelf: 'flex-start' as const, marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: t.successBg, maxWidth: '100%' as const },
  fileChipText: { ...typography.captionMedium, color: t.successText },
  noteInput: { minHeight: 46, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingHorizontal: spacing.sm, marginTop: spacing.sm, color: t.textPrimary, ...typography.body },
  // A department's card: the issue, what the team did, and a Call button for the customer.
  label: { ...typography.overline, fontSize: 10, letterSpacing: 0.8, color: t.textMuted, marginBottom: 6 },
  issueBox: { padding: spacing.sm, borderRadius: 12, backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border },
  issueChips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginBottom: 6 },
  issueChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, maxWidth: '100%' as const },
  issueChipText: { ...typography.caption, color: t.textSecondary },
  issueText: { ...typography.body, color: t.textPrimary },
  deptNote: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  deptNoteLabel: { fontSize: 11, fontWeight: '800' as const, color: '#92400E', letterSpacing: 0.3, marginBottom: 2 },
  doneCard: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  doneIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#16A34A', alignItems: 'center' as const, justifyContent: 'center' as const },
  doneTop: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 6 },
  donePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: '800' as const, overflow: 'hidden' as const },
  doneMeta: { ...typography.caption, color: t.textMuted, flexShrink: 1 },
  doneNote: { ...typography.bodyMedium, color: t.textPrimary, marginTop: 4 },
  avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { fontSize: 9, fontWeight: '800' as const, color: t.textOnPrimary },
  fileCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#D1FAE5', backgroundColor: t.surface },
  fileIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const },
  fileName: { ...typography.captionMedium, color: t.textPrimary },
  fileSub: { ...typography.caption, fontSize: 11, color: t.textMuted },
  fileOpen: { ...typography.captionMedium, fontWeight: '800' as const, color: '#059669' },
  fileRemove: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  pickBox: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs, padding: spacing.sm, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: t.border, backgroundColor: t.surfaceAlt },
  pickIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  waiting: { alignSelf: 'flex-start' as const, marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', overflow: 'hidden' as const, color: '#92400E', fontSize: 12, fontWeight: '700' as const },
  callRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: '#E0E7FF', backgroundColor: '#EEF2FF' },
  callRowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#6366F1', alignItems: 'center' as const, justifyContent: 'center' as const },
  callRowTitle: { ...typography.captionMedium, fontWeight: '800' as const, color: '#1E1B4B' },
  callRowText: { ...typography.caption, color: t.textMuted },
  callBtn: { flexGrow: 1, minHeight: 44, borderRadius: radii.md, backgroundColor: '#16A34A', flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingHorizontal: spacing.md },
  callBtnText: { ...typography.captionMedium, fontWeight: '800' as const, color: '#FFFFFF' },
  // Follow-up call as one bar.
  fuBar: { padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: '#BAE6FD', backgroundColor: '#F0F9FF', marginBottom: spacing.md },
  fuBarWait: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  fuBarHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  fuBarIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#0284C7', alignItems: 'center' as const, justifyContent: 'center' as const },
  fuBarTitle: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.textPrimary },
  fuBarText: { ...typography.caption, color: t.textSecondary, marginTop: spacing.xs },
  fuBarBtns: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs, marginTop: spacing.sm },
  choice: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.md, borderRadius: 16, borderWidth: 1.5, marginBottom: spacing.sm },
  choiceIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const },
  choiceTitle: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.textPrimary },
  sheetInput: { minHeight: 64, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, padding: spacing.sm, color: t.textPrimary, textAlignVertical: 'top' as const, marginBottom: spacing.sm, ...typography.body },
  sheetRow: { flexDirection: 'row' as const, gap: spacing.sm },
});

/** "TJ" for "Tejas Jain". */
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

/** "1.2 MB" / "340 KB". */
function fileSize(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A file's look by its type: photos green, PDFs red, the rest blue. */
function fileLook(type?: string | null): { bg: string; image: boolean } {
  const t = type || '';
  return t.startsWith('image/') ? { bg: '#10B981', image: true } : t === 'application/pdf' ? { bg: '#EF4444', image: false } : { bg: '#3B82F6', image: false };
}

/**
 * A ticket: its problem (the bad answers), the re-visit booked for it, and the follow-up calls.
 * The follow-up is made on the call ("Open the call") once the technician completes the re-visit;
 * all good answers close the ticket. Booking the re-visit is done on the web Feedback Desk.
 */
export function FeedbackTicketScreen() {
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  const { ticketId, reopen } = useRoute<RouteProp<FeedbackStackParamList, 'FeedbackTicket'>>().params;
  // "reopen": the ticket was opened from the call to reopen it (asks the questions at once).
  const [asking, setAsking] = useState<null | 'reopen' | TicketPart>(reopen ? 'reopen' : null);
  const { styles, theme } = useCrmStyles(factory);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const { can, myDepartments, deptOnly, userId, role } = useFeedback();
  // Close the ticket: by taking the customer's feedback, or without it (with a note).
  const [closing, setClosing] = useState<null | 'choose' | 'now'>(null);
  const [closeNote, setCloseNote] = useState('');
  const [partNotes, setPartNotes] = useState<Record<string, string>>({});
  const [partFiles, setPartFiles] = useState<Record<string, PickedFile | null>>({});
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
  // Operations is done once its step is marked Completed (any step), or a re-visit step's visit is completed.
  const opsDone = !hasOps || !!ticket.action_done || (!assigned && ticket.action !== 'OTHER' && visit?.status === 'COMPLETED');
  const canFinishAction = open && assigned && !ticket.action_done && (can('FEEDBACK_MANAGE') || ticket.action_owner?.id === userId);
  const ready = open && (ticket.follow_up_due ?? opsDone);
  // Only the department's own team (or admin) updates its part; everyone else just sees it.
  const canFinish = (p: TicketPart) => open && p.status !== 'DONE' && (role === 'admin' || myDepartments.includes(p.kind));
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
          [visit?.status === 'COMPLETED' ? `Work done ${formatDay(visit.completed_at || visit.date)}` : 'Work done', visit?.status === 'COMPLETED' || (ticket.action === 'OTHER' && !!ticket.action_done)],
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
  async function closeNow() {
    setSaving(true);
    try {
      const fresh = await getTicket(ticket!.id);
      await closeTicket(ticket!.id, fresh.row_version ?? 0, closeNote.trim() || null);
      setClosing(null);
      setCloseNote('');
      setToast({ message: `${ticket!.ticket_number} is closed.`, variant: 'success' });
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // Who the Call button on a department's part dials: whoever gave the feedback, else the first with a phone.
  const contacts = ticket.contacts || [];
  const customerToCall = contacts.find((c) => c.id === ticket.feedback?.contact_id && c.phone?.trim()) || contacts.find((c) => c.phone?.trim()) || null;
  const dialCustomer = () => customerToCall?.phone && Linking.openURL(`tel:${customerToCall.phone.replace(/[^\d+]/g, '')}`);

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
      const file = partFiles[p.kind] || null;
      if (file?.size && file.size > 10 * 1024 * 1024) throw new Error('The file is too big - up to 10 MB');
      await markPartDone(ticket!.id, p.kind, (partNotes[p.kind] || '').trim(), file);
      setPartNotes((n) => ({ ...n, [p.kind]: '' }));
      setPartFiles((f) => ({ ...f, [p.kind]: null }));
      setToast({ message: `${p.label} part marked done.`, variant: 'success' });
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function pickFile(p: TicketPart) {
    try {
      const [r] = await pick();
      setPartFiles((f) => ({ ...f, [p.kind]: { uri: r.uri, name: r.name || `file-${Date.now()}`, type: r.type || 'application/octet-stream', size: r.size } }));
    } catch (err) {
      if (!(isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED)) setToast({ message: 'Could not open the file picker.', variant: 'error' });
    }
  }

  async function openFile(p: TicketPart) {
    try {
      await openPartAttachment(ticket!.id, p.kind, p.attachment?.name || 'file', p.attachment?.type || '');
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
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
          <HeroPill key={p.kind} label={`${p.label || p.kind}${p.kind !== OPERATIONS && p.status === 'DONE' ? ' ✓' : ''}`} tone={p.kind !== OPERATIONS ? (p.status === 'DONE' ? 'success' : 'info') : 'accent'} />
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
            <View style={styles.issueBox}>
              <Text style={styles.label}>ISSUE</Text>
              {(p.issues || []).length > 0 && (
                <View style={styles.issueChips}>
                  {(p.issues || []).map((i) => (
                    <View key={String(i.id)} style={styles.issueChip}>
                      <Text style={styles.issueChipText}>
                        <Text style={{ fontWeight: '800' }}>{i.name}</Text>
                        {i.text ? ` · ${i.text}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {!p.issue_summary && !(p.issues || []).length && <Text style={styles.issueText}>No details written.</Text>}
              {/* What the collector wrote for this department when raising the ticket. */}
              {!!p.issue_summary && (
                <View style={styles.deptNote}>
                  <Text style={styles.deptNoteLabel}>NOTE FROM {(ticket.raised_by?.name || 'the feedback desk').toUpperCase()}</Text>
                  <Text style={styles.issueText}>{p.issue_summary}</Text>
                </View>
              )}
            </View>
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
              <View style={styles.doneCard}>
                <View style={styles.doneIcon}>
                  <CheckCircleIcon size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.doneTop}>
                    <Text style={styles.donePill}>Completed</Text>
                    {!!p.done_by?.name && (
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initialsOf(p.done_by.name)}</Text>
                      </View>
                    )}
                    <Text style={styles.doneMeta} numberOfLines={1}>
                      {[p.done_by?.name, formatDateTime(p.done_at)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.doneNote}>{p.done_note}</Text>
                  {!!p.attachment && (
                    <Pressable onPress={() => openFile(p)} style={styles.fileCard} accessibilityRole="button" accessibilityLabel={`Open ${p.attachment.name}`}>
                      <View style={[styles.fileIcon, { backgroundColor: fileLook(p.attachment.type).bg }]}>
                        {fileLook(p.attachment.type).image ? <GalleryIcon size={16} color="#FFFFFF" /> : <DocumentIcon size={16} color="#FFFFFF" />}
                      </View>
                      <Text style={[styles.fileName, { flex: 1 }]} numberOfLines={1}>
                        {p.attachment.name}
                      </Text>
                      <Text style={styles.fileOpen}>Open</Text>
                    </Pressable>
                  )}
                </View>
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
                {partFiles[p.kind] ? (
                  <View style={[styles.fileCard, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
                    <View style={[styles.fileIcon, { backgroundColor: fileLook(partFiles[p.kind]!.type).bg }]}>
                      {fileLook(partFiles[p.kind]!.type).image ? <GalleryIcon size={16} color="#FFFFFF" /> : <DocumentIcon size={16} color="#FFFFFF" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {partFiles[p.kind]!.name}
                      </Text>
                      <Text style={styles.fileSub}>{[(partFiles[p.kind]!.name.split('.').pop() || '').toUpperCase().slice(0, 5), fileSize(partFiles[p.kind]!.size)].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Pressable onPress={() => setPartFiles((f) => ({ ...f, [p.kind]: null }))} hitSlop={8} style={styles.fileRemove} accessibilityRole="button" accessibilityLabel="Remove the file">
                      <CloseIcon size={16} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => pickFile(p)} style={styles.pickBox} accessibilityRole="button">
                    <View style={styles.pickIcon}>
                      <DocumentIcon size={16} color={theme.primary} />
                    </View>
                    <Text style={[styles.filePickText, { flex: 1 }]} numberOfLines={2}>
                      Attach a file (optional, up to 10 MB)
                    </Text>
                  </Pressable>
                )}
                <PrimaryButton label={`Mark ${p.label} done`} onPress={() => finishPart(p)} loading={saving} disabled={!(partNotes[p.kind] || '').trim()} style={{ marginTop: spacing.xs }} />
              </>
            ) : (
              <Text style={styles.waiting}>{open ? `Waiting for ${p.label} to update this.` : 'Closed.'}</Text>
            )}
            {/* Optional: once the department is done, ask the customer how it went. */}
            {p.status === 'DONE' && !deptOnly && (
              p.customer_feedback ? (
                <View style={[styles.fb, p.customer_feedback.has_issue ? { borderColor: theme.dangerBg, backgroundColor: '#FFF8F8' } : { borderColor: theme.successBg, backgroundColor: '#F7FEF9' }]}>
                  <View style={styles.fbHead}>
                    <Text style={[styles.fbTitle, { color: p.customer_feedback.has_issue ? theme.dangerText : theme.successText }]}>
                      Customer feedback · {p.customer_feedback.has_issue ? 'Not happy' : 'All good'}
                    </Text>
                    {canClose && (
                      <Pressable onPress={() => setAsking(p)} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.fbAgain}>Ask again</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.small}>{[p.customer_feedback.spoke_with_name, formatDateTime(p.customer_feedback.submitted_at)].filter(Boolean).join(' · ')}</Text>
                  <AnswersList submission={p.customer_feedback} />
                </View>
              ) : (
                canClose && (
                  <View style={styles.callRow}>
                    <View style={styles.callRowIcon}>
                      <PhoneIcon size={18} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <Text style={styles.callRowTitle}>Call the customer about {p.label}</Text>
                      <Text style={styles.callRowText}>Optional · ask how it went</Text>
                    </View>
                    {/* Only the Call button: dials whoever gave the feedback, else the first number. */}
                    {!!customerToCall?.phone?.trim() && (
                      <Pressable onPress={dialCustomer} style={styles.callBtn} accessibilityRole="button" accessibilityLabel={`Call ${customerToCall.name}`}>
                        <PhoneIcon size={16} color="#FFFFFF" />
                        <Text style={styles.callBtnText} numberOfLines={1}>
                          Call {customerToCall.name}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )
              )
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
            <View style={[styles.fuBar, !ready && styles.fuBarWait, followUps.length > 0 && { marginTop: spacing.xs }, { marginBottom: 0 }]}>
              <View style={styles.fuBarHead}>
                <View style={[styles.fuBarIcon, !ready && { backgroundColor: '#F59E0B' }]}>
                  <PhoneIcon size={18} color="#FFFFFF" />
                </View>
                <Text style={[styles.fuBarTitle, { flex: 1 }]}>Follow-up call · {ticket.ticket_number}</Text>
              </View>
              <Text style={styles.fuBarText}>
                {ready
                  ? 'The action is taken. Call the customer and ask the feedback questions again (satisfied: the ticket closes), or close the ticket without the call.'
                  : `Waiting for ${waitingFor.join(' and ') || 'the work'}. Then the customer is called back.`}
              </Text>
              {!deptOnly && (
                <View style={styles.fuBarBtns}>
                  {ready && canClose && <PrimaryButton label="Close the ticket" variant="secondary" onPress={() => setClosing('choose')} disabled={saving} style={{ flexGrow: 1 }} />}
                  <PrimaryButton label="Open the call" onPress={() => navigation.navigate('FeedbackCall', { callId: ticket.request_id })} disabled={!ready} style={{ flexGrow: 1 }} />
                </View>
              )}
            </View>
          ) : (
            <>
              <Text style={styles.small}>{ticket.close_note || 'Closed.'}</Text>
              {!deptOnly && canClose && (
                <PrimaryButton label={`Reopen ${ticket.ticket_number}`} variant="secondary" onPress={() => setAsking('reopen')} style={{ marginTop: spacing.sm }} />
              )}
            </>
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
      {asking === 'reopen' && !open && canClose && (
        <QuestionsSheet
          title={`Reopen ${ticket.ticket_number}`}
          heading="The customer has the problem again?"
          text="Ask the feedback questions. The answers are saved on the call and the same ticket opens again."
          color="#4F46E5"
          contacts={ticket.contacts || []}
          services={ticket.service_label ? [ticket.service_label] : []}
          withNote
          submitLabel="Save & reopen"
          onClose={() => setAsking(null)}
          onSubmit={async (body, note) => {
            setTicket(await reopenTicket(ticket.id, ticket.row_version ?? 0, note, body));
            setAsking(null);
            setToast({ message: 'Ticket reopened with the customer\'s answers.', variant: 'success' });
          }}
        />
      )}
      {asking && asking !== 'reopen' && (
        <QuestionsSheet
          title={`${asking.label} · customer feedback`}
          heading={`${asking.label} has finished its part`}
          text="Call the customer and ask how it went. Optional - the ticket doesn't change."
          color="#16A34A"
          contacts={ticket.contacts || []}
          mode={`DEPT:${asking.kind}`}
          submitLabel="Save feedback"
          onClose={() => setAsking(null)}
          onSubmit={async (body) => {
            setTicket(await recordPartFeedback(ticket.id, asking.kind, body));
            setToast({ message: `${asking.label} feedback saved.`, variant: 'success' });
            setAsking(null);
          }}
        />
      )}
      <Sheet visible={!!closing} onClose={() => setClosing(null)} title={`Close ${ticket.ticket_number}?`}>
        {closing === 'choose' ? (
          <>
            <Text style={[styles.small, { marginBottom: spacing.sm }]}>Every team has finished its work. How do you want to close it?</Text>
            <Pressable
              onPress={() => {
                setClosing(null);
                navigation.navigate('FeedbackCall', { callId: ticket.request_id });
              }}
              style={[styles.choice, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}
              accessibilityRole="button"
            >
              <View style={[styles.choiceIcon, { backgroundColor: '#0284C7' }]}>
                <PhoneIcon size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>Close by taking feedback</Text>
                <Text style={styles.small}>Call the customer and ask the questions again. Satisfied: the ticket closes.</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => setClosing('now')} style={[styles.choice, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]} accessibilityRole="button">
              <View style={[styles.choiceIcon, { backgroundColor: '#16A34A' }]}>
                <CheckCircleIcon size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>Close without feedback</Text>
                <Text style={styles.small}>Close it now, without the follow-up call. You can reopen it later.</Text>
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.small, { marginBottom: spacing.sm }]}>The ticket closes without the follow-up call.</Text>
            <TextInput style={styles.sheetInput} value={closeNote} onChangeText={setCloseNote} multiline maxLength={400} placeholder="Note (optional), e.g. Customer said on WhatsApp it is sorted" placeholderTextColor={theme.textMuted} />
            <View style={styles.sheetRow}>
              <PrimaryButton label="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setClosing('choose')} disabled={saving} />
              <PrimaryButton label="Close the ticket" style={{ flex: 1 }} onPress={closeNow} loading={saving} />
            </View>
          </>
        )}
      </Sheet>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}
