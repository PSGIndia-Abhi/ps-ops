import React, { useCallback, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  DocumentIcon,
  PersonIcon,
  PhoneIcon,
  SendIcon,
  UsersIcon,
} from '../../components/icons';
import { formatINR, formatLeadWhen } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton, NoticeBanner, SectionLabel } from '../../crm/ui/CrmScreen';
import { StatusBadge, type Tone } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { actionLabel, leadActions, sourceLabel, type LeadAction } from '../stage';
import type { PipelineLead } from '../types';
import { ActionRow, Card, errorMessage, InfoLine, StageBadge, useLoad, useMe, LeadButton as PrimaryButton, LeadTopBar as TopBar, LeadScreen } from '../ui';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heroTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroText: { flex: 1 },
  company: { ...typography.subtitle, color: t.textPrimary },
  contact: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  heroFoot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  quoteLabel: { ...typography.caption, color: t.textMuted },
  quote: { ...typography.title, color: t.textPrimary },
  callButton: { marginBottom: spacing.md },
  viewOnly: { ...typography.caption, color: t.textMuted },
  quoteRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: spacing.xs },
  quoteNumber: { ...typography.bodyMedium, color: t.textPrimary },
  quoteMeta: { ...typography.caption, color: t.textMuted },
  entry: { flexDirection: 'row' as const, gap: spacing.sm, paddingVertical: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary, marginTop: 5 },
  entryBody: { flex: 1 },
  entryTitle: { ...typography.bodyMedium, color: t.textPrimary },
  entryNote: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  entryMeta: { ...typography.caption, color: t.textMuted, marginTop: 2 },
});

const ACTION_META: Record<LeadAction, { title: string; hint: string; tone: Tone; icon: (c: string) => React.ReactNode }> = {
  claim: { title: 'Start verification', hint: 'Take this lead to call and verify', tone: 'info', icon: (c) => <PersonIcon size={20} color={c} /> },
  call: { title: 'Log a call', hint: 'Save the call outcome and notes', tone: 'info', icon: (c) => <PhoneIcon size={20} color={c} /> },
  genuine: { title: 'Mark as genuine', hint: 'Qualified - ready for a sales meeting', tone: 'success', icon: (c) => <CheckCircleIcon size={20} color={c} /> },
  needInfo: { title: 'Need more information', hint: 'Keep it open and call again later', tone: 'warning', icon: (c) => <AlertCircleIcon size={20} color={c} /> },
  meeting: { title: 'Schedule meeting', hint: 'Assign a sales person and set the time', tone: 'accent', icon: (c) => <CalendarIcon size={20} color={c} /> },
  followUp: { title: 'Schedule follow-up', hint: 'Creates a reminder task for you', tone: 'info', icon: (c) => <ClockIcon size={20} color={c} /> },
  quote: { title: 'Upload quotation', hint: 'Attach the quotation PDF and its amount', tone: 'accent', icon: (c) => <DocumentIcon size={20} color={c} /> },
  convert: { title: 'Convert to customer', hint: 'Creates the customer record', tone: 'success', icon: (c) => <UsersIcon size={20} color={c} /> },
  lost: { title: 'Mark as lost', hint: 'Close this opportunity with a reason', tone: 'danger', icon: (c) => <CloseIcon size={20} color={c} /> },
  reject: { title: 'Reject lead', hint: 'Not genuine - a reason is required', tone: 'danger', icon: (c) => <CloseIcon size={20} color={c} /> },
  feedback: { title: 'Send feedback to provider', hint: 'Visible to the lead provider', tone: 'neutral', icon: (c) => <SendIcon size={20} color={c} /> },
};

/**
 * One commercial lead in the pipeline: who it is, where it stands, what can be
 * done next, its quotations and its full history. The single screen every lead
 * role works a lead from.
 */
export function LeadWorkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { leadId } = useRoute<RouteProp<LeadStackParamList, 'LeadWork'>>().params;
  const { myId, myIdNum, persona } = useMe();
  const { styles, theme } = useCrmStyles(factory);
  const [busy, setBusy] = useState<LeadAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loader = useCallback(async () => {
    const lead = await api.getLead(leadId);
    // The lead is what the screen needs; a failure in one of the extras must not hide it.
    const [timeline, quotations, conversion] = await Promise.all([
      api.getTimeline(leadId).catch(() => []),
      api.getQuotations(leadId).catch(() => []),
      lead.stage === 'CONVERTED' ? api.getConversion(leadId).catch(() => null) : Promise.resolve(null),
    ]);
    return { lead, timeline, quotations, conversion };
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
        return navigation.navigate('LeadMeetingNew', { leadId: lead.id, name, address: lead.address });
      case 'followUp':
        return navigation.navigate('LeadFollowUp', { leadId: lead.id, name });
      case 'quote':
        return navigation.navigate('LeadQuote', { leadId: lead.id, name, amount: lead.amount });
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

  const lead = data?.lead;
  const actions = lead ? leadActions(lead, persona, myId) : [];

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title={lead?.leadNumber || 'Lead'} subtitle={lead?.companyName} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />
        <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />

        {loading && !lead && (
          <>
            <CrmSkeleton height={140} radius={radii.lg} style={{ marginBottom: spacing.md }} />
            <CrmSkeleton height={220} radius={radii.lg} />
          </>
        )}

        {!loading && !lead && !error && <CrmEmptyState title="Lead not found" subtitle="It may have been removed, or you no longer have access to it." />}

        {lead && (
          <>
            <Card>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <BriefcaseIcon size={26} color={theme.primary} />
                </View>
                <View style={styles.heroText}>
                  <Text style={styles.company} numberOfLines={2}>
                    {lead.companyName}
                  </Text>
                  <Text style={styles.contact} numberOfLines={1}>
                    {lead.contactPerson}
                  </Text>
                </View>
              </View>
              <View style={styles.heroFoot}>
                <View>
                  <Text style={styles.quoteLabel}>Approximate quote</Text>
                  <Text style={styles.quote}>{formatINR(lead.amount)}</Text>
                </View>
                <StageBadge stage={lead.stage} />
              </View>
            </Card>

            <PrimaryButton
              label={`Call ${lead.contactPerson || 'customer'}`}
              icon={<PhoneIcon size={18} color={theme.textOnPrimary} />}
              onPress={() => Linking.openURL(`tel:${lead.phone}`).catch(() => setActionError('This phone cannot place calls.'))}
              style={styles.callButton}
            />

            <SectionLabel>NEXT STEP</SectionLabel>
            <Card>
              {actions.length === 0 ? (
                <Text style={styles.viewOnly}>
                  {lead.stage === 'NEW'
                    ? 'Waiting for a telecaller to verify this lead.'
                    : 'No actions available - this lead is closed or is being handled by someone else.'}
                </Text>
              ) : (
                actions.map((action, i) => {
                  const meta = ACTION_META[action];
                  return (
                    <ActionRow
                      key={action}
                      icon={meta.icon}
                      title={busy === action ? 'Saving…' : meta.title}
                      hint={meta.hint}
                      tone={meta.tone}
                      divider={i > 0}
                      disabled={busy !== null}
                      onPress={() => onAction(action, lead)}
                    />
                  );
                })
              )}
            </Card>

            {data?.conversion && (
              <>
                <SectionLabel>CUSTOMER</SectionLabel>
                <Card>
                  <InfoLine label="Customer" value={data.conversion.companyName} />
                  <InfoLine label="Customer ID" value={data.conversion.companyId} />
                  <InfoLine label="Converted by" value={data.conversion.convertedBy} />
                </Card>
              </>
            )}

            <SectionLabel>LEAD DETAILS</SectionLabel>
            <Card>
              <InfoLine label="Phone" value={lead.phone} onPress={() => Linking.openURL(`tel:${lead.phone}`).catch(() => {})} />
              {!!lead.alternatePhone && (
                <InfoLine label="Alternate" value={lead.alternatePhone} onPress={() => Linking.openURL(`tel:${lead.alternatePhone}`).catch(() => {})} />
              )}
              {!!lead.email && <InfoLine label="Email" value={lead.email} onPress={() => Linking.openURL(`mailto:${lead.email}`).catch(() => {})} />}
              <InfoLine
                label="Address"
                value={lead.address}
                onPress={lead.address ? () => Linking.openURL(`geo:0,0?q=${encodeURIComponent(lead.address)}`).catch(() => {}) : undefined}
              />
              <InfoLine label="Source" value={lead.providerId ? `${sourceLabel(lead.source)} (lead provider)` : sourceLabel(lead.source)} />
              <InfoLine label="Requirement" value={lead.notes} />
              <InfoLine label="Created" value={formatLeadWhen(lead.createdAt)} />
            </Card>

            {data && data.quotations.length > 0 && (
              <>
                <SectionLabel>QUOTATIONS</SectionLabel>
                <Card>
                  {data.quotations.map((q) => (
                    <View key={q.id} style={styles.quoteRow}>
                      <View>
                        <Text style={styles.quoteNumber}>{q.number}</Text>
                        <Text style={styles.quoteMeta}>
                          {formatINR(q.total)}
                          {q.hasPdf ? ' · PDF attached' : ''}
                        </Text>
                      </View>
                      <StatusBadge label={actionLabel(q.status)} tone="accent" dot={false} />
                    </View>
                  ))}
                </Card>
              </>
            )}

            <SectionLabel>HISTORY</SectionLabel>
            <Card>
              {data && data.timeline.length === 0 && <Text style={styles.viewOnly}>No activity yet.</Text>}
              {/* The server sends oldest first; the latest activity is what matters most on a phone. */}
              {data &&
                [...data.timeline].reverse().map((entry) => (
                  <View key={entry.id} style={styles.entry}>
                    <View style={styles.dot} />
                    <View style={styles.entryBody}>
                      <Text style={styles.entryTitle}>{actionLabel(entry.action)}</Text>
                      {!!entry.note && <Text style={styles.entryNote}>{entry.note}</Text>}
                      <Text style={styles.entryMeta}>
                        {formatLeadWhen(entry.at)}
                        {entry.by ? ` · ${entry.by}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
            </Card>
          </>
        )}
      </CrmScreen>
    </LeadScreen>
  );
}
