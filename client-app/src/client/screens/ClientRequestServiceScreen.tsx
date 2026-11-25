import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  HomeIcon,
  PinIcon,
  SettingsIcon,
  ShieldIcon,
  SparkleIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { todayStr } from '../../tasks/format';
import { DateSheet } from '../../tasks/ui/sheets';
import { cancelServiceRequest, createServiceRequest, listServiceRequests, type RequestSlot, type RequestType, type ServiceRequest } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { formatDate, plural, serviceLabel } from '../format';
import type { ClientStackParamList } from '../navigation';
import { DEEP_CLEANING_SERVICES, GROUP_LABEL, PEST_SERVICES, serviceMeta, type ServiceGroup } from '../services';
import { OutletSheet } from '../ui/OutletPicker';
import { ClientPage, Segmented } from '../ui/page';
import { Popup, PopupButtons } from '../ui/Popup';
import { useToast } from '../ui/Toast';

type IconType = React.ComponentType<{ size?: number; color?: string }>;

/** How many services show before "Show all". */
const SHOWN = 6;

const palette = (t: CrmTheme) => ({
  page: t.isDark ? t.background : '#FFFFFF',
  ink: t.isDark ? '#E6E7EA' : '#1B1C1F',
  sub: t.isDark ? '#A3A7AE' : '#5E6470',
  faint: t.isDark ? '#6E737C' : '#9AA1AD',
  blue: t.isDark ? '#A8C7FA' : '#0B57D0',
  blueSoft: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD',
  tint: t.isDark ? t.surfaceAlt : '#F2F5FB',
  line: t.isDark ? 'rgba(255,255,255,0.10)' : '#DCE3EF',
  white: t.isDark ? t.surface : '#FFFFFF',
  green: t.isDark ? '#81C995' : '#188038',
  greenSoft: t.isDark ? 'rgba(129,201,149,0.14)' : '#E6F4EA',
  amber: t.isDark ? '#FDD663' : '#B06000',
  amberSoft: t.isDark ? 'rgba(253,214,99,0.14)' : '#FEF7E0',
  red: t.isDark ? '#F28B82' : '#B3261E',
  redSoft: t.isDark ? 'rgba(242,139,130,0.14)' : '#FCE8E6',
  slate: t.isDark ? '#A3A7AE' : '#5F6368',
  slateSoft: t.isDark ? 'rgba(255,255,255,0.08)' : '#F1F3F4',
});

const TYPES: { key: RequestType; label: string; hint: string; Icon: IconType }[] = [
  { key: 'PEST', label: 'Pest control', hint: 'Cockroach, rodent, mosquito', Icon: ShieldIcon },
  { key: 'DEEP', label: 'Cleaning', hint: 'Deep clean, floor care', Icon: SparkleIcon },
  { key: 'BOTH', label: 'Both', hint: 'Pest control + cleaning', Icon: BriefcaseIcon },
];

const SLOTS: { key: RequestSlot; label: string; sub: string }[] = [
  { key: 'ANY', label: 'Any time', sub: 'Flexible' },
  { key: 'MORNING', label: 'Morning', sub: '8 – 12' },
  { key: 'AFTERNOON', label: 'Afternoon', sub: '12 – 4' },
  { key: 'EVENING', label: 'Evening', sub: '4 – 8' },
];

const STATUS: Record<string, { label: string; tone: 'amber' | 'green' | 'red' | 'slate' }> = {
  NEW: { label: 'Waiting for our team', tone: 'amber' },
  ASSIGNED: { label: 'Scheduled', tone: 'green' },
  REJECTED: { label: 'Declined', tone: 'red' },
  CANCELLED: { label: 'Cancelled', tone: 'slate' },
};

const factory = (t: CrmTheme) => {
  const c = palette(t);
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.65 },
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
    // ---- steps ----
    step: { backgroundColor: c.tint, borderRadius: 24, padding: 16, marginBottom: 14 },
    stepHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 14 },
    stepNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.blue, alignItems: 'center' as const, justifyContent: 'center' as const },
    stepNoDone: { backgroundColor: c.green },
    stepNoText: { fontSize: 13, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
    stepTitle: { flex: 1, fontSize: 16.5, fontWeight: '600' as const, color: c.ink },
    stepHint: { fontSize: 13, color: c.sub },
    badge: { backgroundColor: c.blue, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontSize: 12.5, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
    // outlet / date rows
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: c.white },
    rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
    rowText: { flex: 1, fontSize: 15.5, fontWeight: '500' as const, color: c.ink },
    rowPlaceholder: { color: c.sub, fontWeight: '400' as const },
    // types
    types: { flexDirection: 'row' as const, gap: 10 },
    type: { flex: 1, alignItems: 'center' as const, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 18, backgroundColor: c.white, borderWidth: 1.5, borderColor: 'transparent' },
    typeOn: { borderColor: c.blue, backgroundColor: t.isDark ? 'rgba(168,199,250,0.10)' : '#F5F8FF' },
    typeIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
    typeIconOn: { backgroundColor: c.blue },
    typeLabel: { fontSize: 14.5, fontWeight: '600' as const, color: c.ink, marginTop: 10 },
    typeHint: { fontSize: 11.5, color: c.sub, textAlign: 'center' as const, marginTop: 3, lineHeight: 15 },
    tick: { position: 'absolute' as const, top: 8, right: 8 },
    // services
    search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 46, paddingHorizontal: 14, borderRadius: 23, backgroundColor: c.white, marginBottom: 12 },
    searchInput: { flex: 1, fontSize: 15, color: c.ink, paddingVertical: 10 },
    groups: { gap: 8, paddingRight: 4, marginBottom: 12 },
    group: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.white },
    groupOn: { backgroundColor: c.ink },
    groupText: { fontSize: 13.5, fontWeight: '500' as const, color: c.ink },
    groupTextOn: { color: c.page, fontWeight: '600' as const },
    listBox: { backgroundColor: c.white, borderRadius: 18, paddingHorizontal: 6, paddingVertical: 4 },
    svc: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 14 },
    svcOn: { backgroundColor: t.isDark ? 'rgba(168,199,250,0.12)' : '#EEF4FF' },
    svcDivider: { height: 1, backgroundColor: c.line, marginLeft: 58, marginRight: 8, opacity: 0.7 },
    svcIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
    svcTitle: { fontSize: 15, color: c.ink, lineHeight: 20 },
    svcTitleOn: { fontWeight: '600' as const },
    svcSub: { fontSize: 12.5, color: c.sub, marginTop: 1 },
    check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.line, alignItems: 'center' as const, justifyContent: 'center' as const },
    checkOn: { backgroundColor: c.blue, borderColor: c.blue },
    more: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: 14, backgroundColor: c.white },
    moreText: { fontSize: 14, fontWeight: '600' as const, color: c.blue },
    noMatch: { fontSize: 14, color: c.sub, paddingVertical: 18, textAlign: 'center' as const },
    // slots
    slots: { flexDirection: 'row' as const, gap: 8, marginTop: 12 },
    slot: { flex: 1, alignItems: 'center' as const, paddingVertical: 12, borderRadius: 16, backgroundColor: c.white, borderWidth: 1.5, borderColor: 'transparent' },
    slotOn: { borderColor: c.blue, backgroundColor: t.isDark ? 'rgba(168,199,250,0.10)' : '#F5F8FF' },
    slotLabel: { fontSize: 13, fontWeight: '600' as const, color: c.ink, marginTop: 6 },
    slotSub: { fontSize: 11, color: c.sub, marginTop: 1 },
    // notes
    notes: { minHeight: 96, borderRadius: 16, backgroundColor: c.white, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: c.ink, textAlignVertical: 'top' as const },
    // footer
    footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.page, borderTopWidth: 1, borderTopColor: c.line },
    summary: { fontSize: 13.5, color: c.sub, textAlign: 'center' as const, marginBottom: 10 },
    summaryStrong: { color: c.ink, fontWeight: '600' as const },
    send: { minHeight: 54, borderRadius: 27, backgroundColor: c.blue, alignItems: 'center' as const, justifyContent: 'center' as const },
    sendOff: { opacity: 0.38 },
    sendText: { fontSize: 16, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF', letterSpacing: 0.2 },
    formError: { fontSize: 14, color: c.red, textAlign: 'center' as const, marginBottom: 10 },
    // ---- my requests ----
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
    card: { backgroundColor: c.tint, borderRadius: 24, padding: 16, marginBottom: 12 },
    cardTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
    cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.white, alignItems: 'center' as const, justifyContent: 'center' as const },
    cardTitle: { fontSize: 16, fontWeight: '600' as const, color: c.ink },
    cardSub: { fontSize: 13, color: c.sub, marginTop: 2 },
    status: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, alignSelf: 'flex-start' as const, marginTop: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12.5, fontWeight: '700' as const },
    cardChips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 12 },
    cardChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.white },
    cardChipText: { fontSize: 12.5, color: c.ink },
    meta: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14, marginTop: 12 },
    metaItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
    metaText: { fontSize: 13, color: c.sub },
    note: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: c.white },
    noteLabel: { fontSize: 11.5, fontWeight: '700' as const, color: c.blue, letterSpacing: 0.6 },
    noteText: { fontSize: 13.5, color: c.ink, marginTop: 3, lineHeight: 19 },
    jobLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.white },
    jobLinkText: { flex: 1, fontSize: 14, fontWeight: '600' as const, color: c.blue },
    cancel: { alignSelf: 'flex-start' as const, marginTop: 12, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.redSoft },
    cancelText: { fontSize: 13.5, fontWeight: '600' as const, color: c.red },
    empty: { alignItems: 'center' as const, paddingTop: 56, paddingHorizontal: 24 },
    emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
    emptyTitle: { fontSize: 18, fontWeight: '600' as const, color: c.ink, marginTop: 16 },
    emptySub: { fontSize: 14.5, color: c.sub, textAlign: 'center' as const, marginTop: 6, lineHeight: 21 },
    emptyBtn: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, backgroundColor: c.blue },
    emptyBtnText: { fontSize: 15, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
  };
};

// ---------- small drawn icons ----------

function Tick({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="11" fill={color} />
      <Path d="M7.2 12.3l3.2 3.1 6.4-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const GROUP_TONE: Record<ServiceGroup, { bg: string; fg: string }> = {
  general: { bg: '#E3ECFD', fg: '#0B57D0' },
  mosquito: { bg: '#E6F4EA', fg: '#188038' },
  insects: { bg: '#FEF3E2', fg: '#B06000' },
  rodent: { bg: '#F3E8FD', fg: '#7B3FC4' },
  termite: { bg: '#FCE8E6', fg: '#B3261E' },
  cleaning: { bg: '#E0F4F5', fg: '#00796B' },
  works: { bg: '#ECEFF1', fg: '#455A64' },
};

/** A small line icon per service group. */
function GroupIcon({ group, color }: { group: ServiceGroup; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (group === 'general') return <ShieldIcon size={19} color={color} />;
  if (group === 'termite') return <HomeIcon size={19} color={color} />;
  if (group === 'cleaning') return <SparkleIcon size={19} color={color} />;
  if (group === 'works') return <SettingsIcon size={19} color={color} />;
  if (group === 'rodent') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path d="M4 15c0-3.9 3.1-7 7-7 3.4 0 6 2.4 6.6 5.5L20 15h-1.5" {...s} />
        <Path d="M4 15c0 1.7 1.3 3 3 3h9" {...s} />
        <Circle cx="9" cy="8.5" r="2" {...s} />
        <Circle cx="14.3" cy="12.3" r="0.6" fill={color} />
        <Path d="M16 18c2 0 3.5.8 4 2" {...s} />
      </Svg>
    );
  }
  // mosquito / insects: a simple bug
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M9 7.5a3 3 0 0 1 6 0" {...s} />
      <Path d="M8 10.5h8v3a4 4 0 0 1-8 0z" {...s} />
      <Path d="M12 10.5v7M5 9l3 1.5M19 9l-3 1.5M4.5 14H8M19.5 14H16M5.5 19l2.8-2.2M18.5 19l-2.8-2.2" {...s} />
      {group === 'mosquito' && <Path d="M12 4.5V2.5" {...s} />}
    </Svg>
  );
}

function SearchGlass({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="6.5" fill="none" stroke={color} strokeWidth={2} />
      <Path d="M16 16l4.5 4.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Time-of-day icons for the slot tiles. */
function SlotIcon({ slot, color }: { slot: RequestSlot; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {slot === 'ANY' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...s} />
          <Path d="M12 7.5V12l3 2" {...s} />
        </>
      )}
      {slot === 'MORNING' && (
        <>
          <Path d="M4 17h16M7 17a5 5 0 0 1 10 0" {...s} />
          <Path d="M12 6.5V8.5M6.2 9.6l1.4 1.4M17.8 9.6l-1.4 1.4" {...s} />
        </>
      )}
      {slot === 'AFTERNOON' && (
        <>
          <Circle cx="12" cy="12" r="4" {...s} />
          <Path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6" {...s} />
        </>
      )}
      {slot === 'EVENING' && <Path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" {...s} />}
    </Svg>
  );
}

function StepHead({ n, title, done, right }: { n: number; title: string; done?: boolean; right?: React.ReactNode }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.stepHead}>
      <View style={[styles.stepNo, done && styles.stepNoDone]}>
        {done ? (
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={theme.isDark ? '#0B1B3A' : '#FFFFFF'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : (
          <Text style={styles.stepNoText}>{n}</Text>
        )}
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      {right}
    </View>
  );
}

/** Request a service (web: PortalRequestService) - a short step-by-step form, and the client's own requests. */
export function ClientRequestServiceScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientRequestService'>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
  const toast = useToast();
  const { outlets, outletId, outletName } = useClientPortal();

  const [tab, setTab] = useState<'new' | 'mine'>(params?.tab === 'mine' ? 'mine' : 'new');
  // Form
  const [siteId, setSiteId] = useState(params?.siteId || (outlets.length === 1 ? outlets[0].id : outletId));
  const [type, setType] = useState<RequestType>('PEST');
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [group, setGroup] = useState<ServiceGroup | 'all'>('all');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<RequestSlot>('ANY');
  const [notes, setNotes] = useState('');
  const [outletSheet, setOutletSheet] = useState(false);
  const [dateSheet, setDateSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // List
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [counts, setCounts] = useState<{ open: number; all: number } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toCancel, setToCancel] = useState<ServiceRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fullCatalog = useMemo(
    () => (type === 'PEST' ? PEST_SERVICES : type === 'DEEP' ? DEEP_CLEANING_SERVICES : [...PEST_SERVICES, ...DEEP_CLEANING_SERVICES]),
    [type],
  );
  // Groups present for the chosen type, in a fixed order.
  const groups = useMemo(() => {
    const present = new Set(fullCatalog.map((sv) => serviceMeta(sv).group));
    return (Object.keys(GROUP_LABEL) as ServiceGroup[]).filter((g) => present.has(g));
  }, [fullCatalog]);
  const inGroup = useMemo(
    () => (group === 'all' ? fullCatalog : fullCatalog.filter((sv) => serviceMeta(sv).group === group)),
    [fullCatalog, group],
  );
  const catalog = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q) return fullCatalog.filter((sv) => sv.toLowerCase().includes(q));
    if (showAll || inGroup.length <= SHOWN + 1) return inGroup;
    // Collapsed: the first few, plus anything already picked further down.
    const head = inGroup.slice(0, SHOWN);
    return [...head, ...picked.filter((p) => inGroup.includes(p) && !head.includes(p))];
  }, [fullCatalog, inGroup, filter, showAll, picked]);

  const loadList = useCallback(async () => {
    try {
      const body = await listServiceRequests(outletId || undefined);
      setRequests(body.requests);
      setCounts(body.counts);
      setListError(null);
    } catch (err) {
      setListError((err as Error).message || 'Could not load your requests');
    } finally {
      setRefreshing(false);
    }
  }, [outletId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const changeType = (next: RequestType) => {
    setType(next);
    setShowAll(false);
    setGroup('all');
    // Keep only what still belongs to the new type.
    const allowed = next === 'PEST' ? PEST_SERVICES : next === 'DEEP' ? DEEP_CLEANING_SERVICES : [...PEST_SERVICES, ...DEEP_CLEANING_SERVICES];
    setPicked((p) => p.filter((s) => allowed.includes(s)));
  };
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const needsOutlet = outlets.length > 1;
  const ready = !!siteId && picked.length > 0;
  const n = (k: number) => (needsOutlet ? k + 1 : k);

  const submit = async () => {
    if (!siteId) return setFormError('Please choose the outlet.');
    if (!picked.length) return setFormError('Please choose at least one service.');
    setSaving(true);
    setFormError(null);
    try {
      await createServiceRequest({ siteId, type, subServices: picked, preferredDate: date || undefined, slot, notes: notes.trim() });
      setPicked([]);
      setDate('');
      setSlot('ANY');
      setNotes('');
      setFilter('');
      setShowAll(false);
      setGroup('all');
      toast.show('Request sent - we will schedule it soon');
      setTab('mine');
      loadList();
    } catch (err) {
      setFormError((err as Error).message || 'Could not send the request. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      await cancelServiceRequest(toCancel.id);
      toast.show('Request cancelled');
      setToCancel(null);
      loadList();
    } catch (err) {
      setListError((err as Error).message || 'Could not cancel the request');
      setToCancel(null);
    } finally {
      setCancelling(false);
    }
  };

  const typeLabel = TYPES.find((x) => x.key === type)?.label || '';
  const slotLabel = SLOTS.find((x) => x.key === slot)?.label || '';

  const form = (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {needsOutlet && (
          <View style={styles.step}>
            <StepHead n={1} title="Outlet" done={!!siteId} />
            <Pressable onPress={() => setOutletSheet(true)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
              <View style={styles.rowIcon}>
                <PinIcon size={18} color={c.blue} />
              </View>
              <Text style={[styles.rowText, !siteId && styles.rowPlaceholder]} numberOfLines={1}>
                {siteId ? outletName(siteId) : 'Choose the outlet'}
              </Text>
              <ChevronRightIcon size={18} color={c.sub} />
            </Pressable>
          </View>
        )}

        {/* ---- service type ---- */}
        <View style={styles.step}>
          <StepHead n={n(1)} title="What do you need?" done />
          <View style={styles.types}>
            {TYPES.map((t) => {
              const on = type === t.key;
              return (
                <Pressable key={t.key} onPress={() => changeType(t.key)} style={({ pressed }) => [styles.type, on && styles.typeOn, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  {on && (
                    <View style={styles.tick}>
                      <Tick color={c.blue} size={18} />
                    </View>
                  )}
                  <View style={[styles.typeIcon, on && styles.typeIconOn]}>
                    <t.Icon size={22} color={on ? (theme.isDark ? '#0B1B3A' : '#FFFFFF') : c.blue} />
                  </View>
                  <Text style={styles.typeLabel}>{t.label}</Text>
                  <Text style={styles.typeHint} numberOfLines={2}>
                    {t.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ---- services ---- */}
        <View style={styles.step}>
          <StepHead
            n={n(2)}
            title="Choose services"
            done={picked.length > 0}
            right={
              picked.length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{picked.length} selected</Text>
                </View>
              ) : undefined
            }
          />
          <View style={styles.search}>
            <SearchGlass color={c.sub} />
            <TextInput value={filter} onChangeText={setFilter} placeholder="Search services" placeholderTextColor={c.faint} style={styles.searchInput} />
            {!!filter && (
              <Pressable onPress={() => setFilter('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <CloseIcon size={16} color={c.sub} />
              </Pressable>
            )}
          </View>
          {!filter && groups.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groups} keyboardShouldPersistTaps="handled">
              {(['all', ...groups] as (ServiceGroup | 'all')[]).map((g) => {
                const on = group === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => {
                      setGroup(g);
                      setShowAll(false);
                    }}
                    style={({ pressed }) => [styles.group, on && styles.groupOn, pressed && styles.pressed]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.groupText, on && styles.groupTextOn]}>{g === 'all' ? 'All' : GROUP_LABEL[g]}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.listBox}>
            {catalog.map((sv, i) => {
              const on = picked.includes(sv);
              const meta = serviceMeta(sv);
              const tone = GROUP_TONE[meta.group];
              return (
                <React.Fragment key={sv}>
                  {i > 0 && !on && !picked.includes(catalog[i - 1]) && <View style={styles.svcDivider} />}
                  <Pressable onPress={() => toggle(sv)} style={({ pressed }) => [styles.svc, on && styles.svcOn, pressed && styles.pressed]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={sv}>
                    <View style={[styles.svcIcon, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : tone.bg }]}>
                      <GroupIcon group={meta.group} color={tone.fg} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={[styles.svcTitle, on && styles.svcTitleOn]} numberOfLines={2}>
                        {meta.title}
                      </Text>
                      <Text style={styles.svcSub}>{meta.code || GROUP_LABEL[meta.group]}</Text>
                    </View>
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on && (
                        <Svg width={13} height={13} viewBox="0 0 24 24">
                          <Path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={theme.isDark ? '#0B1B3A' : '#FFFFFF'} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
                        </Svg>
                      )}
                    </View>
                  </Pressable>
                </React.Fragment>
              );
            })}
            {!catalog.length && <Text style={styles.noMatch}>No service matches "{filter}"</Text>}
          </View>
          {!filter && inGroup.length > SHOWN + 1 && (
            <Pressable onPress={() => setShowAll((v) => !v)} style={({ pressed }) => [styles.more, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.moreText}>{showAll ? 'Show fewer' : `Show all ${inGroup.length}`}</Text>
              <Svg width={14} height={14} viewBox="0 0 24 24" style={{ transform: [{ rotate: showAll ? '180deg' : '0deg' }] }}>
                <Path d="M6 9l6 6 6-6" fill="none" stroke={c.blue} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          )}
        </View>

        {/* ---- when ---- */}
        <View style={styles.step}>
          <StepHead n={n(3)} title="When suits you?" right={<Text style={styles.stepHint}>Optional</Text>} />
          <Pressable onPress={() => setDateSheet(true)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.rowIcon}>
              <CalendarIcon size={18} color={c.blue} />
            </View>
            <Text style={[styles.rowText, !date && styles.rowPlaceholder]}>{date ? formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Any day'}</Text>
            {date ? (
              <Pressable onPress={() => setDate('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear date">
                <CloseIcon size={16} color={c.sub} />
              </Pressable>
            ) : (
              <ChevronRightIcon size={18} color={c.sub} />
            )}
          </Pressable>
          <View style={styles.slots}>
            {SLOTS.map((s) => {
              const on = slot === s.key;
              return (
                <Pressable key={s.key} onPress={() => setSlot(s.key)} style={({ pressed }) => [styles.slot, on && styles.slotOn, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <SlotIcon slot={s.key} color={on ? c.blue : c.sub} />
                  <Text style={styles.slotLabel}>{s.label}</Text>
                  <Text style={styles.slotSub}>{s.sub}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ---- notes ---- */}
        <View style={styles.step}>
          <StepHead n={n(4)} title="Anything we should know?" right={<Text style={styles.stepHint}>Optional</Text>} />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Area, access, timing…"
            placeholderTextColor={c.faint}
            multiline
            style={styles.notes}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
        {formError ? (
          <Text style={styles.formError}>{formError}</Text>
        ) : (
          <Text style={styles.summary} numberOfLines={1}>
            {picked.length ? (
              <>
                <Text style={styles.summaryStrong}>{plural(picked.length, 'service')}</Text> · {typeLabel} · {date ? formatDate(date, { day: 'numeric', month: 'short' }) : 'Any day'} · {slotLabel}
              </>
            ) : (
              'Pick at least one service to continue'
            )}
          </Text>
        )}
        <Pressable
          onPress={submit}
          disabled={!ready || saving}
          style={({ pressed }) => [styles.send, (!ready || saving) && styles.sendOff, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || saving, busy: saving }}
        >
          {saving ? <ActivityIndicator color={theme.isDark ? '#0B1B3A' : '#FFFFFF'} /> : <Text style={styles.sendText}>Send request</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );

  const statusColors = (tone: 'amber' | 'green' | 'red' | 'slate') =>
    ({
      amber: { fg: c.amber, bg: c.amberSoft },
      green: { fg: c.green, bg: c.greenSoft },
      red: { fg: c.red, bg: c.redSoft },
      slate: { fg: c.slate, bg: c.slateSoft },
    })[tone];

  const list = (
    <ScrollView
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={brandRefreshControl(refreshing, () => {
        setRefreshing(true);
        loadList();
      })}
    >
      <RefreshBanner refreshing={refreshing} />
      <CrmErrorBanner message={listError} onRetry={loadList} />
      {requests === null ? (
        Array.from({ length: 3 }).map((_, i) => <CrmSkeleton key={i} height={140} radius={24} style={{ marginBottom: 12 }} />)
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <SparkleIcon size={32} color={c.blue} />
          </View>
          <Text style={styles.emptyTitle}>No requests yet</Text>
          <Text style={styles.emptySub}>Book a visit in a few taps - we'll schedule it and keep you posted here.</Text>
          <Pressable onPress={() => setTab('new')} style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.emptyBtnText}>Request a service</Text>
          </Pressable>
        </View>
      ) : (
        requests.map((r) => {
          const t = TYPES.find((x) => x.key === r.service_type) || TYPES[0];
          const st = STATUS[r.status] || { label: r.status, tone: 'slate' as const };
          const sc = statusColors(st.tone);
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <t.Icon size={20} color={c.blue} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>{serviceLabel(r.service_type)}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {r.site_name || '—'} · sent {formatDate(r.created_at, { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>
              <View style={[styles.status, { backgroundColor: sc.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: sc.fg }]} />
                <Text style={[styles.statusText, { color: sc.fg }]}>{st.label}</Text>
              </View>
              {r.sub_services.length > 0 && (
                <View style={styles.cardChips}>
                  {r.sub_services.map((s) => (
                    <View key={s} style={styles.cardChip}>
                      <Text style={styles.cardChipText}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(r.preferred_date || (r.preferred_slot && r.preferred_slot !== 'ANY')) && (
                <View style={styles.meta}>
                  {!!r.preferred_date && (
                    <View style={styles.metaItem}>
                      <CalendarIcon size={14} color={c.sub} />
                      <Text style={styles.metaText}>{formatDate(r.preferred_date, { day: 'numeric', month: 'short' })}</Text>
                    </View>
                  )}
                  {!!r.preferred_slot && r.preferred_slot !== 'ANY' && (
                    <View style={styles.metaItem}>
                      <ClockIcon size={14} color={c.sub} />
                      <Text style={styles.metaText}>{SLOTS.find((s) => s.key === r.preferred_slot)?.label}</Text>
                    </View>
                  )}
                </View>
              )}
              {!!r.staff_note && (
                <View style={styles.note}>
                  <Text style={styles.noteLabel}>BESTSERVE</Text>
                  <Text style={styles.noteText}>{r.staff_note}</Text>
                </View>
              )}
              {r.jobs.map((j) => (
                <Pressable key={j.id} onPress={() => navigation.navigate('ClientJobDetail', { jobId: j.id })} style={({ pressed }) => [styles.jobLink, pressed && styles.pressed]} accessibilityRole="button">
                  <BriefcaseIcon size={16} color={c.blue} />
                  <Text style={styles.jobLinkText} numberOfLines={1}>
                    Job #{j.code || j.id}
                    {j.sub_service ? ` · ${j.sub_service}` : ''}
                  </Text>
                  <ChevronRightIcon size={16} color={c.blue} />
                </Pressable>
              ))}
              {r.status === 'NEW' && (
                <Pressable onPress={() => setToCancel(r)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]} hitSlop={6} accessibilityRole="button">
                  <Text style={styles.cancelText}>Cancel request</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  return (
    <ClientPage title="Request a service" back>
      <Segmented
        options={[
          { key: 'new', label: 'New request' },
          { key: 'mine', label: counts?.open ? `My requests · ${counts.open}` : 'My requests' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'new' ? form : list}

      <OutletSheet visible={outletSheet} onClose={() => setOutletSheet(false)} outlets={outlets} value={siteId} onChange={setSiteId} allowAll={false} />
      <DateSheet
        visible={dateSheet}
        onClose={() => setDateSheet(false)}
        title="Preferred date"
        value={date || null}
        minDate={todayStr()}
        onPick={(d) => {
          setDate(d);
          setDateSheet(false);
        }}
      />
      <Popup
        visible={!!toCancel}
        onClose={() => setToCancel(null)}
        dismissible={!cancelling}
        icon={<AlertTriangleIcon size={20} color="#FFFFFF" />}
        tone="danger"
        title="Cancel this request?"
        subtitle="It is not scheduled yet."
      >
        <PopupButtons cancelLabel="Keep it" onCancel={() => setToCancel(null)} confirmLabel="Cancel request" tone="danger" onConfirm={doCancel} loading={cancelling} />
      </Popup>
    </ClientPage>
  );
}
