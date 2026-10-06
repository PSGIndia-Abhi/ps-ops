import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircleIcon,
  BriefcaseIcon,
  CameraIcon,
  CheckCircleIcon,
  DocumentIcon,
  EmailIcon,
  ExternalLinkIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  TagIcon,
  UsersIcon,
} from '../../components/icons';
import { ApiError, crmApi } from '../../api';
import { radii, spacing, typography } from '../../theme';
import { getCurrentLocation } from '../../utils/location';
import { reverseGeocode } from '../../utils/reverseGeocode';
import { formatINR } from '../format';
import { useLeads } from '../LeadsContext';
import type { CrmStackParamList } from '../navigation';
import { useCrmStyles, type CrmTheme } from '../theme';
import {
  COMMERCIAL_LEAD_SOURCES,
  COMMERCIAL_SERVICES,
  INDUSTRY_TYPES,
  LEAD_STATUSES,
  LEAD_TYPES,
  MAX_LEAD_PHOTOS,
  optionLabel,
  servicesLabel,
  type CommercialService,
  type IndustryType,
  type Lead,
  type LeadPhoto,
  type LeadSource,
  type LeadStatus,
  type LeadType,
  type LocalLeadPhoto,
  type NewLeadInput,
} from '../types';
import {
  cleanPhoneInput,
  normalizePhone,
  parseAmount,
  validateCommercialLead,
  type CommercialLeadFormErrors,
  type CommercialLeadFormValues,
} from '../validation';
import { ContactPickerSheet } from '../ui/ContactPickerSheet';
import { CheckIcon, RupeeIcon } from '../ui/crmIcons';
import { CrmErrorBanner, CrmScreen } from '../ui/CrmScreen';
import { CrmTextField } from '../ui/CrmTextField';
import { SectionHeader } from '../ui/LeadFormParts';
import { LeadPhotoPicker, LocalLeadPhotos, SavedLeadPhotos } from '../ui/LeadPhotos';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SelectField } from '../ui/SelectField';
import { TopBar } from '../ui/TopBar';

const factory = (t: CrmTheme) => ({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  typeSwitch: { marginBottom: spacing.md },
  section: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
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
  amountInput: { ...typography.subtitle },

  fieldLabel: {
    ...typography.captionMedium,
    color: t.textSecondary,
    marginBottom: spacing.xxs,
  },
  fieldError: {
    ...typography.caption,
    color: t.dangerText,
    marginTop: spacing.xxs,
  },
  locationBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  locationBoxOk: { backgroundColor: t.successBg },
  locationBoxFailed: { backgroundColor: t.warningBg },
  locationText: { flex: 1 },
  locationTitle: { ...typography.bodyMedium, color: t.textPrimary },
  locationSub: { ...typography.caption, color: t.textSecondary, marginTop: 1 },
  locationAction: { ...typography.captionMedium, color: t.primary },
  locationGap: { marginBottom: spacing.md },
  typeLink: {
    ...typography.captionMedium,
    color: t.primary,
    marginTop: spacing.sm,
  },
  addressWrap: { marginTop: spacing.md },

  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  chipOn: { borderColor: t.primary, backgroundColor: t.primary },
  chipText: { ...typography.captionMedium, color: t.textSecondary },
  chipTextOn: { color: t.textOnPrimary },
  chipsWrap: { marginBottom: spacing.md },

  reviewIntro: {
    ...typography.body,
    color: t.textSecondary,
    marginBottom: spacing.md,
  },
  reviewHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.xs,
  },
  reviewTitle: { ...typography.overline, color: t.primary },
  reviewEdit: { ...typography.captionMedium, color: t.primary },
  reviewRow: { paddingVertical: spacing.sm },
  reviewDivider: { borderTopWidth: 1, borderTopColor: t.border },
  reviewLabel: { ...typography.captionMedium, color: t.textMuted },
  reviewValue: { ...typography.body, color: t.textPrimary, marginTop: 2 },
  reviewValueStrong: { ...typography.subtitle, color: t.textPrimary },
  reviewValueEmpty: { color: t.textMuted },
  reviewPhotos: { paddingTop: spacing.sm },
  footer: {
    flexDirection: 'row' as const,
    gap: spacing.md,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.border,
    backgroundColor: t.surface,
  },
  footerButton: { flex: 1 },
  footerButtonWide: { flex: 1.6 },
});

const INITIAL_VALUES: CommercialLeadFormValues = {
  industryType: null,
  companyName: '',
  address: '',
  customerName: '',
  designation: '',
  phone: '',
  alternatePhone: '',
  email: '',
  source: null,
  referenceBy: '',
  services: [],
  amount: '',
  notes: '',
};

type Step = 'details' | 'review';

/** The form's values for a lead that is being edited. */
function valuesOf(lead: Lead): CommercialLeadFormValues {
  return {
    industryType: lead.industryType ?? null,
    companyName: lead.companyName ?? '',
    address: lead.location ?? '',
    customerName: lead.customerName,
    designation: lead.designation ?? '',
    phone: lead.phone,
    alternatePhone: lead.alternatePhone ?? '',
    email: lead.email ?? '',
    source: lead.source,
    referenceBy: lead.referenceBy ?? '',
    services: lead.servicesRequested ?? [],
    amount: lead.amount > 0 ? String(Math.round(lead.amount)) : '',
    notes: lead.notes ?? '',
  };
}

/** Where the phone is: read automatically when the form opens. */
type LocationState =
  | { status: 'locating' }
  | { status: 'ok'; latitude: number; longitude: number; accuracy: number | null }
  | { status: 'failed' };

/** One field on the review step. An optional field left blank still shows, as "Not provided". */
function ReviewRow({
  label,
  value,
  first,
  strong,
}: {
  label: string;
  value: string;
  first?: boolean;
  /** For the one figure worth standing out (the quote). */
  strong?: boolean;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={[styles.reviewRow, !first && styles.reviewDivider]}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text
        style={[
          styles.reviewValue,
          strong && styles.reviewValueStrong,
          !value && styles.reviewValueEmpty,
        ]}
      >
        {value || 'Not provided'}
      </Text>
    </View>
  );
}

/** A review card: the same heading the form used for these fields, with an Edit link back to them. */
function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.section}>
      <View style={styles.reviewHead}>
        <Text style={styles.reviewTitle}>{title}</Text>
        <Pressable
          onPress={onEdit}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title.toLowerCase()}`}
        >
          <Text style={styles.reviewEdit}>Edit</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

/**
 * New commercial lead: a business enquiry. Two steps - fill in the details, then review and save.
 * There is no house type / plan and no payment here; the amount is only an approximate quote.
 * Where the business is comes from the phone's own location, read when the form opens; the
 * address for that spot is then filled in for the rep, who can correct it. The rep types the
 * address from scratch only if the location (or the address lookup) fails.
 *
 * Opened with `editLeadId` it is the same form filled in with that lead, to change it: the saved
 * location is kept unless the rep asks for the current one, the lead status can be changed, and
 * saved photos can be removed as well as new ones added.
 */
export function CrmNewCommercialLeadScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const route = useRoute<RouteProp<CrmStackParamList, 'CrmNewCommercialLead'>>();
  const { addLead, updateLead, getLead, showNotice } = useLeads();
  const { styles, theme } = useCrmStyles(factory);

  // The lead being edited, as it was when the form opened (it does not change under the rep's hands).
  const editLeadId = route.params?.editLeadId;
  const editLead = useRef(editLeadId ? getLead(editLeadId) : undefined).current;
  const editing = !!editLead;
  const initialValues = useRef(editLead ? valuesOf(editLead) : INITIAL_VALUES).current;

  const [step, setStep] = useState<Step>('details');
  const [values, setValues] = useState<CommercialLeadFormValues>(initialValues);
  const latest = useRef<CommercialLeadFormValues>(initialValues);
  latest.current = values;
  const [errors, setErrors] = useState<CommercialLeadFormErrors>({});
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(editLead?.leadStatus ?? 'new');
  const [location, setLocation] = useState<LocationState>(() => {
    if (!editLead) return { status: 'locating' };
    return typeof editLead.latitude === 'number' && typeof editLead.longitude === 'number'
      ? { status: 'ok', latitude: editLead.latitude, longitude: editLead.longitude, accuracy: null }
      : { status: 'failed' };
  });
  /** Shown once there is an address to show: found for the location, or to be typed by the rep. */
  const [typeAddress, setTypeAddress] = useState(editing);
  /** True while the written address for the location is being looked up. */
  const [findingAddress, setFindingAddress] = useState(false);
  /**
   * The address the lookup last filled in - so a later lookup never overwrites what the rep typed.
   * When editing it starts as the saved address: asking for the current location replaces that,
   * unless the rep has changed it by hand.
   */
  const filledAddress = useRef(editLead?.location?.trim() ?? '');
  /** Editing only: the photos already on the server (minus any marked for removal), null until loaded. */
  const [savedPhotos, setSavedPhotos] = useState<LeadPhoto[] | null>(editing ? null : []);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<LocalLeadPhoto[]>([]);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const designationRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const phoneRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const alternateRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const emailRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const amountNumber = parseAmount(values.amount);
  const hasErrors = Object.values(errors).some(Boolean);
  const hasLocation = location.status === 'ok';
  const hasLocationRef = useRef(hasLocation);
  hasLocationRef.current = hasLocation;

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const [hasTriedLocation, setHasTriedLocation] = useState(false);
  const readLocation = useCallback(async () => {
    setHasTriedLocation(true);
    setLocation({ status: 'locating' });
    try {
      const fix = await getCurrentLocation();
      if (!mounted.current) return;
      setLocation({
        status: 'ok',
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
      });
      setErrors(prev => (prev.address ? { ...prev, address: undefined } : prev));

      // Fill in the written address for this spot - unless the rep has typed their own.
      setFindingAddress(true);
      const found = await reverseGeocode(fix.latitude, fix.longitude);
      if (!mounted.current) return;
      setFindingAddress(false);
      const current = latest.current.address.trim();
      if (found && (!current || current === filledAddress.current)) {
        const address = found.slice(0, 255);
        filledAddress.current = address;
        latest.current = { ...latest.current, address };
        setValues(prev => ({ ...prev, address }));
        setTypeAddress(true);
      }
    } catch {
      // Permission refused, location switched off, or no fix indoors: the rep types the address instead.
      if (!mounted.current) return;
      setLocation({ status: 'failed' });
      setTypeAddress(true);
    }
  }, []);

  // A new lead: the location is read on its own as soon as the form opens. An edited lead keeps the
  // location it was saved with until the rep asks for the current one.
  useEffect(() => {
    if (!editing) readLocation();
  }, [editing, readLocation]);

  useEffect(() => {
    if (!editLead) return;
    let cancelled = false;
    crmApi
      .listLeadPhotos(editLead.id)
      .then(list => {
        if (!cancelled) setSavedPhotos(list);
      })
      .catch(() => {
        if (!cancelled) setSavedPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [editLead]);

  // On the review step the phone's back button goes back to the details, not out of the form.
  useEffect(() => {
    if (step !== 'review') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('details');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  function setField<K extends keyof CommercialLeadFormValues>(
    key: K,
    value: CommercialLeadFormValues[K],
  ) {
    latest.current = { ...latest.current, [key]: value };
    setValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /** Checks a field as the user leaves it: the error appears right there, not only on Next. */
  function checkField(key: keyof CommercialLeadFormValues) {
    const message = validateCommercialLead(
      latest.current,
      hasLocationRef.current,
    )[key];
    setErrors(prev =>
      prev[key] === message ? prev : { ...prev, [key]: message },
    );
  }

  function toggleService(service: CommercialService) {
    const chosen = latest.current.services;
    setField(
      'services',
      chosen.includes(service)
        ? chosen.filter(s => s !== service)
        : [...chosen, service],
    );
  }

  function applyContact(contact: { name: string; phone: string }) {
    setValues(prev => ({
      ...prev,
      phone: contact.phone,
      customerName: prev.customerName.trim() ? prev.customerName : contact.name,
    }));
    setErrors(prev => ({ ...prev, phone: undefined, customerName: undefined }));
  }

  function switchType(type: LeadType) {
    if (type === 'consumer') navigation.replace('CrmNewLead');
  }

  function goToReview() {
    Keyboard.dismiss();
    setSaveError(null);
    // While the location is still being read it is not a problem yet - Save checks it again.
    const found = validateCommercialLead(values, location.status !== 'failed');
    setErrors(found);
    if (Object.keys(found).length > 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setStep('review');
  }

  async function save() {
    if (saving) return;
    setSaveError(null);
    if (location.status === 'locating') {
      setSaveError('Still reading your location. Wait a moment, then tap Save Lead again.');
      return;
    }
    // The location may have failed after the details were checked: an address is needed then.
    const found = validateCommercialLead(values, hasLocation);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStep('details');
      return;
    }
    const input: NewLeadInput = {
      leadType: 'commercial',
      industryType: values.industryType as IndustryType,
      companyName: values.companyName.trim(),
      customerName: values.customerName.trim(),
      designation: values.designation.trim(),
      phone: normalizePhone(values.phone),
      alternatePhone: normalizePhone(values.alternatePhone),
      email: values.email.trim(),
      latitude: location.status === 'ok' ? location.latitude : null,
      longitude: location.status === 'ok' ? location.longitude : null,
      location: values.address.trim(),
      source: values.source as LeadSource,
      referenceBy: values.referenceBy.trim(),
      servicesRequested: values.services as CommercialService[],
      amount: amountNumber,
      notes: values.notes.trim(),
      // A commercial lead has no house type / plan and no payment; these stay empty / unused.
      houseType: '',
      service: '',
      plan: '',
      coupon: '',
      paymentMethod: 'other',
      paymentStatus: 'pending',
      leadStatus,
    };

    setSaving(true);
    try {
      if (editLead) {
        await updateLead(editLead.id, input);
        // Photo changes follow the lead itself; one that fails does not undo the saved details.
        let failed = 0;
        for (const photoId of removedPhotoIds) {
          try {
            await crmApi.deleteLeadPhoto(editLead.id, photoId);
          } catch {
            failed += 1;
          }
        }
        for (const photo of photos) {
          try {
            await crmApi.uploadLeadPhoto(editLead.id, photo);
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) {
          showNotice(
            failed === 1
              ? 'Changes saved, but 1 photo change did not go through'
              : `Changes saved, but ${failed} photo changes did not go through`,
            'warning',
          );
        } else {
          showNotice('Changes saved');
        }
        navigation.goBack();
        return;
      }
      const saved = await addLead(input, photos);
      navigation.replace('CrmLeadSaved', { leadId: saved.id });
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err.message
          : 'Unable to save the lead. Please try again.',
      );
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setSaving(false);
    }
  }

  const reviewing = step === 'review';
  const savedCount = savedPhotos?.length ?? 0;
  const locationSummary =
    location.status === 'ok'
      ? 'Current location captured'
      : location.status === 'locating'
      ? 'Still reading the location...'
      : '';

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar
        title={editing ? 'Edit Commercial Lead' : 'New Commercial Lead'}
        subtitle={
          reviewing
            ? 'Check the details, then save'
            : editing
            ? 'Change what you need, then save'
            : 'Add a business enquiry'
        }
        icon={reviewing ? 'back' : 'close'}
        onBack={() => (reviewing ? setStep('details') : navigation.goBack())}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!reviewing && !editing && (
          <View style={styles.typeSwitch}>
            <SegmentedControl
              options={LEAD_TYPES}
              value="commercial"
              onChange={switchType}
            />
          </View>
        )}

        <CrmErrorBanner message={saveError} />

        {reviewing ? (
          <>
            <Text style={styles.reviewIntro}>
              Please check every detail below. Tap Edit to change anything, then Save Lead.
            </Text>

            <ReviewSection title="BUSINESS" onEdit={() => setStep('details')}>
              <ReviewRow
                first
                label="Industry Type"
                value={optionLabel(INDUSTRY_TYPES, values.industryType as IndustryType)}
              />
              <ReviewRow label="Company / Business Name" value={values.companyName.trim()} />
              <ReviewRow label="Location" value={locationSummary} />
              {(!hasLocation || !!values.address.trim()) && (
                <ReviewRow label="Address" value={values.address.trim()} />
              )}
            </ReviewSection>

            <ReviewSection title="CONTACT" onEdit={() => setStep('details')}>
              <ReviewRow first label="Contact Person Name" value={values.customerName.trim()} />
              <ReviewRow label="Designation" value={values.designation.trim()} />
              <ReviewRow label="Phone Number" value={`+91 ${normalizePhone(values.phone)}`} />
              <ReviewRow
                label="Alternate Number"
                value={
                  normalizePhone(values.alternatePhone)
                    ? `+91 ${normalizePhone(values.alternatePhone)}`
                    : ''
                }
              />
              <ReviewRow label="Email" value={values.email.trim()} />
            </ReviewSection>

            <ReviewSection title="LEAD DETAILS" onEdit={() => setStep('details')}>
              <ReviewRow
                first
                label="Source of Lead"
                value={optionLabel(COMMERCIAL_LEAD_SOURCES, values.source as LeadSource)}
              />
              <ReviewRow label="Referred By" value={values.referenceBy.trim()} />
              <ReviewRow
                label="Service Requested"
                value={servicesLabel(values.services as CommercialService[])}
              />
              <ReviewRow label="Approximate Quote" value={formatINR(amountNumber)} strong />
              {editing && <ReviewRow label="Lead Status" value={optionLabel(LEAD_STATUSES, leadStatus)} />}
              <ReviewRow label="Notes" value={values.notes.trim()} />
            </ReviewSection>

            <ReviewSection
              title={`PHOTOS (${savedCount + photos.length} of ${MAX_LEAD_PHOTOS})`}
              onEdit={() => setStep('details')}
            >
              {editing && (
                <ReviewRow
                  first
                  label="Saved photos"
                  value={
                    removedPhotoIds.length > 0
                      ? `${savedCount} kept, ${removedPhotoIds.length} to be removed`
                      : `${savedCount} kept`
                  }
                />
              )}
              {photos.length > 0 ? (
                <View style={styles.reviewPhotos}>
                  <LocalLeadPhotos photos={photos} />
                </View>
              ) : (
                <ReviewRow first={!editing} label={editing ? 'New photos' : 'Photos'} value="" />
              )}
            </ReviewSection>
          </>
        ) : (
          <>
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
                icon={<BriefcaseIcon size={20} color={theme.primary} />}
                title="Business"
              />
              <SelectField
                label="Industry Type *"
                sheetTitle="Industry Type"
                icon={<TagIcon size={18} color={theme.textMuted} />}
                placeholder="Select industry type"
                options={INDUSTRY_TYPES}
                value={values.industryType as IndustryType | null}
                onChange={value => setField('industryType', value)}
                error={errors.industryType}
              />
              <CrmTextField
                label="Company / Business Name *"
                placeholder="e.g. Skyline Builders"
                value={values.companyName}
                onChangeText={text => setField('companyName', text)}
                onBlur={() => checkField('companyName')}
                error={errors.companyName}
                icon={<BriefcaseIcon size={18} color={theme.textMuted} />}
                autoCapitalize="words"
                maxLength={150}
                returnKeyType="done"
                testID="commercial-company"
              />

              <Text style={styles.fieldLabel}>Location</Text>
              <View
                style={[
                  styles.locationBox,
                  location.status === 'ok' && styles.locationBoxOk,
                  location.status === 'failed' && styles.locationBoxFailed,
                ]}
                accessibilityLiveRegion="polite"
                testID="commercial-location"
              >
                {location.status === 'locating' ? (
                  <ActivityIndicator color={theme.primary} />
                ) : location.status === 'ok' ? (
                  <CheckCircleIcon size={22} color={theme.successText} />
                ) : (
                  <PinIcon size={22} color={theme.warningText} />
                )}
                <View style={styles.locationText}>
                  <Text style={styles.locationTitle}>
                    {location.status === 'locating'
                      ? 'Reading your current location...'
                      : location.status === 'ok'
                      ? editing && location.accuracy === null
                        ? 'Location saved with this lead'
                        : 'Current location captured'
                      : editing && !hasTriedLocation
                      ? 'No location saved with this lead'
                      : 'Could not read your location'}
                  </Text>
                  <Text style={styles.locationSub}>
                    {location.status === 'locating'
                      ? 'This takes a few seconds.'
                      : location.status === 'ok'
                      ? findingAddress
                        ? 'Finding the address...'
                        : location.accuracy !== null
                        ? `Accurate to about ${Math.round(location.accuracy)} m`
                        : editing
                        ? 'Tap "Use current" if you are at the site now.'
                        : 'Saved with this lead'
                      : 'Type the address below, or try again.'}
                  </Text>
                </View>
                {location.status !== 'locating' && (
                  <Pressable
                    onPress={readLocation}
                    hitSlop={10}
                    accessibilityRole="button"
                    testID="commercial-location-retry"
                  >
                    <Text style={styles.locationAction}>
                      {location.status !== 'ok' ? 'Try again' : editing ? 'Use current' : 'Refresh'}
                    </Text>
                  </Pressable>
                )}
              </View>
              {typeAddress ? (
                <View style={styles.addressWrap}>
                  <CrmTextField
                    label={hasLocation ? 'Address' : 'Address *'}
                    placeholder="Building, area, city"
                    hint={
                      hasLocation && !!values.address && values.address === filledAddress.current
                        ? 'Filled in from your location - correct it if needed.'
                        : undefined
                    }
                    value={values.address}
                    onChangeText={text => setField('address', text)}
                    onBlur={() => checkField('address')}
                    error={errors.address}
                    icon={<PinIcon size={18} color={theme.textMuted} />}
                    maxLength={255}
                    multiline
                    testID="commercial-address"
                  />
                </View>
              ) : location.status === 'locating' || findingAddress ? (
                <View style={styles.locationGap} />
              ) : (
                <Pressable
                  onPress={() => setTypeAddress(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.locationGap}
                >
                  <Text style={styles.typeLink}>Type the address</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.section}>
              <SectionHeader
                icon={<PhoneIcon size={20} color={theme.primary} />}
                title="Contact"
              />
              <CrmTextField
                label="Contact Person Name *"
                placeholder="Who you spoke to"
                value={values.customerName}
                onChangeText={text => setField('customerName', text)}
                onBlur={() => checkField('customerName')}
                error={errors.customerName}
                icon={<PersonIcon size={18} color={theme.textMuted} />}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
                onSubmitEditing={() => designationRef.current?.focus()}
                testID="commercial-name"
              />
              <CrmTextField
                ref={designationRef}
                label="Designation"
                placeholder="e.g. Facility Manager (optional)"
                value={values.designation}
                onChangeText={text => setField('designation', text)}
                icon={<BriefcaseIcon size={18} color={theme.textMuted} />}
                autoCapitalize="words"
                maxLength={100}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                testID="commercial-designation"
              />
              <CrmTextField
                ref={phoneRef}
                label="Phone Number *"
                placeholder="Mobile number"
                value={values.phone}
                onChangeText={text => setField('phone', cleanPhoneInput(text))}
                onBlur={() => checkField('phone')}
                error={errors.phone}
                prefix="+91"
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="next"
                onSubmitEditing={() => alternateRef.current?.focus()}
                testID="commercial-phone"
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
                  >
                    <UsersIcon size={15} color={theme.primary} />
                    <Text style={styles.contactsPillText}>Contacts</Text>
                  </Pressable>
                }
              />
              <CrmTextField
                ref={alternateRef}
                label="Alternate Number"
                placeholder="Another number (optional)"
                value={values.alternatePhone}
                onChangeText={text => setField('alternatePhone', cleanPhoneInput(text))}
                onBlur={() => checkField('alternatePhone')}
                error={errors.alternatePhone}
                prefix="+91"
                keyboardType="phone-pad"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                testID="commercial-alternate"
              />
              <CrmTextField
                ref={emailRef}
                label="Email"
                placeholder="name@company.com (optional)"
                value={values.email}
                onChangeText={text => setField('email', text)}
                onBlur={() => checkField('email')}
                error={errors.email}
                icon={<EmailIcon size={18} color={theme.textMuted} />}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="done"
                testID="commercial-email"
              />
            </View>

            <View style={styles.section}>
              <SectionHeader
                icon={<RupeeIcon size={20} color={theme.primary} />}
                title="Lead Details"
              />
              <SelectField
                label="Source of Lead *"
                sheetTitle="Source of Lead"
                icon={<ExternalLinkIcon size={18} color={theme.textMuted} />}
                placeholder="Select source of lead"
                options={COMMERCIAL_LEAD_SOURCES}
                value={values.source as LeadSource | null}
                onChange={value => setField('source', value)}
                error={errors.source}
              />
              <CrmTextField
                label="Referred By"
                placeholder="Who referred this lead? (optional)"
                value={values.referenceBy}
                onChangeText={text => setField('referenceBy', text)}
                icon={<UsersIcon size={18} color={theme.textMuted} />}
                autoCapitalize="words"
                maxLength={100}
                returnKeyType="done"
                testID="commercial-referred-by"
              />

              {editing && (
                <SelectField
                  label="Lead Status"
                  icon={<TagIcon size={18} color={theme.textMuted} />}
                  placeholder="Select lead status"
                  options={LEAD_STATUSES}
                  value={leadStatus}
                  onChange={setLeadStatus}
                />
              )}

              <Text style={styles.fieldLabel}>Service Requested *</Text>
              <View style={styles.chipsWrap}>
                <View style={styles.chips}>
                  {COMMERCIAL_SERVICES.map(service => {
                    const on = values.services.includes(service.value);
                    return (
                      <Pressable
                        key={service.value}
                        onPress={() => toggleService(service.value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={service.label}
                        testID={`commercial-service-${service.value}`}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        {on && <CheckIcon size={14} color={theme.textOnPrimary} />}
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {service.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!errors.services && (
                  <Text style={styles.fieldError}>{errors.services}</Text>
                )}
              </View>

              <CrmTextField
                label="Approximate Quote (₹) *"
                placeholder="0"
                value={values.amount}
                onChangeText={text => setField('amount', text.replace(/[^0-9]/g, ''))}
                onBlur={() => checkField('amount')}
                error={errors.amount}
                hint="A rough figure is fine - no payment is collected for a commercial lead."
                icon={<RupeeIcon size={20} color={theme.textPrimary} />}
                keyboardType="number-pad"
                style={styles.amountInput}
                maxLength={8}
                returnKeyType="done"
                testID="commercial-quote"
              />
              <CrmTextField
                label="Notes"
                icon={<DocumentIcon size={18} color={theme.textMuted} />}
                placeholder="e.g. Interested in an annual pest control contract"
                value={values.notes}
                onChangeText={text => setField('notes', text)}
                multiline
                testID="commercial-notes"
              />
            </View>

            <View style={styles.section}>
              <SectionHeader
                icon={<CameraIcon size={20} color={theme.primary} />}
                title="Photos"
                hint="Site or problem-area photos help the team quote"
              />
              <CrmErrorBanner message={photoProblem} />
              {editLead && savedPhotos !== null && (
                <SavedLeadPhotos
                  leadId={editLead.id}
                  photos={savedPhotos}
                  onRemove={photoId => {
                    setSavedPhotos(list => (list ?? []).filter(photo => photo.id !== photoId));
                    setRemovedPhotoIds(ids => [...ids, photoId]);
                  }}
                />
              )}
              {editing && savedPhotos === null ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <LeadPhotoPicker
                  photos={photos}
                  max={MAX_LEAD_PHOTOS - savedCount}
                  onChange={next => {
                    setPhotoProblem(null);
                    setPhotos(next);
                  }}
                  onProblem={setPhotoProblem}
                />
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {reviewing ? (
          <>
            <PrimaryButton
              label="Back"
              variant="secondary"
              onPress={() => setStep('details')}
              disabled={saving}
              style={styles.footerButton}
              testID="commercial-back"
            />
            <PrimaryButton
              label={editing ? 'Save Changes' : 'Save Lead'}
              onPress={save}
              loading={saving}
              style={styles.footerButtonWide}
              testID="commercial-save"
            />
          </>
        ) : (
          <PrimaryButton
            label="Next"
            onPress={goToReview}
            style={styles.footerButton}
            testID="commercial-next"
          />
        )}
      </View>

      <ContactPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={applyContact}
      />
    </CrmScreen>
  );
}
