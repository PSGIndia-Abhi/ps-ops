import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GlossyBadge } from '../components/GlossyBadge';
import { CalendarIcon, CheckCircleIcon, ClockIcon, CloseIcon, DocumentIcon, ExternalLinkIcon, SendIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';
import { openPdf, saveToDownloads, sharePdf, type ContractType } from './quotation';
import { errorMessage } from './ui';

// The quotation dialogs, in the app's own design instead of the plain Android alert: a card that
// pops in, a glossy coloured badge in a soft halo, a bold title, the client's name in a chip, and
// the choices as colourful round buttons.

/**
 * "Save and send?" before a quotation is numbered and saved - with "One-time or AMC?", which is
 * saved with it and shown on the lead (not on the PDF).
 */
export function SendQuotationDialog({
  name,
  initial = null,
  replacing = false,
  onCancel,
  onSend,
}: {
  name: string;
  /** The choice already made (a quotation opened again to edit or duplicate). */
  initial?: ContractType | null;
  /** An edit: the quotation it came from is marked Cancelled - replaced. */
  replacing?: boolean;
  onCancel: () => void;
  onSend: (contractType: ContractType) => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [kind, setKind] = useState<ContractType | null>(initial);
  return (
    <Card onClose={onCancel}>
      <Badge color={theme.primary} icon={<SendIcon size={24} color="#fff" />} />
      <Text style={styles.title}>Save and send?</Text>
      {!!name && <NameChip name={name} />}
      <Text style={styles.message}>
        {replacing
          ? 'A new quotation is saved on the lead. The current one stays in the list, marked "Cancelled - replaced".'
          : 'The quotation is saved on the lead and the lead moves to "Quotation sent".'}
      </Text>
      <Text style={styles.kindLabel}>Is this for a one-time service or an AMC?</Text>
      <View style={styles.kindRow}>
        {(
          [
            { key: 'ONE_TIME', label: 'One-time', sub: 'A single service', Icon: ClockIcon, color: theme.warning },
            { key: 'AMC', label: 'AMC', sub: 'Annual contract', Icon: CalendarIcon, color: theme.accent },
          ] as const
        ).map((o) => {
          const on = kind === o.key;
          return (
            <Pressable key={o.key} onPress={() => setKind(o.key)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={({ pressed }) => [styles.kind, on && styles.kindOn, pressed && styles.pressed]}>
              <View style={styles.kindTop}>
                <GlossyBadge color={o.color} size={32} icon={<o.Icon size={16} color="#fff" />} />
                <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
              </View>
              <Text style={[styles.kindTitle, on && styles.kindTitleOn]}>{o.label}</Text>
              <Text style={styles.kindSub}>{o.sub}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.btn, styles.grow, styles.btnOutline, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.btnOutlineText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => kind && onSend(kind)}
          disabled={!kind}
          style={({ pressed }) => [styles.btn, styles.grow, styles.btnPrimary, !kind && styles.btnDisabled, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <SendIcon size={16} color="#fff" />
          <Text style={styles.btnPrimaryText}>Save &amp; send</Text>
        </Pressable>
      </View>
    </Card>
  );
}

/**
 * What to do with a quotation's PDF: share it straight from the phone's share sheet (WhatsApp,
 * Gmail...), open it in the phone's PDF viewer, or save a copy to Downloads/BestServe. `saved` shows the "Quotation saved" tick, after one
 * was just sent. Only a failure is spelled out; a saved copy shows on the Save button itself.
 */
export function QuotationPdfDialog({
  name,
  saved = false,
  getFile,
  onOpened,
  onClose,
  onEdit,
  onDuplicate,
}: {
  name: string;
  saved?: boolean;
  /** Downloads the PDF to the phone and returns its path. */
  getFile: () => Promise<string>;
  /** After the PDF opened in the viewer. */
  onOpened: () => void;
  onClose: () => void;
  /** Open it in the builder to save a replacement (only when allowed). */
  onEdit?: () => void;
  /** Open it in the builder to save a new quotation from its details. */
  onDuplicate?: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [busy, setBusy] = useState<'' | 'share' | 'open' | 'save'>('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function run(kind: 'share' | 'open' | 'save') {
    if (busy) return;
    setBusy(kind);
    setResult(null);
    try {
      const file = await getFile();
      if (kind === 'share') {
        await sharePdf(file, name ? `Quotation for ${name} - Bestserve Pest Management Pvt. Ltd.` : undefined);
        setBusy('');
        return;
      }
      if (kind === 'open') {
        await openPdf(file);
        setBusy('');
        onOpened();
        return;
      }
      await saveToDownloads(file);
      setDownloaded(true);
    } catch (err) {
      const fallback = kind === 'share' ? 'Could not share the PDF. Try again.' : kind === 'open' ? 'Could not open the PDF. Try again.' : 'Could not save the PDF. Try again.';
      setResult({ ok: false, text: errorMessage(err, fallback) });
    }
    setBusy('');
  }

  return (
    <Card onClose={busy ? () => undefined : onClose}>
      <Badge
        color={saved ? theme.success : theme.primary}
        icon={saved ? <CheckCircleIcon size={26} color="#fff" /> : <DocumentIcon size={24} color="#fff" />}
      />
      <Text style={styles.title}>{saved ? 'Quotation saved' : 'Quotation PDF'}</Text>
      {!!name && <NameChip name={name} />}

      {/* Only a problem is spelled out; a saved copy shows on its own button. */}
      {!!result && !result.ok && (
        <View style={[styles.result, { backgroundColor: theme.dangerBg }]}>
          <Text style={[styles.resultText, { color: theme.dangerText }]}>{result.text}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <ActionButton color={theme.success} Icon={ShareIcon} label="Share" busy={busy === 'share'} disabled={!!busy} onPress={() => run('share')} />
        <ActionButton color={theme.primary} Icon={ExternalLinkIcon} label="Open" busy={busy === 'open'} disabled={!!busy} onPress={() => run('open')} />
        <ActionButton
          color={downloaded ? theme.success : theme.warning}
          Icon={downloaded ? CheckCircleIcon : DownloadIcon}
          label={downloaded ? 'Saved' : 'Save'}
          busy={busy === 'save'}
          disabled={!!busy || downloaded}
          onPress={() => run('save')}
        />
      </View>

      {(!!onEdit || !!onDuplicate) && (
        <View style={styles.pair}>
          {!!onEdit && (
            <Pressable onPress={onEdit} disabled={!!busy} style={({ pressed }) => [styles.mini, pressed && styles.pressed]} accessibilityRole="button">
              <EditIcon size={16} color={theme.accentText} />
              <Text style={styles.miniText}>Edit</Text>
            </Pressable>
          )}
          {!!onDuplicate && (
            <Pressable onPress={onDuplicate} disabled={!!busy} style={({ pressed }) => [styles.mini, pressed && styles.pressed]} accessibilityRole="button">
              <CopyIcon size={16} color={theme.accentText} />
              <Text style={styles.miniText}>Duplicate</Text>
            </Pressable>
          )}
        </View>
      )}

      <Pressable onPress={onClose} disabled={!!busy} style={({ pressed }) => [styles.done, pressed && styles.pressed]} accessibilityRole="button">
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </Card>
  );
}

/** One action: a glossy coloured round button with its name under it. */
function ActionButton({
  color,
  Icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  color: string;
  Icon: React.ComponentType<{ size?: number; color: string }>;
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <GlossyBadge color={color} size={56} icon={busy ? <ActivityIndicator color="#fff" /> : <Icon size={22} color="#fff" />} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/** The glossy badge at the top of a dialog, in a soft halo of its colour. */
export function Badge({ color, icon }: { color: string; icon: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.halo}>
      <View style={[styles.haloFill, { backgroundColor: color }]} />
      <GlossyBadge color={color} size={58} icon={icon} />
    </View>
  );
}

export function Card({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { styles, theme } = useCrmStyles(factory);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pop, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [pop]);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.shade} onPress={onClose}>
        <Animated.View style={[styles.cardWrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
          <Pressable style={styles.card} onPress={() => undefined}>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <CloseIcon size={16} color={theme.textMuted} />
            </Pressable>
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export function NameChip({ name }: { name: string }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.chip}>
      <DocumentIcon size={13} color={theme.primary} />
      <Text style={styles.chipText} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

/** Arrow into a tray - same 24-grid line style as components/icons. */
function EditIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CopyIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 9h10v11H9zM5 15V4h10" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShareIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a3 3 0 1 0-2.83-4M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DownloadIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const factory = (t: CrmTheme) => ({
  shade: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  cardWrap: { width: '100%' as const, maxWidth: 380 },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl + 6,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center' as const,
    ...t.raisedShadow,
  },
  close: {
    position: 'absolute' as const,
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 2,
  },
  halo: { width: 84, height: 84, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: spacing.sm },
  haloFill: { position: 'absolute' as const, width: 84, height: 84, borderRadius: 42, opacity: 0.14 },
  title: { ...typography.title, color: t.textPrimary, textAlign: 'center' as const },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: t.primarySoftBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: '100%' as const,
  },
  chipText: { ...typography.captionMedium, color: t.primary, textAlign: 'center' as const, flexShrink: 1 },
  message: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.sm, paddingHorizontal: spacing.sm },
  result: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    alignSelf: 'stretch' as const,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  resultText: { ...typography.captionMedium, textAlign: 'center' as const, flexShrink: 1 },
  row: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xs, alignSelf: 'stretch' as const },
  grow: { flex: 1 },
  actions: { flexDirection: 'row' as const, justifyContent: 'space-around' as const, alignSelf: 'stretch' as const, marginTop: spacing.lg },
  action: { alignItems: 'center' as const, gap: spacing.xs, minWidth: 72 },
  actionText: { ...typography.captionMedium, color: t.textPrimary },
  pair: { flexDirection: 'row' as const, gap: spacing.sm, alignSelf: 'stretch' as const, marginTop: spacing.lg },
  mini: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radii.lg,
    backgroundColor: t.accentBg,
  },
  miniText: { ...typography.bodyMedium, color: t.accentText },
  done: { alignSelf: 'stretch' as const, minHeight: 46, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: spacing.sm },
  doneText: { ...typography.button, color: t.textSecondary },
  btn: { minHeight: 50, borderRadius: radii.lg, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  btnPrimary: { backgroundColor: t.primary },
  btnDisabled: { opacity: 0.45 },
  // One-time or AMC on "Save and send?"
  kindLabel: { ...typography.captionMedium, color: t.textPrimary, alignSelf: 'stretch' as const, marginTop: spacing.md, marginBottom: spacing.xs },
  kindRow: { flexDirection: 'row' as const, gap: spacing.sm, alignSelf: 'stretch' as const },
  kind: { flex: 1, padding: spacing.sm, borderRadius: radii.lg, borderWidth: 1.5, borderColor: t.border, gap: 2 },
  kindOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  kindTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.xs },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  radioOn: { borderColor: t.primary },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.primary },
  kindTitle: { ...typography.bodyMedium, color: t.textPrimary },
  kindTitleOn: { color: t.primary },
  kindSub: { ...typography.caption, color: t.textMuted },
  btnPrimaryText: { ...typography.button, color: '#fff' },
  btnOutline: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
  btnOutlineText: { ...typography.button, color: t.textPrimary },
  pressed: { opacity: 0.75 },
});
