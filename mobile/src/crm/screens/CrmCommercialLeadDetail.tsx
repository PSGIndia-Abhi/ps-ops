import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BriefcaseIcon,
  ChevronRightIcon,
  ClockIcon,
  EmailIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  TagIcon,
  UsersIcon,
} from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR, formatLeadWhen } from '../format';
import { fmtDateShort } from '../../tasks/format';
import { whatsappUrl } from '../leadHelpers';
import { leadSourceLabel } from '../leadSources';
import { useLeads } from '../LeadsContext';
import type { CrmStackParamList } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import {
  INDUSTRY_TYPES,
  optionLabel,
  type Lead,
} from '../types';
import { WhatsAppIcon } from '../ui/crmIcons';
import { CrmScreen } from '../ui/CrmScreen';
import { LocalLeadPhotos, ServerLeadPhotos } from '../ui/LeadPhotos';
import { PrimaryButton } from '../ui/PrimaryButton';
import { LeadStatusBadge } from '../ui/StatusBadge';
import { TopBar } from '../ui/TopBar';

const WHATSAPP = '#25D366';

const factory = (t: CrmTheme) => ({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  // Who, how much, and how to reach them
  hero: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    borderLeftWidth: 4,
    borderLeftColor: t.primary,
    padding: spacing.md,
    ...t.cardShadow,
  },
  heroTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  companyTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroText: { flex: 1 },
  company: { ...typography.subtitle, color: t.textPrimary },
  contactPerson: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginTop: 1 },
  contactPersonText: { ...typography.caption, color: t.textSecondary, flex: 1 },
  quoteRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  quoteLabel: { ...typography.caption, color: t.textMuted },
  quote: { ...typography.subtitle, color: t.textPrimary },
  reach: { flexDirection: 'row' as const, gap: spacing.xs, marginTop: spacing.sm },
  reachItem: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    height: 40,
    borderRadius: radii.lg,
  },
  reachLabel: { ...typography.captionMedium, color: '#FFFFFF' },
  pressed: { opacity: 0.8 },

  syncBanner: { borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.md, backgroundColor: t.warningBg },
  syncBannerFailed: { backgroundColor: t.dangerBg },
  syncText: { ...typography.captionMedium, color: t.warningText },
  syncTextFailed: { color: t.dangerText },
  syncDiscard: { ...typography.captionMedium, color: t.dangerText, marginTop: spacing.xs },

  manage: { marginTop: spacing.lg, marginBottom: spacing.lg },
  actionRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.lg },
  actionMain: { flex: 1.4 },
  actionSide: { flex: 1 },
  spacer: { height: spacing.lg },

  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  cardTitle: { ...typography.overline, color: t.textMuted, marginTop: spacing.xs, marginBottom: spacing.xs },
  subBlock: { borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.sm, marginTop: spacing.xs, paddingBottom: spacing.sm },
  subTitle: { ...typography.caption, color: t.textMuted, marginBottom: spacing.xs },
  foldHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 48 },
  foldText: { flex: 1 },
  foldTitle: { marginBottom: 0 },
  foldHint: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  foldChevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const, transform: [{ rotate: '90deg' }] },
  foldChevronOpen: { transform: [{ rotate: '-90deg' }] },
  infoRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  infoDivider: { borderTopWidth: 1, borderTopColor: t.border },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  infoText: { flex: 1 },
  infoLabel: { ...typography.caption, color: t.textMuted },
  infoValue: { ...typography.bodyMedium, color: t.textPrimary, marginTop: 1 },
  infoEmpty: { ...typography.body, color: t.textMuted, fontStyle: 'italic' as const },
  infoLink: { color: t.primary },
  notes: { ...typography.body, color: t.textSecondary, lineHeight: 22, paddingBottom: spacing.sm },
});

function InfoRow({
  icon,
  label,
  value,
  first,
  onPress,
  empty,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  first?: boolean;
  /** Makes the row tappable (e.g. to call the number it shows). */
  onPress?: () => void;
  /** Nothing saved yet: the value reads "Not added", greyed. */
  empty?: boolean;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.infoRow, !first && styles.infoDivider]}
    >
      <View style={styles.infoIcon}>{icon}</View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, !!onPress && styles.infoLink, empty && styles.infoEmpty]}>{empty ? 'Not added' : value}</Text>
      </View>
    </Pressable>
  );
}

/** A round contact button with its label under it. */
function ReachButton({ icon, label, color, onPress }: { icon: React.ReactNode; label: string; color: string; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.reachItem, { backgroundColor: color }, pressed && styles.pressed]}
    >
      {icon}
      <Text style={styles.reachLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Details of a commercial lead. Deliberately not the consumer layout: the company comes first,
 * the amount is a quote rather than a payment, and there is a photos section instead of a
 * service / payment section. One Details card lists only the fields the lead actually has.
 *
 * The Lead Management app shows the same screen (LeadDetailScreen) and passes its own pieces:
 * `stage` replaces the status badge with the pipeline stage, `onFollowUp` adds a Follow-up
 * button beside Manage lead, `onEdit={null}` hides Edit, and `showPhotos={false}` drops the
 * Photos card (only the person who added a lead can have put photos on it).
 */
export function CommercialLeadDetail({
  lead,
  stage,
  onManage,
  onFollowUp,
  onEdit,
  showPhotos = true,
  extra,
  afterActions,
}: {
  lead: Lead;
  stage?: React.ReactNode;
  onManage?: () => void;
  onFollowUp?: () => void;
  onEdit?: (() => void) | null;
  showPhotos?: boolean;
  /** More cards shown after Details (the Lead Management app's site visits). */
  extra?: React.ReactNode;
  /** Shown right under Manage lead / Follow-up (the Lead Management app's open meeting). */
  afterActions?: React.ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const manage = onManage ?? (() => navigation.navigate('LeadWork', { leadId: lead.id }));
  const edit =
    onEdit === null ? undefined : onEdit ?? (() => navigation.navigate('CrmNewCommercialLead', { editLeadId: lead.id }));
  const { showNotice, discardQueued } = useLeads();
  // Photos can change in the edit form, so they are loaded again each time this screen comes back.
  const [photosKey, setPhotosKey] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const competitor = !!(lead.competitorName || lead.competitorAmount || lead.competitorContractEnd || lead.competitorNotes);
  useFocusEffect(
    useCallback(() => {
      setPhotosKey(k => k + 1);
    }, []),
  );
  const { styles, theme } = useCrmStyles(factory);
  const iconColor = theme.primary;
  const localPhotos = lead.localPhotos ?? [];
  const hasPoint = typeof lead.latitude === 'number' && typeof lead.longitude === 'number';
  const industry = optionLabel(INDUSTRY_TYPES, lead.industryType ?? null);
  const services = (lead.serviceNames ?? []).join(', ');
  // A source from outside this app's own list (e.g. "Lead Provider") is shown as stored.
  const source = leadSourceLabel(lead.source);

  async function open(url: string, failMessage: string) {
    try {
      await Linking.openURL(url);
    } catch {
      showNotice(failMessage, 'warning');
    }
  }
  const call = (phone: string) => open(`tel:${phone}`, 'No phone app found on this device.');
  const openMaps = () =>
    hasPoint
      ? open(`https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`, 'No maps app found on this device.')
      : open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.location)}`, 'No maps app found on this device.');

  // Only the fields this lead has, in the order a sales person needs them.
  const rows: { key: string; icon: React.ReactNode; label: string; value: string; onPress?: () => void; empty?: boolean }[] = [
    { key: 'phone', icon: <PhoneIcon size={17} color={iconColor} />, label: 'Phone', value: lead.phone, onPress: () => call(lead.phone) },
    ...(lead.alternatePhone
      ? [{ key: 'alt', icon: <PhoneIcon size={17} color={iconColor} />, label: 'Alternate phone', value: lead.alternatePhone, onPress: () => call(lead.alternatePhone as string) }]
      : []),
    ...(lead.email ? [{ key: 'email', icon: <EmailIcon size={17} color={iconColor} />, label: 'Email', value: lead.email }] : []),
    ...(lead.location || hasPoint
      ? [{ key: 'addr', icon: <PinIcon size={17} color={iconColor} />, label: 'Address', value: lead.location || 'Open in Maps', onPress: openMaps }]
      : []),
    ...(lead.designation ? [{ key: 'desig', icon: <PersonIcon size={17} color={iconColor} />, label: 'Designation', value: lead.designation }] : []),
    // Always shown - "Not added" when empty (e.g. a lead added on the web), so Edit can fill them in.
    { key: 'industry', icon: <BriefcaseIcon size={17} color={iconColor} />, label: 'Industry', value: industry, empty: !industry },
    { key: 'services', icon: <BriefcaseIcon size={17} color={iconColor} />, label: 'Services', value: services, empty: !services },
    { key: 'source', icon: <TagIcon size={17} color={iconColor} />, label: 'Source', value: source, empty: !source },
    ...(lead.referenceBy ? [{ key: 'ref', icon: <UsersIcon size={17} color={iconColor} />, label: 'Referred by', value: lead.referenceBy }] : []),
    ...(lead.createdByName ? [{ key: 'by', icon: <PersonIcon size={17} color={iconColor} />, label: 'Added by', value: lead.createdByName }] : []),
    { key: 'when', icon: <ClockIcon size={17} color={iconColor} />, label: 'Added on', value: formatLeadWhen(lead.createdAt) },
  ];

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar
        title="Lead details"
        onBack={() => navigation.goBack()}
        // A lead still waiting on this phone is not on the server yet, so there is nothing to edit there.
        action={lead.pendingSync || !edit ? undefined : { label: 'Edit', onPress: edit }}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.companyTile}>
              <BriefcaseIcon size={20} color={theme.primary} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.company} numberOfLines={1}>
                {lead.companyName || lead.customerName}
              </Text>
              <View style={styles.contactPerson}>
                <PersonIcon size={13} color={theme.textMuted} />
                <Text style={styles.contactPersonText} numberOfLines={1}>
                  {lead.customerName}
                </Text>
              </View>
            </View>
            {stage ?? <LeadStatusBadge status={lead.leadStatus} />}
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Approx. quote</Text>
            <Text style={styles.quote}>{formatINR(lead.amount)}</Text>
          </View>

          <View style={styles.reach}>
            <ReachButton icon={<PhoneIcon size={16} color="#FFFFFF" />} label="Call" color={theme.primary} onPress={() => call(lead.phone)} />
            <ReachButton
              icon={<WhatsAppIcon size={17} color="#FFFFFF" />}
              label="WhatsApp"
              color={WHATSAPP}
              onPress={() => open(whatsappUrl(lead.phone), 'Could not open WhatsApp on this device.')}
            />
            {!!lead.email && (
              <ReachButton
                icon={<EmailIcon size={16} color="#FFFFFF" />}
                label="Email"
                color={theme.crestRed}
                onPress={() => open(`mailto:${lead.email}`, 'No email app found on this device.')}
              />
            )}
          </View>
        </View>

        {lead.pendingSync && (
          <View style={[styles.syncBanner, !!lead.syncError && styles.syncBannerFailed]}>
            <Text style={[styles.syncText, !!lead.syncError && styles.syncTextFailed]}>
              {lead.syncError
                ? `This lead could not be sent: ${lead.syncError}`
                : 'Saved on this phone. It will be sent automatically once you are online.'}
            </Text>
            {!!lead.syncError && (
              <Pressable
                onPress={() => {
                  discardQueued(lead.id);
                  navigation.goBack();
                }}
                accessibilityRole="button"
                testID="discard-queued"
              >
                <Text style={styles.syncDiscard}>Discard this lead</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Meetings, follow-ups, history and closing the lead all live on the pipeline screen. */}
        {lead.pendingSync ? (
          <View style={styles.spacer} />
        ) : onFollowUp ? (
          <View style={styles.actionRow}>
            <PrimaryButton label="Manage lead" onPress={manage} style={styles.actionMain} testID="manage-lead" />
            <PrimaryButton
              label="Follow-up"
              variant="secondary"
              icon={<ClockIcon size={17} color={theme.primary} />}
              onPress={onFollowUp}
              style={styles.actionSide}
              testID="follow-up"
            />
          </View>
        ) : (
          <PrimaryButton label="Manage lead" onPress={manage} style={styles.manage} testID="manage-lead" />
        )}

        {afterActions}

        {/* Details fold away (closed at first): the header above already has what is used most. */}
        <View style={styles.card}>
          <Pressable
            onPress={() => setDetailsOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            style={styles.foldHead}
          >
            <View style={styles.foldText}>
              <Text style={[styles.cardTitle, styles.foldTitle]}>DETAILS</Text>
              {!detailsOpen && (
                <Text style={styles.foldHint} numberOfLines={1}>
                  {[...rows.map((r) => r.label), ...(lead.notes ? ['Requirement'] : []), ...(competitor ? ['Competitor'] : []), ...(showPhotos ? ['Photos'] : [])].join(' · ')}
                </Text>
              )}
            </View>
            <View style={[styles.foldChevron, detailsOpen && styles.foldChevronOpen]}>
              <ChevronRightIcon size={18} color={theme.textMuted} />
            </View>
          </Pressable>
          {detailsOpen && (
            <>
              {rows.map((r, i) => (
                <InfoRow key={r.key} first={i === 0} icon={r.icon} label={r.label} value={r.value} onPress={r.onPress} empty={r.empty} />
              ))}
              {!!lead.notes && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Requirement</Text>
                  <Text style={styles.notes}>{lead.notes}</Text>
                </View>
              )}
              {competitor && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Competitor</Text>
                  {!!lead.competitorName && <Text style={styles.notes}>Current provider: {lead.competitorName}</Text>}
                  {!!lead.competitorAmount && <Text style={styles.notes}>Their price: {formatINR(lead.competitorAmount)}</Text>}
                  {!!lead.competitorContractEnd && <Text style={styles.notes}>Contract ends: {fmtDateShort(lead.competitorContractEnd)}</Text>}
                  {!!lead.competitorNotes && <Text style={styles.notes}>{lead.competitorNotes}</Text>}
                </View>
              )}
              {showPhotos && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Photos</Text>
                  {lead.pendingSync ? (
                    localPhotos.length > 0 ? (
                      <LocalLeadPhotos photos={localPhotos} />
                    ) : (
                      <Text style={styles.notes}>No photos were added to this lead.</Text>
                    )
                  ) : (
                    <ServerLeadPhotos key={photosKey} leadId={lead.id} />
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {extra}

      </ScrollView>
    </CrmScreen>
  );
}
