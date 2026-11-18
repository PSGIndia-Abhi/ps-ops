import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  PinIcon,
  ShieldIcon,
  SparkleIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton, NoticeBanner } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { DEEP_CLEANING_SERVICES, PEST_SERVICES } from '../../screens/bookings/CreateBookingScreen';
import { todayStr } from '../../tasks/format';
import { DateSheet, Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { cancelServiceRequest, createServiceRequest, listServiceRequests, type RequestSlot, type RequestType, type ServiceRequest } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { formatDate, plural, serviceLabel } from '../format';
import type { ClientStackParamList } from '../navigation';
import { OutletSheet } from '../ui/OutletPicker';
import { ClientPage, Segmented, SOFT, TONES, type ToneKey } from '../ui/page';

type IconType = React.ComponentType<{ size?: number; color?: string }>;

const TYPES: { key: RequestType; label: string; hint: string; Icon: IconType; tone: ToneKey }[] = [
  { key: 'PEST', label: 'Pest control', hint: 'Cockroach, rodent, mosquito…', Icon: ShieldIcon, tone: 'green' },
  { key: 'DEEP', label: 'Cleaning', hint: 'Deep cleaning, floor care…', Icon: SparkleIcon, tone: 'teal' },
  { key: 'BOTH', label: 'Both', hint: 'Pest control + cleaning', Icon: BriefcaseIcon, tone: 'indigo' },
];
const SLOTS: { key: RequestSlot; label: string }[] = [
  { key: 'ANY', label: 'Any time' },
  { key: 'MORNING', label: 'Morning' },
  { key: 'AFTERNOON', label: 'Afternoon' },
  { key: 'EVENING', label: 'Evening' },
];
const REQUEST_STATUS: Record<string, { label: string; tone: ToneKey }> = {
  NEW: { label: 'Waiting for our team', tone: 'amber' },
  ASSIGNED: { label: 'Scheduled', tone: 'green' },
  REJECTED: { label: 'Declined', tone: 'red' },
  CANCELLED: { label: 'Cancelled', tone: 'slate' },
};

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: { ...typography.captionMedium, color: t.textSecondary, marginBottom: spacing.xs },
  labelRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, marginBottom: spacing.xs },
  labelCount: { ...typography.caption, color: TONES.blue.fg, marginLeft: 'auto' as const },
  field: { marginBottom: spacing.lg },
  select: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, borderRadius: 16, backgroundColor: SOFT(t) },
  selectText: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  placeholder: { color: t.textMuted, fontWeight: '400' as const },
  types: { flexDirection: 'row' as const, gap: spacing.xs },
  type: { flex: 1, alignItems: 'center' as const, paddingVertical: spacing.md, paddingHorizontal: 6, borderRadius: 18, borderWidth: 1.5, borderColor: t.border },
  typeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const },
  typeLabel: { ...typography.bodyMedium, color: t.textPrimary, marginTop: spacing.xs },
  typeHint: { ...typography.caption, fontSize: 11, color: t.textMuted, textAlign: 'center' as const, marginTop: 2 },
  filter: { ...typography.body, color: t.textPrimary, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, backgroundColor: SOFT(t), marginBottom: spacing.sm },
  services: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
  service: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: t.border },
  serviceOn: { backgroundColor: TONES.blue.bg, borderColor: TONES.blue.bg },
  serviceText: { ...typography.caption, fontSize: 13, color: t.textSecondary },
  serviceTextOn: { color: TONES.blue.fg, fontWeight: '600' as const },
  slots: { flexDirection: 'row' as const, gap: spacing.xs },
  slot: { flex: 1, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  slotText: { ...typography.caption, fontSize: 12.5, color: t.textSecondary },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: t.border },
  submit: { borderRadius: radii.pill },
  // My requests
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, paddingTop: spacing.sm },
  req: { borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.sm },
  reqTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  reqCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  reqTitle: { ...typography.bodyMedium, color: t.textPrimary },
  reqSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  reqStatus: { alignSelf: 'flex-start' as const, marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  reqStatusText: { ...typography.captionMedium, fontSize: 12 },
  reqServices: { ...typography.caption, color: t.textSecondary, marginTop: spacing.sm },
  reqMeta: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.md, marginTop: spacing.xs },
  reqMetaItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  reqMetaText: { ...typography.caption, color: t.textMuted },
  note: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: 12, backgroundColor: SOFT(t) },
  noteText: { ...typography.caption, color: t.textSecondary },
  jobLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: spacing.sm, paddingVertical: 6 },
  jobLinkText: { ...typography.captionMedium, color: TONES.blue.fg, flex: 1 },
  cancel: { alignSelf: 'flex-start' as const, marginTop: spacing.sm, paddingVertical: 4 },
  cancelText: { ...typography.captionMedium, color: TONES.red.fg },
  empty: { alignItems: 'center' as const, paddingTop: spacing.xxl, gap: spacing.sm },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: SOFT(t), alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary },
  emptySub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
});

export function ClientRequestServiceScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientRequestService'>>();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, outletId, outletName } = useClientPortal();

  const [tab, setTab] = useState<'new' | 'mine'>(params?.tab === 'mine' ? 'mine' : 'new');
  // Form
  const [siteId, setSiteId] = useState(params?.siteId || (outlets.length === 1 ? outlets[0].id : outletId));
  const [type, setType] = useState<RequestType>('PEST');
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<RequestSlot>('ANY');
  const [notes, setNotes] = useState('');
  const [outletSheet, setOutletSheet] = useState(false);
  const [dateSheet, setDateSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // List
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [counts, setCounts] = useState<{ open: number; all: number } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toCancel, setToCancel] = useState<ServiceRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const catalog = useMemo(() => {
    const list = type === 'PEST' ? PEST_SERVICES : type === 'DEEP' ? DEEP_CLEANING_SERVICES : [...PEST_SERVICES, ...DEEP_CLEANING_SERVICES];
    const q = filter.trim().toLowerCase();
    return q ? list.filter((s) => s.toLowerCase().includes(q)) : list;
  }, [type, filter]);

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
    // Keep only what still belongs to the new type.
    const allowed = next === 'PEST' ? PEST_SERVICES : next === 'DEEP' ? DEEP_CLEANING_SERVICES : [...PEST_SERVICES, ...DEEP_CLEANING_SERVICES];
    setPicked((p) => p.filter((s) => allowed.includes(s)));
  };
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

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
      setNotice('Request sent! Our team will schedule it and let you know.');
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
      setNotice('Request cancelled.');
      setToCancel(null);
      loadList();
    } catch (err) {
      setListError((err as Error).message || 'Could not cancel the request');
      setToCancel(null);
    } finally {
      setCancelling(false);
    }
  };

  const form = (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <CrmErrorBanner message={formError} />

        {outlets.length > 1 && (
          <View style={styles.field}>
            <Text style={styles.label}>Outlet *</Text>
            <Pressable onPress={() => setOutletSheet(true)} style={({ pressed }) => [styles.select, pressed && styles.pressed]} accessibilityRole="button">
              <PinIcon size={18} color={theme.primary} />
              <Text style={[styles.selectText, !siteId && styles.placeholder]} numberOfLines={1}>
                {siteId ? outletName(siteId) : 'Choose the outlet'}
              </Text>
              <ChevronRightIcon size={18} color={theme.textMuted} />
            </Pressable>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>What do you need?</Text>
          <View style={styles.types}>
            {TYPES.map((t) => {
              const on = type === t.key;
              const tone = TONES[t.tone];
              return (
                <Pressable
                  key={t.key}
                  onPress={() => changeType(t.key)}
                  style={({ pressed }) => [styles.type, on && { borderColor: tone.fg, backgroundColor: tone.bg }, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.typeCircle, { backgroundColor: on ? '#FFFFFF' : tone.bg }]}>
                    <t.Icon size={22} color={tone.fg} />
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

        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>Choose services *</Text>
            {picked.length > 0 && <Text style={styles.labelCount}>{plural(picked.length, 'service')} selected</Text>}
          </View>
          {type === 'BOTH' && (
            <TextInput value={filter} onChangeText={setFilter} placeholder="Search services" placeholderTextColor={theme.textMuted} style={styles.filter} />
          )}
          <View style={styles.services}>
            {catalog.map((s) => {
              const on = picked.includes(s);
              return (
                <Pressable key={s} onPress={() => toggle(s)} style={({ pressed }) => [styles.service, on && styles.serviceOn, pressed && styles.pressed]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  {on && <CheckCircleIcon size={14} color={TONES.blue.fg} />}
                  <Text style={[styles.serviceText, on && styles.serviceTextOn]}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Preferred date (optional)</Text>
          <Pressable onPress={() => setDateSheet(true)} style={({ pressed }) => [styles.select, pressed && styles.pressed]} accessibilityRole="button">
            <CalendarIcon size={18} color={theme.primary} />
            <Text style={[styles.selectText, !date && styles.placeholder]}>{date ? formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Any day that suits you'}</Text>
            {date ? (
              <Pressable onPress={() => setDate('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear date">
                <CloseIcon size={16} color={theme.textMuted} />
              </Pressable>
            ) : (
              <ChevronRightIcon size={18} color={theme.textMuted} />
            )}
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Preferred time</Text>
          <View style={styles.slots}>
            {SLOTS.map((s) => {
              const on = slot === s.key;
              return (
                <Pressable key={s.key} onPress={() => setSlot(s.key)} style={[styles.slot, on && { backgroundColor: TONES.blue.bg, borderColor: TONES.blue.bg }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[styles.slotText, on && { color: TONES.blue.fg, fontWeight: '600' }]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <CrmTextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Anything our team should know - area, access, timing…" multiline numberOfLines={3} style={{ minHeight: 90, textAlignVertical: 'top' }} />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={picked.length ? `Send request · ${plural(picked.length, 'service')}` : 'Send request'} onPress={submit} loading={saving} disabled={saving} style={styles.submit} />
      </View>
    </KeyboardAvoidingView>
  );

  const list = (
    <ScrollView
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadList();
          }}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }
    >
      <CrmErrorBanner message={listError} onRetry={loadList} />
      {requests === null ? (
        Array.from({ length: 3 }).map((_, i) => <CrmSkeleton key={i} height={120} radius={20} style={{ marginBottom: spacing.sm }} />)
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyCircle}>
            <SparkleIcon size={28} color={theme.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No requests yet</Text>
          <Text style={styles.emptySub}>Requests you send will show here with their status.</Text>
        </View>
      ) : (
        requests.map((r) => {
          const t = TYPES.find((x) => x.key === r.service_type) || TYPES[0];
          const st = REQUEST_STATUS[r.status] || { label: r.status, tone: 'slate' as ToneKey };
          const stTone = TONES[st.tone];
          return (
            <View key={r.id} style={styles.req}>
              <View style={styles.reqTop}>
                <View style={[styles.reqCircle, { backgroundColor: TONES[t.tone].bg }]}>
                  <t.Icon size={20} color={TONES[t.tone].fg} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.reqTitle}>{serviceLabel(r.service_type)}</Text>
                  <Text style={styles.reqSub}>
                    {r.site_name || '—'} · sent {formatDate(r.created_at, { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>
              <View style={[styles.reqStatus, { backgroundColor: stTone.bg }]}>
                <Text style={[styles.reqStatusText, { color: stTone.fg }]}>{st.label}</Text>
              </View>
              <Text style={styles.reqServices}>{r.sub_services.join(' · ')}</Text>
              {(r.preferred_date || (r.preferred_slot && r.preferred_slot !== 'ANY')) && (
                <View style={styles.reqMeta}>
                  {!!r.preferred_date && (
                    <View style={styles.reqMetaItem}>
                      <CalendarIcon size={13} color={theme.textMuted} />
                      <Text style={styles.reqMetaText}>{formatDate(r.preferred_date, { day: 'numeric', month: 'short' })}</Text>
                    </View>
                  )}
                  {!!r.preferred_slot && r.preferred_slot !== 'ANY' && (
                    <View style={styles.reqMetaItem}>
                      <ClockIcon size={13} color={theme.textMuted} />
                      <Text style={styles.reqMetaText}>{SLOTS.find((s) => s.key === r.preferred_slot)?.label}</Text>
                    </View>
                  )}
                </View>
              )}
              {!!r.staff_note && (
                <View style={styles.note}>
                  <Text style={styles.noteText}>BestServe: {r.staff_note}</Text>
                </View>
              )}
              {r.jobs.map((j) => (
                <Pressable key={j.id} onPress={() => navigation.navigate('ClientJobDetail', { jobId: j.id })} style={({ pressed }) => [styles.jobLink, pressed && styles.pressed]} accessibilityRole="button">
                  <BriefcaseIcon size={15} color={TONES.blue.fg} />
                  <Text style={styles.jobLinkText} numberOfLines={1}>
                    Job #{j.code || j.id}
                    {j.sub_service ? ` · ${j.sub_service}` : ''}
                  </Text>
                  <ChevronRightIcon size={15} color={TONES.blue.fg} />
                </Pressable>
              ))}
              {r.status === 'NEW' && (
                <Pressable onPress={() => setToCancel(r)} style={styles.cancel} hitSlop={8} accessibilityRole="button">
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
      {!!notice && (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
          <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />
        </View>
      )}
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
      <Sheet visible={!!toCancel} onClose={() => setToCancel(null)} title="Cancel this request?">
        <Text style={styles.sheetText}>Our team has not scheduled it yet. You can always send a new request later.</Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton label="Keep it" variant="secondary" onPress={() => setToCancel(null)} style={styles.flex1} />
          <PrimaryButton label="Cancel request" variant="brand" onPress={doCancel} loading={cancelling} style={styles.flex1} />
        </View>
      </Sheet>
    </ClientPage>
  );
}
