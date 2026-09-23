import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
  EmailIcon,
  ExternalLinkIcon,
  HomeIcon,
  PersonIcon,
  PinIcon,
  SparkleIcon,
  TagIcon,
  UsersIcon,
} from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { formatINR } from '../format';
import { useAuth } from '../../auth/AuthContext';
import {
  clearDraft,
  isDraftEmpty,
  loadDraft,
  loadLastSource,
  saveDraft,
  saveLastSource,
} from '../draft';
import { findLeadByPhone, suggestReferences } from '../leadHelpers';
import { useLeads } from '../LeadsContext';
import { payForLead } from '../payment';
import {
  getHouseTypes,
  getPlans,
  getPrice,
  getServices,
} from '../serviceMaster';
import { ApiError } from '../../api';
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
import {
  cleanPhoneInput,
  normalizePhone,
  parseAmount,
  validateLead,
  type LeadFormErrors,
  type LeadFormValues,
} from '../validation';
import { ContactPickerSheet } from '../ui/ContactPickerSheet';
import { PaymentFailedOverlay, PaymentSuccessOverlay } from '../ui/Celebration';
import { RupeeIcon, WalletIcon } from '../ui/crmIcons';
import { SectionHeader } from '../ui/LeadFormParts';
import { PestIcon } from '../ui/PestIcon';
import { CrmErrorBanner, CrmScreen } from '../ui/CrmScreen';
import { CrmTextField } from '../ui/CrmTextField';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SelectField } from '../ui/SelectField';
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
  sectionTitle: {
    ...typography.overline,
    color: t.textMuted,
    marginBottom: spacing.sm,
  },
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
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  bannerWarn: { backgroundColor: t.warningBg },
  bannerInfo: { backgroundColor: t.primarySoftBg },
  bannerText: { ...typography.captionMedium, flex: 1 },
  bannerTextWarn: { color: t.warningText },
  bannerTextInfo: { color: t.primary },
  bannerAction: { ...typography.captionMedium, color: t.primary },
  contactsPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
  },
  contactsPillText: { ...typography.captionMedium, color: t.primary },
  suggestRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  suggestChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: t.surfaceAlt,
    borderWidth: 1,
    borderColor: t.border,
  },
  suggestText: { ...typography.captionMedium, color: t.textSecondary },
  resetLink: {
    ...typography.captionMedium,
    color: t.primary,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  subLabel: {
    ...typography.captionMedium,
    color: t.textSecondary,
    marginBottom: spacing.xxs,
  },
  paymentBlock: { marginTop: spacing.md },
  paymentNote: {
    ...typography.caption,
    color: t.textMuted,
    marginTop: spacing.sm,
  },
  onlineNote: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.sm,
  },
  onlineCard: {
    marginTop: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: t.primary,
    padding: spacing.lg,
    overflow: 'hidden' as const,
    ...t.raisedShadow,
  },
  onlineBlobA: {
    position: 'absolute' as const,
    right: -30,
    top: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  onlineBlobB: {
    position: 'absolute' as const,
    left: -24,
    bottom: -44,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  onlineHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  onlineTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  onlineIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  onlineTitle: { ...typography.bodyMedium, color: '#FFFFFF' },
  onlinePendingPill: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  onlinePendingText: { ...typography.captionMedium, color: '#FFFFFF' },
  onlineAmountLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing.md,
  },
  onlineAmount: {
    ...typography.display,
    color: '#FFFFFF',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  onlineButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  onlineButtonText: { ...typography.bodyMedium, color: t.primary },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.border,
    backgroundColor: t.surface,
  },
  footerSummary: { flex: 1 },
  footerCaption: { ...typography.caption, color: t.textMuted },
  footerAmount: { ...typography.display, fontSize: 26, color: t.textPrimary },
  footerButton: { flex: 1.15 },
});

const INITIAL_VALUES: LeadFormValues = {
  customerName: '',
  phone: '',
  email: '',
  houseType: null,
  service: null,
  plan: null,
  amount: '',
  location: '',
  referenceBy: '',
  notes: '',
};

export function CrmNewLeadScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const {
    leads,
    addLead,
    replaceLead,
    showNotice,
    serviceMaster,
    loading: masterLoading,
    refresh,
  } = useLeads();
  const { session } = useAuth();
  const scope = session?.userId ?? 'anon';
  const { styles, theme } = useCrmStyles(factory);

  const [values, setValues] = useState<LeadFormValues>(INITIAL_VALUES);
  const latest = useRef<LeadFormValues>(INITIAL_VALUES);
  latest.current = values;
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [source, setSource] = useState<LeadSource | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('new');
  const [saving, setSaving] = useState(false);
  /** True while the saved lead is being paid (drives the spinner on the Razorpay button instead of Save). */
  const [paying, setPaying] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [paidLead, setPaidLead] = useState<{
    name: string;
    amount: number;
  } | null>(null);
  const [failedPayment, setFailedPayment] = useState<{ reason: string } | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const propertySectionY = useRef(0);
  const nameRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const phoneRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const emailRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const amountRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const locationRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const referenceRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  /** Fields the user has left at least once - checked (and ticked or explained) as they go. */
  const [touched, setTouched] = useState<
    Partial<Record<keyof LeadFormValues, boolean>>
  >({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [referenceFocused, setReferenceFocused] = useState(false);
  const [dismissedDuplicate, setDismissedDuplicate] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  /** Set once the lead is saved so the draft is not written back after it was cleared. */
  const submitted = useRef(false);

  // Bring back an unfinished lead (or at least the last lead source) when the form opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadDraft(scope);
      if (cancelled) return;
      if (draft && !isDraftEmpty(draft)) {
        setValues({ ...INITIAL_VALUES, ...draft.values });
        setSource((draft.source as LeadSource | null) ?? null);
        setPaymentMethod(draft.paymentMethod);
        setPaymentStatus(draft.paymentStatus);
        setLeadStatus(draft.leadStatus);
        setDraftRestored(true);
      } else {
        const last = await loadLastSource(scope);
        if (!cancelled && last) setSource(last as LeadSource);
      }
      if (!cancelled) setDraftReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  // Keep the draft up to date (a moment after typing stops) so nothing is lost if the app closes.
  useEffect(() => {
    if (!draftReady) return;
    const timer = setTimeout(() => {
      if (submitted.current) return;
      const draft = {
        values,
        source,
        paymentMethod,
        paymentStatus,
        leadStatus,
      };
      if (isDraftEmpty(draft)) clearDraft(scope);
      else saveDraft(scope, draft);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    draftReady,
    scope,
    values,
    source,
    paymentMethod,
    paymentStatus,
    leadStatus,
  ]);

  const houseOptions = useMemo(
    () => getHouseTypes(serviceMaster).map(h => ({ value: h, label: h })),
    [serviceMaster],
  );
  const serviceOptions = useMemo(
    () => getServices(serviceMaster).map(sv => ({ value: sv, label: sv })),
    [serviceMaster],
  );
  const planOptions = useMemo(
    () =>
      getPlans(serviceMaster, values.service).map(p => ({
        value: p,
        label: p,
      })),
    [serviceMaster, values.service],
  );
  const standardPrice = getPrice(
    serviceMaster,
    values.service,
    values.houseType,
    values.plan,
  );
  const masterMissing = !masterLoading && serviceMaster.length === 0;
  const amountNumber = parseAmount(values.amount);
  const expectedAmount = standardPrice;
  const customPrice =
    expectedAmount !== null && amountNumber !== expectedAmount;
  const hasErrors = Object.values(errors).some(Boolean);

  const duplicate = useMemo(
    () => findLeadByPhone(leads, values.phone),
    [leads, values.phone],
  );
  const showDuplicate =
    !!duplicate && dismissedDuplicate !== normalizePhone(values.phone);
  const referenceSuggestions = useMemo(
    () =>
      referenceFocused ? suggestReferences(leads, values.referenceBy) : [],
    [leads, values.referenceBy, referenceFocused],
  );

  /** Checks a field as the user leaves it: the error appears right there, not only on Save. */
  function checkField(key: keyof LeadFormValues) {
    setTouched(prev => ({ ...prev, [key]: true }));
    // `latest` already holds the last keystroke even if React has not re-rendered yet (fast typing / Enter).
    const message = validateLead(latest.current)[key];
    setErrors(prev =>
      prev[key] === message ? prev : { ...prev, [key]: message },
    );
  }

  const isGood = (key: keyof LeadFormValues) =>
    !!touched[key] &&
    !errors[key] &&
    String(values[key] ?? '').trim().length > 0 &&
    !validateLead(values)[key];

  function handlePhoneChange(text: string) {
    const phone = cleanPhoneInput(text);
    setField('phone', phone);
    // Check as soon as the tenth digit is in, so the tick (or the problem) shows straight away.
    if (phone.length === 10) {
      setTouched(prev => ({ ...prev, phone: true }));
      setErrors(prev => ({
        ...prev,
        phone: validateLead({ ...values, phone }).phone,
      }));
    }
  }

  function applyContact(contact: { name: string; phone: string }) {
    setValues(prev => ({
      ...prev,
      phone: contact.phone,
      customerName: prev.customerName.trim() ? prev.customerName : contact.name,
    }));
    setTouched(prev => ({ ...prev, phone: true, customerName: true }));
    setErrors(prev => ({ ...prev, phone: undefined, customerName: undefined }));
  }

  function startFresh() {
    submitted.current = false;
    setValues(INITIAL_VALUES);
    setErrors({});
    setTouched({});
    setPaymentMethod('cash');
    setPaymentStatus('pending');
    setLeadStatus('new');
    setDraftRestored(false);
    clearDraft(scope);
    loadLastSource(scope).then(last =>
      setSource((last as LeadSource | null) ?? null),
    );
  }

  function setField<K extends keyof LeadFormValues>(
    key: K,
    value: LeadFormValues[K],
  ) {
    latest.current = { ...latest.current, [key]: value };
    setValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /** House type / service / plan drive the price: any change re-fills the standard amount. */
  function applySelection(
    patch: Partial<Pick<LeadFormValues, 'houseType' | 'service' | 'plan'>>,
  ) {
    setValues(prev => {
      const next = { ...prev, ...patch };
      if (
        patch.service !== undefined &&
        !getPlans(serviceMaster, next.service).includes(next.plan ?? '')
      ) {
        next.plan = null;
      }
      const price = getPrice(
        serviceMaster,
        next.service,
        next.houseType,
        next.plan,
      );
      next.amount = price !== null ? String(price) : '';
      return next;
    });
    setErrors(prev => ({
      ...prev,
      houseType: undefined,
      service: undefined,
      plan: undefined,
      amount: undefined,
    }));
  }

  const savedLeadId = useRef<string | null>(null);

  /** Leaves the form for the "Saved" screen, where the rep can call, WhatsApp or add another lead. */
  function openSavedScreen(leadId: string, note?: string) {
    navigation.replace('CrmLeadSaved', { leadId, note });
  }

  function finishAfterPayment() {
    setPaidLead(null);
    if (savedLeadId.current) openSavedScreen(savedLeadId.current);
  }

  function finishAfterFailedPayment() {
    const note = failedPayment?.reason;
    setFailedPayment(null);
    if (savedLeadId.current) openSavedScreen(savedLeadId.current, note);
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
    setErrors(found);
    const invalid = Object.keys(found);
    if (invalid.length > 0) {
      // Every required field is in the first two sections - bring the first one into view.
      const inCustomer =
        invalid.includes('customerName') || invalid.includes('phone');
      scrollRef.current?.scrollTo({
        y: inCustomer ? 0 : propertySectionY.current,
        animated: true,
      });
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
        coupon: '',
        location: values.location.trim(),
        source,
        referenceBy: values.referenceBy.trim(),
        notes: values.notes.trim(),
        paymentMethod,
        paymentStatus: paymentMethod === 'online' ? 'pending' : paymentStatus,
        leadStatus,
      });
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err.message
          : 'Unable to save the lead. Please try again.',
      );
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setSaving(false);
      setPaying(false);
      return;
    }

    // Saved (on the server, or on this phone if there is no connection): the draft has done its job.
    submitted.current = true;
    savedLeadId.current = saved.id;
    clearDraft(scope);
    if (source) saveLastSource(scope, source);

    let note: string | undefined;
    if (saved.pendingSync) {
      note = payNow
        ? 'No connection, so the payment could not start. Once the lead is sent, open it to pay online.'
        : undefined;
    } else if (payNow) {
      const outcome = await payForLead(saved);
      if (outcome.status === 'paid') {
        replaceLead(outcome.lead);
        showNotice(`Payment received - ${saved.customerName}`);
        setSaving(false);
        setPaying(false);
        setPaidLead({ name: saved.customerName, amount: outcome.lead.amount });
        return;
      } else if (outcome.status === 'cancelled') {
        setSaving(false);
        setPaying(false);
        setFailedPayment({
          reason:
            'Payment is still pending. Open the lead to pay online whenever the customer is ready.',
        });
        return;
      } else {
        setSaving(false);
        setPaying(false);
        setFailedPayment({ reason: `The payment did not go through: ${outcome.message}` });
        return;
      }
    }

    setSaving(false);
    setPaying(false);
    openSavedScreen(saved.id, note);
  }

  const summaryText = values.service ?? 'Pick a service';

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar
        title="New Lead"
        subtitle="Add a customer and their service"
        icon="close"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {draftRestored && (
          <View style={[styles.banner, styles.bannerInfo]}>
            <Text style={[styles.bannerText, styles.bannerTextInfo]}>
              We restored the lead you were filling in.
            </Text>
            <Pressable
              onPress={startFresh}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.bannerAction}>Start fresh</Text>
            </Pressable>
          </View>
        )}
        <CrmErrorBanner message={saveError} />
        {masterMissing && (
          <CrmErrorBanner
            message="The price list couldn't be loaded, so services can't be picked yet."
            onRetry={refresh}
          />
        )}
        {hasErrors && (
          <View style={styles.formError} accessibilityLiveRegion="polite">
            <AlertCircleIcon size={18} color={theme.dangerText} />
            <Text style={styles.formErrorText}>
              Please complete the highlighted fields.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader
            icon={<PersonIcon size={20} color={theme.primary} />}
            title="Add Lead"
          />
          <CrmTextField
            ref={nameRef}
            label="Customer Name"
            placeholder="Enter customer name"
            value={values.customerName}
            onChangeText={text => setField('customerName', text)}
            onBlur={() => checkField('customerName')}
            error={errors.customerName}
            valid={isGood('customerName')}
            icon={<PersonIcon size={18} color={theme.textMuted} />}
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
          <CrmTextField
            ref={phoneRef}
            label="Mobile Number"
            placeholder="Mobile number"
            value={values.phone}
            onChangeText={handlePhoneChange}
            onBlur={() => checkField('phone')}
            error={errors.phone}
            valid={isGood('phone')}
            prefix="+91"
            keyboardType="phone-pad"
            autoComplete="tel"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            accessory={
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setPickerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose from contacts"
                style={({ pressed }) => [
                  styles.contactsPill,
                  pressed && { opacity: 0.8 },
                ]}
                testID="pick-contact"
              >
                <UsersIcon size={15} color={theme.primary} />
                <Text style={styles.contactsPillText}>Contacts</Text>
              </Pressable>
            }
          />
          {showDuplicate && duplicate && (
            <View
              style={[styles.banner, styles.bannerWarn]}
              accessibilityLiveRegion="polite"
            >
              <Text style={[styles.bannerText, styles.bannerTextWarn]}>
                Already a lead: {duplicate.customerName} (
                {duplicate.paymentStatus === 'paid'
                  ? 'Paid'
                  : 'Payment pending'}
                ). Open it?
              </Text>
              <Pressable
                onPress={() =>
                  navigation.navigate('CrmLeadDetail', { leadId: duplicate.id })
                }
                hitSlop={8}
                accessibilityRole="button"
                testID="open-duplicate"
              >
                <Text style={styles.bannerAction}>Open</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setDismissedDuplicate(normalizePhone(values.phone))
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={styles.bannerAction}>Ignore</Text>
              </Pressable>
            </View>
          )}
          <CrmTextField
            ref={emailRef}
            label="Email (optional)"
            placeholder="customer@example.com"
            value={values.email}
            onChangeText={text => setField('email', text)}
            onBlur={() => checkField('email')}
            error={errors.email}
            valid={isGood('email')}
            icon={<EmailIcon size={18} color={theme.textMuted} />}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="done"
          />
        </View>

        <View
          style={styles.section}
          onLayout={e => {
            propertySectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <SectionHeader
            icon={<HomeIcon size={20} color={theme.primary} />}
            title="Property & Service"
          />
          <SelectField
            label="House Type"
            icon={<HomeIcon size={18} color={theme.textMuted} />}
            placeholder={
              masterLoading ? 'Loading price list...' : 'Select house type'
            }
            disabled={masterLoading}
            options={houseOptions}
            value={values.houseType}
            onChange={value => applySelection({ houseType: value })}
            error={errors.houseType}
          />
          <SelectField
            label="Service"
            icon={
              <PestIcon
                service={values.service ?? ''}
                size={19}
                color={theme.textMuted}
              />
            }
            placeholder={
              masterLoading ? 'Loading price list...' : 'Select service'
            }
            disabled={masterLoading}
            options={serviceOptions}
            value={values.service}
            onChange={value => applySelection({ service: value })}
            error={errors.service}
          />
          <SelectField
            label="Plan"
            icon={<TagIcon size={18} color={theme.textMuted} />}
            placeholder={
              values.service ? 'Select plan' : 'Select a service first'
            }
            options={planOptions}
            value={values.plan}
            onChange={value => applySelection({ plan: value })}
            error={errors.plan}
            disabled={!values.service}
          />
          <CrmTextField
            ref={amountRef}
            label="Amount"
            placeholder="0"
            value={values.amount}
            onChangeText={text =>
              setField('amount', text.replace(/[^0-9]/g, ''))
            }
            onBlur={() => checkField('amount')}
            error={errors.amount}
            valid={isGood('amount')}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            hint={
              standardPrice === null || expectedAmount === null
                ? 'Choose house type, service and plan to fill the price automatically.'
                : customPrice
                ? `Custom price. Standard price is ${formatINR(expectedAmount)}.`
                : 'Filled from the price list. You can change it for a negotiated price.'
            }
            icon={<RupeeIcon size={20} color={theme.textPrimary} />}
            keyboardType="number-pad"
            style={styles.amountInput}
            maxLength={7}
          />
          {customPrice && expectedAmount !== null && (
            <Pressable
              onPress={() => setField('amount', String(expectedAmount))}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.resetLink}>
                Reset to {formatINR(expectedAmount)}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            icon={<TagIcon size={20} color={theme.primary} />}
            title="Lead Details"
          />
          <CrmTextField
            ref={locationRef}
            label="Location"
            placeholder="Enter customer location"
            value={values.location}
            onChangeText={text => setField('location', text)}
            icon={<PinIcon size={18} color={theme.textMuted} />}
            returnKeyType="next"
            onSubmitEditing={() => referenceRef.current?.focus()}
          />
          <SelectField
            label="Lead Source"
            icon={<ExternalLinkIcon size={18} color={theme.textMuted} />}
            placeholder="Select lead source"
            options={LEAD_SOURCES}
            value={source}
            onChange={setSource}
          />
          <CrmTextField
            ref={referenceRef}
            label="Reference By"
            placeholder="Who referred this lead? (optional)"
            value={values.referenceBy}
            onChangeText={text => setField('referenceBy', text)}
            icon={<UsersIcon size={18} color={theme.textMuted} />}
            autoCapitalize="words"
            maxLength={100}
            returnKeyType="done"
            onFocus={() => setReferenceFocused(true)}
            onBlur={() => setReferenceFocused(false)}
          />
          {referenceSuggestions.length > 0 && (
            <View style={styles.suggestRow}>
              {referenceSuggestions.map(name => (
                <Pressable
                  key={name}
                  onPress={() => setField('referenceBy', name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${name}`}
                  style={styles.suggestChip}
                >
                  <Text style={styles.suggestText}>{name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <SelectField
            label="Lead Status"
            icon={<SparkleIcon size={18} color={theme.textMuted} />}
            placeholder="Select lead status"
            options={LEAD_STATUSES}
            value={leadStatus}
            onChange={setLeadStatus}
          />
          <CrmTextField
            label="Notes"
            icon={<DocumentIcon size={18} color={theme.textMuted} />}
            placeholder="Add any additional information..."
            value={values.notes}
            onChangeText={text => setField('notes', text)}
            multiline
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            icon={<WalletIcon size={20} color={theme.primary} />}
            title="Payment"
          />
          <Text style={styles.subLabel}>Payment Method</Text>
          <SegmentedControl
            options={PAYMENT_METHODS}
            value={paymentMethod}
            onChange={handleMethodChange}
            renderIcon={(method, color) =>
              method === 'cash' ? (
                <RupeeIcon size={16} color={color} />
              ) : method === 'online' ? (
                <WalletIcon size={16} color={color} />
              ) : (
                <DocumentIcon size={16} color={color} />
              )
            }
          />

          {paymentMethod === 'online' ? (
            <View style={styles.onlineCard}>
              <View style={styles.onlineBlobA} />
              <View style={styles.onlineBlobB} />
              <View style={styles.onlineHeader}>
                <View style={styles.onlineTitleRow}>
                  <View style={styles.onlineIconWrap}>
                    <WalletIcon size={18} color="#FFFFFF" />
                  </View>
                  <Text style={styles.onlineTitle}>Online Payment</Text>
                </View>
                <View style={styles.onlinePendingPill}>
                  <Text style={styles.onlinePendingText}>Pending</Text>
                </View>
              </View>
              <Text style={styles.onlineAmountLabel}>Amount to collect</Text>
              <Text style={styles.onlineAmount}>{formatINR(amountNumber)}</Text>
              <Pressable
                onPress={() => submit(true)}
                disabled={
                  amountNumber <= 0 || masterMissing || (saving && !paying)
                }
                accessibilityRole="button"
                testID="pay-razorpay"
                style={({ pressed }) => [
                  styles.onlineButton,
                  (pressed ||
                    amountNumber <= 0 ||
                    masterMissing ||
                    (saving && !paying)) && { opacity: 0.85 },
                ]}
              >
                {saving && paying ? (
                  <ActivityIndicator color={theme.primary} />
                ) : (
                  <>
                    <RupeeIcon size={18} color={theme.primary} />
                    <Text style={styles.onlineButtonText}>
                      Pay with Razorpay
                    </Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.onlineNote}>
                The lead is saved first, then Razorpay opens. It shows Paid
                once Razorpay confirms the payment.
              </Text>
            </View>
          ) : (
            <View style={styles.paymentBlock}>
              <Text style={styles.subLabel}>Payment Status</Text>
              <SegmentedControl
                options={PAYMENT_STATUSES}
                value={paymentStatus}
                onChange={setPaymentStatus}
                renderIcon={(status, color) =>
                  status === 'paid' ? (
                    <CheckCircleIcon size={16} color={color} />
                  ) : (
                    <ClockIcon size={16} color={color} />
                  )
                }
              />
              <Text style={styles.paymentNote}>
                {paymentMethod === 'cash'
                  ? `Cash payment of ${formatINR(
                      amountNumber,
                    )} to be collected from the customer.`
                  : `Payment of ${formatINR(
                      amountNumber,
                    )} will be recorded as "Other".`}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerCaption} numberOfLines={1}>
            {summaryText}
          </Text>
          <Text style={styles.footerAmount}>{formatINR(amountNumber)}</Text>
        </View>
        <View style={styles.footerButton}>
          <PrimaryButton
            label={
              paymentMethod === 'online' ? 'Save (pay later)' : 'Save Lead'
            }
            onPress={() => submit(false)}
            loading={saving && !paying}
            disabled={masterMissing || (saving && paying)}
            testID="save-lead"
          />
        </View>
      </View>

      <ContactPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={applyContact}
      />
      <PaymentSuccessOverlay
        visible={paidLead !== null}
        amount={paidLead?.amount ?? 0}
        customerName={paidLead?.name ?? ''}
        onDone={finishAfterPayment}
      />
      <PaymentFailedOverlay
        visible={failedPayment !== null}
        reason={failedPayment?.reason ?? ''}
        onDone={finishAfterFailedPayment}
      />
    </CrmScreen>
  );
}
