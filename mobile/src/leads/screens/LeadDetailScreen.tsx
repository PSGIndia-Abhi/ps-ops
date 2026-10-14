import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { crmApi } from '../../api';
import { CommercialLeadDetail } from '../../crm/screens/CrmCommercialLeadDetail';
import { BellIcon, CalendarIcon, ChevronRightIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { SiteVisitsCard } from '../SiteVisitsCard';
import { leadActions } from '../stage';
import { meetingWhen, StageBadge, useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, gap: spacing.md },
  remind: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
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
  remindIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  remindText: { flex: 1 },
  remindTitle: { ...typography.bodyMedium, color: t.textPrimary },
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

  // Both read GET /api/crm/leads/:id: the CRM shape has every field of the form, the pipeline
  // shape has the stage and who may act on it. Reloaded on every focus, so it is current after Manage lead.
  const loader = useCallback(async () => {
    const [lead, pipeline, visits, openMeeting] = await Promise.all([
      crmApi.getLead(leadId),
      api.getLead(leadId),
      // The visit history is extra: if it cannot load, the lead still shows.
      api.leadVisits(leadId).catch(() => [] as api.LeadVisit[]),
      api.openMeeting(leadId).catch(() => null),
    ]);
    return { lead, pipeline, visits, openMeeting };
  }, [leadId]);
  const { data, error, reload } = useLoad(loader, 'Could not load this lead.');

  if (!data) {
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

  const { lead, pipeline, visits, openMeeting } = data;
  const name = pipeline.companyName || lead.companyName || lead.customerName;
  const canFollowUp = leadActions(pipeline, persona, myId).includes('followUp');

  return (
    <CommercialLeadDetail
      lead={lead}
      stage={<StageBadge stage={pipeline.stage} />}
      onManage={() => navigation.navigate('LeadWork', { leadId })}
      onFollowUp={canFollowUp ? () => navigation.navigate('LeadFollowUp', { leadId, name }) : undefined}
      onEdit={null}
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
          <Pressable
            onPress={() => navigation.navigate('LeadReminderEdit', { leadId, leadName: name })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.remind, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.remindIcon}>
              <BellIcon size={19} color={theme.primary} />
            </View>
            <View style={styles.remindText}>
              <Text style={styles.remindTitle}>Set a reminder</Text>
              <Text style={styles.remindSub}>Your phone rings at the time you choose</Text>
            </View>
            <ChevronRightIcon size={16} color={theme.textMuted} />
          </Pressable>
          <SiteVisitsCard visits={visits} onOpen={(meetingId) => navigation.navigate('LeadMeeting', { meetingId })} />
        </>
      }
    />
  );
}
