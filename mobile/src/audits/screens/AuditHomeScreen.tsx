import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackgroundWash } from '../../components/BackgroundWash';
import { ScreenContainer } from '../../components/ScreenContainer';
import {
  AlertTriangleIcon, ChevronRightIcon, DocumentIcon, PinIcon,
} from '../../components/icons';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { auditsApi, type AuditListItem, type AuditSummary } from '../api';
import { addDays, fmtDate, fmtSaved, todayIso } from '../format';
import { downloadLatestReport, viewReport } from '../report';
import { AuditStatusPill, GreenButton, MessageBox, RiskText } from '../ui';
import { ag } from '../theme';
import type { AuditsStackParamList } from '../AuditsNavigator';

type Nav = NativeStackNavigationProp<AuditsStackParamList>;
type Filter = 'all' | 'scheduled' | 'progress' | 'submitted' | 'urgent';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today" / "Tomorrow" / "Yesterday", else "27 Oct 2026". */
function relDate(iso: string) {
  const d = iso.slice(0, 10);
  const today = todayIso();
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  if (d === addDays(today, -1)) return 'Yesterday';
  return fmtDate(d);
}

/** "Saved 10:45 AM" today, else "Saved 10:45 AM, 26 Oct". */
function savedLabel(value: string | null) {
  if (!value) return '';
  const full = fmtSaved(value);
  return `Saved ${value.slice(0, 10) === todayIso() ? full.split(',')[0] : full}`;
}

/**
 * Audits home, in the same style as the technician / supervisor Home: soft background, underlined
 * section titles, search, a high-risk alert,
 * filter chips, drafts to continue and recent submitted audits with a one-tap PDF download.
 */
export function AuditHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [drafts, setDrafts] = useState<AuditListItem[]>([]);
  const [recent, setRecent] = useState<AuditListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // Search waits until typing pauses, so it does not call the server on every letter.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const extra = { q: q || undefined, urgent: filter === 'urgent' ? '1' : undefined };
      const [s, d, r] = await Promise.all([
        auditsApi.summary(),
        // Scheduled = audit date after today (incl. next audits made at submit); the rest = today or earlier.
        auditsApi.list({
          status: 'IN_PROGRESS,AMENDING',
          pageSize: 20,
          ...extra,
          from: filter === 'scheduled' ? addDays(todayIso(), 1) : undefined,
          to: filter === 'scheduled' ? undefined : todayIso(),
        }),
        auditsApi.list({ status: 'SUBMITTED', pageSize: 20, ...extra }),
      ]);
      setSummary(s);
      setDrafts(d.items);
      setRecent(r.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load audits');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (item: AuditListItem) => navigation.navigate('AuditAreas', { auditId: item.id });

  const [reportBusy, setReportBusy] = useState<string | null>(null);
  async function openReport(item: AuditListItem) {
    setReportBusy(item.id);
    setNote(null);
    try {
      await viewReport(item.id, item.companyName, item.auditDate);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Could not open the report' });
    } finally {
      setReportBusy(null);
    }
  }

  async function downloadPdf(item: AuditListItem) {
    setPdfBusy(item.id);
    setNote(null);
    try {
      // Opens the PDF (every tap); a copy is also kept in Downloads/BestServe.
      await downloadLatestReport(item.id, item.companyName, item.auditDate);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Could not download the report' });
    } finally {
      setPdfBusy(null);
    }
  }

  const now = new Date();
  const dateLine = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  const showDrafts = filter !== 'submitted';
  const showRecent = filter !== 'progress' && filter !== 'scheduled';
  const shownDrafts = showAllDrafts ? drafts : drafts.slice(0, 2);
  const shownRecent = showAllRecent ? recent : recent.slice(0, 5);

  return (
    <View style={styles.screen}>
      <BackgroundWash />
      <ScreenContainer transparent edges={['top']} onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}>
        <View style={styles.pad}>
          {/* Title with a small Start Audit button on the right */}
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.title}>Site Audits</Text>
              <Text style={styles.subtitle}>{dateLine}</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('StartAudit')}
              style={({ pressed }) => [styles.startBtn, pressed && styles.startPressed]}
              accessibilityRole="button"
              accessibilityLabel="Start a new audit"
            >
              <Text style={styles.startText}>+ Start Audit</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="🔍  Search customer or audit no."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />

          {/* Alert, only when there are urgent findings */}
          {summary?.urgentFindings && filter !== 'urgent' ? (
            <Pressable onPress={() => setFilter('urgent')} style={styles.alert}>
              <View style={styles.alertIcon}><AlertTriangleIcon size={16} color={colors.textOnPrimary} /></View>
              <Text style={styles.alertText}>
                <Text style={styles.alertBold}>{summary.urgentFindings} high-risk finding{summary.urgentFindings === 1 ? '' : 's'}</Text> due this week
              </Text>
              <ChevronRightIcon size={16} color="#9A3412" />
            </Pressable>
          ) : null}

          <View style={styles.chips}>
            {([['all', 'All'], ['scheduled', 'Scheduled'], ['progress', 'In progress'], ['submitted', 'Submitted']] as [Filter, string][]).map(([v, label]) => (
              <Pressable key={v} onPress={() => setFilter(v)} style={[styles.chip, filter === v && styles.chipOn]}>
                <Text style={[styles.chipText, filter === v && styles.chipTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {filter === 'urgent' ? (
            <View style={styles.urgentRow}>
              <Text style={[styles.cardSub, styles.flex]}>Showing audits with high-risk findings due this week</Text>
              <Pressable onPress={() => setFilter('all')} hitSlop={8}><Text style={styles.link}>Clear</Text></Pressable>
            </View>
          ) : null}

          {error ? <MessageBox tone="error" title={error} /> : null}
          {note ? <MessageBox tone={note.ok ? 'ok' : 'error'} title={note.text} /> : null}

          {showDrafts ? (
            <>
              <SectionTitle
                title={filter === 'scheduled' ? 'Scheduled audits' : 'Continue where you left off'}
                actionLabel={drafts.length > 2 ? (showAllDrafts ? 'Show less' : 'View all') : undefined}
                onAction={() => setShowAllDrafts(v => !v)}
              />
              {!loading && !drafts.length ? <Text style={styles.empty}>{q ? 'No matching audits in progress.' : 'No audits in progress.'}</Text> : null}
              {shownDrafts.map((item, i) => {
                const pct = item.areasTotal ? Math.round((item.areasCompleted / item.areasTotal) * 100) : 0;
                const scheduled = item.auditDate > todayIso();
                return (
                  <Pressable key={item.id} onPress={() => open(item)} style={({ pressed }) => [styles.card, styles.draftCard, i === 0 && styles.cardFirst, pressed && styles.pressed]}>
                    <View style={[styles.accent, i === 0 && styles.accentOn]} />
                    <View style={styles.cardBody}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.cardTitle, styles.flex]} numberOfLines={2}>{item.companyName}</Text>
                        {scheduled ? (
                          <View style={styles.schedPill}><Text style={styles.schedPillText}>Scheduled</Text></View>
                        ) : (
                          <AuditStatusPill status={item.status} />
                        )}
                      </View>
                      <View style={styles.metaRow}>
                        <PinIcon size={12} color={colors.textMuted} />
                        <Text style={[styles.cardSub, styles.flex]} numberOfLines={1}> {[item.siteName, item.siteAddress].filter(Boolean).join(', ')}</Text>
                      </View>
                      <Text style={styles.dateLine}>
                        {scheduled
                          ? `Next audit due: ${fmtDate(item.auditDate)}`
                          : `Audit date: ${fmtDate(item.auditDate)}${relDate(item.auditDate) === 'Today' ? ' (Today)' : ''}`}
                      </Text>
                      <Text style={styles.cardSub}>
                        {item.areasCompleted} area{item.areasCompleted === 1 ? '' : 's'} saved
                        {item.areasTotal - item.areasCompleted > 0
                          ? ` · ${item.areasTotal - item.areasCompleted} area${item.areasTotal - item.areasCompleted === 1 ? '' : 's'} incomplete`
                          : ''}
                        {item.lastSavedAt ? ` · ${savedLabel(item.lastSavedAt)}` : ''}
                      </Text>
                      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                      {/* Resume audit + View report (off until the audit is submitted) */}
                      <View style={styles.cardActions}>
                        <GreenButton
                          label={scheduled && !item.areasTotal ? 'Start audit' : 'Resume audit'}
                          onPress={() => open(item)}
                          style={[styles.cardBtn, styles.flex]}
                        />
                        <GreenButton
                          label={reportBusy === item.id ? 'Opening…' : 'View report'}
                          variant="outline"
                          onPress={() => openReport(item)}
                          disabled={!!reportBusy || item.status !== 'SUBMITTED'}
                          style={[styles.cardBtn, styles.flex]}
                        />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          {showRecent ? (
            <>
              <SectionTitle
                title="Recent"
                actionLabel={recent.length > 5 ? (showAllRecent ? 'Show less' : 'View all') : undefined}
                onAction={() => setShowAllRecent(v => !v)}
                spaced
              />
              {!loading && !recent.length ? <Text style={styles.empty}>{q ? 'No matching submitted audits.' : 'Submitted audits appear here.'}</Text> : null}
              {shownRecent.map(item => (
                <Pressable key={item.id} onPress={() => open(item)} style={({ pressed }) => [styles.card, styles.recentRow, pressed && styles.pressed]}>
                  <View style={styles.docIcon}><DocumentIcon size={20} color={colors.textOnPrimary} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.companyName}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.cardSub}>{fmtDate(item.auditDate)} · {item.findings} finding{item.findings === 1 ? '' : 's'}</Text>
                      {item.overallRisk ? <Text style={styles.cardSub}> · </Text> : null}
                      {item.overallRisk ? <RiskText level={item.overallRisk} /> : null}
                    </View>
                  </View>
                  <View style={styles.right}>
                    <AuditStatusPill status={item.status} />
                    <View style={styles.recentActions}>
                      <Pressable onPress={() => openReport(item)} hitSlop={8} disabled={!!reportBusy} style={styles.pdfBtn}>
                        {reportBusy === item.id ? <ActivityIndicator size="small" color={ag.green} /> : <Text style={styles.pdfText}>View</Text>}
                      </Pressable>
                      <Pressable onPress={() => downloadPdf(item)} hitSlop={8} disabled={!!pdfBusy} style={styles.pdfBtn}>
                        {pdfBusy === item.id ? <ActivityIndicator size="small" color={ag.green} /> : <Text style={styles.pdfText}>↓ PDF</Text>}
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}
        </View>
      </ScreenContainer>
    </View>
  );
}

/** Section title with a short coloured underline and an optional "View all >", like the technician Home. */
function SectionTitle({ title, actionLabel, onAction, spaced }: { title: string; actionLabel?: string; onAction?: () => void; spaced?: boolean }) {
  return (
    <View style={[styles.sectionRow, spaced && styles.sectionSpaced]}>
      <View style={styles.flex}>
        <Text style={styles.section}>{title}</Text>
        <View style={styles.underline} />
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.sectionAction}>
          <Text style={styles.link}>{actionLabel}</Text>
          <ChevronRightIcon size={14} color={ag.green} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  startBtn: { backgroundColor: ag.green, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 10, ...shadows.card },
  startPressed: { backgroundColor: ag.greenPressed },
  startText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
  search: {
    minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.sm,
  },
  alert: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74', borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.sm,
  },
  alertIcon: { width: 28, height: 28, borderRadius: 999, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center' },
  alertText: { ...typography.caption, color: '#9A3412', flex: 1 },
  alertBold: { fontWeight: '700', color: '#C2410C' },
  chips: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: ag.greenSoft, borderColor: ag.green },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextOn: { color: ag.greenDark },
  urgentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -spacing.xs, marginBottom: spacing.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  sectionSpaced: { marginTop: spacing.lg },
  section: { ...typography.subtitle, color: colors.textPrimary },
  underline: { width: 40, height: 3, borderRadius: 2, backgroundColor: ag.green, marginTop: spacing.xs },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  link: { color: ag.green, fontWeight: '700' },
  empty: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.card,
  },
  draftCard: { flexDirection: 'row', padding: 0, overflow: 'hidden' },
  cardFirst: { borderColor: ag.green, backgroundColor: ag.greenSofter },
  accent: { width: 4, backgroundColor: colors.border },
  accentOn: { backgroundColor: ag.green },
  cardBody: { flex: 1, padding: spacing.md },
  nextTag: { backgroundColor: ag.green, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  nextTagText: { ...typography.overline, fontSize: 10, color: colors.textOnPrimary },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary },
  cardSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  track: { height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: ag.green, borderRadius: radii.pill },
  cardBtn: { minHeight: 44 },
  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  dateLine: { ...typography.body, color: colors.textPrimary, marginTop: 4 },
  schedPill: { backgroundColor: '#FEF3C7', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  schedPillText: { color: ag.amberText, fontSize: 12, fontWeight: '700' },
  recentActions: { flexDirection: 'row', gap: spacing.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docIcon: { width: 42, height: 42, borderRadius: 999, backgroundColor: ag.green, alignItems: 'center', justifyContent: 'center' },
  right: { alignItems: 'flex-end', gap: spacing.xs },
  pdfBtn: { minWidth: 48, alignItems: 'flex-end', paddingVertical: 2 },
  pdfText: { color: ag.green, fontWeight: '700', fontSize: 13 },
});
