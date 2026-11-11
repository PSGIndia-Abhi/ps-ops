import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { ChevronRightIcon } from '../../components/icons';
import { Toast, type ToastMessage } from '../../components/Toast';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import { cancelNumberRequest, errorText, listNumberRequests } from '../api';
import { formatDateTime, formatDay } from '../format';
import { HeroHeader } from '../Hero';
import type { FeedbackStackParamList } from '../navigation';
import type { NumberRequestRow } from '../types';
import { Dropdown } from '../Dropdown';
import { SendIcon } from '../../components/icons';

// The collector's requests for the right number (after a wrong number): waiting for the service
// coordinator, or the number they added. A tap opens the call. Coordinators answer on the website
// (Feedback Desk > Requests).

type Filter = 'OPEN' | 'DONE' | '';
const STATUS: Record<NumberRequestRow['status'], { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  OPEN: { label: 'Waiting', tone: 'warning' },
  DONE: { label: 'Number added', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  list: { padding: spacing.md, paddingBottom: spacing.xxxl },
  filters: { marginTop: spacing.xs, marginBottom: spacing.md },
  card: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, padding: spacing.md, paddingLeft: spacing.md + 5, marginBottom: spacing.sm, overflow: 'hidden' as const, ...t.cardShadow },
  stripe: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 5 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: spacing.xs },
  site: { ...typography.bodyMedium, color: t.textPrimary, flexShrink: 1 },
  muted: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  wrong: { ...typography.caption, color: t.dangerText, marginTop: spacing.xs },
  right: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: t.successBg },
  rightText: { ...typography.captionMedium, color: t.successText },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.surfaceAlt },
  footText: { ...typography.captionMedium, color: t.primary, flexShrink: 1 },
  pressed: { opacity: 0.85 },
});

export function FeedbackRequestsScreen() {
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const [status, setStatus] = useState<Filter>('OPEN');
  const [data, setData] = useState<{ requests: NumberRequestRow[]; counts: { OPEN: number; DONE: number; ALL: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listNumberRequests(status));
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Could not load the requests.'));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function cancel(q: NumberRequestRow) {
    setBusy(q.id);
    try {
      await cancelNumberRequest(q.id);
      setToast({ message: 'Request cancelled.', variant: 'success' });
      await load();
    } catch (err) {
      setToast({ message: errorText(err), variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const counts = data?.counts;
  const filters: { value: Filter; label: string }[] = [
    { value: 'OPEN', label: `Waiting${counts ? ` (${counts.OPEN})` : ''}` },
    { value: 'DONE', label: `Number added${counts ? ` (${counts.DONE})` : ''}` },
    { value: '', label: `All${counts ? ` (${counts.ALL})` : ''}` },
  ];

  return (
    <View style={styles.screen}>
      <HeroHeader icon={SendIcon} title="Requests" subtitle="Right numbers asked from the service coordinator" />
      <FlatList
        data={data?.requests || []}
        keyExtractor={(q) => q.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.filters}>
              <Dropdown caption="Show" value={status} options={filters} onChange={setStatus} highlight={status !== 'OPEN'} />
            </View>
            <CrmErrorBanner message={error} onRetry={load} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={theme.primary} />
          ) : (
            <CrmEmptyState
              title={status === 'OPEN' ? 'No requests waiting' : 'No requests'}
              subtitle="When a call reaches a wrong number, pick Wrong number on the call and send a request."
            />
          )
        }
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} />}
        renderItem={({ item: q }) => {
          const s = STATUS[q.status];
          const stripe = q.status === 'OPEN' ? theme.warning : q.status === 'DONE' ? theme.success : theme.border;
          return (
            <Pressable onPress={() => navigation.navigate('FeedbackCall', { callId: q.call_id })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={[styles.stripe, { backgroundColor: stripe }]} />
              <View style={styles.top}>
                <Text style={[styles.site, { flex: 1 }]} numberOfLines={1}>
                  {q.customer.name}
                </Text>
                <StatusBadge label={s.label} tone={s.tone} dot={false} />
              </View>
              <Text style={styles.muted}>
                {q.site.name}
                {q.site.city ? ` · ${q.site.city}` : ''}
                {q.due_date ? ` · call due ${formatDay(q.due_date)}` : ''}
              </Text>
              <Text style={styles.wrong}>
                Wrong: {[q.wrong.name, q.wrong.phone].filter(Boolean).join(' · ') || 'not recorded'}
                {q.note ? `  "${q.note}"` : ''}
              </Text>
              <Text style={styles.muted}>Sent {formatDateTime(q.requested_at)}</Text>
              {!!q.right && (
                <View style={styles.right}>
                  <Text style={styles.rightText}>
                    ✓ Right number: {q.right.name} · {q.right.phone}
                  </Text>
                  <Text style={styles.muted}>
                    {[q.resolved_by?.name, formatDateTime(q.resolved_at)].filter(Boolean).join(' · ')}
                    {q.resolve_note ? `  "${q.resolve_note}"` : ''}
                  </Text>
                </View>
              )}
              {q.status === 'OPEN' && (
                <PrimaryButton label="Cancel request" variant="secondary" onPress={() => cancel(q)} loading={busy === q.id} style={{ marginTop: spacing.sm }} />
              )}
              <View style={styles.foot}>
                <Text style={styles.footText} numberOfLines={1}>
                  {q.status === 'DONE' ? 'Open the call and call the new number' : 'Open the call'}
                </Text>
                <ChevronRightIcon size={16} color={theme.textMuted} />
              </View>
            </Pressable>
          );
        }}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}
