import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { radii, spacing, typography } from '../../theme';
import { listComplaints, listDocuments, listJobs, type ClientComplaint, type ClientDocument, type ClientJob } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { formatDate, serviceLabel, statusInfo } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ComplaintGlyph, DocumentsGlyph, ICON_DEEP, JobsGlyph, SearchGlyph, TILE_BG } from '../ui/ClientIcons';
import { PAGE_BG, SOFT } from '../ui/page';
import { RowsSkeleton } from '../ui/skeletons';

type Nav = NavigationProp<ClientStackParamList>;

const SUGGESTIONS = ['Pest control', 'Deep cleaning', 'Certificate', 'Invoice', 'Rodent'];
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
  hint: { ...typography.caption, fontSize: 13, color: t.textMuted, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill, borderWidth: 1, borderColor: t.border },
  chipText: { ...typography.captionMedium, fontSize: 13.5, color: t.textPrimary },
  group: { marginTop: spacing.lg },
  groupHead: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.lg, marginBottom: 4 },
  groupTitle: { ...typography.subtitle, fontSize: 16, color: t.textPrimary, flex: 1 },
  groupCount: { ...typography.caption, color: t.textMuted },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: t.isDark ? t.surfaceAlt : TILE_BG, alignItems: 'center' as const, justifyContent: 'center' as const },
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
  const { outletId } = useClientPortal();
  const [q, setQ] = useState('');
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
    fn();
  };

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
            <Text style={styles.hint}>Try searching for</Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => setQ(s)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]} accessibilityRole="button">
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>Search by job number (e.g. 2026-1179), service, outlet, complaint subject or document name.</Text>
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
            <Text style={styles.emptySub}>Check the spelling, or try a job number or service name.</Text>
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
                    <View style={styles.tile}>
                      <JobsGlyph size={22} color={ICON_DEEP} />
                    </View>
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
                    <View style={styles.tile}>
                      <ComplaintGlyph size={22} color={ICON_DEEP} />
                    </View>
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
                    <View style={styles.tile}>
                      <DocumentsGlyph size={22} color={ICON_DEEP} />
                    </View>
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
