import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  CalendarIcon,
  CameraIcon,
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
import { useAuth } from '../../auth/AuthContext';
import { loadLastChoices, saveLastChoices } from '../draft';
import { leadAssignees, roleName } from '../../leads/api';
import { fmtDateShort } from '../../tasks/format';
import { DateSheet } from '../../tasks/ui/sheets';
import type { Person } from '../../leads/types';
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
import { CheckIcon, ChevronDownIcon, RupeeIcon } from '../ui/crmIcons';
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
  competitorHint: { ...typography.caption, color: t.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
  collapseHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  collapseIcon: { width: 36, height: 36, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  collapseText: { flex: 1, minWidth: 0 },
  collapseTitle: { ...typography.subtitle, color: t.textPrimary },
  collapseSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  dateField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    marginBottom: spacing.md,
  },
  dateFieldPressed: { opacity: 0.85 },
  dateFieldText: { ...typography.body, color: t.textPrimary, flex: 1 },
  dateFieldPlaceholder: { color: t.textMuted },
  dateClear: { ...typography.captionMedium, color: t.primary },
  addressActions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: spacing.sm, marginTop: -spacing.xs },
  addressButton: {
    minWidth: 84,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  addressButtonOff: { opacity: 0.4 },
  addressButtonPressed: { opacity: 0.8 },
  addressButtonText: { ...typography.captionMedium, color: t.primary },

  // A two-column grid of equal tiles with a tick circle - the same as the quotation form.
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    rowGap: spacing.sm,
  },
  chip: {
    width: '48.5%' as const,
    height: 56, // every tile the same size, whether the name takes one line or two
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  chipOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  chipPressed: { opacity: 0.7 },
  tick: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  tickOn: { backgroundColor: t.primary, borderColor: t.primary },
  chipText: { ...typography.captionMedium, color: t.textPrimary, flex: 1 },
  chipTextOn: { color: t.primary },
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

/**
 * A stored source as this form's choice: the web saves the name ("Google", "Social Media"), the
 * app the code ("google"). A source the form has no button for (e.g. "Lead Provider") is kept as is.
 */
function sourceChoice(stored: string | null | undefined): string | null {
  const raw = (stored ?? '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  const hit = COMMERCIAL_LEAD_SOURCES.find(o => o.value === key || o.label.toLowerCase() === key || o.value === key.replace(/\s+/g, '_'));
  return hit ? hit.value : raw;
}

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
    source: sourceChoice(lead.source) as LeadSource | null,
    referenceBy: lead.referenceBy ?? '',
    services: lead.servicesRequested ?? [],
    amount: Number.isFinite(lead.amount) && lead.amount >= 0 ? String(Math.round(lead.amount)) : '',
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
 *
 * The Lead Management app reuses this same form for its commercial roles: `commercialOnly` hides
 * the Residential tab, and `onCreated` replaces the CRM's "lead saved" screen after a new lead.
 */
export function CrmNewCommercialLeadScreen({
  commercialOnly = false,
  onCreated,
  onResidential,
  assign,
}: {
  commercialOnly?: boolean;
  onCreated?: (lead: Lead) => void;
  /** The Lead Management app: its own residential form for the Residential tab. */
  onResidential?: () => void;
  /** The sales manager: choose which sales executive the new lead goes to (`myId` is "Myself"). */
  assign?: { myId: number };
} = {}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  const route = useRoute<RouteProp<CrmStackParamList, 'CrmNewCommercialLead'>>();
  const { addLead, updateLead, getLead, showNotice } = useLeads();
  const { styles, theme } = useCrmStyles(factory);
  const { session } = useAuth();
  const scope = session?.userId ?? 'anon';

  // The lead being edited, as it was when the form opened (it does not change under the rep's hands).
  const editLeadId = route.params?.editLeadId;
  const editLead = useRef(editLeadId ? getLead(editLeadId) : undefined).current;
  const editing = !!editLead;
  const initialValues = useRef(editLead ? valuesOf(editLead) : INITIAL_VALUES).current;

  const [step, setStep] = useState<Step>('details');
  const [values, setValues] = useState<CommercialLeadFormValues>(initialValues);
  const latest = useRef<CommercialLeadFormValues>(initialValues);
  // The app's sources, plus the lead's own when it came from elsewhere (e.g. "Lead Provider").
  const sourceOptions = useMemo(
    () =>
      values.source && !COMMERCIAL_LEAD_SOURCES.some(o => o.value === values.source)
        ? [...COMMERCIAL_LEAD_SOURCES, { value: values.source as LeadSource, label: String(values.source) }]
        : COMMERCIAL_LEAD_SOURCES,
    [values.source],
  );
  latest.current = values;
  const [errors, setErrors] = useState<CommercialLeadFormErrors>({});
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(editLead?.leadStatus ?? 'new');
  const [location, setLocation] = useState<LocationState>(() => {
    if (!editLead) return { status: 'locating' };
    return typeof editLead.latitude === 'number' && typeof editLead.longitude === 'number'
      ? { status: 'ok', latitude: editLead.latitude, longitude: editLead.longitude, accuracy: null }
      : { status: 'failed' };
  });
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
  // Competitor details (optional): who serves the customer now, their price, when the contract ends.
  const [competitor, setCompetitor] = useState(() => ({
    name: editLead?.competitorName ?? '',
    amount: editLead?.competitorAmount ? String(Math.round(editLead.competitorAmount)) : '',
    contractEnd: editLead?.competitorContractEnd ?? null,
    notes: editLead?.competitorNotes ?? '',
  }));
  const [contractSheet, setContractSheet] = useState(false);
  const setCompetitorField = (key: 'name' | 'amount' | 'notes', value: string) =>
    setCompetitor(prev => ({ ...prev, [key]: key === 'amount' ? value.replace(/\D/g, '').slice(0, 9) : value }));
  const hasCompetitor = !!(competitor.name.trim() || competitor.amount || competitor.contractEnd || competitor.notes.trim());
  // The Competitor block folds away: closed on a new lead, open when editing one that already has details.
  const [competitorOpen, setCompetitorOpen] = useState(hasCompetitor);
  const competitorSummary = [competitor.name.trim(), competitor.amount ? formatINR(Number(competitor.amount)) : ''].filter(Boolean).join('  ·  ');

  // Sales manager: who the new lead goes to - themselves unless they pick someone.
  const [people, setPeople] = useState<Person[]>([]);
  const [assignTo, setAssignTo] = useState<string | null>(assign ? String(assign.myId) : null);
  useEffect(() => {
    if (!assign || editing) return;
    let alive = true;
    leadAssignees()
      .then(list => alive && setPeople(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [assign, editing]);
  const assignOptions = assign
    ? [
        { value: String(assign.myId), label: 'Myself' },
        ...people.filter(p => p.id !== assign.myId).map(p => ({ value: String(p.id), label: `${p.name} · ${roleName(p.role)}` })),
      ]
    : [];
  const assignLabel = assignOptions.find(o => o.value === assignTo)?.label ?? '';

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
  const readLocation = useCallback(async (replaceAddress = false) => {
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
      if (found && (replaceAddress || !current || current === filledAddress.current)) {
        const address = found.slice(0, 255);
        filledAddress.current = address;
        latest.current = { ...latest.current, address };
        setValues(prev => ({ ...prev, address }));
      }
    } catch {
      // Permission refused, location switched off, or no fix indoors: the rep types the address instead.
      if (!mounted.current) return;
      setLocation({ status: 'failed' });
    }
  }, []);

  // A new lead: the location is read on its own as soon as the form opens. An edited lead keeps the
  // location it was saved with until the rep asks for the current one.
  useEffect(() => {
    if (!editing) readLocation();
  }, [editing, readLocation]);

  // A new lead opens with the industry type and lead source picked last time (still changeable).
  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    loadLastChoices(scope).then(last => {
      if (cancelled) return;
      const industryType = INDUSTRY_TYPES.some(o => o.value === last.industryType) ? last.industryType : null;
      const source = COMMERCIAL_LEAD_SOURCES.some(o => o.value === last.commercialSource) ? last.commercialSource : null;
      setValues(prev => {
        const next = {
          ...prev,
          industryType: prev.industryType ?? (industryType as IndustryType | null),
          source: prev.source ?? (source as LeadSource | null),
        };
        latest.current = next;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [editing, scope]);

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
    if (type !== 'consumer') return;
    if (onResidential) onResidential();
    else navigation.replace('CrmNewLead');
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
      assignTo: assign && !editing && assignTo ? Number(assignTo) : undefined,
      competitorName: competitor.name.trim(),
      competitorAmount: competitor.amount ? Number(competitor.amount) : null,
      competitorContractEnd: competitor.contractEnd,
      competitorNotes: competitor.notes.trim(),
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
      saveLastChoices(scope, { industryType: input.industryType ?? undefined, commercialSource: input.source ?? undefined }).catch(() => {});
      if (onCreated) {
        onCreated(saved);
        return;
      }
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
  const addressStatus =
    location.status === 'locating'
      ? 'Reading your location...'
      : findingAddress
      ? 'Finding the address for your location...'
      : location.status === 'failed'
      ? hasTriedLocation
        ? 'Could not read your location - type the address, or tap Refresh.'
        : undefined
      : !!values.address && values.address === filledAddress.current
      ? 'Filled in from your location - correct it if needed.'
      : undefined;

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
        {!reviewing && !editing && !commercialOnly && (
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
              <ReviewRow label="Address" value={values.address.trim()} />
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
                value={optionLabel(sourceOptions, values.source as LeadSource)}
              />
              <ReviewRow label="Referred By" value={values.referenceBy.trim()} />
              <ReviewRow
                label="Service Requested"
                value={servicesLabel(values.services as CommercialService[])}
              />
              <ReviewRow label="Approximate Quote" value={formatINR(amountNumber)} strong />
              {!!assign && !editing && <ReviewRow label="Assigned To" value={assignLabel} />}
              {editing && <ReviewRow label="Lead Status" value={optionLabel(LEAD_STATUSES, leadStatus)} />}
              <ReviewRow label="Notes" value={values.notes.trim()} />
            </ReviewSection>

            <ReviewSection title="COMPETITOR" onEdit={() => setStep('details')}>
              {hasCompetitor ? (
                <>
                  <ReviewRow first label="Current Service Provider" value={competitor.name.trim()} />
                  <ReviewRow label="Their Price" value={competitor.amount ? formatINR(Number(competitor.amount)) : ''} />
                  <ReviewRow label="Contract Ends On" value={competitor.contractEnd ? fmtDateShort(competitor.contractEnd) : ''} />
                  <ReviewRow label="Notes" value={competitor.notes.trim()} />
                </>
              ) : (
                <ReviewRow first label="Competitor" value="" />
              )}
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

              <View style={styles.addressWrap}>
                <CrmTextField
                  label={hasLocation ? 'Address' : 'Address *'}
                  placeholder={location.status === 'locating' || findingAddress ? 'Reading your location...' : 'Building, area, city'}
                  hint={addressStatus}
                  value={values.address}
                  onChangeText={text => setField('address', text)}
                  onBlur={() => checkField('address')}
                  error={errors.address}
                  icon={<PinIcon size={18} color={theme.textMuted} />}
                  maxLength={255}
                  multiline
                  testID="commercial-address"
                />
                <View style={styles.addressActions}>
                  <Pressable
                    onPress={() => setField('address', '')}
                    disabled={!values.address}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Clear the address"
                    style={({ pressed }) => [styles.addressButton, !values.address && styles.addressButtonOff, pressed && styles.addressButtonPressed]}
                    testID="commercial-address-clear"
                  >
                    <Text style={styles.addressButtonText}>Clear</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => readLocation(true)}
                    disabled={location.status === 'locating' || findingAddress}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Read the address of my current location"
                    style={({ pressed }) => [
                      styles.addressButton,
                      (location.status === 'locating' || findingAddress) && styles.addressButtonOff,
                      pressed && styles.addressButtonPressed,
                    ]}
                    testID="commercial-location-retry"
                  >
                    {location.status === 'locating' || findingAddress ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <Text style={styles.addressButtonText}>Refresh</Text>
                    )}
                  </Pressable>
                </View>
              </View>
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
              {!!assign && !editing && (
                <SelectField
                  label="Assign To *"
                  sheetTitle="Assign this lead to"
                  icon={<PersonIcon size={18} color={theme.textMuted} />}
                  placeholder="Choose who works this lead"
                  options={assignOptions}
                  value={assignTo}
                  onChange={value => setAssignTo(value)}
                />
              )}
              <SelectField
                label="Source of Lead *"
                sheetTitle="Source of Lead"
                icon={<ExternalLinkIcon size={18} color={theme.textMuted} />}
                placeholder="Select source of lead"
                options={sourceOptions}
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
                        style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.chipPressed]}
                      >
                        <View style={[styles.tick, on && styles.tickOn]}>
                          {on && <CheckIcon size={12} color={theme.textOnPrimary} />}
                        </View>
                        <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={2}>
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
              <Pressable
                onPress={() => setCompetitorOpen(o => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: competitorOpen }}
                style={({ pressed }) => [styles.collapseHead, pressed && styles.dateFieldPressed]}
                testID="commercial-competitor-toggle"
              >
                <View style={styles.collapseIcon}>
                  <UsersIcon size={18} color={theme.primary} />
                </View>
                <View style={styles.collapseText}>
                  <Text style={styles.collapseTitle}>Competitor (optional)</Text>
                  {!competitorOpen && (
                    <Text style={styles.collapseSub} numberOfLines={1}>
                      {competitorSummary || 'Tap to add the current service provider'}
                    </Text>
                  )}
                </View>
                <View style={competitorOpen ? styles.chevronOpen : undefined}>
                  <ChevronDownIcon size={20} color={theme.textMuted} />
                </View>
              </Pressable>
              {competitorOpen && (
              <>
              <Text style={styles.competitorHint}>Who looks after the customer today? It helps price and time the offer.</Text>
              <CrmTextField
                label="Current Service Provider"
                placeholder="e.g. ABC Pest Control"
                value={competitor.name}
                onChangeText={text => setCompetitorField('name', text)}
                icon={<BriefcaseIcon size={18} color={theme.textMuted} />}
                autoCapitalize="words"
                maxLength={150}
                testID="commercial-competitor-name"
              />
              <CrmTextField
                label="Their Price / Contract Amount (₹)"
                placeholder="What the customer pays them"
                value={competitor.amount}
                onChangeText={text => setCompetitorField('amount', text)}
                prefix="₹"
                keyboardType="number-pad"
                maxLength={9}
                testID="commercial-competitor-amount"
              />
              <Text style={styles.fieldLabel}>Contract Ends On</Text>
              <Pressable
                onPress={() => setContractSheet(true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.dateField, pressed && styles.dateFieldPressed]}
                testID="commercial-competitor-end"
              >
                <CalendarIcon size={18} color={theme.textMuted} />
                <Text style={[styles.dateFieldText, !competitor.contractEnd && styles.dateFieldPlaceholder]}>
                  {competitor.contractEnd ? fmtDateShort(competitor.contractEnd) : 'Pick a date (optional)'}
                </Text>
                {!!competitor.contractEnd && (
                  <Pressable onPress={() => setCompetitor(prev => ({ ...prev, contractEnd: null }))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear the date">
                    <Text style={styles.dateClear}>Clear</Text>
                  </Pressable>
                )}
              </Pressable>
              <CrmTextField
                label="Notes on the Competitor"
                placeholder="What the customer likes or dislikes about them"
                value={competitor.notes}
                onChangeText={text => setCompetitorField('notes', text)}
                multiline
                maxLength={500}
                testID="commercial-competitor-notes"
              />
              </>
              )}
              <DateSheet
                visible={contractSheet}
                onClose={() => setContractSheet(false)}
                value={competitor.contractEnd}
                title="Contract ends on"
                onPick={d => {
                  setCompetitor(prev => ({ ...prev, contractEnd: d }));
                  setContractSheet(false);
                }}
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
