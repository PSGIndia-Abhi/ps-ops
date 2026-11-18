import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BriefcaseIcon, CameraIcon, ChevronRightIcon, CloseIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { AttachSheet, PickedFiles, useFilePicker } from '../../helpdesk/ui';
import { radii, spacing, typography } from '../../theme';
import { createComplaint, type ComplaintPriority } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import type { ClientStackParamList } from '../navigation';
import { OutletSheet } from '../ui/OutletPicker';
import { ClientPage, SOFT, TONES, type ToneKey } from '../ui/page';

const PRIORITIES: { key: ComplaintPriority; label: string; tone: ToneKey }[] = [
  { key: 'LOW', label: 'Low', tone: 'slate' },
  { key: 'MEDIUM', label: 'Normal', tone: 'blue' },
  { key: 'HIGH', label: 'High', tone: 'amber' },
  { key: 'URGENT', label: 'Urgent', tone: 'red' },
];

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  intro: { ...typography.body, color: t.textMuted, marginBottom: spacing.lg },
  label: { ...typography.captionMedium, color: t.textSecondary, marginBottom: spacing.xs },
  field: { marginBottom: spacing.lg },
  select: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: SOFT(t),
  },
  selectText: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  selectPlaceholder: { color: t.textMuted, fontWeight: '400' as const },
  job: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: TONES.indigo.bg },
  jobText: { ...typography.bodyMedium, color: TONES.indigo.fg, flex: 1 },
  priorities: { flexDirection: 'row' as const, gap: spacing.xs },
  priority: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  priorityText: { ...typography.captionMedium, fontSize: 13.5, color: t.textSecondary },
  attach: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: t.border,
    marginBottom: spacing.sm,
  },
  attachText: { ...typography.bodyMedium, color: t.primary },
  hint: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: t.border },
  submit: { borderRadius: radii.pill },
});

/** Raise a complaint (web: ComplaintForm) - outlet, optional job, subject, details, priority, photos / PDF. */
export function ClientNewComplaintScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ClientStackParamList>>();
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientNewComplaint'>>();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, outletId, outletName } = useClientPortal();
  const picker = useFilePicker();

  const [siteId, setSiteId] = useState(params?.siteId || (outlets.length === 1 ? outlets[0].id : outletId));
  const [jobId, setJobId] = useState(params?.jobId || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('MEDIUM');
  const [outletSheet, setOutletSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!siteId) return setError('Please choose the outlet.');
    if (!subject.trim()) return setError('Please add a short subject.');
    setSaving(true);
    setError(null);
    try {
      const res = await createComplaint({ subject: subject.trim(), message: message.trim(), priority, siteId, jobId: jobId || undefined, files: picker.files });
      navigation.replace('ClientComplaintDetail', { complaintId: res.id, notice: res.warning || 'Complaint raised. Our team will get back to you soon.' });
    } catch (err) {
      setError((err as Error).message || 'Could not raise the complaint. Please try again.');
      setSaving(false);
    }
  };

  return (
    <ClientPage title="Raise a complaint" back>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>Tell us what went wrong. Our team is notified straight away and will reply here.</Text>
          <CrmErrorBanner message={error} />

          {outlets.length > 1 && (
            <View style={styles.field}>
              <Text style={styles.label}>Outlet *</Text>
              <Pressable onPress={() => setOutletSheet(true)} style={({ pressed }) => [styles.select, pressed && styles.pressed]} accessibilityRole="button">
                <PinIcon size={18} color={theme.primary} />
                <Text style={[styles.selectText, !siteId && styles.selectPlaceholder]} numberOfLines={1}>
                  {siteId ? outletName(siteId) : 'Choose the outlet'}
                </Text>
                <ChevronRightIcon size={18} color={theme.textMuted} />
              </Pressable>
            </View>
          )}

          {!!jobId && (
            <View style={styles.field}>
              <Text style={styles.label}>About job</Text>
              <View style={styles.job}>
                <BriefcaseIcon size={18} color={TONES.indigo.fg} />
                <Text style={styles.jobText} numberOfLines={1}>
                  {params?.jobLabel || 'This job'}
                </Text>
                <Pressable onPress={() => setJobId('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove job">
                  <CloseIcon size={16} color={TONES.indigo.fg} />
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.field}>
            <CrmTextField label="Subject *" value={subject} onChangeText={setSubject} maxLength={200} placeholder="e.g. Cockroaches seen in the kitchen" />
          </View>
          <View style={styles.field}>
            <CrmTextField
              label="Details (optional)"
              value={message}
              onChangeText={setMessage}
              placeholder="What happened, where, and since when?"
              multiline
              numberOfLines={4}
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>How urgent is it?</Text>
            <View style={styles.priorities}>
              {PRIORITIES.map((p) => {
                const on = priority === p.key;
                const tone = TONES[p.tone];
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPriority(p.key)}
                    style={[styles.priority, on && { backgroundColor: tone.bg, borderColor: tone.bg }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.priorityText, on && { color: tone.fg }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={styles.label}>Photos or PDF</Text>
          <Pressable onPress={() => picker.setMenu(true)} style={({ pressed }) => [styles.attach, pressed && styles.pressed]} accessibilityRole="button">
            <CameraIcon size={18} color={theme.primary} />
            <Text style={styles.attachText}>Add photo or file</Text>
          </Pressable>
          <PickedFiles picker={picker} />
          <Text style={styles.hint}>Up to 5 files, 10 MB each.</Text>
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label="Submit complaint" onPress={submit} loading={saving} disabled={saving} style={styles.submit} />
        </View>
      </KeyboardAvoidingView>

      <AttachSheet picker={picker} />
      <OutletSheet visible={outletSheet} onClose={() => setOutletSheet(false)} outlets={outlets} value={siteId} onChange={setSiteId} allowAll={false} />
    </ClientPage>
  );
}
