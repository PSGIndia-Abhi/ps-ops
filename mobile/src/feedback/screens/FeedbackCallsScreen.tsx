import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { radii, spacing, typography } from '../../theme';
import { errorText, listCalls, takeCall } from '../api';
import { CALL_FILTERS, defaultPeriod, periodLabel, periodQuery, type Period } from '../format';
import type { FeedbackStackParamList, FeedbackTabParamList } from '../navigation';
import { HeroHeader } from '../Hero';
import { SiteCard } from '../SiteCard';
import type { CallList, CallRow } from '../types';
import { Chips, PeriodPicker } from '../ui';
import { Dropdown } from '../Dropdown';
import { PhoneIcon } from '../../components/icons';

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
  count: { ...typography.captionMedium, color: t.textMuted },
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

  const [period, setPeriod] = useState<Period>(defaultPeriod('today'));
  const [status, setStatus] = useState(route.params?.status ?? '');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<CallList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      setData(await listCalls({ ...periodQuery(period), status, q: query }));
    } catch (err) {
      setError(errorText(err, 'Could not load the calls.'));
    } finally {
      setLoading(false);
    }
  }, [period, status, query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function take(row: CallRow) {
    setBusy(row.request_id);
    setError(null);
    try {
      const call = await takeCall(row.request_id);
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
      {/* Which calls: due today (the usual), all, a month or dates - a dropdown. */}
      <View style={styles.topRow}>
        <Dropdown
          caption="Show"
          value={period.mode}
          options={[
            { value: 'today', label: 'Due today' },
            { value: 'all', label: 'All calls' },
            { value: 'month', label: 'By month' },
            { value: 'range', label: 'By dates' },
          ]}
          onChange={(mode) => setPeriod((p) => ({ ...p, mode }))}
          highlight={period.mode !== 'today'}
        />
        <Text style={styles.count}>{data ? `${data.total} call${data.total === 1 ? '' : 's'}` : ''}</Text>
      </View>
      {(period.mode === 'month' || period.mode === 'range') && (
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
          <TextInput style={styles.searchInput} placeholder="Search site or customer" placeholderTextColor={theme.textMuted} value={q} onChangeText={setQ} />
        </View>
      </View>
      <CrmErrorBanner message={error} onRetry={load} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <HeroHeader icon={PhoneIcon} title="Calls" subtitle={periodLabel(period)} />
      <FlatList
        data={data?.sites || []}
        keyExtractor={(r) => r.request_id}
        renderItem={({ item: row }) => (
          <SiteCard
            row={row}
            myId={myId}
            busy={busy === row.request_id}
            onOpen={() => navigation.navigate('FeedbackCall', { callId: row.request_id })}
            onTake={() => take(row)}
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
