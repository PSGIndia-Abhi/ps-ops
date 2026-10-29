import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  DocumentIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  SendIcon,
  SparkleIcon,
  UsersIcon,
} from '../../components/icons';
import { formatINR, formatLeadWhen } from '../../crm/format';
import { whatsappUrl } from '../../crm/leadHelpers';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { WhatsAppIcon } from '../../crm/ui/crmIcons';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton, NoticeBanner } from '../../crm/ui/CrmScreen';
import { toneColors, type Tone } from '../../crm/ui/StatusBadge';
import { fmtDateShort, fmtTime } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { savedQuotationPdf } from '../quotation';
import { QuotationPdfDialog } from '../QuotationDialogs';
import { actionLabel, isTerminal, leadActions, type LeadAction } from '../stage';
import type { PipelineLead, PipelineStage, Quotation, TimelineEntry } from '../types';
import { errorMessage, StageBadge, useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';

const HISTORY_PREVIEW = 5;

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  cardTitle: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm },
  sectionTitle: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm, marginTop: spacing.xs },

  // Who, how much, where it stands
  hero: { borderLeftWidth: 5, borderLeftColor: t.primary, ...t.raisedShadow },
  heroTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  heroTopTagged: { paddingRight: 72 }, // room for the corner tag
  // The corner tag: One-time or AMC, from the latest quotation
  contractTag: {
    position: 'absolute' as const,
    top: -1,
    right: -1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: radii.lg,
    zIndex: 1,
  },
  contractAmc: { backgroundColor: '#ea580c' },
  contractOnce: { backgroundColor: '#0d9488' },
  contractDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.85)' },
  contractText: { ...typography.captionMedium, fontSize: 11, fontWeight: '800' as const, letterSpacing: 1, color: '#fff' },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroText: { flex: 1 },
  company: { ...typography.title, color: t.textPrimary },
  contactRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 3 },
  contact: { ...typography.body, color: t.textSecondary, flex: 1 },
  quoteRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quoteLabel: { ...typography.caption, color: t.textMuted },
  quote: { ...typography.title, color: t.textPrimary },
  progress: { marginTop: spacing.md },
  progressBar: { flexDirection: 'row' as const, gap: 4 },
  progressSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: t.border },
  progressDone: { backgroundColor: t.success },
  progressNow: { backgroundColor: t.primary },
  progressClosed: { backgroundColor: t.danger },
  progressText: { ...typography.caption, color: t.textMuted, marginTop: 6 },

  // Contact buttons
  contactBtns: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.lg },
  contactBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  contactCall: { backgroundColor: t.primary },
  contactWa: { backgroundColor: '#25D366' },
  contactPressed: { opacity: 0.85 },
  contactLabel: { ...typography.captionMedium, color: '#FFFFFF' },

  // The recommended next step
  primary: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: t.primary,
    ...t.raisedShadow,
  },
  primaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  primaryText: { flex: 1 },
  primaryKicker: { ...typography.overline, color: 'rgba(255,255,255,0.8)' },
  primaryTitle: { ...typography.subtitle, color: '#FFFFFF', marginTop: 2 },
  primaryHint: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  // The other steps
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, rowGap: spacing.sm, marginBottom: spacing.md },
  tile: {
    width: '48.5%' as const,
    minHeight: 62,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    ...t.cardShadow,
  },
  tileIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
  tileTitle: { ...typography.captionMedium, color: t.textPrimary, flex: 1 },
  pressed: { opacity: 0.85 },
  busy: { opacity: 0.5 },
  closeRow: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: spacing.lg, marginBottom: spacing.lg },
  closeBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  closeText: { ...typography.bodyMedium, color: t.danger },
  waiting: {
    ...typography.body,
    color: t.textSecondary,
    textAlign: 'center' as const,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: t.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },

  // Customer + quotations
  infoRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 6 },
  infoLabel: { ...typography.caption, color: t.textMuted },
  infoValue: { ...typography.bodyMedium, color: t.textPrimary },
  // Quotations: one small card each - PDF tile, file name, amount, One-time/AMC and status chips
  quotesHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.sm },
  quotesTitle: { marginBottom: 0 },
  quotesCount: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  quotesCountText: { ...typography.captionMedium, fontSize: 12, color: t.primary },
  qCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    overflow: 'hidden' as const,
  },
  qCardLatest: { borderColor: t.primary, borderLeftWidth: 4, backgroundColor: t.primarySoftBg },
  qCardCancelled: { opacity: 0.6, backgroundColor: t.surfaceAlt },
  qPressed: { opacity: 0.8 },
  qLatest: { position: 'absolute' as const, top: 0, right: 0, paddingHorizontal: spacing.sm, paddingVertical: 3, borderBottomLeftRadius: radii.md, backgroundColor: t.primary },
  qLatestText: { ...typography.caption, fontSize: 9, fontWeight: '800' as const, letterSpacing: 1, color: '#fff' },
  qTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  qPdf: { width: 44, height: 50, borderRadius: radii.md, backgroundColor: '#fee2e2', alignItems: 'center' as const, justifyContent: 'center' as const, gap: 1 },
  qPdfText: { ...typography.caption, fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.5, color: '#dc2626' },
  qTitleBox: { flex: 1, paddingRight: spacing.lg },
  qTitle: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  qSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  qBottom: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  qAmount: { ...typography.title, fontSize: 20, fontWeight: '800' as const, color: t.textPrimary },
  qAmountCancelled: { color: t.textMuted },
  qChips: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  qChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  qChipAmc: { backgroundColor: '#ffedd5' },
  qChipOnce: { backgroundColor: '#ccfbf1' },
  qChipSent: { backgroundColor: t.successBg },
  qChipCancelled: { backgroundColor: t.surfaceAlt },
  qChipText: { ...typography.captionMedium, fontSize: 12 },
  qDot: { width: 6, height: 6, borderRadius: 3 },

  // Activity
  entry: { flexDirection: 'row' as const, gap: spacing.sm },
  entryRail: { alignItems: 'center' as const, width: 32 },
  entryIcon: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  entryLine: { flex: 1, width: 2, backgroundColor: t.border, marginVertical: 2 },
  entryBody: { flex: 1, paddingBottom: spacing.md },
  entryTitle: { ...typography.bodyMedium, color: t.textPrimary },
  entryNote: { ...typography.caption, color: t.textSecondary, marginTop: 2, lineHeight: 18 },
  entryMeta: { ...typography.caption, color: t.textMuted, marginTop: 3 },
  showAll: { alignSelf: 'center' as const, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  showAllText: { ...typography.captionMedium, color: t.primary },
  empty: { ...typography.caption, color: t.textMuted },
});

type IconFn = (c: string) => React.ReactNode;

const ACTION_META: Record<LeadAction, { title: string; hint: string; tone: Tone; icon: IconFn }> = {
  claim: { title: 'Start verification', hint: 'Take this lead to call and verify', tone: 'info', icon: (c) => <PersonIcon size={20} color={c} /> },
  call: { title: 'Log a call', hint: 'Save how the call went', tone: 'info', icon: (c) => <PhoneIcon size={20} color={c} /> },
  genuine: { title: 'Mark as genuine', hint: 'Qualified - ready for a sales meeting', tone: 'success', icon: (c) => <CheckCircleIcon size={20} color={c} /> },
  needInfo: { title: 'Need more info', hint: 'Keep it open and call again later', tone: 'warning', icon: (c) => <AlertCircleIcon size={20} color={c} /> },
  meeting: { title: 'Schedule meeting', hint: 'Pick the sales person and the time', tone: 'accent', icon: (c) => <CalendarIcon size={20} color={c} /> },
  followUp: { title: 'Follow-up', hint: 'Set a reminder to get back to them', tone: 'warning', icon: (c) => <ClockIcon size={20} color={c} /> },
  quote: { title: 'Create quotation', hint: 'Pick services, plan and price - the PDF is made for you', tone: 'accent', icon: (c) => <DocumentIcon size={20} color={c} /> },
  convert: { title: 'Convert to customer', hint: 'Creates the customer record', tone: 'success', icon: (c) => <UsersIcon size={20} color={c} /> },
  lost: { title: 'Mark as lost', hint: 'Close with a reason', tone: 'danger', icon: (c) => <CloseIcon size={20} color={c} /> },
  reject: { title: 'Reject lead', hint: 'Not genuine - a reason is required', tone: 'danger', icon: (c) => <CloseIcon size={20} color={c} /> },
  feedback: { title: 'Feedback to provider', hint: 'Visible to the lead provider', tone: 'neutral', icon: (c) => <SendIcon size={20} color={c} /> },
};

/** The step a lead at this stage most likely needs next - shown as the big card. */
const RECOMMENDED: Partial<Record<PipelineStage, LeadAction[]>> = {
  NEW: ['claim', 'call'],
  TO_CALL: ['call'],
  NEED_MORE_INFO: ['call'],
  QUALIFIED: ['meeting'],
  MEETING_SCHEDULED: ['followUp', 'call'],
  VISIT_COMPLETED: ['quote'],
  QUOTATION_SENT: ['convert'],
};
const CLOSING: LeadAction[] = ['lost', 'reject'];

/** The road a commercial lead travels, for the progress bar. */
const JOURNEY: { label: string; stages: PipelineStage[] }[] = [
  { label: 'New', stages: ['NEW', 'TO_CALL', 'NEED_MORE_INFO'] },
  { label: 'Verified', stages: ['QUALIFIED'] },
  { label: 'Meeting', stages: ['MEETING_SCHEDULED'] },
  { label: 'Visited', stages: ['VISIT_COMPLETED'] },
  { label: 'Quoted', stages: ['QUOTATION_SENT'] },
  { label: 'Won', stages: ['WON', 'CONVERTED'] },
];

/** History rows in plain words. */
const HISTORY_META: Record<string, { title: string; tone: Tone; icon: IconFn }> = {
  CREATE: { title: 'Lead added', tone: 'info', icon: (c) => <SparkleIcon size={15} color={c} /> },
  ASSIGN_TELECALLER: { title: 'Picked up for verification', tone: 'info', icon: (c) => <PersonIcon size={15} color={c} /> },
  CALL_LOGGED: { title: 'Call logged', tone: 'info', icon: (c) => <PhoneIcon size={15} color={c} /> },
  QUALIFY: { title: 'Verified as genuine', tone: 'success', icon: (c) => <CheckCircleIcon size={15} color={c} /> },
  REJECT: { title: 'Marked not genuine', tone: 'danger', icon: (c) => <CloseIcon size={15} color={c} /> },
  MEETING_SCHEDULED: { title: 'Meeting scheduled', tone: 'accent', icon: (c) => <CalendarIcon size={15} color={c} /> },
  MEETING_RESCHEDULED: { title: 'Meeting moved', tone: 'accent', icon: (c) => <CalendarIcon size={15} color={c} /> },
  MEETING_CANCELLED: { title: 'Meeting cancelled', tone: 'neutral', icon: (c) => <CloseIcon size={15} color={c} /> },
  VISIT_CHECK_IN: { title: 'Visit started', tone: 'accent', icon: (c) => <PinIcon size={15} color={c} /> },
  VISIT_COMPLETED: { title: 'Visit completed', tone: 'accent', icon: (c) => <PinIcon size={15} color={c} /> },
  FOLLOW_UP_SCHEDULED: { title: 'Follow-up set', tone: 'warning', icon: (c) => <ClockIcon size={15} color={c} /> },
  QUOTATION_SENT: { title: 'Quotation sent', tone: 'accent', icon: (c) => <DocumentIcon size={15} color={c} /> },
  CONVERTED: { title: 'Converted to customer', tone: 'success', icon: (c) => <UsersIcon size={15} color={c} /> },
  MARK_LOST: { title: 'Marked lost', tone: 'danger', icon: (c) => <CloseIcon size={15} color={c} /> },
  FEEDBACK_SENT: { title: 'Feedback sent to provider', tone: 'neutral', icon: (c) => <SendIcon size={15} color={c} /> },
};

const historyFallbackIcon: IconFn = (c) => <ClockIcon size={15} color={c} />;
/** A verification call that ended "need more information" (also a QUALIFY row - its note tells). */
const NEEDS_INFO_META = { title: 'Marked as need more information', tone: 'warning' as Tone, icon: historyFallbackIcon };

/** Server notes in plain words: dates read as dates, raw GPS as "location recorded". */
function humanNote(note: string): string {
  const text = note
    .replace(/\bat -?\d+\.\d+\s*,\s*-?\d+\.\d+/g, 'location recorded')
    .replace(/\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?\b/g, (_m, d: string, t: string) => `${fmtDateShort(d)}, ${fmtTime(t)}`)
    .replace(/\bSubmitted by user #\d+\b/, '')
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Manage lead: one commercial lead's pipeline - where it stands, the step it needs next (big
 * and obvious), every other step it allows, its quotations and its history. Lead details live
 * on the screen before this one.
 */
export function LeadWorkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { leadId } = useRoute<RouteProp<LeadStackParamList, 'LeadWork'>>().params;
  const { myId, myIdNum, persona } = useMe();
  const { styles, theme } = useCrmStyles(factory);
  const [busy, setBusy] = useState<LeadAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const loader = useCallback(async () => {
    const lead = await api.getLead(leadId);
    // The lead is what the screen needs; a failure in one of the extras must not hide it.
    const [timeline, quotations, conversion, openMeeting] = await Promise.all([
      api.getTimeline(leadId).catch(() => []),
      api.getQuotations(leadId).catch(() => []),
      lead.stage === 'CONVERTED' ? api.getConversion(leadId).catch(() => null) : Promise.resolve(null),
      // A scheduled meeting turns "Schedule meeting" into "View meeting".
      api.openMeeting(leadId).catch(() => null),
    ]);
    return { lead, timeline, quotations, conversion, openMeeting };
  }, [leadId]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load this lead.');

  const runInline = async (action: LeadAction, work: () => Promise<void>, done: string) => {
    setBusy(action);
    setActionError(null);
    try {
      await work();
      setNotice(done);
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'That did not go through. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const onAction = (action: LeadAction, lead: PipelineLead) => {
    const name = lead.companyName;
    switch (action) {
      case 'claim':
        return runInline(action, () => api.claimLead(lead.id, myIdNum), 'This lead is now yours to verify.');
      case 'genuine':
        return Alert.alert('Mark as genuine?', `${name} will be qualified and can be given to the sales team.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark genuine', onPress: () => runInline(action, () => api.qualifyLead(lead.id, 'GENUINE'), 'Lead marked as genuine.') },
        ]);
      case 'needInfo':
        return runInline(action, () => api.qualifyLead(lead.id, 'NEEDS_INFO'), 'Marked as needing more information.');
      case 'call':
        return navigation.navigate('LeadCall', {
          leadId: lead.id,
          name,
          contact: lead.contactPerson,
          stage: lead.stage,
          canQualify: lead.stage === 'TO_CALL' || lead.stage === 'NEED_MORE_INFO',
        });
      case 'meeting':
        // One open meeting per lead: open it rather than offering a second one.
        if (data?.openMeeting) return navigation.navigate('LeadMeeting', { meetingId: data.openMeeting.id });
        return navigation.navigate('LeadMeetingNew', { leadId: lead.id, name, address: lead.address });
      case 'followUp':
        return navigation.navigate('LeadFollowUp', { leadId: lead.id, name });
      case 'quote':
        return navigation.navigate('LeadQuoteBuild', { leadId: lead.id, name });
      case 'convert':
        return navigation.navigate('LeadConvert', { leadId: lead.id, name });
      case 'lost':
        return navigation.navigate('LeadClose', { leadId: lead.id, name, mode: 'lost' });
      case 'reject':
        return navigation.navigate('LeadClose', { leadId: lead.id, name, mode: 'reject' });
      case 'feedback':
        return navigation.navigate('LeadFeedback', { leadId: lead.id, name });
    }
  };

  const open = (url: string, fail: string) => Linking.openURL(url).catch(() => setActionError(fail));

  // A saved quotation's PDF: open it in the phone's PDF viewer, or save a copy to Downloads
  // (QuotationPdfDialog does both and shows how it went).
  const [pdfFor, setPdfFor] = useState<Quotation | null>(null);

  const lead = data?.lead;
  // One-time or AMC from the latest quotation that still stands - the tag on the lead card.
  const contractType = data?.quotations?.find((q) => q.status !== 'CANCELLED' && q.contractType)?.contractType ?? null;
  const openMeeting = data?.openMeeting ?? null;
  const baseActions = lead ? leadActions(lead, persona, myId) : [];
  // An open meeting is always reachable from here (as "View meeting"), whoever runs the visit.
  const actions: LeadAction[] = openMeeting && !baseActions.includes('meeting') ? ['meeting', ...baseActions] : baseActions;
  const recommended = lead
    ? openMeeting && lead.stage === 'MEETING_SCHEDULED'
      ? 'meeting'
      : (RECOMMENDED[lead.stage] ?? []).find((a) => actions.includes(a)) ?? actions.find((a) => !CLOSING.includes(a))
    : undefined;
  /** An action's title and hint - "Schedule meeting" reads "View meeting" once one is set. */
  const metaOf = (action: LeadAction) =>
    action === 'meeting' && openMeeting
      ? {
          ...ACTION_META.meeting,
          title: openMeeting.started ? 'Visit in progress' : 'View meeting',
          hint: `${fmtDateShort(openMeeting.date)}${openMeeting.time ? `, ${fmtTime(openMeeting.time)}` : ''}${openMeeting.salesName ? ` · ${openMeeting.salesName}` : ''}`,
        }
      : ACTION_META[action];
  const others = actions.filter((a) => a !== recommended && !CLOSING.includes(a));
  const closing = actions.filter((a) => CLOSING.includes(a));

  const journeyIndex = lead ? JOURNEY.findIndex((s) => s.stages.includes(lead.stage)) : -1;
  const closedBadly = !!lead && isTerminal(lead.stage) && journeyIndex === -1;
  // A saved quotation can be opened again to edit or duplicate while the lead is still open.
  const reopenable = (q: Quotation) => !!lead && !isTerminal(lead.stage) && q.status !== 'CANCELLED' && q.hasContent;
  const reopen = (q: Quotation, mode: 'edit' | 'duplicate') => {
    setPdfFor(null);
    if (lead) navigation.navigate('LeadQuoteBuild', { leadId: lead.id, name: lead.companyName, fromId: q.id, mode });
  };

  const history = data ? [...data.timeline].reverse() : [];
  const shownHistory = showAllHistory ? history : history.slice(0, HISTORY_PREVIEW);

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Manage lead" subtitle={lead?.leadNumber || undefined} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />
        <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />

        {loading && !lead && (
          <>
            <CrmSkeleton height={190} radius={radii.xl} style={{ marginBottom: spacing.md }} />
            <CrmSkeleton height={96} radius={radii.xl} style={{ marginBottom: spacing.md }} />
            <CrmSkeleton height={200} radius={radii.xl} />
          </>
        )}

        {!loading && !lead && !error && <CrmEmptyState title="Lead not found" subtitle="It may have been removed, or you no longer have access to it." />}

        {lead && (
          <>
            {/* Who, how much, where it stands */}
            <View style={[styles.card, styles.hero]}>
              {!!contractType && (
                <View style={[styles.contractTag, contractType === 'AMC' ? styles.contractAmc : styles.contractOnce]} accessibilityLabel={contractType === 'AMC' ? 'AMC contract' : 'One-time service'}>
                  <View style={styles.contractDot} />
                  <Text style={styles.contractText}>{contractType === 'AMC' ? 'AMC' : 'ONE-TIME'}</Text>
                </View>
              )}
              <View style={[styles.heroTop, !!contractType && styles.heroTopTagged]}>
                <View style={styles.heroIcon}>
                  <BriefcaseIcon size={26} color={theme.primary} />
                </View>
                <View style={styles.heroText}>
                  <Text style={styles.company} numberOfLines={2}>
                    {lead.companyName}
                  </Text>
                  {!!lead.contactPerson && (
                    <View style={styles.contactRow}>
                      <PersonIcon size={15} color={theme.textMuted} />
                      <Text style={styles.contact} numberOfLines={1}>
                        {lead.contactPerson}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.quoteRow}>
                <View>
                  <Text style={styles.quoteLabel}>Approximate quote</Text>
                  <Text style={styles.quote}>{formatINR(lead.amount)}</Text>
                </View>
                <StageBadge stage={lead.stage} />
              </View>
              <View style={styles.progress}>
                <View style={styles.progressBar}>
                  {JOURNEY.map((step, i) => (
                    <View
                      key={step.label}
                      style={[
                        styles.progressSeg,
                        closedBadly ? styles.progressClosed : i < journeyIndex ? styles.progressDone : i === journeyIndex ? styles.progressNow : null,
                        i === journeyIndex && journeyIndex === JOURNEY.length - 1 && styles.progressDone,
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.progressText}>
                  {closedBadly ? 'Closed' : `Step ${journeyIndex + 1} of ${JOURNEY.length} · ${JOURNEY[journeyIndex]?.label ?? ''}`}
                </Text>
              </View>
            </View>

            {/* Reach the customer */}
            <View style={styles.contactBtns}>
              <Pressable
                onPress={() => open(`tel:${lead.phone}`, 'This phone cannot place calls.')}
                disabled={!lead.phone}
                accessibilityRole="button"
                accessibilityLabel={`Call ${lead.contactPerson || 'customer'}`}
                style={({ pressed }) => [styles.contactBtn, styles.contactCall, pressed && styles.contactPressed]}
              >
                <PhoneIcon size={17} color="#FFFFFF" />
                <Text style={styles.contactLabel}>Call</Text>
              </Pressable>
              <Pressable
                onPress={() => open(whatsappUrl(lead.phone), 'Could not open WhatsApp on this phone.')}
                disabled={!lead.phone}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${lead.contactPerson || 'customer'}`}
                style={({ pressed }) => [styles.contactBtn, styles.contactWa, pressed && styles.contactPressed]}
              >
                <WhatsAppIcon size={18} color="#FFFFFF" />
                <Text style={styles.contactLabel}>WhatsApp</Text>
              </Pressable>
            </View>

            {/* What to do next */}
            <Text style={styles.sectionTitle}>NEXT STEP</Text>
            {actions.length === 0 ? (
              <Text style={styles.waiting}>
                {lead.stage === 'NEW'
                  ? 'Waiting for a telecaller to verify this lead.'
                  : isTerminal(lead.stage)
                  ? 'This lead is closed.'
                  : 'Someone else is handling this lead right now.'}
              </Text>
            ) : (
              <>
                {recommended && (
                  <Pressable
                    onPress={() => onAction(recommended, lead)}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.primary, (pressed || busy === recommended) && styles.pressed]}
                    testID="next-step"
                  >
                    <View style={styles.primaryIcon}>{metaOf(recommended).icon('#FFFFFF')}</View>
                    <View style={styles.primaryText}>
                      <Text style={styles.primaryKicker}>RECOMMENDED</Text>
                      <Text style={styles.primaryTitle}>{busy === recommended ? 'Saving...' : metaOf(recommended).title}</Text>
                      <Text style={styles.primaryHint}>{metaOf(recommended).hint}</Text>
                    </View>
                    <ChevronRightIcon size={20} color="#FFFFFF" />
                  </Pressable>
                )}
                {others.length > 0 && (
                  <View style={styles.grid}>
                    {others.map((action) => {
                      const meta = metaOf(action);
                      const c = toneColors(theme, meta.tone);
                      return (
                        <Pressable
                          key={action}
                          onPress={() => onAction(action, lead)}
                          disabled={busy !== null}
                          accessibilityRole="button"
                          accessibilityLabel={meta.title}
                          style={({ pressed }) => [styles.tile, pressed && styles.pressed, busy === action && styles.busy]}
                        >
                          <View style={[styles.tileIcon, { backgroundColor: c.bg }]}>{meta.icon(c.fg)}</View>
                          <Text style={styles.tileTitle}>{busy === action ? 'Saving...' : meta.title}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {closing.length > 0 && (
                  <View style={styles.closeRow}>
                    {closing.map((action) => (
                      <Pressable key={action} onPress={() => onAction(action, lead)} disabled={busy !== null} accessibilityRole="button" style={styles.closeBtn}>
                        <CloseIcon size={16} color={theme.danger} />
                        <Text style={styles.closeText}>{ACTION_META[action].title}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {data?.conversion && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>CUSTOMER</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Customer</Text>
                  <Text style={styles.infoValue}>{data.conversion.companyName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Customer ID</Text>
                  <Text style={styles.infoValue}>{data.conversion.companyId}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Converted by</Text>
                  <Text style={styles.infoValue}>{data.conversion.convertedBy}</Text>
                </View>
              </View>
            )}

            {data && data.quotations.length > 0 && (
              <View style={styles.card}>
                <View style={styles.quotesHead}>
                  <Text style={[styles.cardTitle, styles.quotesTitle]}>QUOTATIONS</Text>
                  <View style={styles.quotesCount}>
                    <Text style={styles.quotesCountText}>{data.quotations.length}</Text>
                  </View>
                </View>
                {data.quotations.map((q) => {
                  const cancelled = q.status === 'CANCELLED';
                  // The newest one that still stands is the one the customer is looking at.
                  const latest = !cancelled && data.quotations.find((x) => x.status !== 'CANCELLED')?.id === q.id;
                  return (
                    // A tap opens the PDF card: Share, Open, Save to Downloads, Edit, Duplicate.
                    <Pressable
                      key={q.id}
                      disabled={!q.hasPdf}
                      onPress={() => setPdfFor(q)}
                      accessibilityRole="button"
                      accessibilityLabel={`${q.fileName}, ${formatINR(q.total)}${q.contractType ? `, ${q.contractType === 'AMC' ? 'AMC' : 'one-time'}` : ''}, ${cancelled ? 'cancelled' : 'sent'}`}
                      style={({ pressed }) => [styles.qCard, latest && styles.qCardLatest, cancelled && styles.qCardCancelled, pressed && styles.qPressed]}
                    >
                      {latest && (
                        <View style={styles.qLatest}>
                          <Text style={styles.qLatestText}>LATEST</Text>
                        </View>
                      )}
                      <View style={styles.qTop}>
                        <View style={styles.qPdf}>
                          <DocumentIcon size={20} color="#dc2626" />
                          <Text style={styles.qPdfText}>PDF</Text>
                        </View>
                        <View style={styles.qTitleBox}>
                          {/* The PDF's name (CLIENTNAME_PROPOSAL_YEAR.pdf); it wraps at its underscores. */}
                          <Text style={styles.qTitle} numberOfLines={3}>
                            {q.fileName.replace(/_/g, '_\u200B')}
                          </Text>
                          <Text style={styles.qSub} numberOfLines={2}>
                            {[q.number, q.sentAt ? formatLeadWhen(q.sentAt) : ''].filter(Boolean).join('  ·  ')}
                          </Text>
                        </View>
                        {q.hasPdf && <ChevronRightIcon size={18} color={theme.textMuted} />}
                      </View>
                      <View style={styles.qBottom}>
                        <Text style={[styles.qAmount, cancelled && styles.qAmountCancelled]}>{formatINR(q.total)}</Text>
                        <View style={styles.qChips}>
                          {!!q.contractType && (
                            <View style={[styles.qChip, q.contractType === 'AMC' ? styles.qChipAmc : styles.qChipOnce]}>
                              <Text style={[styles.qChipText, { color: q.contractType === 'AMC' ? '#c2410c' : '#0f766e' }]}>
                                {q.contractType === 'AMC' ? 'AMC' : 'One-time'}
                              </Text>
                            </View>
                          )}
                          <View style={[styles.qChip, cancelled ? styles.qChipCancelled : styles.qChipSent]}>
                            <View style={[styles.qDot, { backgroundColor: cancelled ? theme.textMuted : theme.success }]} />
                            <Text style={[styles.qChipText, { color: cancelled ? theme.textMuted : theme.successText }]}>{cancelled ? 'Cancelled' : actionLabel(q.status)}</Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* What has happened, newest first */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>ACTIVITY</Text>
              {history.length === 0 && <Text style={styles.empty}>No activity yet.</Text>}
              {shownHistory.map((entry: TimelineEntry, i) => {
                // A verification call can end "genuine" or "need more information": the note says which.
                const needsInfo = entry.action === 'QUALIFY' && /NEEDS_INFO/.test(entry.note || '');
                const meta = needsInfo
                  ? NEEDS_INFO_META
                  : HISTORY_META[entry.action] ?? { title: actionLabel(entry.action), tone: 'neutral' as Tone, icon: historyFallbackIcon };
                const c = toneColors(theme, meta.tone);
                const note = entry.note ? humanNote(entry.note) : '';
                const last = i === shownHistory.length - 1;
                return (
                  <View key={entry.id} style={styles.entry}>
                    <View style={styles.entryRail}>
                      <View style={[styles.entryIcon, { backgroundColor: c.bg }]}>{meta.icon(c.fg)}</View>
                      {!last && <View style={styles.entryLine} />}
                    </View>
                    <View style={styles.entryBody}>
                      <Text style={styles.entryTitle}>{meta.title}</Text>
                      {!!note && <Text style={styles.entryNote}>{note}</Text>}
                      <Text style={styles.entryMeta}>
                        {formatLeadWhen(entry.at)}
                        {entry.by ? ` · ${entry.by}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {history.length > HISTORY_PREVIEW && (
                <Pressable onPress={() => setShowAllHistory((v) => !v)} accessibilityRole="button" style={styles.showAll}>
                  <Text style={styles.showAllText}>{showAllHistory ? 'Show less' : `Show all ${history.length} updates`}</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </CrmScreen>
      {pdfFor && lead && (
        <QuotationPdfDialog
          name={pdfFor.clientName || lead.companyName || ''}
          getFile={() => savedQuotationPdf(leadId, pdfFor.id, pdfFor.fileName)}
          onOpened={() => setPdfFor(null)}
          onClose={() => setPdfFor(null)}
          // Built in the app or on the web (its details are saved), on a lead still open. Editing it
          // saves a replacement - for whoever sent it or a sales manager, as on the web.
          onEdit={reopenable(pdfFor) && (pdfFor.createdBy === myId || persona === 'sales_manager') ? () => reopen(pdfFor, 'edit') : undefined}
          onDuplicate={reopenable(pdfFor) ? () => reopen(pdfFor, 'duplicate') : undefined}
        />
      )}
    </LeadScreen>
  );
}
