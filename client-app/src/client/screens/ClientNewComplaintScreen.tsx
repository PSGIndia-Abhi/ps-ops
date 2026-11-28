import React, { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { BriefcaseIcon, CameraIcon, ChevronRightIcon, CloseIcon, DocumentIcon, GalleryIcon, PinIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { AttachSheet, useFilePicker } from '../../helpdesk/ui';
import { createComplaint, type ComplaintCategory, type ComplaintPriority } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import type { ClientStackParamList } from '../navigation';
import { OutletSheet } from '../ui/OutletPicker';
import { ClientPage } from '../ui/page';
import { ImagePreview } from '../ui/ImagePreview';

/** Most files a complaint takes (the backend limit). */
const MAX_FILES = 5;
const SUBJECT_MAX = 200;

const palette = (t: CrmTheme) => ({
  page: t.isDark ? t.background : '#FFFFFF',
  ink: t.isDark ? '#E6E7EA' : '#1B1C1F',
  sub: t.isDark ? '#A3A7AE' : '#5E6470',
  faint: t.isDark ? '#6E737C' : '#9AA1AD',
  blue: t.isDark ? '#A8C7FA' : '#0B57D0',
  blueSoft: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD',
  tint: t.isDark ? t.surfaceAlt : '#F2F5FB',
  white: t.isDark ? t.surface : '#FFFFFF',
  line: t.isDark ? 'rgba(255,255,255,0.14)' : '#C9D3E3',
  red: t.isDark ? '#F28B82' : '#B3261E',
  green: t.isDark ? '#81C995' : '#188038',
});

const PRIORITIES: { key: ComplaintPriority; label: string; color: string; soft: string }[] = [
  { key: 'LOW', label: 'Low', color: '#5F6368', soft: '#F1F3F4' },
  { key: 'MEDIUM', label: 'Normal', color: '#0B57D0', soft: '#E3ECFD' },
  { key: 'HIGH', label: 'High', color: '#E37400', soft: '#FEF1E0' },
  { key: 'URGENT', label: 'Urgent', color: '#D93025', soft: '#FCE8E6' },
];

/** A small line icon per urgency: down arrow, equals, up arrow, flame. */
function PriorityIcon({ level, color }: { level: ComplaintPriority; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      {level === 'LOW' && <Path d="M12 5v14M6 13l6 6 6-6" {...s} />}
      {level === 'MEDIUM' && <Path d="M5 9h14M5 15h14" {...s} />}
      {level === 'HIGH' && <Path d="M12 19V5M6 11l6-6 6 6" {...s} />}
      {level === 'URGENT' && <Path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" {...s} />}
    </Svg>
  );
}

const factory = (t: CrmTheme) => {
  const c = palette(t);
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.65 },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
    lead: { fontSize: 14.5, lineHeight: 21, color: c.sub, marginBottom: 14, paddingHorizontal: 4 },
    step: { backgroundColor: c.tint, borderRadius: 24, padding: 16, marginBottom: 14 },
    stepHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 14 },
    stepNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.blue, alignItems: 'center' as const, justifyContent: 'center' as const },
    stepNoDone: { backgroundColor: c.green },
    stepNoText: { fontSize: 13, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
    stepTitle: { flex: 1, fontSize: 16.5, fontWeight: '600' as const, color: c.ink },
    stepHint: { fontSize: 13, color: c.sub },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: c.white },
    rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
    rowText: { flex: 1, fontSize: 15.5, fontWeight: '500' as const, color: c.ink },
    rowPlaceholder: { color: c.sub, fontWeight: '400' as const },
    job: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.white, marginBottom: 14 },
    jobLabel: { fontSize: 11.5, fontWeight: '700' as const, color: c.blue, letterSpacing: 0.5 },
    jobText: { fontSize: 14.5, fontWeight: '600' as const, color: c.ink, marginTop: 1 },
    inputLabel: { fontSize: 13.5, fontWeight: '600' as const, color: c.ink, marginBottom: 8 },
    input: { minHeight: 52, borderRadius: 16, backgroundColor: c.white, paddingHorizontal: 14, fontSize: 15.5, color: c.ink, borderWidth: 1.5, borderColor: 'transparent' },
    inputFocused: { borderColor: c.blue },
    area: { minHeight: 112, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' as const },
    counter: { fontSize: 12, color: c.faint, textAlign: 'right' as const, marginTop: 6 },
    gap: { height: 14 },
    prios: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
    prio: { width: '47.8%' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 16, backgroundColor: c.white, borderWidth: 1.5, borderColor: 'transparent' },
    prioIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const },
    prioLabel: { flex: 1, fontSize: 15, fontWeight: '600' as const, color: c.ink },
    cats: { flexDirection: 'row' as const, gap: 10 },
    cat: { flex: 1, padding: 12, borderRadius: 18, backgroundColor: c.white, borderWidth: 1.5, borderColor: 'transparent' },
    catIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center' as const, justifyContent: 'center' as const },
    catLabel: { fontSize: 15.5, fontWeight: '700' as const, color: c.ink, marginTop: 10 },
    catHint: { fontSize: 12, color: c.sub, marginTop: 2, lineHeight: 16 },
    catTick: { position: 'absolute' as const, top: 10, right: 10 },
    files: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
    tile: { width: 92, height: 92, borderRadius: 18, overflow: 'hidden' as const, backgroundColor: c.white, alignItems: 'center' as const, justifyContent: 'center' as const },
    thumb: { width: '100%' as const, height: '100%' as const },
    pdfName: { fontSize: 10.5, color: c.sub, marginTop: 4, paddingHorizontal: 6, textAlign: 'center' as const },
    remove: { position: 'absolute' as const, top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center' as const, justifyContent: 'center' as const },
    add: { borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: c.line, backgroundColor: 'transparent' },
    addText: { fontSize: 12.5, fontWeight: '600' as const, color: c.blue, marginTop: 4 },
    zone: { alignItems: 'center' as const, paddingVertical: 20, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: c.line, backgroundColor: c.white },
    zoneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
    zoneTitle: { fontSize: 15.5, fontWeight: '600' as const, color: c.ink, marginTop: 12 },
    zoneSub: { fontSize: 12.5, color: c.sub, marginTop: 3 },
    zoneActions: { flexDirection: 'row' as const, gap: 8, marginTop: 16, alignSelf: 'stretch' as const },
    zoneBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, minHeight: 42, borderRadius: 21, backgroundColor: c.tint },
    zoneBtnText: { fontSize: 13.5, fontWeight: '600' as const, color: c.blue },
    fileError: { fontSize: 13, color: c.red, marginTop: 10 },
    footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.page, borderTopWidth: 1, borderTopColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#E6EBF3' },
    note: { fontSize: 13, color: c.sub, textAlign: 'center' as const, marginBottom: 10 },
    error: { fontSize: 14, color: c.red, textAlign: 'center' as const, marginBottom: 10 },
    send: { minHeight: 54, borderRadius: 27, backgroundColor: c.blue, alignItems: 'center' as const, justifyContent: 'center' as const },
    sendOff: { opacity: 0.38 },
    sendText: { fontSize: 16, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF', letterSpacing: 0.2 },
  };
};

// "Complaint about" tiles (one or both). Accounts is for head-office logins only.
const CATEGORIES: { key: ComplaintCategory; label: string; hint: string; color: string; soft: string }[] = [
  { key: 'SERVICE', label: 'Service', hint: 'Treatment, technician, visit…', color: '#0B57D0', soft: '#E3ECFD' },
  { key: 'ACCOUNTS', label: 'Accounts', hint: 'Invoice, payment, billing…', color: '#00796B', soft: '#E0F4F2' },
];

function CategoryIcon({ kind, color }: { kind: ComplaintCategory; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'SERVICE') {
    // a wrench
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...s} />
      </Svg>
    );
  }
  // a receipt with a rupee sign
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" {...s} />
      <Path d="M9.5 8h5M9.5 10.5h5M11 8c1.7 0 2.6.8 2.6 1.9s-1 1.9-2.6 1.9h-1l3.2 2.8" {...s} />
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

/** Raise a complaint (web: ComplaintForm) - outlet, optional job, subject, details, urgency, photos / PDF. */
export function ClientNewComplaintScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ClientStackParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientNewComplaint'>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
  const { outlets, outletId, outletName, isCompanyAdmin } = useClientPortal();
  const picker = useFilePicker();

  const [siteId, setSiteId] = useState(params?.siteId || (outlets.length === 1 ? outlets[0].id : outletId));
  const [jobId, setJobId] = useState(params?.jobId || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('MEDIUM');
  // Outlet logins can only raise Service complaints, so the choice is skipped for them.
  const [category, setCategory] = useState<ComplaintCategory[]>(isCompanyAdmin ? [] : ['SERVICE']);
  const toggleCategory = (k: ComplaintCategory) => setCategory((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const [focus, setFocus] = useState<'subject' | 'details' | null>(null);
  const [outletSheet, setOutletSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const needsOutlet = outlets.length > 1;
  const askCategory = isCompanyAdmin;
  const n = (k: number) => k + (needsOutlet ? 1 : 0) + (askCategory ? 1 : 0);
  const ready = !!siteId && !!subject.trim() && category.length > 0;

  const submit = async () => {
    if (!siteId) return setError('Please choose the outlet.');
    if (!category.length) return setError('Please choose what the complaint is about: Service or Accounts.');
    if (!subject.trim()) return setError('Please add a short subject.');
    setSaving(true);
    setError(null);
    try {
      const res = await createComplaint({ subject: subject.trim(), message: message.trim(), priority, category, siteId, jobId: jobId || undefined, files: picker.files });
      navigation.replace('ClientComplaintDetail', { complaintId: res.id, notice: res.warning || 'Complaint raised - we will get back to you soon' });
    } catch (err) {
      setError((err as Error).message || 'Could not raise the complaint. Please try again.');
      setSaving(false);
    }
  };

  return (
    <ClientPage title="Raise a complaint" back>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {needsOutlet && (
            <View style={styles.step}>
              <StepHead n={1} title="Which outlet?" done={!!siteId} />
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

          {/* ---- complaint about (head office: Service and / or Accounts) ---- */}
          {askCategory && (
            <View style={styles.step}>
              <StepHead n={needsOutlet ? 2 : 1} title="Complaint about" done={category.length > 0} right={<Text style={styles.stepHint}>One or both</Text>} />
              <View style={styles.cats}>
                {CATEGORIES.map((k) => {
                  const on = category.includes(k.key);
                  return (
                    <Pressable
                      key={k.key}
                      onPress={() => toggleCategory(k.key)}
                      style={({ pressed }) => [styles.cat, on && { borderColor: k.color, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF' }, pressed && styles.pressed]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${k.label}: ${k.hint}`}
                    >
                      {on && (
                        <View style={styles.catTick}>
                          <Svg width={20} height={20} viewBox="0 0 24 24">
                            <Circle cx="12" cy="12" r="11" fill={k.color} />
                            <Path d="M7.2 12.3l3.2 3.1 6.4-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        </View>
                      )}
                      <View style={[styles.catIcon, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : k.soft }]}>
                        <CategoryIcon kind={k.key} color={theme.isDark ? c.ink : k.color} />
                      </View>
                      <Text style={styles.catLabel}>{k.label}</Text>
                      <Text style={styles.catHint} numberOfLines={2}>
                        {k.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ---- what's wrong ---- */}
          <View style={styles.step}>
            <StepHead n={n(1)} title="What's wrong?" done={!!subject.trim()} />
            {!!jobId && (
              <View style={styles.job}>
                <View style={styles.rowIcon}>
                  <BriefcaseIcon size={17} color={c.blue} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.jobLabel}>ABOUT JOB</Text>
                  <Text style={styles.jobText} numberOfLines={1}>
                    {params?.jobLabel || 'This job'}
                  </Text>
                </View>
                <Pressable onPress={() => setJobId('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove job">
                  <CloseIcon size={16} color={c.sub} />
                </Pressable>
              </View>
            )}
            <Text style={styles.inputLabel}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={SUBJECT_MAX}
              placeholder="e.g. Cockroaches seen in the kitchen"
              placeholderTextColor={c.faint}
              style={[styles.input, focus === 'subject' && styles.inputFocused]}
              onFocus={() => setFocus('subject')}
              onBlur={() => setFocus(null)}
              returnKeyType="next"
            />
            <View style={styles.gap} />
            <Text style={styles.inputLabel}>Details</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="What happened, where, and since when?"
              placeholderTextColor={c.faint}
              multiline
              style={[styles.input, styles.area, focus === 'details' && styles.inputFocused]}
              onFocus={() => setFocus('details')}
              onBlur={() => setFocus(null)}
            />
            {subject.length > SUBJECT_MAX - 40 && (
              <Text style={styles.counter}>
                {subject.length}/{SUBJECT_MAX}
              </Text>
            )}
          </View>

          {/* ---- urgency ---- */}
          <View style={styles.step}>
            <StepHead n={n(2)} title="How urgent is it?" done />
            <View style={styles.prios}>
              {PRIORITIES.map((p) => {
                const on = priority === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPriority(p.key)}
                    style={({ pressed }) => [styles.prio, on && { borderColor: p.color, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF' }, pressed && styles.pressed]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[styles.prioIcon, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : p.soft }]}>
                      <PriorityIcon level={p.key} color={theme.isDark ? c.ink : p.color} />
                    </View>
                    <Text style={[styles.prioLabel, on && { color: theme.isDark ? c.ink : p.color }]}>{p.label}</Text>
                    {on && (
                      <Svg width={18} height={18} viewBox="0 0 24 24">
                        <Circle cx="12" cy="12" r="11" fill={p.color} />
                        <Path d="M7.2 12.3l3.2 3.1 6.4-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ---- photos ---- */}
          <View style={styles.step}>
            <StepHead n={n(3)} title="Add photos" done={picker.files.length > 0} right={<Text style={styles.stepHint}>{picker.files.length ? `${picker.files.length}/${MAX_FILES}` : 'Optional'}</Text>} />
            {picker.files.length === 0 ? (
              <View style={styles.zone}>
                <View style={styles.zoneIcon}>
                  <CameraIcon size={26} color={c.blue} />
                </View>
                <Text style={styles.zoneTitle}>Show us the problem</Text>
                <Text style={styles.zoneSub}>Photos or PDF · up to {MAX_FILES} files</Text>
                <View style={styles.zoneActions}>
                  <Pressable onPress={picker.camera} style={({ pressed }) => [styles.zoneBtn, pressed && styles.pressed]} accessibilityRole="button">
                    <CameraIcon size={16} color={c.blue} />
                    <Text style={styles.zoneBtnText}>Camera</Text>
                  </Pressable>
                  <Pressable onPress={picker.gallery} style={({ pressed }) => [styles.zoneBtn, pressed && styles.pressed]} accessibilityRole="button">
                    <GalleryIcon size={16} color={c.blue} />
                    <Text style={styles.zoneBtnText}>Gallery</Text>
                  </Pressable>
                  <Pressable onPress={picker.pdf} style={({ pressed }) => [styles.zoneBtn, pressed && styles.pressed]} accessibilityRole="button">
                    <DocumentIcon size={16} color={c.blue} />
                    <Text style={styles.zoneBtnText}>PDF</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
                        <View style={styles.files}>
              {picker.files.map((f, i) => (
                <View key={`${f.uri}-${i}`} style={styles.tile}>
                  {f.type.startsWith('image/') ? (
                    <Pressable onPress={() => setPreview(i)} style={styles.thumb} accessibilityRole="imagebutton" accessibilityLabel={`Preview ${f.name}`}>
                      <Image source={{ uri: f.uri }} style={styles.thumb} />
                    </Pressable>
                  ) : (
                    <>
                      <DocumentIcon size={26} color={c.red} />
                      <Text style={styles.pdfName} numberOfLines={2}>
                        {f.name}
                      </Text>
                    </>
                  )}
                  <Pressable onPress={() => picker.remove(i)} hitSlop={8} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`}>
                    <CloseIcon size={12} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
              {picker.files.length < MAX_FILES && (
                <Pressable onPress={() => picker.setMenu(true)} style={({ pressed }) => [styles.tile, styles.add, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add photo or file">
                  <PlusIcon size={24} color={c.blue} />
                  <Text style={styles.addText}>Add</Text>
                </Pressable>
              )}
            </View>
            )}
            {!!picker.error && <Text style={styles.fileError}>{picker.error}</Text>}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            onPress={submit}
            disabled={!ready || saving}
            style={({ pressed }) => [styles.send, (!ready || saving) && styles.sendOff, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || saving, busy: saving }}
          >
            {saving ? <ActivityIndicator color={theme.isDark ? '#0B1B3A' : '#FFFFFF'} /> : <Text style={styles.sendText}>Submit complaint</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ImagePreview
        uri={preview != null ? picker.files[preview]?.uri ?? null : null}
        title={preview != null ? picker.files[preview]?.name : undefined}
        onClose={() => setPreview(null)}
        onRemove={preview != null ? () => picker.remove(preview) : undefined}
      />
      <AttachSheet picker={picker} />
      <OutletSheet visible={outletSheet} onClose={() => setOutletSheet(false)} outlets={outlets} value={siteId} onChange={setSiteId} allowAll={false} />
    </ClientPage>
  );
}
