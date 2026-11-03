import React, { useCallback, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { crmApi } from '../../api';
import { useLeads } from '../../crm/LeadsContext';
import { CommercialLeadDetail } from '../../crm/screens/CrmCommercialLeadDetail';
import { GlossyBadge } from '../../components/GlossyBadge';
import { BellIcon, CalendarIcon, ChevronRightIcon, PersonIcon } from '../../components/icons';
import { toneColors } from '../../crm/ui/StatusBadge';
import { initials } from '../../tasks/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadRootStackParamList, LeadStackParamList } from '../navigation';
import { SiteVisitsCard } from '../SiteVisitsCard';
import { leadActions } from '../stage';
import { meetingWhen, personTone, StageBadge, useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, gap: spacing.md },
  remind: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: t.border },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.bodyMedium, fontWeight: '700' as const },
  meet: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.accentBg,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  meetIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  meetKicker: { ...typography.overline, color: t.accentText },
  meetWhen: { ...typography.bodyMedium, color: t.textPrimary, marginTop: 1 },
  meetOpen: { ...typography.bodyMedium, color: t.accent },
  remindText: { flex: 1 },
  remindTitle: { ...typography.bodyMedium, color: t.textPrimary },
  assignBtn: { minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  assignBtnText: { ...typography.captionMedium, color: t.primary },
  remindSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
});

/**
 * What a tap on a lead opens in the Lead Management app: the lead's details first (the same
 * screen the CRM shows for a commercial lead), with Call / WhatsApp / Email, the pipeline stage,
 * and the way on to Manage lead (next steps, quotations, history) or a quick Follow-up.
 */
export function LeadDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { leadId } = useRoute<RouteProp<LeadStackParamList, 'LeadDetail'>>().params;
  const { myId, persona } = useMe();
  const { styles, theme } = useCrmStyles(factory);
  const { replaceLead } = useLeads();

  // Both read GET /api/crm/leads/:id: the CRM shape has every field of the form, the pipeline
  // shape has the stage and who may act on it. Reloaded on every focus, so it is current after Manage lead.
  // The sales manager also sees who the lead is with (and can give it to someone else).
  const manager = persona === 'sales_manager';
  const loader = useCallback(async () => {
    // A residential lead has no pipeline: it opens on its own details page (see below).
    const first = await crmApi.getLead(leadId);
    if (first.leadType !== 'commercial') return { lead: first, residential: true as const };
    const [lead, pipeline, visits, openMeeting, people] = await Promise.all([
      first,
      api.getLead(leadId),
      // The visit history is extra: if it cannot load, the lead still shows.
      api.leadVisits(leadId).catch(() => [] as api.LeadVisit[]),
      api.openMeeting(leadId).catch(() => null),
      manager ? api.leadAssignees().catch(() => []) : Promise.resolve([]),
    ]);
    return { lead, pipeline, visits, openMeeting, people, residential: false as const };
  }, [leadId, manager]);
  const { data, error, reload } = useLoad(loader, 'Could not load this lead.');
  const residential = !!data && data.residential;
  useEffect(() => {
    if (residential) (navigation as unknown as NativeStackNavigationProp<LeadRootStackParamList>).replace('CrmLeadDetail', { leadId });
  }, [residential, navigation, leadId]);

  if (!data || data.residential) {
    return (
      <LeadScreen>
        <TopBar title="Lead details" onBack={() => navigation.goBack()} />
        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
          {!error && (
            <>
              <CrmSkeleton height={190} radius={radii.xl} />
              <CrmSkeleton height={52} radius={radii.lg} />
              <CrmSkeleton height={220} radius={radii.xl} />
            </>
          )}
        </View>
      </LeadScreen>
    );
  }

  const { lead, pipeline, visits, openMeeting, people } = data;
  const name = pipeline.companyName || lead.companyName || lead.customerName;
  const closed = ['WON', 'CONVERTED', 'NOT_GENUINE', 'LOST', 'CANCELLED'].includes(pipeline.stage);
  const holderId = pipeline.salesEmployeeId || pipeline.telecallerId;
  const holder = holderId ? people.find((p) => String(p.id) === String(holderId)) : undefined;
  const holderTone = !holderId
    ? { fg: theme.textMuted, bg: theme.surfaceAlt }
    : holderId === myId
    ? { fg: theme.primary, bg: theme.primarySoftBg }
    : toneColors(theme, personTone(holder?.name ?? ''));
  const canFollowUp = leadActions(pipeline, persona, myId).includes('followUp');
  // Details can be changed (another number, address...) until the lead becomes a customer - by the
  // sales manager or whoever added it or holds it. The server checks the same.
  const converted = lead.leadStatus === 'converted' || ['WON', 'CONVERTED'].includes(pipeline.stage);
  const canEdit =
    !converted && (manager || [pipeline.createdById, pipeline.salesEmployeeId, pipeline.telecallerId].some((id) => !!id && String(id) === myId));
  const edit = () => {
    // The edit form reads the lead from the CRM list: put this copy there first.
    replaceLead(lead);
    (navigation as unknown as NativeStackNavigationProp<LeadRootStackParamList>).navigate('CrmNewCommercialLead', { editLeadId: lead.id });
  };

  return (
    <CommercialLeadDetail
      lead={lead}
      stage={<StageBadge stage={pipeline.stage} />}
      contractType={pipeline.contractType ?? null}
      onManage={() => navigation.navigate('LeadWork', { leadId })}
      onFollowUp={canFollowUp ? () => navigation.navigate('LeadFollowUp', { leadId, name }) : undefined}
      onEdit={canEdit ? edit : null}
      afterActions={
        openMeeting ? (
          <Pressable
            onPress={() => navigation.navigate('LeadMeeting', { meetingId: openMeeting.id })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.meet, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.meetIcon}>
              <CalendarIcon size={20} color="#FFFFFF" />
            </View>
            <View style={styles.remindText}>
              <Text style={styles.meetKicker}>{openMeeting.started ? 'VISIT IN PROGRESS' : openMeeting.type === 'OFFICE' ? 'OFFICE MEETING' : 'SITE VISIT'}</Text>
              <Text style={styles.meetWhen} numberOfLines={1}>
                {meetingWhen(openMeeting)}
                {openMeeting.salesName ? ` · ${openMeeting.salesName}` : ''}
              </Text>
            </View>
            <Text style={styles.meetOpen}>Open</Text>
            <ChevronRightIcon size={16} color={theme.accent} />
          </Pressable>
        ) : null
      }
      // Lead providers and telecallers add no photos, so the card only appears on your own leads.
      showPhotos={pipeline.createdById === myId}
      extra={
        <>
          {/* Who has it (managers) and a reminder - one card, two rows. */}
          <View style={styles.remind}>
            {manager && (
              <View style={[styles.row, styles.rowDivider]}>
                <View style={[styles.avatar, { backgroundColor: holderTone.bg }]}>
                  {holderId ? (
                    <Text style={[styles.avatarText, { color: holderTone.fg }]}>{holderId === myId ? 'ME' : initials(holder?.name ?? '?')}</Text>
                  ) : (
                    <PersonIcon size={18} color={theme.textMuted} />
                  )}
                </View>
                <View style={styles.remindText}>
                  <Text style={styles.remindTitle} numberOfLines={1}>
                    {!holderId ? 'Not assigned yet' : holderId === myId ? 'You' : holder?.name ?? 'Someone else'}
                  </Text>
                  <Text style={styles.remindSub} numberOfLines={1}>
                    {holder && holderId !== myId ? `Assigned · ${api.roleName(holder.role)}` : 'Assigned to'}
                  </Text>
                </View>
                {!closed && (
                  <Pressable
                    onPress={() =>
                      navigation.navigate('LeadAssign', { leadId, name, salesId: pipeline.salesEmployeeId, telecallerId: pipeline.telecallerId })
                    }
                    accessibilityRole="button"
                    hitSlop={6}
                    style={({ pressed }) => [styles.assignBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.assignBtnText}>{holderId ? 'Reassign' : 'Assign'}</Text>
                  </Pressable>
                )}
              </View>
            )}
            <Pressable
              onPress={() => navigation.navigate('LeadReminderEdit', { leadId, leadName: name })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
            >
              <GlossyBadge color={theme.warning} size={40} icon={<BellIcon size={18} color="#fff" />} />
              <View style={styles.remindText}>
                <Text style={styles.remindTitle}>Set a reminder</Text>
                <Text style={styles.remindSub}>Rings at the time you choose</Text>
              </View>
              <ChevronRightIcon size={16} color={theme.textMuted} />
            </Pressable>
          </View>
          <SiteVisitsCard visits={visits} onOpen={(meetingId) => navigation.navigate('LeadMeeting', { meetingId })} />
        </>
      }
    />
  );
}
