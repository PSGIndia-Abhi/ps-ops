import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, CloseIcon } from '../../components/icons';
import { kvGet, kvSet } from '../../crm/secureKv';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { radii, spacing, typography } from '../../theme';
import { listComplaints, listDocuments, listJobs, type ClientComplaint, type ClientDocument, type ClientJob } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { formatDate, serviceLabel, statusInfo } from '../format';
import type { ClientStackParamList } from '../navigation';
import { AuditGlyph, ComplaintGlyph, DocumentsGlyph, GlyphTile, ICON_DEEP, JobsGlyph, SearchGlyph } from '../ui/ClientIcons';
import { PAGE_BG, SOFT } from '../ui/page';
import { RowsSkeleton } from '../ui/skeletons';

type Nav = NavigationProp<ClientStackParamList>;

const SUGGESTIONS = ['Pest control', 'Deep cleaning', 'Certificate', 'Invoice'];
const RECENT_KEY = 'clientPortal.recentSearches';
const MAX_RECENT = 5;
const PER_GROUP = 5;

interface Results {
  jobs: ClientJob[];
  complaints: ClientComplaint[];
  documents: ClientDocument[];
  jobsTotal: number;
  complaintsTotal: number;
  documentsTotal: number;
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: PAGE_BG(t) },
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
  pill: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, height: 52, borderRadius: 26, paddingHorizontal: spacing.md, backgroundColor: SOFT(t) },
  input: { flex: 1, ...typography.body, fontSize: 16, color: t.textPrimary, paddingVertical: 0 },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const },
  content: { paddingBottom: spacing.xxxl },
  label: { ...typography.captionMedium, fontSize: 13, letterSpacing: 0.3, color: t.textMuted, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  labelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingRight: spacing.lg },
  clearAll: { ...typography.captionMedium, fontSize: 13, color: t.isDark ? '#8AB4F8' : ICON_DEEP, marginTop: spacing.xl, marginBottom: spacing.md },
  recent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.sm, height: 48 },
  recentText: { ...typography.body, fontSize: 15, color: t.textPrimary, flex: 1 },
  remove: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  browse: { flexDirection: 'row' as const, paddingHorizontal: spacing.sm },
  browseItem: { flex: 1, alignItems: 'center' as const },
  browseLabel: { ...typography.caption, fontSize: 12.5, color: t.textPrimary, marginTop: 8, textAlign: 'center' as const },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radii.pill, backgroundColor: SOFT(t) },
  chipText: { ...typography.captionMedium, fontSize: 13.5, color: t.textPrimary },
  group: { marginTop: spacing.lg },
  groupHead: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.lg, marginBottom: 4 },
  groupTitle: { ...typography.subtitle, fontSize: 16, color: t.textPrimary, flex: 1 },
  groupCount: { ...typography.caption, color: t.textMuted },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, fontSize: 12.5, color: t.textMuted, marginTop: 1 },
  empty: { alignItems: 'center' as const, paddingHorizontal: spacing.xl, marginTop: spacing.xxxl, gap: spacing.sm },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary, textAlign: 'center' as const },
  emptySub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const },
  error: { ...typography.body, color: t.danger, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
});

/** One search box for the whole portal: jobs, complaints and documents, grouped. */
export function ClientSearchScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const { outletId, portal } = useClientPortal();
  const scope = portal?.user?.id ? String(portal.user.id) : '';
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  // Recent searches, per login, in the phone's encrypted store.
  useEffect(() => {
    if (scope) kvGet<string[]>(scope, RECENT_KEY).then((list) => setRecent(Array.isArray(list) ? list : []));
  }, [scope]);

  const remember = (term: string) => {
    const t = term.trim();
    if (t.length < 2 || !scope) return;
    setRecent((list) => {
      const next = [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
      kvSet(scope, RECENT_KEY, next);
      return next;
    });
  };
  const forget = (term?: string) => {
    if (!scope) return;
    setRecent((list) => {
      const next = term ? list.filter((x) => x !== term) : [];
      kvSet(scope, RECENT_KEY, next);
      return next;
    });
  };
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const siteId = outletId || undefined;
      const [jobs, complaints, documents] = await Promise.allSettled([
        listJobs({ search: term, siteId }),
        listComplaints({ search: term, siteId, status: 'all' }),
        listDocuments({ search: term, siteId }),
      ]);
      if (!alive) return;
      const allFailed = [jobs, complaints, documents].every((r) => r.status === 'rejected');
      setError(allFailed ? 'Could not search right now. Please check your connection.' : null);
      setResults({
        jobs: jobs.status === 'fulfilled' ? jobs.value.jobs : [],
        jobsTotal: jobs.status === 'fulfilled' ? jobs.value.total : 0,
        complaints: complaints.status === 'fulfilled' ? complaints.value.complaints : [],
        complaintsTotal: complaints.status === 'fulfilled' ? complaints.value.total : 0,
        documents: documents.status === 'fulfilled' ? documents.value.documents : [],
        documentsTotal: documents.status === 'fulfilled' ? documents.value.total : 0,
      });
      setLoading(false);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, outletId]);

  const nothing = results && !results.jobs.length && !results.complaints.length && !results.documents.length;

  const open = (fn: () => void) => () => {
    Keyboard.dismiss();
    remember(q);
    fn();
  };

  const browse: { key: string; label: string; Icon: React.ComponentType<{ size?: number; color?: string; fill?: string }>; go: () => void }[] = [
    { key: 'jobs', label: 'Jobs', Icon: JobsGlyph, go: () => navigation.navigate('Jobs') },
    { key: 'complaints', label: 'Complaints', Icon: ComplaintGlyph, go: () => navigation.navigate('Complaints') },
    { key: 'docs', label: 'Documents', Icon: DocumentsGlyph, go: () => navigation.navigate('ClientDocuments') },
    { key: 'audits', label: 'Audit reports', Icon: AuditGlyph, go: () => navigation.navigate('ClientAudits') },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeftIcon size={22} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.pill}>
          <SearchGlyph size={20} color={theme.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search jobs, complaints, documents"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => remember(q)}
            autoCorrect={false}
          />
          {!!q && (
            <Pressable onPress={() => setQ('')} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear search">
              <CloseIcon size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {q.trim().length < 2 ? (
          <>
            {recent.length > 0 && (
              <>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Recent</Text>
                  <Pressable onPress={() => forget()} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.clearAll}>Clear all</Text>
                  </Pressable>
                </View>
                {recent.map((term) => (
                  <Pressable key={term} onPress={() => setQ(term)} style={({ pressed }) => [styles.recent, pressed && styles.pressed]} accessibilityRole="button">
                    <ClockIcon size={19} color={theme.textMuted} />
                    <Text style={styles.recentText} numberOfLines={1}>
                      {term}
                    </Text>
                    <Pressable onPress={() => forget(term)} style={styles.remove} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Remove ${term}`}>
                      <CloseIcon size={16} color={theme.textMuted} />
                    </Pressable>
                  </Pressable>
                ))}
              </>
            )}

            <Text style={styles.label}>Browse</Text>
            <View style={styles.browse}>
              {browse.map((b) => (
                <Pressable key={b.key} onPress={open(b.go)} style={({ pressed }) => [styles.browseItem, pressed && styles.pressed]} accessibilityRole="button">
                  <GlyphTile Icon={b.Icon} size={56} iconSize={26} />
                  <Text style={styles.browseLabel} numberOfLines={1}>
                    {b.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Popular</Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => setQ(s)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]} accessibilityRole="button">
                  <SearchGlyph size={14} color={theme.textSecondary} />
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : loading && !results ? (
          <View style={styles.group}>
            <RowsSkeleton count={6} lead="tile" inset />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : nothing ? (
          <View style={styles.empty}>
            <SearchGlyph size={40} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No matches for “{q.trim()}”</Text>
            <Text style={styles.emptySub}>Try a job number or service name.</Text>
          </View>
        ) : results ? (
          <View style={loading ? { opacity: 0.6 } : undefined}>
            {results.jobs.length > 0 && (
              <View style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupTitle}>Jobs</Text>
                  <Text style={styles.groupCount}>{results.jobsTotal}</Text>
                </View>
                {results.jobs.slice(0, PER_GROUP).map((j) => (
                  <Pressable key={j.id} onPress={open(() => navigation.navigate('ClientJobDetail', { jobId: j.id }))} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                    <GlyphTile Icon={JobsGlyph} size={44} iconSize={22} />
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {serviceLabel(j.service_type)}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {[j.code ? `#${j.code}` : null, j.site_name, statusInfo(j.status).label].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <ChevronRightIcon size={16} color={theme.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
            {results.complaints.length > 0 && (
              <View style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupTitle}>Complaints</Text>
                  <Text style={styles.groupCount}>{results.complaintsTotal}</Text>
                </View>
                {results.complaints.slice(0, PER_GROUP).map((c) => (
                  <Pressable key={c.id} onPress={open(() => navigation.navigate('ClientComplaintDetail', { complaintId: c.id }))} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                    <GlyphTile Icon={ComplaintGlyph} size={44} iconSize={22} />
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {c.subject}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {[statusInfo(c.status).label, c.site_name, formatDate(c.created_at, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <ChevronRightIcon size={16} color={theme.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
            {results.documents.length > 0 && (
              <View style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupTitle}>Documents</Text>
                  <Text style={styles.groupCount}>{results.documentsTotal}</Text>
                </View>
                {results.documents.slice(0, PER_GROUP).map((d) => (
                  <Pressable
                    key={d.key}
                    onPress={open(() => (d.kind === 'photos' && d.id ? navigation.navigate('ClientJobDetail', { jobId: d.id }) : navigation.navigate('ClientDocuments')))}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <GlyphTile Icon={DocumentsGlyph} size={44} iconSize={22} />
                    <View style={styles.flex1}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {d.title}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {[d.site_name, d.date ? formatDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' }) : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <ChevronRightIcon size={16} color={theme.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
