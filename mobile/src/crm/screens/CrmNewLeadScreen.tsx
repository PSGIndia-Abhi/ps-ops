import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertCircleIcon, EmailIcon, PersonIcon, UsersIcon, PhoneIcon, PinIcon, TagIcon } from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR } from '../format';
import { useLeads } from '../LeadsContext';
import { payForLead } from '../payment';
import { getHouseTypes, getPlans, getPrice, getServices } from '../serviceMaster';
import { ApiError, crmApi } from '../../api';
import { discountedAmount } from '../coupon';
import type { CrmStackParamList } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type LeadSource,
  type LeadStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../types';
import { normalizePhone, parseAmount, validateLead, type LeadFormErrors, type LeadFormValues } from '../validation';
import { ConfettiBurst, PaymentSuccessOverlay } from '../ui/Celebration';
import { CheckIcon, RupeeIcon } from '../ui/crmIcons';
import { CrmErrorBanner, CrmScreen } from '../ui/CrmScreen';
import { CrmTextField } from '../ui/CrmTextField';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SelectField } from '../ui/SelectField';
import { PaymentStatusBadge } from '../ui/StatusBadge';
import { TopBar } from '../ui/TopBar';

const factory = (t: CrmTheme) => ({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  section: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  sectionTitle: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm },
  formError: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.dangerBg,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  formErrorText: { ...typography.captionMedium, color: t.dangerText, flex: 1 },
  rupeePrefix: { marginRight: spacing.xs },
  amountInput: { ...typography.subtitle },
  applyPill: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  applyPillText: { ...typography.captionMedium, color: t.textOnPrimary },
  appliedPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xxs,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: t.successBg,
  },
  appliedText: { ...typography.captionMedium, color: t.successText },
  resetLink: { ...typography.captionMedium, color: t.primary, marginTop: -spacing.xs, marginBottom: spacing.md },
  subLabel: { ...typography.captionMedium, color: t.textSecondary, marginBottom: spacing.xxs },
  paymentBlock: { marginTop: spacing.md },
  paymentNote: { ...typography.caption, color: t.textMuted, marginTop: spacing.sm },
  onlineCard: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.primary,
    backgroundColor: t.primarySoftBg,
    padding: spacing.md,
  },
  onlineHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  onlineTitle: { ...typography.bodyMedium, color: t.textPrimary },
  onlineAmount: { ...typography.display, color: t.textPrimary, marginVertical: spacing.sm },
  footer: {
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.border,
    backgroundColor: t.surface,
  },
});

const INITIAL_VALUES: LeadFormValues = {
  customerName: '',
  phone: '',
  email: '',
  houseType: null,
  service: null,
  plan: null,
  amount: '',
  coupon: '',
  location: '',
  referenceBy: '',
  notes: '',
};

export function CrmNewLeadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const { addLead, replaceLead, showNotice, serviceMaster, loading: masterLoading, refresh } = useLeads();
  const { styles, theme } = useCrmStyles(factory);

  const [values, setValues] = useState<LeadFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [source, setSource] = useState<LeadSource | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('new');
  const [saving, setSaving] = useState(false);
  /** True while the saved lead is being paid (drives the spinner on the Razorpay button instead of Save). */
  const [paying, setPaying] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The coupon the server accepted (null until Apply succeeds; editing the code clears it). */
  const [coupon, setCoupon] = useState<{ code: string; percentage: number } | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [paidLead, setPaidLead] = useState<{ name: string; amount: number } | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const propertySectionY = useRef(0);

  const houseOptions = useMemo(() => getHouseTypes(serviceMaster).map((h) => ({ value: h, label: h })), [serviceMaster]);
  const serviceOptions = useMemo(() => getServices(serviceMaster).map((sv) => ({ value: sv, label: sv })), [serviceMaster]);
  const planOptions = useMemo(
    () => getPlans(serviceMaster, values.service).map((p) => ({ value: p, label: p })),
    [serviceMaster, values.service],
  );
  const standardPrice = getPrice(serviceMaster, values.service, values.houseType, values.plan);
  const masterMissing = !masterLoading && serviceMaster.length === 0;
  const amountNumber = parseAmount(values.amount);
  const expectedAmount =
    standardPrice === null ? null : coupon ? discountedAmount(standardPrice, coupon.percentage) : standardPrice;
  const customPrice = expectedAmount !== null && amountNumber !== expectedAmount;
  const hasErrors = Object.values(errors).some(Boolean);

  function setField<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /** House type / service / plan drive the price: any change re-fills the standard amount. */
  function applySelection(patch: Partial<Pick<LeadFormValues, 'houseType' | 'service' | 'plan'>>) {
    setValues((prev) => {
      const next = { ...prev, ...patch };
      if (patch.service !== undefined && !getPlans(serviceMaster, next.service).includes(next.plan ?? '')) {
        next.plan = null;
      }
      const price = getPrice(serviceMaster, next.service, next.houseType, next.plan);
      const payable = price !== null && coupon ? discountedAmount(price, coupon.percentage) : price;
      next.amount = payable !== null ? String(payable) : '';
      return next;
    });
    setErrors((prev) => ({ ...prev, houseType: undefined, service: undefined, plan: undefined, amount: undefined }));
  }

  async function applyCoupon() {
    const code = values.coupon.trim();
    if (!code) {
      setErrors((prev) => ({ ...prev, coupon: 'Enter a coupon code first.' }));
      return;
    }
    if (standardPrice === null) {
      setErrors((prev) => ({ ...prev, coupon: 'Choose house type, service and plan first.' }));
      return;
    }
    Keyboard.dismiss();
    setApplyingCoupon(true);
    try {
      const accepted = await crmApi.validateCoupon(code);
      setCoupon(accepted);
      setValues((prev) => ({
        ...prev,
        coupon: accepted.code,
        amount: String(discountedAmount(standardPrice, accepted.percentage)),
      }));
      setErrors((prev) => ({ ...prev, coupon: undefined, amount: undefined }));
      setConfettiKey((k) => k + 1);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        coupon: err instanceof ApiError ? err.message : 'Could not check the coupon. Please try again.',
      }));
    } finally {
      setApplyingCoupon(false);
    }
  }

  function handleCouponText(text: string) {
    setField('coupon', text);
    if (coupon) {
      // Editing an applied code takes the discount back off.
      setCoupon(null);
      if (standardPrice !== null) setField('amount', String(standardPrice));
    }
  }

  function finishAfterPayment() {
    setPaidLead(null);
    navigation.navigate('CrmTabs', { screen: 'Leads' });
  }

  function handleMethodChange(method: PaymentMethod) {
    setPaymentMethod(method);
    // Online is only "Paid" once Razorpay confirms it, so it always starts as pending.
    if (method === 'online') setPaymentStatus('pending');
  }

  /**
   * Saves the lead; with `payNow` it then opens Razorpay for it. The lead is always saved FIRST
   * (as Pending), so cancelling or a failed payment never loses it - it can be paid later from its
   * details screen, and pressing the button again can't create a duplicate.
   */
  async function submit(payNow: boolean) {
    if (saving) return;
    setSaveError(null);
    const found = validateLead(values);
    if (values.coupon.trim() && !coupon) {
      found.coupon = 'Tap Apply to use this coupon, or clear it.';
    }
    setErrors(found);
    const invalid = Object.keys(found);
    if (invalid.length > 0) {
      // Every required field is in the first two sections - bring the first one into view.
      const inCustomer = invalid.includes('customerName') || invalid.includes('phone');
      scrollRef.current?.scrollTo({ y: inCustomer ? 0 : propertySectionY.current, animated: true });
      return;
    }

    setSaving(true);
    setPaying(payNow);

    let saved;
    try {
      saved = await addLead({
        customerName: values.customerName.trim(),
        phone: normalizePhone(values.phone),
        email: values.email.trim(),
        houseType: values.houseType ?? '',
        service: values.service ?? '',
        plan: values.plan ?? '',
        amount: amountNumber,
        coupon: coupon?.code ?? '',
        location: values.location.trim(),
        source,
        referenceBy: values.referenceBy.trim(),
        notes: values.notes.trim(),
        paymentMethod,
        paymentStatus: paymentMethod === 'online' ? 'pending' : paymentStatus,
        leadStatus,
      });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Unable to save the lead. Please try again.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setSaving(false);
      setPaying(false);
      return;
    }

    if (payNow) {
      const outcome = await payForLead(saved);
      if (outcome.status === 'paid') {
        replaceLead(outcome.lead);
        showNotice(`Payment received - ${saved.customerName}`);
        setSaving(false);
        setPaying(false);
        setPaidLead({ name: saved.customerName, amount: outcome.lead.amount });
        return;
      } else if (outcome.status === 'cancelled') {
        showNotice('Lead saved - payment still pending. Open the lead to pay later.', 'warning');
      } else {
        showNotice(`Lead saved, but the payment did not go through: ${outcome.message}`, 'warning');
      }
    }

    setSaving(false);
    setPaying(false);
    navigation.navigate('CrmTabs', { screen: 'Leads' });
  }

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar title="New Lead" subtitle="Add a customer and their service" icon="close" onBack={() => navigation.goBack()} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CrmErrorBanner message={saveError} />
        {masterMissing && (
          <CrmErrorBanner message="The price list couldn't be loaded, so services can't be picked yet." onRetry={refresh} />
        )}
        {hasErrors && (
          <View style={styles.formError} accessibilityLiveRegion="polite">
            <AlertCircleIcon size={18} color={theme.dangerText} />
            <Text style={styles.formErrorText}>Please complete the highlighted fields.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Information</Text>
          <CrmTextField
            label="Customer Name"
            placeholder="Enter customer name"
            value={values.customerName}
            onChangeText={(text) => setField('customerName', text)}
            error={errors.customerName}
            icon={<PersonIcon size={18} color={theme.textMuted} />}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <CrmTextField
            label="Phone"
            placeholder="10-digit mobile number"
            value={values.phone}
            onChangeText={(text) => setField('phone', text)}
            error={errors.phone}
            icon={<PhoneIcon size={18} color={theme.textMuted} />}
            keyboardType="phone-pad"
            maxLength={15}
          />
          <CrmTextField
            label="Email (optional)"
            placeholder="customer@example.com"
            value={values.email}
            onChangeText={(text) => setField('email', text)}
            error={errors.email}
            icon={<EmailIcon size={18} color={theme.textMuted} />}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View
          style={styles.section}
          onLayout={(e) => {
            propertySectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.sectionTitle}>Property & Service</Text>
          <SelectField
            label="House Type"
            placeholder={masterLoading ? 'Loading price list...' : 'Select house type'}
            disabled={masterLoading}
            options={houseOptions}
            value={values.houseType}
            onChange={(value) => applySelection({ houseType: value })}
            error={errors.houseType}
          />
          <SelectField
            label="Service"
            placeholder={masterLoading ? 'Loading price list...' : 'Select service'}
            disabled={masterLoading}
            options={serviceOptions}
            value={values.service}
            onChange={(value) => applySelection({ service: value })}
            error={errors.service}
          />
          <SelectField
            label="Plan"
            placeholder={values.service ? 'Select plan' : 'Select a service first'}
            options={planOptions}
            value={values.plan}
            onChange={(value) => applySelection({ plan: value })}
            error={errors.plan}
            disabled={!values.service}
          />
          <CrmTextField
            label="Amount"
            placeholder="0"
            value={values.amount}
            onChangeText={(text) => setField('amount', text.replace(/[^0-9]/g, ''))}
            error={errors.amount}
            hint={
              standardPrice === null || expectedAmount === null
                ? 'Choose house type, service and plan to fill the price automatically.'
                : customPrice
                  ? `Custom price. ${coupon ? 'With the coupon' : 'Standard price'} is ${formatINR(expectedAmount)}.`
                  : coupon
                    ? `${coupon.code}: ${coupon.percentage}% off ${formatINR(standardPrice)} - you save ${formatINR(standardPrice - expectedAmount)}.`
                    : 'Filled from the price list. You can change it for a negotiated price.'
            }
            icon={<RupeeIcon size={20} color={theme.textPrimary} />}
            keyboardType="number-pad"
            style={styles.amountInput}
            maxLength={7}
          />
          {customPrice && expectedAmount !== null && (
            <Pressable onPress={() => setField('amount', String(expectedAmount))} hitSlop={8} accessibilityRole="button">
              <Text style={styles.resetLink}>Reset to {formatINR(expectedAmount)}</Text>
            </Pressable>
          )}
          <CrmTextField
            label="Coupon Code"
            placeholder="Enter coupon code"
            value={values.coupon}
            onChangeText={handleCouponText}
            error={errors.coupon}
            icon={<TagIcon size={18} color={theme.textMuted} />}
            autoCapitalize="characters"
            autoCorrect={false}
            accessory={
              coupon ? (
                <View style={styles.appliedPill}>
                  <CheckIcon size={14} color={theme.successText} />
                  <Text style={styles.appliedText}>Applied</Text>
                </View>
              ) : (
                <Pressable
                  onPress={applyCoupon}
                  disabled={applyingCoupon}
                  accessibilityRole="button"
                  accessibilityLabel="Apply coupon"
                  style={({ pressed }) => [styles.applyPill, pressed && { opacity: 0.85 }]}
                  testID="apply-coupon"
                >
                  <Text style={styles.applyPillText}>{applyingCoupon ? '...' : 'Apply'}</Text>
                </Pressable>
              )
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lead Details</Text>
          <CrmTextField
            label="Location"
            placeholder="Enter customer location"
            value={values.location}
            onChangeText={(text) => setField('location', text)}
            icon={<PinIcon size={18} color={theme.textMuted} />}
          />
          <SelectField
            label="Lead Source"
            placeholder="Select lead source"
            options={LEAD_SOURCES}
            value={source}
            onChange={setSource}
          />
          <CrmTextField
            label="Reference By"
            placeholder="Who referred this lead? (optional)"
            value={values.referenceBy}
            onChangeText={(text) => setField('referenceBy', text)}
            icon={<UsersIcon size={18} color={theme.textMuted} />}
            autoCapitalize="words"
            maxLength={100}
          />
          <SelectField
            label="Lead Status"
            placeholder="Select lead status"
            options={LEAD_STATUSES}
            value={leadStatus}
            onChange={setLeadStatus}
          />
          <CrmTextField
            label="Notes"
            placeholder="Add any additional information..."
            value={values.notes}
            onChangeText={(text) => setField('notes', text)}
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <Text style={styles.subLabel}>Payment Method</Text>
          <SegmentedControl options={PAYMENT_METHODS} value={paymentMethod} onChange={handleMethodChange} />

          {paymentMethod === 'online' ? (
            <View style={styles.onlineCard}>
              <View style={styles.onlineHeader}>
                <Text style={styles.onlineTitle}>Online Payment</Text>
                <PaymentStatusBadge status="pending" />
              </View>
              <Text style={styles.onlineAmount}>{formatINR(amountNumber)}</Text>
              <PrimaryButton
                label="Pay with Razorpay"
                variant="brand"
                loading={saving && paying}
                disabled={amountNumber <= 0 || masterMissing || (saving && !paying)}
                onPress={() => submit(true)}
                testID="pay-razorpay"
              />
              <Text style={styles.paymentNote}>
                The lead is saved first, then Razorpay opens. It shows Paid once Razorpay confirms the payment.
              </Text>
            </View>
          ) : (
            <View style={styles.paymentBlock}>
              <Text style={styles.subLabel}>Payment Status</Text>
              <SegmentedControl options={PAYMENT_STATUSES} value={paymentStatus} onChange={setPaymentStatus} />
              <Text style={styles.paymentNote}>
                {paymentMethod === 'cash'
                  ? `Cash payment of ${formatINR(amountNumber)} to be collected from the customer.`
                  : `Payment of ${formatINR(amountNumber)} will be recorded as "Other".`}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={paymentMethod === 'online' ? 'Save Lead (pay later)' : 'Save Lead'}
          onPress={() => submit(false)}
          loading={saving && !paying}
          disabled={masterMissing || (saving && paying)}
          testID="save-lead"
        />
      </View>

      <ConfettiBurst burstKey={confettiKey} originY={0.5} />
      <PaymentSuccessOverlay
        visible={paidLead !== null}
        amount={paidLead?.amount ?? 0}
        customerName={paidLead?.name ?? ''}
        onDone={finishAfterPayment}
      />
    </CrmScreen>
  );
}
