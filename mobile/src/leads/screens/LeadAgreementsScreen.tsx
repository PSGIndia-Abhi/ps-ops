import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker';
import Svg, { Path } from 'react-native-svg';
import { GlossyBadge } from '../../components/GlossyBadge';
import { CheckCircleIcon, DocumentIcon, EyeIcon, UploadIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { savedAgreementPdf, saveToDownloads } from '../quotation';
import { QuotationPdfDialog } from '../QuotationDialogs';
import { errorMessage, useLoad, LeadTopBar as TopBar, LeadScreen } from '../ui';

// A customer's service agreements (sales managers only), in two parts so they are never confused:
//  - FINAL AGREEMENT: the one uploaded signed copy (tagged Latest) - download it, or upload / replace it;
//  - AGREEMENTS: every agreement made on the web, newest first, a small card each - only the newest
//    is Active, the older ones are Cancelled.
// View opens the same Share / Open / Save card as quotations; Download saves straight to Downloads/BestServe.

const MAX_PDF_BYTES = 15 * 1024 * 1024;

type Doc = { key: string; agreementId: string; fileName: string; number: string; signed: boolean };

/** Arrow down into a tray - downloading. */
function DownloadIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function LeadAgreementsScreen() {
  const navigation = useNavigation();
  const { leadId, name } = useRoute<RouteProp<LeadStackParamList, 'LeadAgreements'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const loader = useCallback(() => api.getAgreements(leadId), [leadId]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the agreements.');
  const [pdf, setPdf] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Downloads: the one in progress, and the ones done (a tick on their button).
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});

  const list = data?.agreements ?? [];
  const final = data?.final ?? null;
  const active = list.find((a) => a.status !== 'CANCELLED') ?? null;

  const download = async (doc: Doc) => {
    if (downloading) return;
    setMessage(null);
    setDownloading(doc.key);
    try {
      await saveToDownloads(await savedAgreementPdf(leadId, doc.agreementId, doc.fileName, doc.signed));
      setDownloaded((d) => ({ ...d, [doc.key]: true }));
    } catch (err) {
      setMessage(errorMessage(err, 'Could not save the PDF to Downloads.'));
    } finally {
      setDownloading(null);
    }
  };

  const upload = async () => {
    setMessage(null);
    let file: { uri: string; name: string; type: string };
    try {
      const [picked] = await pick({ type: [types.pdf] });
      if (picked.size != null && picked.size > MAX_PDF_BYTES) return setMessage('That file is too large. The limit is 15 MB.');
      file = { uri: picked.uri, name: picked.name || `agreement-signed-${Date.now()}.pdf`, type: 'application/pdf' };
    } catch (err) {
      // Backing out of the picker is not an error.
      if (!(isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED)) setMessage('Could not open the file picker.');
      return;
    }
    setUploading(true);
    try {
      await api.uploadFinalAgreement(leadId, file);
      setDownloaded((d) => ({ ...d, final: false }));
      reload();
    } catch (err) {
      setMessage(errorMessage(err, 'Could not upload the signed agreement.'));
    } finally {
      setUploading(false);
    }
  };

  /** A small pill button: View, Download (a tick once saved), Replace / Upload. */
  const pillButton = (key: string, label: string, onPress: () => void, tone: { bg: string; fg: string }, icon: React.ReactNode, busy = false, disabled = false) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, { backgroundColor: tone.bg }, (pressed || busy) && styles.pressed, disabled && styles.disabled]}
    >
      {busy ? <ActivityIndicator size="small" color={tone.fg} /> : icon}
      <Text style={[styles.btnText, { color: tone.fg }]}>{label}</Text>
    </Pressable>
  );
  const downloadButton = (doc: Doc, bg: string) =>
    pillButton(
      `dl-${doc.key}`,
      downloaded[doc.key] ? 'Saved' : 'Download',
      () => download(doc),
      { bg, fg: downloaded[doc.key] ? theme.successText : theme.textPrimary },
      downloaded[doc.key] ? <CheckCircleIcon size={16} color={theme.successText} /> : <DownloadIcon size={16} color={theme.textPrimary} />,
      downloading === doc.key,
    );

  const finalDoc: Doc | null = final ? { key: 'final', agreementId: final.agreementId, fileName: final.fileName, number: final.number, signed: true } : null;

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Agreements" subtitle={name} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />

        {loading && !data ? (
          <>
            <CrmSkeleton height={110} radius={18} />
            <CrmSkeleton height={110} radius={18} />
          </>
        ) : list.length === 0 ? (
          <CrmEmptyState
            title="No agreements yet"
            subtitle="Create the service agreement on the web. Once it is signed, upload the signed copy here."
            icon={<DocumentIcon size={30} color={theme.textMuted} />}
          />
        ) : (
          <>
            {/* ---------- the final agreement: the one uploaded signed copy ---------- */}
            <Text style={styles.section}>FINAL AGREEMENT</Text>
            <View style={[styles.card, finalDoc ? styles.finalOn : styles.finalOff]}>
              {finalDoc && (
                <View style={styles.latest}>
                  <Text style={styles.latestText}>LATEST</Text>
                </View>
              )}
              <View style={styles.head}>
                <GlossyBadge
                  color={finalDoc ? theme.success : theme.textMuted}
                  size={38}
                  icon={finalDoc ? <CheckCircleIcon size={18} color="#fff" /> : <UploadIcon size={17} color="#fff" />}
                />
                <View style={styles.headText}>
                  <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
                    {finalDoc ? finalDoc.fileName : 'No signed agreement yet'}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {finalDoc ? `Signed copy · ${finalDoc.number}` : 'Upload it once the customer signs'}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                {finalDoc && pillButton('view-final', 'View', () => setPdf(finalDoc), { bg: theme.surface, fg: theme.successText }, <EyeIcon size={16} color={theme.successText} />)}
                {finalDoc && downloadButton(finalDoc, theme.surface)}
                {data?.canUpload &&
                  pillButton(
                    'upload',
                    finalDoc ? 'Replace' : 'Upload signed copy',
                    upload,
                    finalDoc ? { bg: theme.surface, fg: theme.accentText } : { bg: theme.primary, fg: '#fff' },
                    <UploadIcon size={16} color={finalDoc ? theme.accentText : '#fff'} />,
                    uploading,
                    !active,
                  )}
              </View>
            </View>
            {!!message && <Text style={styles.message}>{message}</Text>}

            {/* ---------- every agreement made: only the newest is active ---------- */}
            <View style={styles.sectionRow}>
              <Text style={styles.section}>AGREEMENTS</Text>
              <View style={styles.count}>
                <Text style={styles.countText}>{list.length}</Text>
              </View>
            </View>
            {list.map((a) => {
              const cancelled = a.status === 'CANCELLED';
              const doc: Doc = { key: a.id, agreementId: a.id, fileName: a.fileName, number: a.number, signed: false };
              return (
                <View key={a.id} style={[styles.card, cancelled && styles.cancelled]}>
                  <View style={styles.head}>
                    <GlossyBadge color={cancelled ? theme.textMuted : theme.accent} size={38} icon={<DocumentIcon size={17} color="#fff" />} />
                    <View style={styles.headText}>
                      <Text style={[styles.fileName, cancelled && styles.struck]} numberOfLines={1} ellipsizeMode="middle">
                        {a.fileName}
                      </Text>
                      <Text style={styles.sub}>{a.number}</Text>
                    </View>
                    <View style={[styles.status, { backgroundColor: cancelled ? theme.surfaceAlt : theme.accentBg }]}>
                      <View style={[styles.dot, { backgroundColor: cancelled ? theme.textMuted : theme.accent }]} />
                      <Text style={[styles.statusText, { color: cancelled ? theme.textMuted : theme.accentText }]}>{cancelled ? 'Cancelled' : 'Active'}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    {pillButton(`view-${a.id}`, 'View', () => setPdf(doc), { bg: theme.accentBg, fg: theme.accentText }, <EyeIcon size={16} color={theme.accentText} />)}
                    {downloadButton(doc, theme.surfaceAlt)}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </CrmScreen>

      {pdf && (
        <QuotationPdfDialog
          title={pdf.signed ? 'Final agreement' : 'Agreement PDF'}
          name={name}
          shareMessage={`Service agreement ${pdf.number}${pdf.signed ? ' (signed)' : ''} - Bestserve Pest Management Pvt. Ltd.`}
          getFile={() => savedAgreementPdf(leadId, pdf.agreementId, pdf.fileName, pdf.signed)}
          onOpened={() => setPdf(null)}
          onClose={() => setPdf(null)}
        />
      )}
    </LeadScreen>
  );
}

const factory = (t: CrmTheme) => ({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm + 2 },
  section: { ...typography.overline, color: t.textMuted, marginTop: spacing.xs },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.md },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.accentBg },
  countText: { ...typography.captionMedium, color: t.accentText },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm + 2,
    overflow: 'hidden' as const,
    ...t.cardShadow,
  },
  // the final agreement: green when uploaded, a dashed outline while waiting for it
  finalOn: { borderWidth: 1.5, borderColor: t.success, backgroundColor: t.successBg, paddingTop: spacing.lg + spacing.sm },
  finalOff: { borderWidth: 1.5, borderColor: t.border, borderStyle: 'dashed' as const },
  latest: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderBottomLeftRadius: radii.md,
    backgroundColor: t.success,
  },
  latestText: { ...typography.captionMedium, fontSize: 10, letterSpacing: 1, color: '#fff' },
  cancelled: { opacity: 0.6 },
  struck: { textDecorationLine: 'line-through' as const },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm + 2 },
  headText: { flex: 1 },
  fileName: { ...typography.bodyMedium, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  status: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...typography.captionMedium, fontSize: 11 },
  actions: { flexDirection: 'row' as const, gap: spacing.sm },
  btn: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.pill,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  btnText: { ...typography.captionMedium },
  disabled: { opacity: 0.5 },
  message: { ...typography.caption, color: t.danger },
  pressed: { opacity: 0.8 },
});
