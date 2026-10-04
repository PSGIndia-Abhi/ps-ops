import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { TaskBrandMark } from '../ui/TaskBrandMark';
import { AlertTriangleIcon, BellIcon, CalendarIcon, ChevronRightIcon, PlayIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { radii, spacing, typography } from '../../theme';
import { byNewest, initials, isOverdue, LIST_MODES, todayStr, type ListMode } from '../format';
import type { TaskStackParamList } from '../navigation';
import { useTasks } from '../TasksContext';
import { TONE_GRADIENT } from '../theme';
import type { WorkTask } from '../types';
import { GradientBlock, TaskRow } from '../ui/parts';
import { CheckIcon, ClipboardIcon, FlagIcon, RepeatIcon, SwapIcon } from '../ui/taskIcons';

const RECENT_LIMIT = 3;
/** How far the stat tiles hang below the header band. */
const TILE_OVERLAP = 64;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  band: { paddingHorizontal: spacing.lg, paddingBottom: TILE_OVERLAP + spacing.lg, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' as const },
  ident: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  hi: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  name: { ...typography.title, fontSize: 20, lineHeight: 25, color: '#FFFFFF' },
  roleChip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
  },
  roleText: { ...typography.overline, fontSize: 10, color: '#FFFFFF' },
  scopeSwitch: { flexDirection: 'row' as const, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radii.pill, padding: 4, marginTop: spacing.md },
  scopeSeg: { flex: 1, paddingVertical: spacing.xs, borderRadius: radii.pill, alignItems: 'center' as const },
  scopeSegOn: { backgroundColor: '#FFFFFF' },
  scopeText: { ...typography.captionMedium, color: 'rgba(255,255,255,0.85)' },
  scopeTextOn: { color: t.primary, fontWeight: '700' as const },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center' as const, justifyContent: 'center' as const },
  badge: {
    position: 'absolute' as const,
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#3B6FEA',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badgeText: { fontSize: 10, fontWeight: '700' as const, color: '#FFFFFF' },
  me: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  meText: { ...typography.bodyMedium, fontWeight: '800' as const, color: t.primary },
  pressed: { opacity: 0.75 },
  tiles: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  tile: {
    flex: 1,
    alignItems: 'center' as const,
    backgroundColor: t.surface,
    borderRadius: 22,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    overflow: 'hidden' as const,
    elevation: 8,
    shadowColor: '#1E40AF',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  tileValue: { ...typography.display, fontSize: 26, lineHeight: 32, color: t.textPrimary, marginTop: spacing.xs },
  tileLabel: { ...typography.caption, color: t.textMuted },
  tileBar: { position: 'absolute' as const, left: '22%' as const, right: '22%' as const, bottom: 0, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm },
  sectionTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  sectionTitle: { ...typography.subtitle, fontSize: 19, color: t.textPrimary },
  countBubble: { backgroundColor: t.primarySoftBg, borderRadius: radii.pill, paddingHorizontal: spacing.xs, paddingVertical: 1 },
  countText: { ...typography.captionMedium, color: t.primary },
  underline: { width: 28, height: 3, borderRadius: 1.5, backgroundColor: t.crestRed, marginTop: spacing.xs },
  sectionAction: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  sectionActionText: { ...typography.bodyMedium, color: t.primary },
  skeletonRow: { marginBottom: spacing.sm },
  quickSection: { marginTop: spacing.lg },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm },
  quick: {
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.surface,
    borderRadius: 20,
    paddingVertical: spacing.md,
    paddingHorizontal: 4,
    ...t.cardShadow,
  },
  quickLabel: { ...typography.captionMedium, color: t.textPrimary },
  quickCount: {
    position: 'absolute' as const,
    top: -6,
    right: -10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: t.surface,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  quickCountText: { fontSize: 11, fontWeight: '700' as const },
});

/** The header's blue gradient with its soft decorative circles. */
function BandBackground() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((p) => (p && p.w === width && p.h === height ? p : { w: width, h: height }));
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {!!size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="taskBand" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#5C8DF7" />
              <Stop offset="0.45" stopColor="#2563EB" />
              <Stop offset="1" stopColor="#1E3FBF" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#taskBand)" />
          <Circle cx={size.w * 0.92} cy={size.h * 0.05} r={size.w * 0.3} fill="#FFFFFF" fillOpacity={0.1} />
          <Circle cx={-size.w * 0.05} cy={size.h * 0.72} r={size.w * 0.2} fill="#FFFFFF" fillOpacity={0.07} />
          <Circle cx={size.w * 0.5} cy={size.h * 0.2} r={26} fill="none" stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={2} />
        </Svg>
      )}
    </View>
  );
}

/** A number that counts up from 0 when it first appears (and when it changes). */
function CountUp({ value, style }: { value: number; style: object }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(anim, { toValue: value, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [anim, value]);
  return <Text style={style}>{shown}</Text>;
}

/** One Quick Actions shortcut: gradient icon square with a live count, label on a white card. */
function QuickAction({
  icon,
  label,
  tone,
  count,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'info' | 'accent' | 'success' | 'danger';
  count: number;
  onPress: () => void;
}) {
  const { styles } = useCrmStyles(factory);
  const scale = useRef(new Animated.Value(1)).current;
  const pressTo = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={[styles.flex1, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => pressTo(0.94)}
        onPressOut={() => pressTo(1)}
        style={styles.quick}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${count}`}
      >
        <View>
          <GradientBlock colors={TONE_GRADIENT[tone]} size={44} radius={14} glow>
            {icon}
          </GradientBlock>
          <View style={[styles.quickCount, { borderColor: TONE_GRADIENT[tone][1] }]}>
            <Text style={[styles.quickCountText, { color: TONE_GRADIENT[tone][1] }]}>{count > 99 ? '99+' : count}</Text>
          </View>
        </View>
        <Text style={styles.quickLabel} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function Tile({ icon, value, label, tone, onPress }: { icon: React.ReactNode; value: number; label: string; tone: 'info' | 'danger' | 'success'; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  const colors = TONE_GRADIENT[tone];
  const scale = useRef(new Animated.Value(1)).current;
  const pressTo = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={[styles.flex1, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => pressTo(0.95)}
        onPressOut={() => pressTo(1)}
        style={styles.tile}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
      >
        <GradientBlock colors={colors} size={40} radius={20} glow>
          {icon}
        </GradientBlock>
        <CountUp value={value} style={styles.tileValue} />
        <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
        <View style={[styles.tileBar, { backgroundColor: colors[1] }]} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Task Management Home: a blue gradient header band (BestServe logo, name,
 * role, bell with unread badge, avatar), three stat tiles floating over the
 * band's edge, and the three newest tasks. Same palette as CRM / Technician,
 * its own shape.
 */
export function TaskHomeScreen() {
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const { viewer, tasks, ready, refreshing, refresh, error, unreadCount } = useTasks();
  // Only offered to people who manage someone; everyone else only ever sees their own work.
  const hasTeam = viewer.team.length > 0;
  const [scope, setScope] = useState<'my' | 'team'>('my');
  const inScope = useCallback(
    (t: WorkTask) => !hasTeam || (scope === 'my' ? t.assigned_to === viewer.id : t.assigned_to !== viewer.id),
    [hasTeam, scope, viewer.id],
  );

  const stats = useMemo(
    () => ({
      today: tasks.filter((x) => inScope(x) && x.due_date === todayStr() && x.status !== 'CANCELLED').length,
      overdue: tasks.filter((x) => inScope(x) && isOverdue(x)).length,
      upcoming: tasks.filter((x) => inScope(x) && x.status === 'OPEN' && !!x.due_date && !isOverdue(x)).length,
    }),
    [tasks, inScope],
  );

  // Newest first - a freshly created/assigned task shows at the top.
  const recent = useMemo(
    () => tasks.filter((x) => x.status !== 'CANCELLED' && inScope(x)).sort(byNewest).slice(0, RECENT_LIMIT),
    [tasks, inScope],
  );


  const openTask = (id: string) => navigation.navigate('TaskDetail', { taskId: id });
  const openList = (mode: ListMode, teamScoped?: boolean, focused?: boolean) =>
    navigation.navigate('TaskTabs', { screen: 'Tasks', params: { mode, teamScoped, focused } });

  const quick = useMemo(() => {
    const count = (m: ListMode) => tasks.filter((x) => inScope(x) && LIST_MODES[m].match(x, viewer.id)).length;
    // "Assigned by Me" is its own concept (tasks I created for others) - not part of the My/Team toggle.
    const delegated = tasks.filter((x) => LIST_MODES.delegated.match(x, viewer.id)).length;
    return { progress: count('progress'), high: count('high'), delegated, recurring: count('recurring'), completed: count('completed') };
  }, [tasks, viewer.id, inScope]);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing && ready} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} progressViewOffset={insets.top} />
        }
      >
        <View style={[styles.band, { paddingTop: insets.top + spacing.md }]}>
          <BandBackground />
          <View style={styles.ident}>
            <View style={styles.logo}>
              <TaskBrandMark size={40} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.hi}>Welcome back</Text>
              <Text style={styles.name} numberOfLines={2}>
                {viewer.name}
              </Text>
              {!!viewer.role && (
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>{viewer.role.toUpperCase()}</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => navigation.navigate('Notifications')}
              style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} new` : 'Notifications'}
            >
              <BellIcon size={20} color="#FFFFFF" />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              style={({ pressed }) => [styles.me, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Profile"
            >
              <Text style={styles.meText}>{initials(viewer.name)}</Text>
            </Pressable>
          </View>
          {hasTeam && (
            <View style={styles.scopeSwitch}>
              <Pressable
                onPress={() => setScope('my')}
                style={[styles.scopeSeg, scope === 'my' && styles.scopeSegOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: scope === 'my' }}
              >
                <Text style={[styles.scopeText, scope === 'my' && styles.scopeTextOn]}>My Tasks</Text>
              </Pressable>
              <Pressable
                onPress={() => setScope('team')}
                style={[styles.scopeSeg, scope === 'team' && styles.scopeSegOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: scope === 'team' }}
              >
                <Text style={[styles.scopeText, scope === 'team' && styles.scopeTextOn]}>My Team</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.tiles}>
          {!ready ? (
            <>
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
              <CrmSkeleton height={128} radius={22} style={styles.flex1} />
            </>
          ) : (
            <>
              <Tile
                icon={<ClipboardIcon size={18} color="#FFFFFF" />}
                value={stats.today}
                label={scope === 'team' ? 'Team Today' : "Today's Tasks"}
                tone="info"
                onPress={() => openList('today', scope === 'team')}
              />
              <Tile
                icon={<AlertTriangleIcon size={18} color="#FFFFFF" />}
                value={stats.overdue}
                label={scope === 'team' ? 'Team Overdue' : 'Overdue'}
                tone="danger"
                onPress={() => openList('overdue', scope === 'team')}
              />
              <Tile
                icon={<CalendarIcon size={18} color="#FFFFFF" />}
                value={stats.upcoming}
                label={scope === 'team' ? 'Team Upcoming' : 'Upcoming'}
                tone="success"
                onPress={() => openList('upcoming', scope === 'team')}
              />
            </>
          )}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={ready && tasks.length === 0 ? error : null} onRetry={refresh} />

          <View style={styles.sectionRow}>
            <View>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>{scope === 'team' ? 'Team Recent Tasks' : 'Recent Tasks'}</Text>
                {/* {ready && recent.length > 0 && (
                  <View style={styles.countBubble}>
                    <Text style={styles.countText}>{recent.length}</Text>
                  </View>
                )} */}
              </View>
              <View style={styles.underline} />
            </View>
            {ready && recent.length > 0 && (
              <Pressable style={styles.sectionAction} onPress={() => openList(scope === 'team' ? 'team' : 'my', false, true)} hitSlop={10} accessibilityRole="button">
                <Text style={styles.sectionActionText}>View all</Text>
                <ChevronRightIcon size={16} color={theme.primary} />
              </Pressable>
            )}
          </View>

          {!ready && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={84} radius={radii.lg} style={styles.skeletonRow} />)}
          {ready && recent.length === 0 && !error && scope === 'team' && (
            <CrmEmptyState
              title="No tasks assigned to your team"
              subtitle="Tasks you assign to your team will show here."
              icon={<ClipboardIcon size={30} color={theme.primary} />}
            />
          )}
          {ready && recent.length === 0 && !error && scope === 'my' && (
            <CrmEmptyState
              title="No tasks yet"
              subtitle="Tasks you create or are assigned will show here."
              icon={<ClipboardIcon size={30} color={theme.primary} />}
              action={<PrimaryButton label="Create a task" onPress={() => navigation.navigate('NewTask')} />}
            />
          )}
          {recent.map((x, i) => (
            <TaskRow key={x.id} index={i} task={x} showAssignee={x.assigned_to !== viewer.id} onPress={() => openTask(x.id)} />
          ))}

          <View style={styles.quickSection}>
            <View style={styles.sectionRow}>
              <View>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.underline} />
              </View>
            </View>
            <View style={styles.quickRow}>
              <QuickAction
                icon={<PlayIcon size={18} color="#FFFFFF" />}
                label="In Progress"
                tone="accent"
                count={quick.progress}
                onPress={() => openList('progress', scope === 'team')}
              />
              <QuickAction
                icon={<FlagIcon size={19} color="#FFFFFF" />}
                label="High Priority"
                tone="danger"
                count={quick.high}
                onPress={() => openList('high', scope === 'team')}
              />
              {viewer.team.length > 0 ? (
                <QuickAction
                  icon={<SwapIcon size={19} color="#FFFFFF" />}
                  label="Assigned by Me"
                  tone="info"
                  count={quick.delegated}
                  onPress={() => openList('delegated')}
                />
              ) : (
                <QuickAction
                  icon={<RepeatIcon size={19} color="#FFFFFF" />}
                  label="Recurring"
                  tone="info"
                  count={quick.recurring}
                  onPress={() => openList('recurring', scope === 'team')}
                />
              )}
              <QuickAction
                icon={<CheckIcon size={20} color="#FFFFFF" />}
                label="Completed"
                tone="success"
                count={quick.completed}
                onPress={() => openList('completed', scope === 'team')}
              />
            </View>
          </View>
        </View>
      </ScrollView>

    </View>
  );
}
