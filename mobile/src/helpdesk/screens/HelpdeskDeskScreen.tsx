import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { ScreenHeader } from '../../tasks/ui/parts';
import { radii, spacing, typography } from '../../theme';
import { getSummary, listTickets, type HelpdeskSummary, type HelpdeskTicket, type TicketScope } from '../api';
import { TicketCard } from '../ui';

type Nav = NavigationProp<AuthenticatedStackParamList>;

const SCOPES: { key: TicketScope; label: string; count?: keyof HelpdeskSummary }[] = [
  { key: 'unassigned', label: 'Unassigned', count: 'unassigned' },
  { key: 'mine', label: 'Mine', count: 'mine' },
  { key: 'open', label: 'All open', count: 'open' },
  { key: 'closed', label: 'Closed' },
];

/**
 * Helpdesk desk for the technical team (Technical Lead / Team) - opened from Task Management's
 * Profile. The queue; tap a ticket to reply, pick it up, assign, change status / priority.
 */
export function HelpdeskDeskScreen() {
  const { styles, theme } = useCrmStyles(factory);
  const navigation = useNavigation<Nav>();
  const [scope, setScope] = useState<TicketScope>('open');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState<HelpdeskSummary | null>(null);
  const [tickets, setTickets] = useState<HelpdeskTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Search as they type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const [s, res] = await Promise.all([getSummary(), listTickets({ scope, q: query || undefined })]);
      setSummary(s);
      setTickets(res.tickets);
      setError(s.isAgent ? null : 'The Helpdesk desk is for the technical team.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tickets.');
    }
  }, [scope, query]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 30000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <CrmScreen edges={['top', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader title="Helpdesk desk" onBack={() => navigation.goBack()} />

      {summary?.isAgent && (
        <View style={styles.stats}>
          <Stat label="Unassigned" value={summary.unassigned ?? 0} color={theme.warning} bg={theme.warningBg} onPress={() => setScope('unassigned')} />
          <Stat label="Needs reply" value={summary.needsReply ?? 0} color={theme.danger} bg={theme.dangerBg} onPress={() => setScope('open')} />
          <Stat label="Mine" value={summary.mine ?? 0} color={theme.primary} bg={theme.primarySoftBg} onPress={() => setScope('mine')} />
        </View>
      )}

      <View style={styles.tabs} accessibilityRole="tablist">
        {SCOPES.map((s) => {
          const n = s.count ? Number(summary?.[s.count] ?? 0) : 0;
          return (
            <Pressable key={s.key} onPress={() => setScope(s.key)} accessibilityRole="tab" accessibilityState={{ selected: scope === s.key }} style={[styles.tab, scope === s.key && styles.tabOn]}>
              <Text style={[styles.tabText, scope === s.key && styles.tabTextOn]}>
                {s.label}
                {n > 0 ? `  ${n}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search HD-00042, subject or name"
        placeholderTextColor={theme.textMuted}
        style={styles.search}
        returnKeyType="search"
        accessibilityLabel="Search tickets"
      />

      <CrmErrorBanner message={error} onRetry={load} />

      {tickets === null && !error ? (
        <View style={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <CrmSkeleton key={i} height={100} radius={radii.lg} />
          ))}
        </View>
      ) : tickets && tickets.length === 0 ? (
        <CrmEmptyState
          title={query ? 'No tickets match' : scope === 'unassigned' ? 'Nothing waiting to be picked up' : scope === 'mine' ? 'No open tickets assigned to you' : 'No tickets here'}
          subtitle={query ? 'Try a different search.' : 'New tickets show up here automatically.'}
        />
      ) : (
        (tickets ?? []).map((t) => <TicketCard key={t.id} ticket={t} team onPress={() => navigation.navigate('HelpdeskTicket', { ticketId: t.id })} />)
      )}
    </CrmScreen>
  );
}

function Stat({ label, value, color, bg, onPress }: { label: string; value: number; color: string; bg: string; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => [styles.stat, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const factory = (t: CrmTheme) => ({
  stats: { flexDirection: 'row' as const, gap: spacing.xs, marginBottom: spacing.md },
  stat: { flex: 1, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, minHeight: 68, justifyContent: 'center' as const },
  statValue: { fontSize: 24, fontWeight: '800' as const },
  statLabel: { ...typography.captionMedium, color: t.textSecondary },
  tabs: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs, marginBottom: spacing.sm },
  tab: { height: 38, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, justifyContent: 'center' as const },
  tabOn: { backgroundColor: t.primary, borderColor: t.primary },
  tabText: { ...typography.captionMedium, color: t.textSecondary, fontSize: 13.5 },
  tabTextOn: { color: '#FFFFFF' },
  search: { minHeight: 46, borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, backgroundColor: t.surface, paddingHorizontal: spacing.md, ...typography.body, color: t.textPrimary, marginBottom: spacing.md },
  skeletons: { gap: spacing.sm },
});
