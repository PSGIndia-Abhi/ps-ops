import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { brandRefreshControl, RefreshBanner } from '../../components/BrandRefresh';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { AlertTriangleIcon, CalendarIcon, ChevronRightIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { radii, spacing, typography } from '../../theme';
import { listOutlets, type OutletListItem } from '../api';
import { RISK_STYLE, formatDate, relativeDay, serviceLabel } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ClientPage, SOFT, TONES } from '../ui/page';
import { STATUS_TONE } from './ClientJobsScreen';

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  intro: { ...typography.body, color: t.textMuted, marginBottom: spacing.md },
  card: { borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.sm },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 17 },
  name: { ...typography.bodyMedium, fontSize: 16, color: t.textPrimary },
  addr: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: spacing.sm },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: SOFT(t) },
  tagText: { ...typography.caption, fontSize: 11.5, color: t.textSecondary },
  stats: { flexDirection: 'row' as const, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.border },
  stat: { flex: 1 },
  statValue: { ...typography.bodyMedium, color: t.textPrimary },
  statLabel: { ...typography.caption, fontSize: 11.5, color: t.textMuted, marginTop: 1 },
  statRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
});

/** Every outlet this login can see (web: PortalOutlets). */
export function ClientOutletsScreen() {
  const navigation = useNavigation<NavigationProp<ClientStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const [outlets, setOutlets] = useState<OutletListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOutlets(await listOutlets());
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Could not load your outlets');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ClientPage title="Outlets" back>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={brandRefreshControl(refreshing, () => {
              setRefreshing(true);
              load();
            })}
      >
        <RefreshBanner refreshing={refreshing} />
        <CrmErrorBanner message={error} onRetry={load} />
        {outlets === null ? (
          Array.from({ length: 3 }).map((_, i) => <CrmSkeleton key={i} height={150} radius={20} style={{ marginBottom: spacing.sm }} />)
        ) : (
          <>
            <Text style={styles.intro}>
              {outlets.length === 1 ? 'Your outlet serviced by BestServe.' : `${outlets.length} outlets serviced by BestServe.`}
            </Text>
            {outlets.map((o) => {
              const risk = RISK_STYLE[String(o.audit_risk || '').toUpperCase()];
              const riskTone = risk ? TONES[STATUS_TONE[risk.tone] || 'slate'] : null;
              return (
                <Pressable key={o.id} onPress={() => navigation.navigate('ClientOutletDetail', { siteId: o.id })} style={({ pressed }) => [styles.card, pressed && styles.pressed]} accessibilityRole="button">
                  <View style={styles.top}>
                    <View style={[styles.avatar, { backgroundColor: avatarColor(o.id) }]}>
                      <Text style={styles.avatarText}>{initials(o.name || o.id)}</Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.name} numberOfLines={1}>
                        {o.name || o.id}
                      </Text>
                      <Text style={styles.addr} numberOfLines={2}>
                        {o.address || o.city || 'No address on file'}
                      </Text>
                    </View>
                    <ChevronRightIcon size={18} color={theme.textMuted} />
                  </View>
                  {(o.services.length > 0 || risk) && (
                    <View style={styles.tags}>
                      {o.services.map((s) => (
                        <View key={s} style={styles.tag}>
                          <Text style={styles.tagText}>{serviceLabel(s)}</Text>
                        </View>
                      ))}
                      {risk && riskTone && (
                        <View style={[styles.tag, { backgroundColor: riskTone.bg }]}>
                          <Text style={[styles.tagText, { color: riskTone.fg }]}>{risk.label} risk</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <View style={styles.stats}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{o.active_jobs}</Text>
                      <Text style={styles.statLabel}>Active jobs</Text>
                    </View>
                    <View style={styles.stat}>
                      <View style={styles.statRow}>
                        <CalendarIcon size={13} color={theme.textMuted} />
                        <Text style={styles.statValue}>{o.next_visit ? formatDate(o.next_visit, { day: 'numeric', month: 'short' }) : '—'}</Text>
                      </View>
                      <Text style={styles.statLabel}>{o.next_visit ? relativeDay(o.next_visit) : 'Next visit'}</Text>
                    </View>
                    <View style={styles.stat}>
                      <View style={styles.statRow}>
                        {o.open_complaints > 0 ? <AlertTriangleIcon size={13} color={TONES.amber.fg} /> : <PinIcon size={13} color={theme.textMuted} />}
                        <Text style={[styles.statValue, o.open_complaints > 0 && { color: TONES.amber.fg }]}>{o.open_complaints}</Text>
                      </View>
                      <Text style={styles.statLabel}>Open issues</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </ClientPage>
  );
}
