import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BriefcaseIcon,
  ClockIcon,
  EmailIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  TagIcon,
} from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR, formatLeadWhen } from '../format';
import { whatsappUrl } from '../leadHelpers';
import { useLeads } from '../LeadsContext';
import type { CrmStackParamList } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import { COMMERCIAL_LEAD_SOURCES, optionLabel, type Lead } from '../types';
import { WhatsAppIcon } from '../ui/crmIcons';
import { CrmScreen } from '../ui/CrmScreen';
import { LocalLeadPhotos, ServerLeadPhotos } from '../ui/LeadPhotos';
import { PrimaryButton } from '../ui/PrimaryButton';
import { LeadStatusBadge } from '../ui/StatusBadge';
import { TopBar } from '../ui/TopBar';

const WHATSAPP = '#25D366';

const factory = (t: CrmTheme) => ({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    borderLeftWidth: 5,
    borderLeftColor: t.primary,
    padding: spacing.lg,
    ...t.raisedShadow,
  },
  heroTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  companyTile: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroText: { flex: 1 },
  kind: { ...typography.overline, color: t.primary },
  company: { ...typography.title, color: t.textPrimary, marginTop: 2 },
  contactPerson: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 4,
  },
  contactPersonText: { ...typography.body, color: t.textSecondary, flex: 1 },
  quoteBox: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    padding: spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  quoteLabel: { ...typography.caption, color: t.textMuted },
  quote: { ...typography.display, fontSize: 30, color: t.textPrimary },
  heroFoot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: spacing.md,
  },
  when: { ...typography.caption, color: t.textMuted },

  syncBanner: {
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    backgroundColor: t.warningBg,
  },
  syncBannerFailed: { backgroundColor: t.dangerBg },
  syncText: { ...typography.captionMedium, color: t.warningText },
  syncTextFailed: { color: t.dangerText },
  syncDiscard: {
    ...typography.captionMedium,
    color: t.dangerText,
    marginTop: spacing.xs,
  },

  manage: { marginBottom: spacing.md },

  contactRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  contact: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radii.lg,
  },
  contactCall: { backgroundColor: t.primary },
  contactWhatsApp: { backgroundColor: WHATSAPP },
  contactEmail: { backgroundColor: t.crestRed },
  contactOff: { opacity: 0.4 },
  contactPressed: { opacity: 0.85 },
  contactLabel: { ...typography.captionMedium, color: '#FFFFFF' },

  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  cardTitle: {
    ...typography.overline,
    color: t.textMuted,
    marginBottom: spacing.xs,
  },
  cardTitleSpaced: { marginBottom: spacing.sm },
  infoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  infoDivider: { borderTopWidth: 1, borderTopColor: t.border },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  infoText: { flex: 1 },
  infoLabel: { ...typography.caption, color: t.textMuted },
  infoValue: { ...typography.bodyMedium, color: t.textPrimary, marginTop: 1 },
  infoLink: { color: t.primary },
  notes: { ...typography.body, color: t.textSecondary, lineHeight: 22 },
});

function InfoRow({
  icon,
  label,
  value,
  first,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  first?: boolean;
  /** Makes the row tappable (e.g. to call the number it shows). */
  onPress?: () => void;
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
        <Text style={[styles.infoValue, !!onPress && styles.infoLink]}>
          {value || '-'}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Details of a commercial lead. Deliberately not the consumer layout: the company comes first,
 * the amount is a quote rather than a payment, and there is a photos section instead of a
 * service / payment section.
 */
export function CommercialLeadDetail({ lead }: { lead: Lead }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const { showNotice, discardQueued } = useLeads();
  const { styles, theme } = useCrmStyles(factory);
  const iconColor = theme.primary;
  const hasEmail = !!lead.email;
  const localPhotos = lead.localPhotos ?? [];

  async function open(url: string, failMessage: string) {
    try {
      await Linking.openURL(url);
    } catch {
      showNotice(failMessage, 'warning');
    }
  }
  const call = (phone: string) =>
    open(`tel:${phone}`, 'No phone app found on this device.');

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar title="Commercial Lead" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.companyTile}>
              <BriefcaseIcon size={30} color={theme.primary} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.kind}>COMMERCIAL</Text>
              <Text style={styles.company} numberOfLines={2}>
                {lead.companyName || lead.customerName}
              </Text>
              <View style={styles.contactPerson}>
                <PersonIcon size={15} color={theme.textMuted} />
                <Text style={styles.contactPersonText} numberOfLines={1}>
                  {lead.customerName}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.quoteBox}>
            <View>
              <Text style={styles.quoteLabel}>Approximate quote</Text>
              <Text style={styles.quote}>{formatINR(lead.amount)}</Text>
            </View>
            <LeadStatusBadge status={lead.leadStatus} />
          </View>

          <View style={styles.heroFoot}>
            <ClockIcon size={14} color={theme.textMuted} />
            <Text style={styles.when}>{formatLeadWhen(lead.createdAt)}</Text>
          </View>
        </View>

        {lead.pendingSync && (
          <View
            style={[
              styles.syncBanner,
              !!lead.syncError && styles.syncBannerFailed,
            ]}
          >
            <Text
              style={[styles.syncText, !!lead.syncError && styles.syncTextFailed]}
            >
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
        {!lead.pendingSync && (
          <PrimaryButton
            label="Manage lead"
            onPress={() => navigation.navigate('LeadWork', { leadId: lead.id })}
            style={styles.manage}
            testID="manage-lead"
          />
        )}

        <View style={styles.contactRow}>
          <Pressable
            onPress={() => call(lead.phone)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${lead.customerName}`}
            style={({ pressed }) => [
              styles.contact,
              styles.contactCall,
              pressed && styles.contactPressed,
            ]}
            testID="contact-call"
          >
            <PhoneIcon size={17} color="#FFFFFF" />
            <Text style={styles.contactLabel}>Call</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              open(
                whatsappUrl(lead.phone),
                'Could not open WhatsApp on this device.',
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`WhatsApp ${lead.customerName}`}
            style={({ pressed }) => [
              styles.contact,
              styles.contactWhatsApp,
              pressed && styles.contactPressed,
            ]}
            testID="contact-whatsapp"
          >
            <WhatsAppIcon size={18} color="#FFFFFF" />
            <Text style={styles.contactLabel}>WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              open(`mailto:${lead.email}`, 'No email app found on this device.')
            }
            disabled={!hasEmail}
            accessibilityRole="button"
            accessibilityLabel={
              hasEmail ? `Email ${lead.customerName}` : 'No email on this lead'
            }
            style={({ pressed }) => [
              styles.contact,
              styles.contactEmail,
              !hasEmail && styles.contactOff,
              pressed && styles.contactPressed,
            ]}
            testID="contact-email"
          >
            <EmailIcon size={17} color="#FFFFFF" />
            <Text style={styles.contactLabel}>Email</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>BUSINESS</Text>
          <InfoRow
            first
            icon={<BriefcaseIcon size={18} color={iconColor} />}
            label="Company / Business"
            value={lead.companyName ?? ''}
          />
          <InfoRow
            icon={<PinIcon size={18} color={iconColor} />}
            label="Address"
            value={lead.location}
          />
          <InfoRow
            icon={<TagIcon size={18} color={iconColor} />}
            label="Source of Lead"
            // A source from outside this app's own list (e.g. "Lead Provider") is shown as stored.
            value={optionLabel(COMMERCIAL_LEAD_SOURCES, lead.source) || lead.source || ''}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>CONTACT</Text>
          <InfoRow
            first
            icon={<PersonIcon size={18} color={iconColor} />}
            label="Lead Name"
            value={lead.customerName}
          />
          <InfoRow
            icon={<PhoneIcon size={18} color={iconColor} />}
            label="Phone Number"
            value={lead.phone}
            onPress={() => call(lead.phone)}
          />
          {!!lead.alternatePhone && (
            <InfoRow
              icon={<PhoneIcon size={18} color={iconColor} />}
              label="Alternate Number"
              value={lead.alternatePhone}
              onPress={() => call(lead.alternatePhone as string)}
            />
          )}
          {hasEmail && (
            <InfoRow
              icon={<EmailIcon size={18} color={iconColor} />}
              label="Email"
              value={lead.email}
            />
          )}
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.cardTitleSpaced]}>PHOTOS</Text>
          {lead.pendingSync ? (
            localPhotos.length > 0 ? (
              <LocalLeadPhotos photos={localPhotos} />
            ) : (
              <Text style={styles.notes}>No photos were added to this lead.</Text>
            )
          ) : (
            <ServerLeadPhotos leadId={lead.id} />
          )}
        </View>

        {!!lead.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>NOTES</Text>
            <Text style={styles.notes}>{lead.notes}</Text>
          </View>
        )}
      </ScrollView>
    </CrmScreen>
  );
}
