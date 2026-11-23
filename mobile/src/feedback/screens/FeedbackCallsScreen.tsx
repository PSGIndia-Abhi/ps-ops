import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { radii, spacing, typography } from '../../theme';
import { errorText, listCalls, listNumberRequests, takeCall, takeUpcomingCall } from '../api';
import { CALL_FILTERS, aheadLabel, defaultPeriod, periodLabel, periodQuery, type Period } from '../format';
import type { FeedbackStackParamList, FeedbackTabParamList } from '../navigation';
import { HeroHeader } from '../Hero';
import { SiteCard } from '../SiteCard';
import type { CallList, CallRow } from '../types';
import { Chips, PeriodPicker } from '../ui';
import { Dropdown } from '../Dropdown';
import { PhoneIcon } from '../../components/icons';

const AHEAD_DAYS = [1, 2, 3, 4, 5, 6, 7];
/** A row's key: its call, or (an upcoming call not made yet) its site. */
const rowKey = (r: CallRow) => r.request_id || `upcoming-${r.site.id}`;

// The calls to make first (To call, Not answered), then the others; in each, calls nobody has taken first.
const CALL_FIRST = ['TO_CALL', 'NOT_ANSWERED', 'WRONG_NUMBER', 'FORM_SENT', 'FORM_RECEIVED', 'TICKET_OPEN', 'DONE'];
function callRank(row: CallRow): number {
  const at = CALL_FIRST.indexOf(row.status);
  return (at < 0 ? CALL_FIRST.length : at) * 2 + (row.collector ? 1 : 0);
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm },
  sectionTitle: { ...typography.subtitle, fontSize: 19, color: t.textPrimary },
  underline: { width: 28, height: 3, borderRadius: 1.5, backgroundColor: t.crestRed, marginTop: spacing.xs },
  sectionCount: { ...typography.captionMedium, color: t.textMuted },
  gap: { height: spacing.sm },
  search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, backgroundColor: t.surface, borderRadius: radii.pill, borderWidth: 1, borderColor: t.border, paddingHorizontal: spacing.md, minHeight: 46 },
  searchInput: { flex: 1, color: t.textPrimary, ...typography.body },
  searchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.md },
  periodBox: { marginBottom: spacing.sm },
  topRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm, marginBottom: spacing.md },
  topLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, flexShrink: 1 },
  count: { ...typography.captionMedium, color: t.textMuted },
  dimmed: { opacity: 0.55 },
});

/**
 * The calls: one card per site (a customer with several sites has a card for each), month wise or
 * between two dates, filtered by status and searched. Opened on a status from Home's tiles.
 */
export function FeedbackCallsScreen() {
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  const route = useRoute<RouteProp<FeedbackTabParamList, 'Calls'>>();
  const { styles, theme } = useCrmStyles(factory);
  const { user } = useAuth();
  const myId = Number(user?.id);

  // The Show dropdown's period; Upcoming (ahead = 1-7 days) replaces it while on.
  const [basePeriod, setPeriod] = useState<Period>(defaultPeriod('today'));
  const [ahead, setAhead] = useState<number | null>(null);
  const period: Period = ahead ? { ...basePeriod, mode: 'upcoming', ahead } : basePeriod;
  const [status, setStatus] = useState(route.params?.status ?? '');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<CallList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Calls whose right number the service coordinator added: call id -> when it was added.
  const [addedAt, setAddedAt] = useState<Record<string, string>>({});

  // A tile on Home opens this tab on its status.
  const asked = route.params?.status;
  const at = route.params?.at;
  useEffect(() => {
    if (asked !== undefined) setStatus(asked);
  }, [asked, at]);

  // Search after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const shownPeriod: Period = ahead ? { ...basePeriod, mode: 'upcoming', ahead } : basePeriod;
      setData(await listCalls({ ...periodQuery(shownPeriod), status, q: query }));
      listNumberRequests('DONE')
        .then((d) => {
          const at: Record<string, string> = {};
          for (const r of d.requests) if (r.resolved_at && (!at[r.call_id] || r.resolved_at > at[r.call_id])) at[r.call_id] = r.resolved_at;
          setAddedAt(at);
        })
        .catch(() => setAddedAt({}));
    } catch (err) {
      setError(errorText(err, 'Could not load the calls.'));
    } finally {
      setLoading(false);
    }
  }, [basePeriod, ahead, status, query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function take(row: CallRow) {
    setBusy(rowKey(row));
    setError(null);
    try {
      // An upcoming call not made yet is made now (with its real due date) and taken.
      const call = row.forecast || !row.request_id ? await takeUpcomingCall(row.site.id, ahead || 1) : await takeCall(row.request_id);
      navigation.navigate('FeedbackCall', { callId: call.id });
    } catch (err) {
      setError(errorText(err, 'Could not take the call.'));
    } finally {
      setBusy(null);
    }
  }

  const shown = CALL_FILTERS.find((f) => f.value === status)?.label || 'All';

  const header = (
    <View>
      {/* Which calls: due today (the usual), a month, dates or all - a dropdown; Upcoming on its own. */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={ahead ? styles.dimmed : undefined}>
            <Dropdown
              caption="Show"
              value={basePeriod.mode}
              options={[
                { value: 'today', label: 'Due today' },
                { value: 'month', label: 'By month' },
                { value: 'range', label: 'By dates' },
                { value: 'all', label: 'All calls' },
              ]}
              onChange={(mode) => {
                setAhead(null);
                setPeriod((p) => ({ ...p, mode }));
              }}
              highlight={!ahead && basePeriod.mode !== 'today'}
            />
          </View>
          {/* Upcoming: one dropdown - pick the day (1-7 days ahead), or Off. */}
          <Dropdown
            value={ahead ? String(ahead) : 'off'}
            buttonLabel={!ahead ? 'Upcoming' : ahead === 1 ? 'Tomorrow' : `In ${ahead} days`}
            options={[
              ...AHEAD_DAYS.map((n) => ({ value: String(n), label: aheadLabel(n) })),
              ...(ahead ? [{ value: 'off', label: 'Off' }] : []),
            ]}
            onChange={(v) => setAhead(v === 'off' ? null : Number(v))}
            highlight={!!ahead}
          />
        </View>
        <Text style={styles.count}>{data ? `${data.total} call${data.total === 1 ? '' : 's'}` : ''}</Text>
      </View>
      {!ahead && (period.mode === 'month' || period.mode === 'range') && (
        <View style={styles.periodBox}>
          <PeriodPicker value={period} onChange={setPeriod} withDue hideModes />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Chips options={CALL_FILTERS} value={status} onChange={setStatus} />
      </ScrollView>
      <View style={styles.searchRow}>
        <View style={[styles.search, { flex: 1 }]}>
          <SearchIcon size={18} color={theme.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search customer, site or number" placeholderTextColor={theme.textMuted} value={q} onChangeText={setQ} />
        </View>
      </View>
      <CrmErrorBanner message={error} onRetry={load} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <HeroHeader icon={PhoneIcon} title="Calls" subtitle={periodLabel(period)} />
      <FlatList
        data={[...(data?.sites || [])].sort((a, b) => callRank(a) - callRank(b))}
        keyExtractor={rowKey}
        renderItem={({ item: row }) => (
          <SiteCard
            row={row}
            myId={myId}
            busy={busy === rowKey(row)}
            onOpen={() => navigation.navigate('FeedbackCall', { callId: row.request_id })}
            onTake={() => take(row)}
            numberAdded={
              row.status === 'TO_CALL' &&
              !!addedAt[row.request_id] &&
              (!row.last_activity_at || new Date(row.last_activity_at).getTime() <= new Date(addedAt[row.request_id]).getTime() + 5000)
            }
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} />
          ) : (
            <CrmEmptyState title="No calls here" subtitle={`No site with "${shown}" for ${periodLabel(period)}.`} />
          )
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} />}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}
