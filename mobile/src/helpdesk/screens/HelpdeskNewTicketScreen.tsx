import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { StackActions, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertCircleIcon, CameraIcon, DocumentIcon, GalleryIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmScreen } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { ScreenHeader } from '../../tasks/ui/parts';
import { radii, spacing, typography } from '../../theme';
import { createTicket, MAX_FILE_MB, MAX_FILES } from '../api';
import { PickedFiles, useFilePicker } from '../ui';

type Nav = NavigationProp<AuthenticatedStackParamList>;

/** Raise a ticket: describe the problem, add photos / PDFs, submit - then straight into the chat. */
export function HelpdeskNewTicketScreen() {
  const { styles, theme } = useCrmStyles(factory);
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<AuthenticatedStackParamList, 'HelpdeskNew'>>();
  const picker = useFilePicker();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!message.trim()) {
      setError('Please describe the problem.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createTicket({ message: message.trim(), files: picker.files, from: route.params?.from });
      // Replace this screen with the chat, so Back goes to the ticket list.
      navigation.dispatch(StackActions.replace('HelpdeskTicket', { ticketId: res.ticket.id, justRaised: res.ticket.code }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise the ticket. Please try again.');
      setBusy(false);
    }
  };

  return (
    <CrmScreen edges={['top', 'bottom']}>
      <ScreenHeader title="New ticket" icon="close" onBack={() => navigation.goBack()} />

      <Text style={styles.label}>What's the problem?</Text>
      <TextInput
        value={message}
        onChangeText={(v) => {
          setMessage(v);
          if (error) setError(null);
        }}
        placeholder={'What were you trying to do, and what happened instead?\nInclude any error message you saw.'}
        placeholderTextColor={theme.textMuted}
        multiline
        maxLength={5000}
        textAlignVertical="top"
        editable={!busy}
        style={styles.input}
        accessibilityLabel="Describe the problem"
      />
      <Text style={styles.counter}>{message.length}/5000</Text>

      <Text style={styles.label}>Photos or files (optional)</Text>
      <View style={styles.pickRow}>
        <PickButton icon={<CameraIcon size={20} color={theme.primary} />} label="Camera" onPress={picker.camera} disabled={busy} />
        <PickButton icon={<GalleryIcon size={20} color={theme.primary} />} label="Gallery" onPress={picker.gallery} disabled={busy} />
        <PickButton icon={<DocumentIcon size={20} color={theme.dangerText} />} label="PDF" onPress={picker.pdf} disabled={busy} />
      </View>
      <Text style={styles.hint}>
        Up to {MAX_FILES} files, {MAX_FILE_MB} MB each. A screenshot of the problem helps a lot.
      </Text>
      <PickedFiles picker={picker} />

      <View style={styles.context}>
        <AlertCircleIcon size={16} color={theme.textMuted} />
        <Text style={styles.contextText}>Your app version and phone model are sent with the ticket to help the team.</Text>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <PrimaryButton label={busy ? 'Submitting…' : 'Submit ticket'} onPress={submit} loading={busy} disabled={busy || !message.trim()} style={styles.submit} />
    </CrmScreen>
  );
}

function PickButton({ icon, label, onPress, disabled }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Add from ${label}`} style={({ pressed }) => [styles.pickBtn, pressed && styles.pressed]}>
      {icon}
      <Text style={styles.pickLabel}>{label}</Text>
    </Pressable>
  );
}

const factory = (t: CrmTheme) => ({
  pressed: { opacity: 0.75 },
  label: { ...typography.bodyMedium, color: t.textPrimary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { minHeight: 160, borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, backgroundColor: t.surface, padding: spacing.md, ...typography.body, color: t.textPrimary },
  counter: { ...typography.caption, color: t.textMuted, textAlign: 'right' as const, marginTop: 4 },
  pickRow: { flexDirection: 'row' as const, gap: spacing.sm },
  pickBtn: { flex: 1, minHeight: 72, borderRadius: radii.lg, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: t.border, backgroundColor: t.surface, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4 },
  pickLabel: { ...typography.captionMedium, color: t.textPrimary },
  hint: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs, marginBottom: spacing.sm },
  context: { flexDirection: 'row' as const, gap: spacing.xs, alignItems: 'flex-start' as const, backgroundColor: t.surfaceAlt, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm },
  contextText: { ...typography.caption, color: t.textMuted, flex: 1 },
  error: { ...typography.captionMedium, color: t.dangerText, marginTop: spacing.md },
  submit: { marginTop: spacing.lg, marginBottom: spacing.lg },
});
