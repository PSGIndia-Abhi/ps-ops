import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { useRawRole } from '../../auth/role';
import { AlertTriangleIcon, CheckCircleIcon, ChevronRightIcon, InboxIcon, PhoneIcon, SendIcon } from '../../components/icons';
import { initialsOf } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { useAppSwitch } from '../../navigation/AppSwitchContext';
import { BandBackground, QuickAction, Tile } from '../../tasks/screens/TaskHomeScreen';
import { TaskBrandMark } from '../../tasks/ui/TaskBrandMark';
import { ClipboardIcon, SwapIcon } from '../../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../../theme';
import { errorText, listCalls, listTickets, takeCall } from '../api';
import { isPast, monthLabel, thisMonth } from '../format';
import type { FeedbackStackParamList } from '../navigation';
import { SiteCard } from '../SiteCard';
import type { CallList, CallRow } from '../types';

/** How far the stat tiles hang below the header band. */
const TILE_OVERLAP = 64;
/** How many calls "Needs attention" shows before "See all". */
const ATTENTION_LIMIT = 4;

// Same shape as Task Management's and Payment Reminders' Home (blue band, tiles hanging below it).
const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  band: { paddingHorizontal: spacing.lg, paddingBottom: TILE_OVERLAP + spacing.lg, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' as const },
  ident: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  logo: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const, elevation: 4 },
  hi: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  name: { ...typography.title, fontSize: 20, lineHeight: 25, color: '#FFFFFF' },
  roleChip: { alignSelf: 'flex-start' as const, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 4 },
  roleText: { ...typography.overline, fontSize: 10, color: '#FFFFFF' },
  me: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  meText: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.primary },
  switchBadge: { position: 'absolute' as const, right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  monthNote: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: spacing.md },
  pressed: { opacity: 0.75 },
  tiles: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm },
  sectionTitle: { ...typography.subtitle, fontSize: 19, color: t.textPrimary },
  underline: { width: 28, height: 3, borderRadius: 1.5, backgroundColor: t.crestRed, marginTop: spacing.xs },
  seeAll: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  seeAllText: { ...typography.bodyMedium, color: t.primary },
  skeleton: { marginBottom: spacing.sm },
  quickSection: { marginTop: spacing.md },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm },
});

/** The order calls need attention in: forms back, call-backs due, not answered, to call, form out. */
function rank(r: CallRow): number {
  if (r.status === 'FORM_RECEIVED') return 0;
  if (r.next_call_at && isPast(r.next_call_at)) return 1;
  if (r.status === 'NOT_ANSWERED') return 2;
  if (r.status === 'TO_CALL') return 3;
  return 4;
}

/**
 * Customer Feedback Home: this month at a glance - To call / Not answered / Done tiles (tap one to
 * open Calls on it) and the calls that need attention first. The avatar opens "Switch app" (or
 * Profile for a user with this app only).
 */
export function FeedbackHomeScreen() {
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const { user } = useAuth();
  const rawRole = useRawRole();
  const { canSwitch, openSwitcher } = useAppSwitch();
  const myId = Number(user?.id);
  const month = thisMonth();

  const [data, setData] = useState<CallList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openTickets, setOpenTickets] = useState(0);
  const [followUps, setFollowUps] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calls, tickets] = await Promise.all([listCalls({ month, status: 'OPEN' }), listTickets('OPEN')]);
      setData(calls);
      setOpenTickets(tickets.length);
      // Open tickets whose work is done: call the customer back to confirm (Other needs no visit).
      setFollowUps(tickets.filter((t) => t.action === 'OTHER' || t.revisit?.status === 'COMPLETED').length);
    } catch (err) {
      setError(errorText(err, 'Could not load the calls.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openCalls = (status: string) => navigation.navigate('FeedbackTabs', { screen: 'Calls', params: { status, at: Date.now() } });

  async function take(row: CallRow) {
    const key = `${row.site.id}|${row.month}`;
    setBusy(key);
    setError(null);
    try {
      const call = await takeCall(row.site.id, row.month);
      navigation.navigate('FeedbackCall', { callId: call.id });
    } catch (err) {
      setError(errorText(err, 'Could not take the call.'));
    } finally {
      setBusy(null);
    }
  }

  const counts = data?.status_counts || {};
  const attention = [...(data?.sites || [])].sort((a, b) => rank(a) - rank(b)).slice(0, ATTENTION_LIMIT);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={theme.primary} colors={[theme.primary]} progressViewOffset={insets.top} />}
      >
        <View style={[styles.band, { paddingTop: insets.top + spacing.md }]}>
          <BandBackground />
          <View style={styles.ident}>
            <View style={styles.logo}>
              <TaskBrandMark size={40} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.hi}>Customer Feedback</Text>
              <Text style={styles.name} numberOfLines={1}>
                {user?.name}
              </Text>
              {!!rawRole && (
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>{rawRole.replace(/_/g, ' ')}</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => (canSwitch ? openSwitcher(() => navigation.navigate('Profile')) : navigation.navigate('Profile'))}
              style={({ pressed }) => [styles.me, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={canSwitch ? 'Switch app' : 'Profile'}
            >
              <Text style={styles.meText}>{initialsOf(user?.name || '')}</Text>
              {canSwitch && (
                <View style={styles.switchBadge}>
                  <SwapIcon size={11} color={theme.primary} />
                </View>
              )}
            </Pressable>
          </View>
          <Text style={styles.monthNote}>{monthLabel(month)} · one call per site</Text>
        </View>

        <View style={styles.tiles}>
          {!data ? (
            <>
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
            </>
          ) : (
            <>
              <Tile icon={<PhoneIcon size={18} color="#FFFFFF" />} value={Number(counts.TO_CALL || 0)} label="To call" tone="info" onPress={() => openCalls('TO_CALL')} />
              <Tile icon={<AlertTriangleIcon size={18} color="#FFFFFF" />} value={Number(counts.NOT_ANSWERED || 0)} label="Not answered" tone="danger" onPress={() => openCalls('NOT_ANSWERED')} />
              <Tile icon={<CheckCircleIcon size={18} color="#FFFFFF" />} value={Number(counts.DONE || 0)} label="Completed" tone="success" onPress={() => openCalls('DONE')} />
            </>
          )}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={load} />

          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.sectionTitle}>Needs attention</Text>
              <View style={styles.underline} />
            </View>
            <Pressable onPress={() => openCalls('')} style={styles.seeAll} accessibilityRole="button">
              <Text style={styles.seeAllText}>See all</Text>
              <ChevronRightIcon size={16} color={theme.primary} />
            </Pressable>
          </View>
          {!data ? (
            <>
              <CrmSkeleton height={150} radius={16} style={styles.skeleton} />
              <CrmSkeleton height={150} radius={16} style={styles.skeleton} />
            </>
          ) : attention.length ? (
            attention.map((row) => (
              <SiteCard
                key={`${row.site.id}|${row.month}`}
                row={row}
                myId={myId}
                busy={busy === `${row.site.id}|${row.month}`}
                onOpen={() => navigation.navigate('FeedbackCall', { callId: row.request_id! })}
                onTake={() => take(row)}
              />
            ))
          ) : (
            <CrmEmptyState title="All caught up" subtitle={`Every call for ${monthLabel(month)} is done.`} />
          )}

          <View style={styles.quickSection}>
            <View style={styles.sectionRow}>
              <View>
                <Text style={styles.sectionTitle}>Quick actions</Text>
                <View style={styles.underline} />
              </View>
            </View>
            <View style={styles.quickRow}>
              <QuickAction icon={<InboxIcon size={20} color="#FFFFFF" />} label="Forms back" tone="accent" count={Number(counts.FORM_RECEIVED || 0)} onPress={() => openCalls('FORM_RECEIVED')} />
              <QuickAction icon={<SendIcon size={19} color="#FFFFFF" />} label="Forms sent" tone="info" count={Number(counts.FORM_SENT || 0)} onPress={() => openCalls('FORM_SENT')} />
              <QuickAction
                icon={<ClipboardIcon size={19} color="#FFFFFF" />}
                label="Open tickets"
                tone="danger"
                count={openTickets}
                onPress={() => navigation.navigate('FeedbackTabs', { screen: 'Tickets' })}
              />
              <QuickAction
                icon={<PhoneIcon size={19} color="#FFFFFF" />}
                label="Follow-ups"
                tone="success"
                count={followUps}
                onPress={() => navigation.navigate('FeedbackTabs', { screen: 'Tickets' })}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
