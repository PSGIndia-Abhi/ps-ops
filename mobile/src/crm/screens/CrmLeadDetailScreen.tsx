import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
  EmailIcon,
  HomeIcon,
  PhoneIcon,
  PinIcon,
  TagIcon,
  UsersIcon,
} from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR, formatLeadWhen } from '../format';
import { useLeads } from '../LeadsContext';
import { payForLead } from '../payment';
import type { CrmStackParamList } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import {
  LEAD_SOURCES,
  optionLabel,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../types';
import { CrmEmptyState, CrmErrorBanner, CrmScreen } from '../ui/CrmScreen';
import { PaymentFailedOverlay, PaymentSuccessOverlay } from '../ui/Celebration';
import { RupeeIcon, WalletIcon, WhatsAppIcon } from '../ui/crmIcons';
import { PestIcon } from '../ui/PestIcon';
import { PrimaryButton } from '../ui/PrimaryButton';
import { LeadStatusBadge } from '../ui/StatusBadge';
import { TopBar } from '../ui/TopBar';

const WHATSAPP = '#25D366';
const PAID_ON_WHITE = '#15803D';
const PENDING_ON_WHITE = '#B45309';

const factory = (t: CrmTheme) => ({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  hero: {
    backgroundColor: t.primary,
    borderRadius: radii.xl,
    padding: spacing.lg,
    overflow: 'hidden' as const,
    ...t.raisedShadow,
  },
  blobA: {
    position: 'absolute' as const,
    right: -40,
    top: -50,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  blobB: {
    position: 'absolute' as const,
    left: -30,
    bottom: -60,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  pestTile: {
    width: 60,
    height: 60,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroText: { flex: 1 },
  heroName: { ...typography.title, color: '#FFFFFF' },
  heroService: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  heroAmountRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.lg,
  },
  heroAmountLabel: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  heroAmount: { ...typography.display, fontSize: 34, color: '#FFFFFF' },
  payPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radii.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  payPillText: { ...typography.captionMedium },
  heroFoot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  heroWhen: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  heroWhenText: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },

  contactRow: {
    flexDirection: 'row' as const,
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  contact: { flex: 1, alignItems: 'center' as const, gap: spacing.xs },
  contactCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...t.cardShadow,
  },
  contactCall: { backgroundColor: t.primary },
  contactWhatsApp: { backgroundColor: WHATSAPP },
  contactEmail: { backgroundColor: t.crestRed },
  contactPressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  contactLabel: { ...typography.captionMedium, color: t.textSecondary },

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
  notes: { ...typography.body, color: t.textSecondary, lineHeight: 22 },
  payBlock: { marginTop: spacing.sm },
  syncBanner: {
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    backgroundColor: t.warningBg,
  },
  syncBannerFailed: { backgroundColor: t.dangerBg },
  syncText: { ...typography.captionMedium, color: t.warningText },
  syncTextFailed: { color: t.dangerText },
  syncDiscard: { ...typography.captionMedium, color: t.dangerText, marginTop: spacing.xs },
  shrink: { flexShrink: 1 },
});

function InfoRow({
  icon,
  label,
  value,
  first,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  first?: boolean;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={[styles.infoRow, !first && styles.infoDivider]}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '-'}</Text>
      </View>
    </View>
  );
}

function methodIcon(method: PaymentMethod, color: string) {
  if (method === 'online') return <WalletIcon size={18} color={color} />;
  if (method === 'cash') return <RupeeIcon size={18} color={color} />;
  return <DocumentIcon size={18} color={color} />;
}

export function CrmLeadDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const route = useRoute<RouteProp<CrmStackParamList, 'CrmLeadDetail'>>();
  const { getLead, replaceLead, showNotice, discardQueued } = useLeads();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const { styles, theme } = useCrmStyles(factory);
  const lead = getLead(route.params.leadId);

  async function open(url: string, failMessage: string) {
    try {
      await Linking.openURL(url);
    } catch {
      showNotice(failMessage, 'warning');
    }
  }

  async function handlePay() {
    if (!lead || paying) return;
    setPayError(null);
    setPaying(true);
    const outcome = await payForLead(lead);
    setPaying(false);
    if (outcome.status === 'paid') {
      replaceLead(outcome.lead);
      showNotice(`Payment received - ${lead.customerName}`);
      setShowSuccess(true);
    } else if (outcome.status === 'failed') {
      setPayError(outcome.message);
      setFailedReason(outcome.message);
    } else {
      // Cancelled: the customer backed out of checkout - nothing went wrong, just unfinished.
      const reason = 'Payment is still pending. You can try again whenever the customer is ready.';
      setPayError(reason);
      setFailedReason(reason);
    }
  }

  function dismissFailedPayment() {
    setFailedReason(null);
  }

  if (!lead) {
    return (
      <CrmScreen scroll={false} edges={['top', 'bottom']}>
        <TopBar title="Lead" onBack={() => navigation.goBack()} />
        <CrmEmptyState
          title="Lead not found"
          subtitle="It may have been removed."
        />
      </CrmScreen>
    );
  }

  const paid = lead.paymentStatus === 'paid';
  const hasEmail = !!lead.email;
  const iconColor = theme.primary;
  const source = optionLabel(LEAD_SOURCES, lead.source);
  const hasLeadInfo = !!(
    source ||
    lead.referenceBy ||
    lead.location ||
    lead.email
  );

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar title="Lead Details" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.blobA} />
          <View style={styles.blobB} />
          <View style={styles.heroTop}>
            <View style={styles.pestTile}>
              <PestIcon service={lead.service} size={36} color="#FFFFFF" />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroName} numberOfLines={2}>
                {lead.customerName}
              </Text>
              <Text style={styles.heroService} numberOfLines={1}>
                {lead.service}
              </Text>
            </View>
          </View>

          <View style={styles.heroAmountRow}>
            <View>
              <Text style={styles.heroAmountLabel}>Amount</Text>
              <Text style={styles.heroAmount}>{formatINR(lead.amount)}</Text>
            </View>
            <View style={styles.payPill}>
              {paid ? (
                <CheckCircleIcon size={16} color={PAID_ON_WHITE} />
              ) : (
                <ClockIcon size={16} color={PENDING_ON_WHITE} />
              )}
              <Text
                style={[
                  styles.payPillText,
                  { color: paid ? PAID_ON_WHITE : PENDING_ON_WHITE },
                ]}
              >
                {paid ? 'Paid' : 'Payment Pending'}
              </Text>
            </View>
          </View>

          <View style={styles.heroFoot}>
            <View style={styles.heroWhen}>
              <ClockIcon size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroWhenText}>
                {formatLeadWhen(lead.createdAt)}
              </Text>
            </View>
            <LeadStatusBadge status={lead.leadStatus} />
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

        <View style={styles.contactRow}>
          <Pressable
            onPress={() =>
              open(`tel:${lead.phone}`, 'No phone app found on this device.')
            }
            accessibilityRole="button"
            accessibilityLabel={`Call ${lead.customerName}`}
            style={({ pressed }) => [
              styles.contact,
              pressed && styles.contactPressed,
            ]}
            testID="contact-call"
          >
            <View style={[styles.contactCircle, styles.contactCall]}>
              <PhoneIcon size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.contactLabel}>Call</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              open(
                `https://wa.me/91${lead.phone}`,
                'Could not open WhatsApp on this device.',
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`WhatsApp ${lead.customerName}`}
            style={({ pressed }) => [
              styles.contact,
              pressed && styles.contactPressed,
            ]}
            testID="contact-whatsapp"
          >
            <View style={[styles.contactCircle, styles.contactWhatsApp]}>
              <WhatsAppIcon size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.contactLabel}>WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              // No email on file yet: still open the mail app with a blank
              // "to" field, so the rep can type the address themselves
              // (e.g. one given over a call, after the lead was saved).
              open(
                hasEmail ? `mailto:${lead.email}` : 'mailto:',
                'No email app found on this device.',
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`Email ${lead.customerName}`}
            style={({ pressed }) => [
              styles.contact,
              pressed && styles.contactPressed,
            ]}
            testID="contact-email"
          >
            <View style={[styles.contactCircle, styles.contactEmail]}>
              <EmailIcon size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.contactLabel}>Email</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>SERVICE</Text>
          <InfoRow
            first
            icon={<HomeIcon size={18} color={iconColor} />}
            label="House Type"
            value={lead.houseType}
          />
          <InfoRow
            icon={
              <PestIcon service={lead.service} size={20} color={iconColor} />
            }
            label="Service"
            value={lead.service}
          />
          <InfoRow
            icon={<TagIcon size={18} color={iconColor} />}
            label="Plan"
            value={lead.plan}
          />
          {!!lead.coupon && (
            <InfoRow
              icon={<TagIcon size={18} color={iconColor} />}
              label="Coupon"
              value={lead.coupon}
            />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>PAYMENT</Text>
          <InfoRow
            first
            icon={methodIcon(lead.paymentMethod, iconColor)}
            label="Method"
            value={optionLabel(PAYMENT_METHODS, lead.paymentMethod)}
          />
          <InfoRow
            icon={
              paid ? (
                <CheckCircleIcon size={18} color={iconColor} />
              ) : (
                <ClockIcon size={18} color={iconColor} />
              )
            }
            label="Status"
            value={paid ? 'Paid' : 'Payment Pending'}
          />
          {lead.paymentMethod === 'online' && !paid && !lead.pendingSync && (
            <View style={styles.payBlock}>
              <CrmErrorBanner message={payError} />
              <PrimaryButton
                label="Pay with Razorpay"
                variant="brand"
                onPress={handlePay}
                loading={paying}
                testID="detail-pay"
              />
            </View>
          )}
        </View>

        {hasLeadInfo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>LEAD</Text>
            {!!source && (
              <InfoRow
                first
                icon={<TagIcon size={18} color={iconColor} />}
                label="Source"
                value={source}
              />
            )}
            {!!lead.referenceBy && (
              <InfoRow
                first={!source}
                icon={<UsersIcon size={18} color={iconColor} />}
                label="Referred By"
                value={lead.referenceBy}
              />
            )}
            {!!lead.location && (
              <InfoRow
                first={!source && !lead.referenceBy}
                icon={<PinIcon size={18} color={iconColor} />}
                label="Location"
                value={lead.location}
              />
            )}
            {!!lead.email && (
              <InfoRow
                first={!source && !lead.referenceBy && !lead.location}
                icon={<EmailIcon size={18} color={iconColor} />}
                label="Email"
                value={lead.email}
              />
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>CUSTOMER</Text>
          <InfoRow
            first
            icon={<PhoneIcon size={18} color={iconColor} />}
            label="Phone"
            value={lead.phone}
          />
        </View>

        {!!lead.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>NOTES</Text>
            <Text style={styles.notes}>{lead.notes}</Text>
          </View>
        )}
      </ScrollView>
      <PaymentSuccessOverlay
        visible={showSuccess}
        amount={lead.amount}
        customerName={lead.customerName}
        onDone={() => setShowSuccess(false)}
      />
      <PaymentFailedOverlay
        visible={failedReason !== null}
        reason={failedReason ?? ''}
        onDone={dismissFailedPayment}
      />
    </CrmScreen>
  );
}
