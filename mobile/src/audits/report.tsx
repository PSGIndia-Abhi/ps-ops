import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, NativeModules, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { ApiError } from '../api/httpClient';
import { getToken } from '../auth/tokenStorage';
import { DocumentIcon } from '../components/icons';
import { API_BASE_URL } from '../config/env';
import { openPdf, saveToDownloads } from '../leads/quotation';
import { colors, radii, spacing, typography } from '../theme';
import { reportsApi, type AuditReport } from './api';
import { GreenButton } from './ui';
import { ag } from './theme';
import { useAppActive } from './useAppActive';

/**
 * The audit's PDF report: made by the server a few seconds after Submit.
 * "Download PDF" saves it to Downloads/BestServe (WhatsApp and email can attach it from there);
 * "Share" opens the phone's share menu with WhatsApp and email apps first; "Open PDF" opens the viewer.
 */

type ShareTarget = 'whatsapp' | 'email' | 'any';
const { ShareFile } = NativeModules as {
  ShareFile?: { share(path: string, mime: string, target: ShareTarget, subject: string | null, text: string | null): Promise<boolean> };
};

/** Sends a PDF to WhatsApp, an email app, or the share sheet. Older app builds without the module open the viewer. */
async function sharePdf(path: string, target: ShareTarget, subject: string): Promise<void> {
  if (Platform.OS !== 'android' || !ShareFile) return openPdf(path);
  await ShareFile.share(path, 'application/pdf', target, subject, `${subject} (PDF attached)`);
}

const POLL_MS = 3000;

/** Latest report of an audit; polls while it is being made. */
export function useLatestReport(auditId: string, enabled = true) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await reportsApi.list(auditId);
      setReport(r.items[0] || null);
    } catch {
      // keep the last known state; the next poll tries again
    } finally {
      setLoaded(true);
    }
  }, [auditId]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  // Polls only while the report is being made and the app is on screen (saves battery).
  const appActive = useAppActive();
  const waiting = !report || report.status === 'QUEUED' || report.status === 'GENERATING';
  useEffect(() => {
    if (!enabled || !waiting || !appActive) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [enabled, waiting, load, appActive]);

  return { report, loaded, reload: load };
}

/** Downloads the PDF into the app cache with the session token; returns the file path. */
async function fetchReport(fileUrl: string, fileName: string): Promise<string> {
  const token = await getToken();
  const target = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  const res = await ReactNativeBlobUtil.config({ path: target, overwrite: true, timeout: 60000 }).fetch(
    'GET',
    `${API_BASE_URL}${fileUrl}`,
    { Authorization: token ? `Bearer ${token}` : '', Accept: 'application/pdf' },
  );
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    await ReactNativeBlobUtil.fs.unlink(target).catch(() => undefined);
    throw new ApiError('Could not download the report. Check your connection and try again.', status);
  }
  return target;
}

/** "<Customer>-AuditReport-<year>.pdf" (+ "-v2" for later versions, "-draft" for previews). */
export function reportFileName(customer: string | null | undefined, auditDate: string | null | undefined, opts: { version?: number; draft?: boolean } = {}): string {
  const name = String(customer || 'Audit').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Audit';
  const year = String(auditDate || '').slice(0, 4) || String(new Date().getFullYear());
  const v = opts.version && opts.version > 1 ? `-v${opts.version}` : '';
  return `${name}-AuditReport-${year}${v}${opts.draft ? '-draft' : ''}.pdf`;
}

/**
 * "View report": the final PDF once the audit is submitted and the report is ready;
 * before that, a draft preview made from what is entered so far (marked DRAFT).
 * Opens in the phone's PDF viewer, which also has Share.
 */
export async function viewReport(auditId: string, customer: string, auditDate: string): Promise<void> {
  let url = `/api/audits/${auditId}/report-preview`;
  let name = reportFileName(customer, auditDate, { draft: true });
  try {
    const latest = (await reportsApi.list(auditId)).items[0];
    if (latest?.status === 'GENERATED' && latest.fileUrl) {
      url = latest.fileUrl;
      name = reportFileName(customer, auditDate, { version: latest.version });
    }
  } catch {
    // no report list: fall back to the draft preview
  }
  await openPdf(await fetchReport(url, name));
}

// Reports already copied to Downloads in this app session (a second tap only opens the PDF again,
// instead of adding another copy to Downloads).
const savedToDownloads = new Set<string>();

/**
 * "↓ PDF": downloads the audit's latest report, keeps a copy in Downloads/BestServe (once) and
 * opens it in the phone's PDF viewer. Every tap opens it again.
 */
export async function downloadLatestReport(auditId: string, customer: string, auditDate: string): Promise<string> {
  const { items } = await reportsApi.list(auditId);
  const latest = items[0];
  if (!latest || latest.status !== 'GENERATED' || !latest.fileUrl) {
    throw new ApiError(latest?.status === 'FAILED' ? 'The report could not be made. Open the audit and tap Try again.' : 'The report is still being made. Try again in a few seconds.');
  }
  const name = reportFileName(customer, auditDate, { version: latest.version });
  const path = await fetchReport(latest.fileUrl, name);
  if (!savedToDownloads.has(name)) {
    try {
      await saveToDownloads(path);
      savedToDownloads.add(name);
    } catch {
      // Downloads copy is a bonus: still open the PDF.
    }
  }
  await openPdf(path);
  return name;
}

export function ReportCard({ auditId, auditNumber, customer, auditDate }: { auditId: string; auditNumber: string; customer: string | null; auditDate: string | null }) {
  const { report, loaded, reload } = useLatestReport(auditId);
  const [busy, setBusy] = useState<null | 'save' | 'open' | ShareTarget>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const fileName = reportFileName(customer, auditDate, { version: report?.version });

  async function run(kind: 'save' | 'open' | ShareTarget) {
    if (!report?.fileUrl) return;
    setBusy(kind);
    setNote(null);
    try {
      const path = await fetchReport(report.fileUrl, fileName);
      if (kind === 'save') {
        await saveToDownloads(path);
        setNote({ ok: true, text: `Saved to Downloads/BestServe/${fileName}` });
      } else if (kind === 'open') {
        await openPdf(path);
      } else {
        await sharePdf(path, kind, `Pest Risk Audit Report - ${auditNumber}`);
      }
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    if (!report) return;
    setNote(null);
    try {
      await reportsApi.retry(auditId, report.id);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Retry failed' });
    }
    reload();
  }

  const ready = report?.status === 'GENERATED';
  const failed = report?.status === 'FAILED';
  const sub = !loaded
    ? 'Checking…'
    : ready
    ? `${report.pageCount || '—'} pages · ready`
    : failed
    ? 'Could not be made'
    : 'Being made… ready in a few seconds';

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.icon}><DocumentIcon size={24} color={ag.greenDark} /></View>
        <View style={styles.flex}>
          <Text style={styles.title}>Pest Risk Audit Report</Text>
          <Text style={[styles.sub, failed && styles.subBad]}>{sub}</Text>
        </View>
        {!ready && !failed && loaded ? <ActivityIndicator color={ag.green} /> : null}
      </View>

      {ready ? (
        <>
          <GreenButton label="↓  Download PDF" onPress={() => run('save')} loading={busy === 'save'} disabled={!!busy} />
          <View style={styles.links}>
            <Pressable onPress={() => run('open')} disabled={!!busy} hitSlop={8}>
              <Text style={styles.link}>{busy === 'open' ? 'Opening…' : 'Open PDF'}</Text>
            </Pressable>
            <Text style={styles.dot}>·</Text>
            <Pressable onPress={() => run('any')} disabled={!!busy} hitSlop={8}>
              <Text style={styles.link}>{busy === 'any' ? 'Opening…' : '↗ Share (WhatsApp, Email)'}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {failed ? (
        <Pressable onPress={retry} hitSlop={8} style={styles.retry}>
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      ) : null}
      {note ? <Text style={[styles.note, !note.ok && styles.subBad]}>{note.text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginBottom: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm,
  },
  icon: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: ag.greenSoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { ...typography.subtitle, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  subBad: { color: colors.danger },
  gap: { marginTop: spacing.sm },
  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  dot: { color: colors.textMuted },
  retry: { alignSelf: 'center', marginTop: spacing.xs },
  link: { color: ag.green, fontWeight: '700' },
  note: { ...typography.caption, color: ag.greenDark, textAlign: 'center', marginTop: spacing.sm },
});
