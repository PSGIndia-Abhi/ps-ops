import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CheckCircleIcon, DocumentIcon, ExternalLinkIcon, SendIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';
import { openPdf, saveToDownloads, sharePdf, type ContractType } from './quotation';
import { errorMessage } from './ui';

// The quotation dialogs, in the app's own design instead of the plain Android alert: a card in
// the middle of the screen with an icon in a soft circle, a bold title, the client's name in a
// chip, a short message and full-width buttons (the same look as the quote builder's ConfirmCard).

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
      <View style={[styles.icon, { backgroundColor: theme.primarySoftBg }]}>
        <SendIcon size={26} color={theme.primary} />
      </View>
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
            { key: 'ONE_TIME', label: 'One-time', sub: 'A single service' },
            { key: 'AMC', label: 'AMC', sub: 'Annual contract' },
          ] as const
        ).map((o) => {
          const on = kind === o.key;
          return (
            <Pressable key={o.key} onPress={() => setKind(o.key)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.kind, on && styles.kindOn]}>
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
 * was just sent. The result of saving shows inside the card, not in another pop-up.
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
      setResult({ ok: true, text: `Saved in Downloads/BestServe as ${file.split('/').pop()}` });
    } catch (err) {
      const fallback = kind === 'share' ? 'Could not share the PDF. Try again.' : kind === 'open' ? 'Could not open the PDF. Try again.' : 'Could not save the PDF. Try again.';
      setResult({ ok: false, text: errorMessage(err, fallback) });
    }
    setBusy('');
  }

  return (
    <Card onClose={busy ? () => undefined : onClose}>
      <View style={[styles.icon, { backgroundColor: saved ? theme.successBg : theme.primarySoftBg }]}>
        {saved ? <CheckCircleIcon size={28} color={theme.success} /> : <DocumentIcon size={26} color={theme.primary} />}
      </View>
      <Text style={styles.title}>{saved ? 'Quotation saved' : 'Quotation PDF'}</Text>
      {!!name && <NameChip name={name} />}
      <Text style={styles.message}>
        {saved ? 'Share it with the customer on WhatsApp or email, or open it to check first.' : 'Share it on WhatsApp or email, open it to check, or keep a copy on the phone.'}
      </Text>

      {!!result && (
        <View style={[styles.result, { backgroundColor: result.ok ? theme.successBg : theme.dangerBg }]}>
          <Text style={[styles.resultText, { color: result.ok ? theme.successText : theme.dangerText }]}>{result.text}</Text>
        </View>
      )}

      <View style={styles.stack}>
        <Pressable
          onPress={() => run('share')}
          disabled={!!busy}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Share the quotation PDF"
        >
          {busy === 'share' ? <ActivityIndicator color="#fff" /> : <ShareIcon size={17} color="#fff" />}
          <Text style={styles.btnPrimaryText}>Share</Text>
        </Pressable>
        <Pressable
          onPress={() => run('open')}
          disabled={!!busy}
          style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          {busy === 'open' ? <ActivityIndicator color={theme.primary} /> : <ExternalLinkIcon size={17} color={theme.primary} />}
          <Text style={[styles.btnOutlineText, { color: theme.primary }]}>Open PDF</Text>
        </Pressable>
        <Pressable
          onPress={() => run('save')}
          disabled={!!busy || downloaded}
          style={({ pressed }) => [styles.btn, styles.btnOutline, downloaded && styles.btnDone, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          {busy === 'save' ? (
            <ActivityIndicator color={theme.primary} />
          ) : downloaded ? (
            <CheckCircleIcon size={17} color={theme.success} />
          ) : (
            <DownloadIcon size={17} color={theme.primary} />
          )}
          <Text style={[styles.btnOutlineText, { color: downloaded ? theme.successText : theme.primary }]}>{downloaded ? 'Saved to Downloads' : 'Save to Downloads'}</Text>
        </Pressable>
        {(!!onEdit || !!onDuplicate) && (
          <View style={styles.row}>
            {!!onEdit && (
              <Pressable onPress={onEdit} disabled={!!busy} style={({ pressed }) => [styles.btn, styles.grow, styles.btnSoft, pressed && styles.pressed]} accessibilityRole="button">
                <EditIcon size={16} color={theme.primary} />
                <Text style={[styles.btnOutlineText, { color: theme.primary }]}>Edit</Text>
              </Pressable>
            )}
            {!!onDuplicate && (
              <Pressable onPress={onDuplicate} disabled={!!busy} style={({ pressed }) => [styles.btn, styles.grow, styles.btnSoft, pressed && styles.pressed]} accessibilityRole="button">
                <CopyIcon size={16} color={theme.primary} />
                <Text style={[styles.btnOutlineText, { color: theme.primary }]}>Duplicate</Text>
              </Pressable>
            )}
          </View>
        )}
        <Pressable onPress={onClose} disabled={!!busy} style={({ pressed }) => [styles.btn, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.btnTextOnly}>Done</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function Card({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.shade} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NameChip({ name }: { name: string }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.chip}>
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
  shade: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.xl },
  card: { width: '100%' as const, maxWidth: 360, backgroundColor: t.surface, borderRadius: radii.xl, padding: spacing.xl, alignItems: 'center' as const },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: spacing.md },
  title: { ...typography.subtitle, color: t.textPrimary, textAlign: 'center' as const },
  chip: { marginTop: spacing.sm, backgroundColor: t.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, maxWidth: '100%' as const },
  chipText: { ...typography.captionMedium, color: t.textPrimary, textAlign: 'center' as const },
  message: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.sm },
  result: { alignSelf: 'stretch' as const, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.md },
  resultText: { ...typography.captionMedium, textAlign: 'center' as const },
  row: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' as const },
  stack: { gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' as const },
  grow: { flex: 1 },
  btn: { minHeight: 48, borderRadius: radii.lg, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  btnPrimary: { backgroundColor: t.primary },
  btnDisabled: { opacity: 0.45 },
  btnSoft: { backgroundColor: t.primarySoftBg },
  // One-time or AMC on "Save and send?"
  kindLabel: { ...typography.captionMedium, color: t.textPrimary, alignSelf: 'stretch' as const, marginTop: spacing.md, marginBottom: spacing.xs },
  kindRow: { flexDirection: 'row' as const, gap: spacing.sm, alignSelf: 'stretch' as const },
  kind: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg, borderWidth: 1.5, borderColor: t.border },
  kindOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  kindTitle: { ...typography.bodyMedium, color: t.textPrimary },
  kindTitleOn: { color: t.primary },
  kindSub: { ...typography.caption, color: t.textMuted },
  btnPrimaryText: { ...typography.button, color: '#fff' },
  btnOutline: { borderWidth: 1.5, borderColor: t.primary, backgroundColor: t.surface },
  btnOutlineText: { ...typography.button, color: t.primary },
  btnDone: { borderColor: t.success },
  btnTextOnly: { ...typography.button, color: t.textSecondary },
  pressed: { opacity: 0.7 },
});
