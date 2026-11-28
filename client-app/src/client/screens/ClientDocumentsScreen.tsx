import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { AlertTriangleIcon, ChevronRightIcon, CloseIcon, DownloadIcon, ExternalLinkIcon, SendIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { useToast } from '../ui/Toast';
import { DateSheet } from '../../tasks/ui/sheets';
import { toDateStr, todayStr } from '../../tasks/format';
import { listDocuments, type ClientDocument, type DocKind } from '../api';
import { useClientPortal } from '../ClientPortalContext';
import { downloadPortalFile, openLocalFile, saveLocalFile, shareLocalFile } from '../files';
import { RISK_STYLE, formatDate, formatMoney, plural } from '../format';
import type { ClientStackParamList } from '../navigation';
import { OutletPicker } from '../ui/OutletPicker';
import { ClientPage } from '../ui/page';
import { Popup } from '../ui/Popup';
import { AuditArt, CertificateArt, DocumentsArt, InvoiceArt, MsdsArt, PhotosArt, QuotationArt } from '../ui/IllustratedIcons';
import { BrandLoaderOverlay } from '../../components/BrandLoader';

type ArtType = React.ComponentType<{ size?: number }>;

const BLUE = '#0B57D0';

// Document type tiles (audit reports and service photos have their own pages).
const KIND_TILES: { key: DocKind | ''; label: string; count: DocKind | 'all'; Art: ArtType; bg: string; border: string; fg: string }[] = [
  { key: '', label: 'All', count: 'all', Art: DocumentsArt, bg: '#ECF3FF', border: '#0B57D0', fg: '#0B57D0' },
  { key: 'agreement', label: 'Agreement', count: 'agreement', Art: CertificateArt, bg: '#F1EEFF', border: '#6D4FE0', fg: '#5B3FD0' },
  { key: 'bestserve', label: 'BestServe docs', count: 'bestserve', Art: AuditArt, bg: '#F3EEFF', border: '#7C3AED', fg: '#6D28D9' },
  { key: 'quotation', label: 'Quotation', count: 'quotation', Art: QuotationArt, bg: '#E6F6F4', border: '#0D8A7E', fg: '#0B7A70' },
  { key: 'invoice', label: 'Invoices', count: 'invoice', Art: InvoiceArt, bg: '#FFF5E8', border: '#E37400', fg: '#B45309' },
  { key: 'msds', label: 'MSDS', count: 'msds', Art: MsdsArt, bg: '#E8F6EE', border: '#0E9F5A', fg: '#0B7A45' },
];

/** Illustrated icon + soft circle colour per kind (rows and the file popup). */
const KIND_ART: Record<DocKind, { Art: ArtType; bg: string }> = {
  agreement: { Art: CertificateArt, bg: '#F1EEFF' },
  bestserve: { Art: AuditArt, bg: '#F3EEFF' },
  quotation: { Art: QuotationArt, bg: '#E6F6F4' },
  invoice: { Art: InvoiceArt, bg: '#FFF5E8' },
  msds: { Art: MsdsArt, bg: '#E8F6EE' },
  audit: { Art: AuditArt, bg: '#EFF6EE' },
  photos: { Art: PhotosArt, bg: '#ECF3FF' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  CERTIFICATE: 'Certificate',
  CONTRACT: 'Agreement',
  AGREEMENT: 'Agreement',
  QUOTATION: 'Final quotation',
  MSDS: 'MSDS / Safety sheet',
  REPORT: 'Report',
  OTHER: 'BestServe document',
};

/** Pill colours (light / dark aware via opacity on dark). */
const PILL = {
  green: { fg: '#188038', bg: '#E6F4EA' },
  amber: { fg: '#B06000', bg: '#FEF3E2' },
  red: { fg: '#C5221F', bg: '#FCE8E6' },
  slate: { fg: '#5F6368', bg: '#F1F3F4' },
  blue: { fg: '#0B57D0', bg: '#E3ECFD' },
};
type PillTone = keyof typeof PILL;

const INVOICE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  PAID: { label: 'Paid', tone: 'green' },
  PENDING: { label: 'Pending', tone: 'amber' },
  PARTIAL: { label: 'Part paid', tone: 'amber' },
  OVERDUE: { label: 'Overdue', tone: 'red' },
};
const RISK_PILL: Record<string, PillTone> = { success: 'green', warning: 'amber', danger: 'red', info: 'blue', neutral: 'slate', accent: 'blue' };

// Date filter quick choices.
type DatePreset = 'any' | 'month' | '3m' | 'year' | 'custom';
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: 'month', label: 'This month' },
  { key: '3m', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];
function presetRange(p: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = todayStr();
  if (p === 'month') return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (p === '3m') return { from: toDateStr(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), to: today };
  if (p === 'year') return { from: toDateStr(new Date(now.getFullYear(), 0, 1)), to: today };
  return { from: '', to: '' };
}
const shortDate = (s: string) => formatDate(s, { day: 'numeric', month: 'short' });

const fileSize = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const factory = (t: CrmTheme) => {
  const ink = t.isDark ? '#E6E7EA' : '#1B1C1F';
  const sub = t.isDark ? '#A3A7AE' : '#5E6470';
  const faint = t.isDark ? '#6E737C' : '#9AA1AD';
  const line = t.isDark ? 'rgba(255,255,255,0.10)' : '#E6EBF3';
  const blue = t.isDark ? '#A8C7FA' : BLUE;
  return {
    flex1: { flex: 1 },
    pressed: { opacity: 0.7 },
    // search + date
    top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 16, marginTop: 4 },
    search: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, height: 50, paddingHorizontal: 16, borderRadius: 25, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1.5, borderColor: t.isDark ? 'rgba(168,199,250,0.35)' : '#A9C4F5' },
    searchFocused: { borderColor: blue, shadowColor: BLUE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 },
    searchInput: { flex: 1, fontSize: 15, color: ink, paddingVertical: 0 },
    dateBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1.5, borderColor: t.isDark ? 'rgba(168,199,250,0.35)' : '#A9C4F5' },
    dateBtnOn: { backgroundColor: blue, borderColor: blue },
    chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, paddingHorizontal: 16, marginTop: 10 },
    chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingLeft: 12, paddingRight: 8, height: 32, borderRadius: 16, backgroundColor: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD' },
    chipText: { fontSize: 13, fontWeight: '600' as const, color: blue },
    outlet: { paddingHorizontal: 16, marginTop: 10 },
    // type tiles
    tiles: { gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
    tile: { width: 104, alignItems: 'center' as const, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 6, borderRadius: 20, borderWidth: 1.5 },
    tileArt: { width: 48, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' },
    tileCount: { fontSize: 20, fontWeight: '800' as const, color: ink, marginTop: 8 },
    tileLabel: { fontSize: 12.5, fontWeight: '600' as const, marginTop: 1, textAlign: 'center' as const },
    tileCheck: { position: 'absolute' as const, top: 7, right: 7 },
    tileZero: { opacity: 0.55 },
    // notices
    expiring: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16, backgroundColor: t.isDark ? 'rgba(253,214,99,0.12)' : '#FEF7E0' },
    expiringText: { flex: 1, fontSize: 13, color: t.isDark ? '#FDD663' : '#8A5300', fontWeight: '500' as const },
    banner: { paddingHorizontal: 16, marginTop: 10 },
    sectionHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8, paddingHorizontal: 20, marginTop: 20, marginBottom: 4 },
    sectionTitle: { fontSize: 16, fontWeight: '700' as const, color: ink },
    sectionCount: { fontSize: 13.5, color: faint, fontWeight: '600' as const },
    // rows
    list: { paddingBottom: 40 },
    card: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 20, backgroundColor: t.isDark ? t.surface : '#FFFFFF', borderWidth: 1, borderColor: line },
    art: { width: 52, height: 52, borderRadius: 26, alignItems: 'center' as const, justifyContent: 'center' as const },
    title: { fontSize: 15, fontWeight: '700' as const, color: ink },
    sub: { fontSize: 12.5, color: sub, marginTop: 3 },
    right: { alignItems: 'flex-end' as const, gap: 6 },
    amount: { fontSize: 15.5, fontWeight: '800' as const, color: ink },
    pill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, alignSelf: 'flex-start' as const, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11.5, fontWeight: '700' as const },
    pillBelow: { marginTop: 7 },
    // empty / loading
    empty: { alignItems: 'center' as const, paddingTop: 36, paddingHorizontal: 28 },
    emptyArt: { width: 104, height: 104, borderRadius: 52, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB', alignItems: 'center' as const, justifyContent: 'center' as const },
    emptyTitle: { fontSize: 18, fontWeight: '700' as const, color: ink, marginTop: 16 },
    emptySub: { fontSize: 14.5, color: sub, textAlign: 'center' as const, marginTop: 6, lineHeight: 21 },
    more: { paddingVertical: 20, alignItems: 'center' as const },
    skeletonCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: line },
    // date popup
    presets: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    preset: { paddingHorizontal: 14, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB', borderWidth: 1.5, borderColor: 'transparent' },
    presetOn: { backgroundColor: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD', borderColor: blue },
    presetText: { fontSize: 14, fontWeight: '500' as const, color: ink },
    presetTextOn: { color: blue, fontWeight: '700' as const },
    range: { flexDirection: 'row' as const, gap: 10, marginTop: 16 },
    rangeBox: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB', borderWidth: 1.5, borderColor: 'transparent' },
    rangeLabel: { fontSize: 12, fontWeight: '600' as const, color: sub },
    rangeValue: { fontSize: 15, fontWeight: '700' as const, color: ink, marginTop: 2 },
    rangePlaceholder: { color: faint, fontWeight: '500' as const },
    actions: { flexDirection: 'row' as const, gap: 10, marginTop: 20 },
    ghostBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 8, backgroundColor: t.isDark ? t.surfaceAlt : '#F2F5FB' },
    ghostText: { fontSize: 15, fontWeight: '600' as const, color: ink },
    primaryBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 8, backgroundColor: blue },
    primaryText: { fontSize: 15, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF' },
    off: { opacity: 0.4 },
    // file popup
    fileHead: { alignItems: 'center' as const, paddingTop: 4 },
    fileArt: { width: 72, height: 72, borderRadius: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    fileTitle: { fontSize: 17, fontWeight: '700' as const, color: ink, textAlign: 'center' as const, marginTop: 12, paddingHorizontal: 12 },
    fileMeta: { fontSize: 13.5, color: sub, textAlign: 'center' as const, marginTop: 4 },
    iconRow: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 22, marginTop: 22 },
    iconBtn: { width: 60, height: 60, borderRadius: 30, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.isDark ? 'rgba(168,199,250,0.16)' : '#E8F0FE' },
    iconBtnMain: { backgroundColor: blue, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  };
};

function TileCheck({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="11" fill={color} />
      <Path d="M7.2 12.3l3.2 3.1 6.4-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SearchGlass({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="6.5" fill="none" stroke={color} strokeWidth={2} />
      <Path d="M16 16l4.5 4.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CalendarGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke={color} strokeWidth={1.9} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx="8.5" cy="14.5" r="1.1" fill={color} />
      <Circle cx="12" cy="14.5" r="1.1" fill={color} />
    </Svg>
  );
}

function Pill({ tone, label, dot, style }: { tone: PillTone; label: string; dot?: boolean; style?: object }) {
  const { styles, theme } = useCrmStyles(factory);
  const p = PILL[tone];
  return (
    <View style={[styles.pill, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : p.bg }, style]}>
      {dot && <View style={[styles.pillDot, { backgroundColor: p.fg }]} />}
      <Text style={[styles.pillText, { color: p.fg }]}>{label}</Text>
    </View>
  );
}

/** Documents (all kinds) or, with `fixedKind="audit"`, the Audit Reports page. */
export function ClientDocumentsScreen({ fixedKind, initialKind, title = 'Documents' }: { fixedKind?: DocKind; initialKind?: DocKind; title?: string }) {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { outlets, outletId, setOutletId, isCompanyAdmin } = useClientPortal();
  const toast = useToast();
  // Invoices are for head-office logins only.
  const tiles = isCompanyAdmin ? KIND_TILES : KIND_TILES.filter((k) => k.key !== 'invoice');
  const blue = theme.isDark ? '#A8C7FA' : BLUE;

  const [kind, setKind] = useState<DocKind | ''>(() => {
    const start = fixedKind ?? initialKind ?? '';
    return start === 'invoice' && !isCompanyAdmin ? '' : start;
  });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  // Date filter: applied range + the popup's draft.
  const [range, setRange] = useState<{ preset: DatePreset; from: string; to: string }>({ preset: 'any', from: '', to: '' });
  const [dateOpen, setDateOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const [items, setItems] = useState<ClientDocument[]>([]);
  const [meta, setMeta] = useState<{ total: number; counts: Partial<Record<DocKind | 'all', number>>; expiring: number }>({ total: 0, counts: {}, expiring: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<ClientDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterKey = `${kind}|${search}|${outletId}|${range.from}|${range.to}|${reloadKey}`;
  const lastKey = useRef(filterKey);
  if (lastKey.current !== filterKey) {
    lastKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listDocuments({ page, siteId: outletId || undefined, kind, search, from: range.from || undefined, to: range.to || undefined })
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
  }, [filterKey, page, kind, search, outletId, range.from, range.to]);

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
    setSelected(null);
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

  // ---- date popup ----
  const openDates = () => {
    setDraft(range);
    setDateOpen(true);
  };
  const choosePreset = (p: DatePreset) => setDraft(p === 'custom' ? { preset: 'custom', from: draft.from, to: draft.to } : { preset: p, ...presetRange(p) });
  const draftReady = draft.preset !== 'custom' || (!!draft.from && !!draft.to);
  const applyDates = () => {
    setRange(draft.preset === 'custom' || draft.preset === 'any' ? draft : { preset: draft.preset, ...presetRange(draft.preset) });
    setDateOpen(false);
  };
  const rangeLabel =
    range.preset === 'any' ? '' : range.preset === 'custom' ? `${shortDate(range.from)} – ${shortDate(range.to)}` : PRESETS.find((p) => p.key === range.preset)!.label;

  // ---- row text ----
  const describe = (d: ClientDocument) => {
    const date = formatDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' });
    let sub = [date, d.site_name].filter(Boolean).join(' · ');
    let pill: { tone: PillTone; label: string } | null = null;
    if (d.shared) {
      sub = [DOC_TYPE_LABELS[String(d.doc_type || '').toUpperCase()] || 'Document', date].filter(Boolean).join(' · ');
      if (d.valid_until) {
        const expired = new Date(d.valid_until) < new Date();
        const soon = !expired && new Date(d.valid_until).getTime() - Date.now() < 30 * 86400000;
        pill = { label: `${expired ? 'Expired' : 'Valid till'} ${formatDate(d.valid_until, { day: 'numeric', month: 'short', year: 'numeric' })}`, tone: expired ? 'red' : soon ? 'amber' : 'green' };
      }
    } else if (d.kind === 'audit') {
      const r = RISK_STYLE[String(d.risk || '').toUpperCase()];
      if (r) pill = { label: `${r.label} risk`, tone: RISK_PILL[r.tone] || 'slate' };
      sub = [date, d.site_name, d.auditor ? `by ${d.auditor}` : null].filter(Boolean).join(' · ');
    } else if (d.kind === 'invoice') {
      sub = d.pending && d.status !== 'PAID' && d.due_date ? `${date} · due ${formatDate(d.due_date, { day: 'numeric', month: 'short' })}` : date;
    } else if (d.kind === 'photos') {
      sub = [d.site_name, d.photos ? plural(d.photos, 'photo') : null].filter(Boolean).join(' · ');
    }
    return { sub, pill };
  };
  const invoiceStatus = (d: ClientDocument) => INVOICE_STATUS[String(d.status || '').toUpperCase()] || { label: d.status || '—', tone: 'slate' as PillTone };

  const firstLoad = loading && page === 1 && items.length === 0;
  const canLoadMore = !loading && items.length < meta.total;
  const shownKind = tiles.find((k) => k.key === kind);
  const sectionTitle = fixedKind === 'audit' ? 'Reports' : kind ? shownKind?.label || 'Documents' : 'All documents';

  const header = (
    <View>
      <View style={styles.top}>
        <View style={[styles.search, focused && styles.searchFocused]}>
          <SearchGlass color={focused ? blue : theme.textMuted} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={fixedKind === 'audit' ? 'Search audit reports' : 'Search documents'}
            placeholderTextColor={theme.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {!!searchInput && (
            <Pressable onPress={() => setSearchInput('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <CloseIcon size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={openDates} style={({ pressed }) => [styles.dateBtn, !!rangeLabel && styles.dateBtnOn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Filter by date">
          <CalendarGlyph color={rangeLabel ? (theme.isDark ? '#0B1B3A' : '#FFFFFF') : blue} />
        </Pressable>
      </View>

      {!!rangeLabel && (
        <View style={styles.chips}>
          <Pressable onPress={() => setRange({ preset: 'any', from: '', to: '' })} style={({ pressed }) => [styles.chip, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Remove date filter ${rangeLabel}`}>
            <Text style={styles.chipText}>{rangeLabel}</Text>
            <CloseIcon size={14} color={blue} />
          </Pressable>
        </View>
      )}

      {outlets.length > 1 && (
        <View style={styles.outlet}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </View>
      )}

      {!fixedKind && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} keyboardShouldPersistTaps="handled">
          {tiles.map((k) => {
            const on = kind === k.key;
            const n = meta.counts[k.count] ?? 0;
            return (
              <Pressable
                key={k.key || 'all'}
                onPress={() => setKind(k.key)}
                style={({ pressed }) => [
                  styles.tile,
                  { backgroundColor: theme.isDark ? theme.surfaceAlt : k.bg, borderColor: on ? k.border : 'transparent' },
                  !on && !n && styles.tileZero,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${k.label}, ${n}`}
              >
                {on && (
                  <View style={styles.tileCheck}>
                    <TileCheck color={k.border} />
                  </View>
                )}
                <View style={styles.tileArt}>
                  <k.Art size={34} />
                </View>
                <Text style={styles.tileCount}>{n}</Text>
                <Text style={[styles.tileLabel, { color: theme.isDark ? theme.textSecondary : k.fg }]} numberOfLines={1}>
                  {k.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {!fixedKind && meta.expiring > 0 && (
        <View style={styles.expiring}>
          <AlertTriangleIcon size={17} color={theme.isDark ? '#FDD663' : '#B06000'} />
          <Text style={styles.expiringText}>{plural(meta.expiring, 'document')} expiring within 30 days or already expired.</Text>
        </View>
      )}
      {!!error && (
        <View style={styles.banner}>
          <CrmErrorBanner message={error} onRetry={error && !busy ? () => setReloadKey((n) => n + 1) : undefined} />
        </View>
      )}
      {!firstLoad && items.length > 0 && (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{sectionTitle}</Text>
          <Text style={styles.sectionCount}>{meta.total}</Text>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: d }: { item: ClientDocument }) => {
    const art = KIND_ART[d.kind] || KIND_ART.bestserve;
    const { sub, pill } = describe(d);
    const tappable = d.kind === 'photos' || !!d.download;
    const inv = d.kind === 'invoice' ? invoiceStatus(d) : null;
    return (
      <Pressable onPress={() => onPressItem(d)} disabled={!tappable} style={({ pressed }) => [styles.card, pressed && styles.pressed]} accessibilityRole={tappable ? 'button' : undefined} accessibilityLabel={d.title}>
        <View style={[styles.art, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : art.bg }]}>
          <art.Art size={34} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.title} numberOfLines={1}>
            {d.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
          {!!pill && <Pill tone={pill.tone} label={pill.label} style={styles.pillBelow} />}
        </View>
        {busy === d.key ? (
          <ActivityIndicator color={blue} />
        ) : inv ? (
          <View style={styles.right}>
            <Text style={styles.amount}>{formatMoney(d.amount)}</Text>
            <Pill tone={inv.tone} label={inv.label} dot style={{ alignSelf: 'flex-end' }} />
          </View>
        ) : tappable ? (
          <ChevronRightIcon size={16} color={theme.textMuted} />
        ) : null}
      </Pressable>
    );
  };

  // File popup summary line.
  const fileMeta = (d: ClientDocument) => {
    if (d.kind === 'invoice') return [formatMoney(d.amount), invoiceStatus(d).label].join(' · ');
    const type = String(d.file_type || 'application/pdf').includes('pdf') ? 'PDF' : String(d.file_type || '').split('/').pop()?.toUpperCase();
    return [type, fileSize(d.size_bytes), formatDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ');
  };
  const selArt = selected ? KIND_ART[selected.kind] || KIND_ART.bestserve : null;
  const emptyFiltered = !!search || !!rangeLabel || !!kind;

  return (
    <ClientPage title={title} back>
      <FlatList
        data={firstLoad ? [] : items}
        keyExtractor={(d) => d.key}
        renderItem={renderItem}
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
            <View style={{ marginTop: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.skeletonCard}>
                  <CrmSkeleton width={52} height={52} radius={26} />
                  <View style={styles.flex1}>
                    <CrmSkeleton height={14} width="70%" />
                    <CrmSkeleton height={12} width="45%" style={{ marginTop: 8 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : error ? undefined : (
            <View style={styles.empty}>
              <View style={styles.emptyArt}>{fixedKind === 'audit' ? <AuditArt size={64} /> : shownKind && kind ? <shownKind.Art size={64} /> : <DocumentsArt size={64} />}</View>
              <Text style={styles.emptyTitle}>{emptyFiltered ? 'Nothing found' : fixedKind === 'audit' ? 'No audit reports yet' : 'No documents yet'}</Text>
              <Text style={styles.emptySub}>
                {emptyFiltered
                  ? 'Try another search, type or date.'
                  : fixedKind === 'audit'
                    ? 'Reports from our hygiene and pest audits will appear here.'
                    : 'Agreements, quotations, MSDS and other documents we share will appear here.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={loading && page > 1 ? <View style={styles.more}><ActivityIndicator color={blue} /></View> : undefined}
      />

      {/* Date filter */}
      <Popup visible={dateOpen && !picking} onClose={() => setDateOpen(false)} title="Filter by date">
        <View style={styles.presets}>
          {PRESETS.map((p) => {
            const on = draft.preset === p.key;
            return (
              <Pressable key={p.key} onPress={() => choosePreset(p.key)} style={({ pressed }) => [styles.preset, on && styles.presetOn, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <Text style={[styles.presetText, on && styles.presetTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {draft.preset === 'custom' && (
          <View style={styles.range}>
            {(['from', 'to'] as const).map((which) => (
              <Pressable key={which} onPress={() => setPicking(which)} style={({ pressed }) => [styles.rangeBox, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.rangeLabel}>{which === 'from' ? 'From' : 'To'}</Text>
                <Text style={[styles.rangeValue, !draft[which] && styles.rangePlaceholder]}>{draft[which] ? formatDate(draft[which], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick date'}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.actions}>
          <Pressable onPress={() => setDraft({ preset: 'any', from: '', to: '' })} style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
          <Pressable onPress={applyDates} disabled={!draftReady} style={({ pressed }) => [styles.primaryBtn, !draftReady && styles.off, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.primaryText}>Apply</Text>
          </Pressable>
        </View>
      </Popup>
      <DateSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={picking === 'to' ? 'To date' : 'From date'}
        value={(picking && draft[picking]) || null}
        minDate={picking === 'to' && draft.from ? draft.from : undefined}
        onPick={(d) => {
          setDraft((cur) => {
            const next = { ...cur, [picking as 'from' | 'to']: d };
            if (next.from && next.to && next.from > next.to) next.to = next.from;
            return next;
          });
          setPicking(null);
        }}
      />

      {/* Open / save / share */}
      <Popup visible={!!selected} onClose={() => setSelected(null)}>
        {!!selected && !!selArt && (
          <>
            <View style={styles.fileHead}>
              <View style={[styles.fileArt, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : selArt.bg }]}>
                <selArt.Art size={46} />
              </View>
              <Text style={styles.fileTitle} numberOfLines={2}>
                {selected.title}
              </Text>
              <Text style={styles.fileMeta}>{fileMeta(selected)}</Text>
            </View>
            <View style={styles.iconRow}>
              <Pressable onPress={() => act(selected, 'open')} style={({ pressed }) => [styles.iconBtn, styles.iconBtnMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open">
                <ExternalLinkIcon size={24} color={theme.isDark ? '#0B1B3A' : '#FFFFFF'} />
              </Pressable>
              <Pressable onPress={() => act(selected, 'save')} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Save">
                <DownloadIcon size={24} color={blue} />
              </Pressable>
              <Pressable onPress={() => act(selected, 'share')} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Share">
                <SendIcon size={23} color={blue} />
              </Pressable>
            </View>
          </>
        )}
      </Popup>
      <BrandLoaderOverlay visible={!!busy} message="Preparing the document" />
    </ClientPage>
  );
}

export const ClientAuditsScreen = () => <ClientDocumentsScreen fixedKind="audit" title="Audit reports" />;
