import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import {
  AlertTriangleIcon,
  CameraIcon,
  ChevronRightIcon,
  CloseIcon,
  DocumentIcon,
  DownloadIcon,
  ExternalLinkIcon,
  SendIcon,
  ShieldIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { useToast } from '../ui/Toast';
import { ActionSheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { listDocuments, type ClientDocument, type DocKind, type DocumentListResponse } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { downloadPortalFile, openLocalFile, saveLocalFile, shareLocalFile } from '../files';
import { RISK_STYLE, formatDate, formatMoney, plural } from '../format';
import type { ClientStackParamList } from '../navigation';
import { OutletPicker } from '../ui/OutletPicker';
import { ChipRow, ClientPage, SOFT, TONES, type ToneKey } from '../ui/page';
import { BrandLoaderOverlay } from '../../components/BrandLoader';
import { STATUS_TONE } from './ClientJobsScreen';

type IconType = React.ComponentType<{ size?: number; color?: string }>;

const KIND_CHIPS: { key: DocKind | ''; label: string; count: keyof DocumentListResponse['counts'] }[] = [
  { key: '', label: 'All', count: 'all' },
  { key: 'shared', label: 'Shared by us', count: 'shared' },
  { key: 'audit', label: 'Audit reports', count: 'audit' },
  { key: 'invoice', label: 'Invoices', count: 'invoice' },
  { key: 'photos', label: 'Service photos', count: 'photos' },
];
const KIND_META: Record<DocKind, { Icon: IconType; tone: ToneKey }> = {
  shared: { Icon: DocumentIcon, tone: 'violet' },
  audit: { Icon: ShieldIcon, tone: 'green' },
  invoice: { Icon: DocumentIcon, tone: 'orange' },
  photos: { Icon: CameraIcon, tone: 'blue' },
};
const INVOICE_STATUS: Record<string, { label: string; tone: ToneKey }> = {
  PAID: { label: 'Paid', tone: 'green' },
  PENDING: { label: 'Pending', tone: 'amber' },
  OVERDUE: { label: 'Overdue', tone: 'red' },
};

const fileSize = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginHorizontal: spacing.lg, marginTop: spacing.xs, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: 24, backgroundColor: SOFT(t) },
  searchInput: { flex: 1, ...typography.body, color: t.textPrimary, paddingVertical: 0 },
  filters: { flexDirection: 'row' as const, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  banner: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  expiring: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.sm, borderRadius: 14, backgroundColor: TONES.amber.bg },
  expiringText: { ...typography.caption, color: '#92400E', flex: 1 },
  list: { paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: 1, backgroundColor: t.border, marginLeft: spacing.lg + 44 + spacing.md },
  circle: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { ...typography.bodyMedium, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  tag: { alignSelf: 'flex-start' as const, marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  tagText: { ...typography.caption, fontSize: 11.5, fontWeight: '700' as const },
  right: { alignItems: 'flex-end' as const, gap: 4 },
  rightStrong: { ...typography.bodyMedium, color: t.textPrimary },
  rightSub: { ...typography.captionMedium, fontSize: 12 },
  empty: { alignItems: 'center' as const, paddingTop: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: SOFT(t), alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary },
  emptySub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' as const },
  footerText: { ...typography.caption, color: t.textMuted },
  skeletonRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});

/** Documents (all kinds) or, with `fixedKind="audit"`, the Audit Reports page. */
export function ClientDocumentsScreen({ fixedKind, title = 'Documents' }: { fixedKind?: DocKind; title?: string }) {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, outletId, setOutletId } = useClientPortal();

  const [kind, setKind] = useState<DocKind | ''>(fixedKind ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ClientDocument[]>([]);
  const [meta, setMeta] = useState<{ total: number; counts: Partial<DocumentListResponse['counts']>; expiring: number }>({ total: 0, counts: {}, expiring: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<ClientDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterKey = `${kind}|${search}|${outletId}|${reloadKey}`;
  const lastKey = useRef(filterKey);
  if (lastKey.current !== filterKey) {
    lastKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listDocuments({ page, siteId: outletId || undefined, kind, search })
      .then((body) => {
        if (!alive) return;
        setItems((prev) => (page === 1 ? body.documents : [...prev, ...body.documents]));
        setMeta({ total: body.total, counts: body.counts, expiring: body.expiring_soon });
        setError(null);
      })
      .catch((err: Error) => alive && setError(err.message || 'Could not load documents'))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [filterKey, page, kind, search, outletId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((n) => n + 1);
  }, []);

  const fileNameOf = (d: ClientDocument) => {
    if (d.kind === 'audit') return `AuditReport-${d.site_name || 'outlet'}-${d.audit_number || d.id}.pdf`;
    return d.file_name || `${d.title}.pdf`;
  };
  const mimeOf = (d: ClientDocument) => d.file_type || 'application/pdf';

  const act = async (d: ClientDocument, what: 'open' | 'save' | 'share') => {
    if (!d.download) return;
    setBusy(d.key);
    setError(null);
    try {
      const local = await downloadPortalFile(d.download, fileNameOf(d));
      if (what === 'open') await openLocalFile(local, mimeOf(d));
      else if (what === 'save') {
        await saveLocalFile(local, mimeOf(d));
        toast.show('Saved to Downloads / BestServe');
      } else await shareLocalFile(local, mimeOf(d), d.title);
    } catch (err) {
      setError((err as Error).message || 'Could not open the file');
    } finally {
      setBusy(null);
    }
  };

  const onPressItem = (d: ClientDocument) => {
    if (d.kind === 'photos') return navigation.navigate('ClientJobDetail', { jobId: d.id });
    if (d.download) setSelected(d);
  };

  const firstLoad = loading && page === 1 && items.length === 0;
  const canLoadMore = !loading && items.length < meta.total;

  const header = (
    <View>
      <View style={styles.search}>
        <DocumentIcon size={18} color={theme.textMuted} />
        <TextInput value={searchInput} onChangeText={setSearchInput} placeholder={fixedKind === 'audit' ? 'Search audit reports' : 'Search documents'} placeholderTextColor={theme.textMuted} style={styles.searchInput} returnKeyType="search" />
        {!!searchInput && (
          <Pressable onPress={() => setSearchInput('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <CloseIcon size={16} color={theme.textMuted} />
          </Pressable>
        )}
      </View>
      {outlets.length > 1 && (
        <View style={styles.filters}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </View>
      )}
      {!fixedKind && <ChipRow options={KIND_CHIPS.map((c) => ({ key: c.key, label: c.label, count: meta.counts[c.count] }))} value={kind} onChange={setKind} style={{ marginTop: spacing.sm }} />}
      {!fixedKind && meta.expiring > 0 && (
        <View style={styles.expiring}>
          <AlertTriangleIcon size={16} color={TONES.amber.fg} />
          <Text style={styles.expiringText}>{plural(meta.expiring, 'certificate')} expiring in the next 30 days.</Text>
        </View>
      )}
      {!!error && (
        <View style={styles.banner}>
          <CrmErrorBanner message={error} onRetry={error && !busy ? () => setReloadKey((n) => n + 1) : undefined} />
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: d }: { item: ClientDocument }) => {
    const m = KIND_META[d.kind];
    const tone = TONES[m.tone];
    let right: React.ReactNode = null;
    let sub = [d.site_name, formatDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ');
    let tag: { label: string; tone: ToneKey } | null = null;

    if (d.kind === 'shared') {
      sub = [d.doc_type, d.site_name, formatDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' }), fileSize(d.size_bytes)].filter(Boolean).join(' · ');
      if (d.valid_until) {
        const expired = new Date(d.valid_until) < new Date();
        const soon = !expired && new Date(d.valid_until).getTime() - Date.now() < 30 * 86400000;
        tag = { label: `${expired ? 'Expired' : 'Valid till'} ${formatDate(d.valid_until, { day: 'numeric', month: 'short', year: 'numeric' })}`, tone: expired ? 'red' : soon ? 'amber' : 'green' };
      }
    } else if (d.kind === 'audit') {
      const r = RISK_STYLE[String(d.risk || '').toUpperCase()];
      if (r) tag = { label: `${r.label} risk`, tone: STATUS_TONE[r.tone] || 'slate' };
      sub = [d.site_name, formatDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' }), d.auditor ? `by ${d.auditor}` : null].filter(Boolean).join(' · ');
    } else if (d.kind === 'invoice') {
      const st = INVOICE_STATUS[String(d.status || '').toUpperCase()] || { label: d.status || '—', tone: 'slate' as ToneKey };
      right = (
        <View style={styles.right}>
          <Text style={styles.rightStrong}>{formatMoney(d.amount)}</Text>
          <Text style={[styles.rightSub, { color: TONES[st.tone].fg }]}>{st.label}</Text>
        </View>
      );
      if (d.pending && d.status !== 'PAID') sub = `${sub} · ${formatMoney(d.pending)} due${d.due_date ? ` by ${formatDate(d.due_date, { day: 'numeric', month: 'short' })}` : ''}`;
    } else if (d.kind === 'photos') {
      sub = [d.site_name, d.photos ? plural(d.photos, 'photo') : null].filter(Boolean).join(' · ');
    }

    const tappable = d.kind === 'photos' || !!d.download;
    return (
      <Pressable onPress={() => onPressItem(d)} disabled={!tappable} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole={tappable ? 'button' : undefined}>
        <View style={[styles.circle, { backgroundColor: tone.bg }]}>
          <m.Icon size={20} color={tone.fg} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.title} numberOfLines={1}>
            {d.title}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {sub}
          </Text>
          {!!tag && (
            <View style={[styles.tag, { backgroundColor: TONES[tag.tone].bg }]}>
              <Text style={[styles.tagText, { color: TONES[tag.tone].fg }]}>{tag.label}</Text>
            </View>
          )}
        </View>
        {busy === d.key ? <ActivityIndicator color={theme.primary} /> : right ?? (tappable ? <ChevronRightIcon size={16} color={theme.textMuted} /> : null)}
      </Pressable>
    );
  };

  return (
    <ClientPage title={title} back>
      <FlatList
        data={firstLoad ? [] : items}
        keyExtractor={(d) => d.key}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={
          <>
            <RefreshBanner refreshing={refreshing} />
            {header}
          </>
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => canLoadMore && setPage((p) => p + 1)}
        refreshControl={brandRefreshControl(refreshing, onRefresh)}
        ListEmptyComponent={
          firstLoad ? (
            <View>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <CrmSkeleton width={44} height={44} radius={14} />
                  <View style={styles.flex1}>
                    <CrmSkeleton height={14} width="70%" />
                    <CrmSkeleton height={12} width="45%" style={{ marginTop: 8 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : error ? undefined : (
            <View style={styles.empty}>
              <View style={styles.emptyCircle}>{fixedKind === 'audit' ? <ShieldIcon size={28} color={theme.textMuted} /> : <DocumentIcon size={28} color={theme.textMuted} />}</View>
              <Text style={styles.emptyTitle}>{fixedKind === 'audit' ? 'No audit reports yet' : 'No documents here'}</Text>
              <Text style={styles.emptySub}>
                {search ? 'Nothing matches your search.' : fixedKind === 'audit' ? 'Reports from our hygiene and pest audits will appear here.' : 'Certificates, reports and invoices we share with you will appear here.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            <View style={styles.footer}>
              {loading && page > 1 ? <ActivityIndicator color={theme.primary} /> : <Text style={styles.footerText}>{items.length} of {meta.total}</Text>}
            </View>
          ) : undefined
        }
      />

      <ActionSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title}
        actions={
          selected
            ? [
                { key: 'open', label: 'Open', sub: 'View it on your phone', icon: <ExternalLinkIcon size={18} color={theme.primary} />, onPress: () => (setSelected(null), act(selected, 'open')) },
                { key: 'save', label: 'Save to Downloads', sub: 'Keep a copy on this phone', icon: <DownloadIcon size={18} color={theme.primary} />, onPress: () => (setSelected(null), act(selected, 'save')) },
                { key: 'share', label: 'Share', sub: 'WhatsApp, email and more', icon: <SendIcon size={18} color={theme.primary} />, onPress: () => (setSelected(null), act(selected, 'share')) },
              ]
            : []
        }
      />
      <BrandLoaderOverlay visible={!!busy} message="Preparing the document" />
    </ClientPage>
  );
}

export const ClientAuditsScreen = () => <ClientDocumentsScreen fixedKind="audit" title="Audit reports" />;
