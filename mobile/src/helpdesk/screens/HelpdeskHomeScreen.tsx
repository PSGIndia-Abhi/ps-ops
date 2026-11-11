import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { ChevronRightIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { ScreenHeader } from '../../tasks/ui/parts';
import { radii, spacing, typography } from '../../theme';
import { listTickets, type HelpdeskTicket } from '../api';
import { HelpCircleIcon } from '../icons';
import { TicketCard } from '../ui';

type Nav = NavigationProp<AuthenticatedStackParamList>;

/**
 * Help & Support - the signed-in user's own tickets (opened from the Profile / More screen of every
 * app). Raise a new one, or open one to chat with the technical team.
 */
export function HelpdeskHomeScreen() {
  const { styles, theme } = useCrmStyles(factory);
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<AuthenticatedStackParamList, 'Helpdesk'>>();
  const from = route.params?.from;
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [tickets, setTickets] = useState<HelpdeskTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listTickets({ scope: 'all' });
      setTickets(res.tickets);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your tickets.');
    }
  }, []);

  // Fresh every time the screen comes back into view (after raising one or reading a reply).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const active = (tickets ?? []).filter((t) => t.status !== 'CLOSED');
  const closed = (tickets ?? []).filter((t) => t.status === 'CLOSED');
  const shown = tab === 'active' ? active : closed;

  return (
    <CrmScreen edges={['top', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader title="Help & Support" onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <HelpCircleIcon size={26} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSub}>Report a problem and chat with the technical team.</Text>
        </View>
      </View>

      <Pressable
        onPress={() => navigation.navigate('HelpdeskNew', { from })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <View style={styles.ctaIcon}>
          <PlusIcon size={20} color={theme.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.ctaTitle}>Raise a new ticket</Text>
          <Text style={styles.ctaSub}>Describe the problem, add photos</Text>
        </View>
        <ChevronRightIcon size={18} color={theme.textMuted} />
      </Pressable>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['active', 'closed'] as const).map((key) => (
          <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} style={[styles.tab, tab === key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
              {key === 'active' ? 'Active' : 'Closed'}
              {key === 'active' && active.length > 0 ? `  ${active.length}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <CrmErrorBanner message={error} onRetry={load} />

      {tickets === null && !error ? (
        <View style={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <CrmSkeleton key={i} height={84} radius={radii.lg} />
          ))}
        </View>
      ) : shown.length === 0 && !error ? (
        <CrmEmptyState
          title={tab === 'active' ? 'No active tickets' : 'No closed tickets'}
          subtitle={tab === 'active' ? 'Facing a problem? Raise a ticket and the technical team will get back to you here.' : 'Tickets you close will appear here.'}
        />
      ) : (
        shown.map((t) => <TicketCard key={t.id} ticket={t} onPress={() => navigation.navigate('HelpdeskTicket', { ticketId: t.id })} />)
      )}
    </CrmScreen>
  );
}

const factory = (t: CrmTheme) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  hero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, backgroundColor: t.primary, borderRadius: radii.xl, padding: spacing.lg, marginBottom: spacing.md, ...t.raisedShadow },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const },
  heroTitle: { ...typography.subtitle, color: '#FFFFFF' },
  heroSub: { ...typography.caption, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  cta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.md, minHeight: 64, ...t.cardShadow },
  ctaIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  ctaTitle: { ...typography.bodyMedium, color: t.textPrimary },
  ctaSub: { ...typography.caption, color: t.textMuted },
  tabs: { flexDirection: 'row' as const, backgroundColor: t.surfaceAlt, borderRadius: radii.md, padding: 4, marginBottom: spacing.md },
  tab: { flex: 1, minHeight: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: radii.sm },
  tabOn: { backgroundColor: t.surface, ...t.cardShadow },
  tabText: { ...typography.captionMedium, color: t.textMuted, fontSize: 14 },
  tabTextOn: { color: t.textPrimary },
  skeletons: { gap: spacing.sm },
});
