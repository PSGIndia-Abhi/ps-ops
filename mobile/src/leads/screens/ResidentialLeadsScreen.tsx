import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { httpClient } from '../../api/httpClient';
import { HomeIcon, PhoneIcon } from '../../components/icons';
import { formatINR } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { StatusBadge, type Tone } from '../../crm/ui/StatusBadge';
import { fmtTimestamp } from '../../tasks/format';
import { ScreenHeader } from '../../tasks/ui/parts';
import { Sheet } from '../../tasks/ui/sheets';
import { SearchIcon } from '../../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../../theme';
import { Card, useLoad } from '../ui';

/**
 * Residential leads for the sales manager: the home-service leads the sales app and the website
 * take in (lead_type 'consumer'). For reference only - they are not worked through the commercial
 * pipeline, so there are no actions: the list with its filters, and each lead's details in a sheet.
 * Same data as the web's Residential Leads page (GET /api/crm/leads?lead_type=consumer).
 */
interface ResidentialLead {
  id: string;
  customer_name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  location: string;
  house_type: string | null;
  service_name: string | null;
  plan_type: string | null;
  standard_amount: number | null;
  amount: number;
  coupon_code: string;
  payment_method: string | null;
  payment_status: string | null;
  lead_status: string | null;
  lead_source: string | null;
  reference_by: string;
  notes: string;
  created_by_name: string;
  created_at: string;
  paid_at: string | null;
}

const STATUS_TONE: Record<string, Tone> = { new: 'info', contacted: 'warning', converted: 'success', lost: 'danger' };
const PAYMENT_TONE: Record<string, Tone> = { paid: 'success', pending: 'warning', failed: 'danger', na: 'neutral' };
const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost' },
];
const PAYMENT_FILTERS = [
  { key: '', label: 'Any payment' },
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'na', label: 'No payment' },
];
const label = (text: string | null | undefined) =>
  text ? text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-';
const paymentText = (s: string | null) => (s === 'na' ? 'No payment' : label(s));
const dial = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});

const factory = (t: CrmTheme) => ({
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, minHeight: 46, ...typography.body, color: t.textPrimary },
  filterLabel: { ...typography.caption, color: t.textMuted, marginBottom: 6, fontWeight: '600' as const },
  chips: { flexDirection: 'row' as const, gap: spacing.xs, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: t.surfaceAlt },
  chipOn: { backgroundColor: t.primary },
  chipText: { ...typography.caption, color: t.textPrimary, fontWeight: '600' as const },
  chipTextOn: { color: t.textOnPrimary },

  // Summary strip: how many leads the filters leave, how many paid, how much collected.
  summary: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' as const, gap: 2 },
  summaryDivider: { width: 1, backgroundColor: t.border },
  summaryValue: { ...typography.subtitle, color: t.textPrimary },
  summaryLabel: { ...typography.caption, color: t.textMuted },

  // A lead in the list
  card: { gap: 6, marginBottom: spacing.sm },
  cardTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  name: { ...typography.bodyMedium, color: t.textPrimary, flexShrink: 1 },
  badges: { flexDirection: 'row' as const, gap: 6 },
  cardMid: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  sub: { ...typography.caption, color: t.textMuted, flexShrink: 1 },
  amount: { ...typography.bodyMedium, color: t.textPrimary },
  date: { ...typography.caption, color: t.textMuted },

  // Details sheet
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.md },
  headText: { flex: 1, gap: 4 },
  headAmount: { ...typography.title, color: t.textPrimary },
  headSub: { ...typography.caption, color: t.textMuted },
  call: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: t.success,
  },
  callText: { ...typography.button, color: '#FFFFFF' },
  group: { marginBottom: spacing.md },
  groupTitle: { ...typography.caption, color: t.textMuted, fontWeight: '700' as const, letterSpacing: 0.5, marginBottom: 4 },
  groupBox: { backgroundColor: t.surfaceAlt, borderRadius: radii.md, paddingHorizontal: spacing.sm },
  fact: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: spacing.md, paddingVertical: 9 },
  factLine: { borderTopWidth: 1, borderTopColor: t.border },
  factKey: { ...typography.caption, color: t.textMuted },
  factValue: { ...typography.body, color: t.textPrimary, flexShrink: 1, textAlign: 'right' as const },
  link: { ...typography.body, color: t.primary },
  notes: { ...typography.body, color: t.textPrimary, paddingVertical: 9 },
  pressed: { opacity: 0.85 },
});

function Chips({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (key: string) => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map(f => {
        const on = value === f.key;
        return (
          <Pressable key={f.key || 'all'} onPress={() => onChange(f.key)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function ResidentialLeadsScreen() {
  const navigation = useNavigation();
  const { styles, theme } = useCrmStyles(factory);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const [open, setOpen] = useState<ResidentialLead | null>(null);

  const loader = useCallback(async () => {
    const { data } = await httpClient.get<ResidentialLead[]>('/api/crm/leads', { params: { lead_type: 'consumer' } });
    return data;
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load residential leads.');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter(l => !status || l.lead_status === status)
      .filter(l => !payment || l.payment_status === payment)
      .filter(l => !q || [l.customer_name, l.phone, l.location, l.service_name].some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [data, query, status, payment]);
  const paid = shown.filter(l => l.payment_status === 'paid');
  const collected = paid.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  return (
    <CrmScreen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader title="Residential Leads" onBack={() => navigation.goBack()} />
      <CrmErrorBanner message={error} onRetry={reload} />

      <View style={styles.search}>
        <SearchIcon size={18} color={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name, phone, area or service"
          placeholderTextColor={theme.textMuted}
          style={styles.searchInput}
        />
      </View>
      <Text style={styles.filterLabel}>Status</Text>
      <Chips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      <Text style={styles.filterLabel}>Payment</Text>
      <Chips options={PAYMENT_FILTERS} value={payment} onChange={setPayment} />

      {loading && !data ? (
        [0, 1, 2, 3].map(i => <CrmSkeleton key={i} height={92} style={{ marginBottom: spacing.sm }} />)
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{shown.length}</Text>
              <Text style={styles.summaryLabel}>Leads</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{paid.length}</Text>
              <Text style={styles.summaryLabel}>Paid</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatINR(collected)}</Text>
              <Text style={styles.summaryLabel}>Collected</Text>
            </View>
          </View>

          {shown.length === 0 ? (
            <CrmEmptyState
              title={data?.length ? 'No matching leads' : 'No residential leads yet'}
              subtitle={data?.length ? 'Try a different search or filter.' : 'They appear here as the sales app and the website take them in.'}
              icon={<HomeIcon size={28} color={theme.textMuted} />}
            />
          ) : (
            shown.map(l => (
              <Pressable key={l.id} onPress={() => setOpen(l)} style={({ pressed }) => pressed && styles.pressed} accessibilityRole="button" accessibilityLabel={`${l.customer_name}, ${label(l.lead_status)}`}>
                <Card style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {l.customer_name || 'Customer'}
                    </Text>
                    <View style={styles.badges}>
                      <StatusBadge label={label(l.lead_status)} tone={STATUS_TONE[l.lead_status ?? ''] ?? 'neutral'} dot={false} />
                      <StatusBadge label={paymentText(l.payment_status)} tone={PAYMENT_TONE[l.payment_status ?? ''] ?? 'neutral'} dot={false} />
                    </View>
                  </View>
                  <View style={styles.cardMid}>
                    <Text style={styles.sub} numberOfLines={1}>
                      {[l.service_name, l.house_type, l.location].filter(Boolean).join(' · ') || l.phone}
                    </Text>
                    <Text style={styles.amount}>{formatINR(l.amount)}</Text>
                  </View>
                  <Text style={styles.date}>{fmtTimestamp(l.created_at)}</Text>
                </Card>
              </Pressable>
            ))
          )}
        </>
      )}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.customer_name || 'Residential lead'}>
        {open && <ResidentialDetails lead={open} />}
      </Sheet>
    </CrmScreen>
  );
}

type Fact = [string, string | null | undefined];

/** One residential lead's details, read-only, grouped. */
function ResidentialDetails({ lead: l }: { lead: ResidentialLead }) {
  const { styles } = useCrmStyles(factory);
  const groups: { title: string; facts: Fact[] }[] = [
    {
      title: 'CONTACT',
      facts: [
        ['Phone', l.phone],
        ['Alternate phone', l.alternate_phone],
        ['Email', l.email],
        ['Address / area', l.location],
      ],
    },
    {
      title: 'SERVICE',
      facts: [
        ['House type', l.house_type],
        ['Service', l.service_name],
        ['Plan', l.plan_type],
      ],
    },
    {
      title: 'PAYMENT',
      facts: [
        ['Standard price', l.standard_amount != null ? formatINR(l.standard_amount) : ''],
        ['Amount', formatINR(l.amount)],
        ['Coupon', l.coupon_code],
        ['Method', label(l.payment_method)],
        ['Status', paymentText(l.payment_status)],
        ['Paid on', l.paid_at ? fmtTimestamp(l.paid_at) : ''],
      ],
    },
    {
      title: 'OTHER',
      facts: [
        ['Source', label(l.lead_source)],
        ['Referred by', l.reference_by],
        ['Added by', l.created_by_name],
        ['Added on', fmtTimestamp(l.created_at)],
      ],
    },
  ];

  return (
    <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.headAmount}>{formatINR(l.amount)}</Text>
          <View style={styles.badges}>
            <StatusBadge label={label(l.lead_status)} tone={STATUS_TONE[l.lead_status ?? ''] ?? 'neutral'} dot={false} />
            <StatusBadge label={paymentText(l.payment_status)} tone={PAYMENT_TONE[l.payment_status ?? ''] ?? 'neutral'} dot={false} />
          </View>
        </View>
        {!!l.phone && (
          <Pressable onPress={() => dial(l.phone)} style={({ pressed }) => [styles.call, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Call ${l.customer_name}`}>
            <PhoneIcon size={18} color="#FFFFFF" />
            <Text style={styles.callText}>Call</Text>
          </Pressable>
        )}
      </View>

      {groups.map(g => {
        const facts = g.facts.filter((f): f is [string, string] => !!f[1] && String(f[1]).trim() !== '' && f[1] !== '-');
        if (!facts.length) return null;
        return (
          <View key={g.title} style={styles.group}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            <View style={styles.groupBox}>
              {facts.map(([k, v], i) => (
                <View key={k} style={[styles.fact, i > 0 && styles.factLine]}>
                  <Text style={styles.factKey}>{k}</Text>
                  {k === 'Phone' || k === 'Alternate phone' ? (
                    <Text style={styles.link} onPress={() => dial(v)}>
                      {v}
                    </Text>
                  ) : (
                    <Text style={styles.factValue}>{v}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {!!l.notes && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>NOTES</Text>
          <View style={styles.groupBox}>
            <Text style={styles.notes}>{l.notes}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
