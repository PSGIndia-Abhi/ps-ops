import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUnreadNotificationCount } from '../../api/notifications';
import { useAuth } from '../../auth/AuthContext';
import { BellIcon, CheckCircleIcon, ClockIcon, CloseIcon, PersonIcon, PhoneIcon, SparkleIcon } from '../../components/icons';
import { formatLeadWhen } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { ClipboardListIcon } from '../../crm/ui/crmIcons';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { useAppSwitch } from '../../navigation/AppSwitchContext';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import { HomeBand, HomeTile, QuickAction, SectionTitle, TILE_OVERLAP } from '../homeParts';
import type { LeadRootStackParamList, LeadTabParamList } from '../navigation';
import { countByGroup, inGroup, type StageGroup } from '../stage';
import type { LeadTask, PipelineLead } from '../types';
import { LeadRow, LeadWash, StageBadge, useLoad, useMe } from '../ui';

const RECENT_LIMIT = 3;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  tiles: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.lg },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm },
  skeleton: { marginBottom: spacing.sm },

  // Call next
  next: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    borderLeftWidth: 5,
    borderLeftColor: t.warning,
    padding: spacing.lg,
    ...t.raisedShadow,
  },
  nextKicker: { ...typography.overline, color: t.warning },
  nextTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs },
  nextCompany: { ...typography.title, color: t.textPrimary, flex: 1 },
  nextMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 4 },
  nextMetaText: { ...typography.body, color: t.textSecondary, flex: 1 },
  nextWhen: { ...typography.caption, color: t.textMuted, marginTop: 4 },
  nextBtns: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  btnCall: { backgroundColor: t.success },
  btnOpen: { backgroundColor: t.primarySoftBg },
  btnTextOn: { ...typography.bodyMedium, color: '#FFFFFF' },
  btnTextSoft: { ...typography.bodyMedium, color: t.primary },
  pressed: { opacity: 0.85 },
  allDone: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.successBg,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  allDoneText: { ...typography.bodyMedium, color: t.successText, flex: 1 },

});

type HomeNav = CompositeNavigationProp<BottomTabNavigationProp<LeadTabParamList, 'Home'>, NativeStackNavigationProp<LeadRootStackParamList>>;

/**
 * The lead a telecaller should call now: one already theirs to call (oldest first), otherwise the
 * oldest new lead nobody has picked up yet.
 */
function callNext(leads: PipelineLead[], myId: string): PipelineLead | null {
  const oldestFirst = (a: PipelineLead, b: PipelineLead) => a.createdAt.localeCompare(b.createdAt);
  const mine = leads.filter((l) => inGroup(l, 'to_call') && l.telecallerId === myId).sort(oldestFirst);
  if (mine.length) return mine[0];
  const fresh = leads.filter((l) => inGroup(l, 'new')).sort(oldestFirst);
  return fresh[0] ?? null;
}

/**
 * The telecaller's Home - a calling desk: how many leads wait for a call, the one to call next
 * (one tap to dial) and the newest leads.
 */
export function TelecallerHome() {
  const navigation = useNavigation<HomeNav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { myId } = useMe();
  const { canSwitch, openSwitcher } = useAppSwitch();
  const { styles, theme } = useCrmStyles(factory);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(async () => {
    const [leads, tasks, unread] = await Promise.all([
      api.listLeads(),
      api.myTasksToday().catch(() => [] as LeadTask[]),
      getUnreadNotificationCount().catch(() => 0),
    ]);
    return { leads, tasks, unread };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your leads.');

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const counts = useMemo(() => countByGroup(leads), [leads]);
  const next = useMemo(() => callNext(leads, myId), [leads, myId]);
  const followUps = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.taskType !== 'LEAD_MEETING').sort((a, b) => (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')),
    [data],
  );
  const recent = leads.slice(0, RECENT_LIMIT);
  const white = '#FFFFFF';

  const openGroup = (group: StageGroup) => navigation.navigate('Leads', { group, at: Date.now() });
  const openProfile = () => navigation.navigate('More');


  return (
    <View style={styles.screen}>
      <LeadWash />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <HomeBand
          name={user?.name ?? ''}
          role="Telecaller"
          alerts={data?.unread ?? 0}
          topInset={insets.top}
          onBell={() => navigation.navigate('LeadNotifications')}
          onProfile={canSwitch ? () => openSwitcher(openProfile) : openProfile}
          onLogo={canSwitch ? () => openSwitcher(openProfile) : undefined}
        />

        <View style={styles.tiles}>
          {loading && !data ? (
            [0, 1, 2].map((i) => <CrmSkeleton key={i} height={128} radius={22} style={styles.flex1} />)
          ) : (
            <>
              <HomeTile icon={<PhoneIcon size={18} color={white} />} value={counts.to_call} label="To call" tone="danger" onPress={() => openGroup('to_call')} />
              <HomeTile icon={<SparkleIcon size={18} color={white} />} value={counts.new} label="New leads" tone="info" onPress={() => openGroup('new')} />
              <HomeTile icon={<CheckCircleIcon size={18} color={white} />} value={counts.qualified} label="Verified" tone="success" onPress={() => openGroup('qualified')} />
            </>
          )}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
          <CrmErrorBanner message={actionError} />

          {/* Who to call now */}
          {loading && !data ? (
            <CrmSkeleton height={190} radius={radii.xl} />
          ) : next ? (
            <View style={styles.next}>
              <Text style={styles.nextKicker}>{next.telecallerId === myId ? 'CALL NEXT' : 'NEW LEAD - PICK UP'}</Text>
              <View style={styles.nextTop}>
                <Text style={styles.nextCompany} numberOfLines={1}>
                  {next.companyName}
                </Text>
                <StageBadge stage={next.stage} />
              </View>
              {!!next.contactPerson && (
                <View style={styles.nextMeta}>
                  <PersonIcon size={15} color={theme.textMuted} />
                  <Text style={styles.nextMetaText} numberOfLines={1}>
                    {next.contactPerson}
                    {next.phone ? ` · ${next.phone}` : ''}
                  </Text>
                </View>
              )}
              <Text style={styles.nextWhen}>Added {formatLeadWhen(next.createdAt)}</Text>
              <View style={styles.nextBtns}>
                <Pressable
                  onPress={() => Linking.openURL(`tel:${next.phone}`).catch(() => setActionError('This phone cannot place calls.'))}
                  disabled={!next.phone}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${next.contactPerson || next.companyName}`}
                  style={({ pressed }) => [styles.btn, styles.btnCall, pressed && styles.pressed]}
                >
                  <PhoneIcon size={18} color={white} />
                  <Text style={styles.btnTextOn}>Call now</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('LeadWork', { leadId: next.id })}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, styles.btnOpen, pressed && styles.pressed]}
                >
                  <Text style={styles.btnTextSoft}>{next.telecallerId === myId ? 'Log call' : 'Start'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            !!data && (
              <View style={styles.allDone}>
                <CheckCircleIcon size={26} color={theme.success} />
                <Text style={styles.allDoneText}>No leads waiting for a call. Nice work!</Text>
              </View>
            )
          )}

          
          {/* Newest leads */}
          <View style={styles.section}>
            <SectionTitle title="Recent Leads" icon="leads" subtitle="Your newest leads" onViewAll={recent.length > 0 ? () => openGroup('all') : undefined} />
            {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={92} radius={radii.lg} style={styles.skeleton} />)}
            {!!data && recent.length === 0 && !error && <CrmEmptyState title="No leads yet" subtitle="New leads to verify will appear here." />}
            {recent.map((lead) => (
              <LeadRow key={lead.id} lead={lead} onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })} />
            ))}
          </View>

          <View style={styles.section}>
            <SectionTitle title="Quick Actions" icon="actions" subtitle="Jump straight to your work" />
            <View style={styles.quickRow}>
              <QuickAction icon={<ClockIcon size={19} color={white} />} label="Follow-ups" tone="warning" count={followUps.length} onPress={() => navigation.navigate('Tasks')} />
              <QuickAction icon={<ClipboardListIcon size={19} color={white} />} label="All Leads" tone="info" count={counts.all} onPress={() => openGroup('all')} />
              <QuickAction icon={<BellIcon size={19} color={white} />} label="Reminders" tone="accent" onPress={() => navigation.navigate('LeadReminders')} />
              <QuickAction icon={<CloseIcon size={19} color={white} />} label="Deal Lost" tone="danger" count={counts.closed} onPress={() => openGroup('closed')} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

