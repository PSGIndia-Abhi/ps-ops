import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CalendarIcon, ChevronRightIcon, HomeIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { ConfettiBurst } from '../../crm/ui/Celebration';
import { CrmBackgroundWash } from '../../crm/ui/CrmBackgroundWash';
import { radii, spacing, typography } from '../../theme';
import { dueLabel } from '../notifications';
import type { TaskStackParamList } from '../navigation';
import { useTaskById, useTasks } from '../TasksContext';
import { PRIORITY_META, TONE_GRADIENT, toneSolid } from '../theme';
import { Avatar, GradientBlock, PriorityPill, TaskIconSquare } from '../ui/parts';
import { CheckIcon, RepeatIcon } from '../ui/taskIcons';

const BADGE = 104;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  body: { flex: 1, justifyContent: 'center' as const, padding: spacing.lg },
  hero: { alignSelf: 'center' as const, width: BADGE * 1.9, height: BADGE * 1.9, alignItems: 'center' as const, justifyContent: 'center' as const },
  pulse: {
    position: 'absolute' as const,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 2,
    borderColor: t.success,
  },
  halo: {
    position: 'absolute' as const,
    width: BADGE + 28,
    height: BADGE + 28,
    borderRadius: (BADGE + 28) / 2,
    backgroundColor: t.successBg,
  },
  // the soft white shine over the top half of the green badge
  shine: {
    position: 'absolute' as const,
    top: 6,
    left: 14,
    right: 14,
    height: BADGE * 0.38,
    borderRadius: BADGE,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  title: { ...typography.display, color: t.textPrimary, textAlign: 'center' as const, letterSpacing: -0.3 },
  sub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xxs, marginBottom: spacing.xl },
  subName: { color: t.textPrimary, fontWeight: '600' as const },
  ticket: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    padding: spacing.md,
    paddingLeft: spacing.md + 6,
    overflow: 'hidden' as const,
    ...t.cardShadow,
  },
  strip: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 6 },
  ticketTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm + 4 },
  ticketTitle: { flex: 1, ...typography.bodyMedium, fontSize: 17, fontWeight: '700' as const, color: t.textPrimary },
  divider: { height: 1, backgroundColor: t.border, marginVertical: spacing.md, borderStyle: 'dashed' as const },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs + 2 },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    height: 32,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: t.surfaceAlt,
    maxWidth: '100%' as const,
  },
  chipText: { ...typography.captionMedium, color: t.textSecondary, flexShrink: 1 },
  actions: { marginTop: spacing.xl, gap: spacing.sm + 2 },
  // View task: a blue gradient pill with a glow, a shine on top and an arrow in a frosted circle
  mainBtn: {
    height: 58,
    borderRadius: 29,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  mainText: { ...typography.bodyMedium, fontSize: 17, fontWeight: '700' as const, color: '#FFFFFF', letterSpacing: 0.2 },
  mainArrow: {
    position: 'absolute' as const,
    right: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  // Create another: a soft tinted pill, the + in a small solid circle
  softBtn: {
    height: 54,
    borderRadius: 27,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.primarySoftBg,
  },
  softPlus: { width: 26, height: 26, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.primary },
  softText: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.primary },
  homeLink: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: spacing.sm + 2 },
  homeText: { ...typography.bodyMedium, color: t.textMuted },
  badgeWrap: { alignItems: 'center' as const, justifyContent: 'center' as const },
});

/** A button that shrinks a little while pressed. */
function Squeeze({ label, onPress, style, children }: { label: string; onPress: () => void; style: object; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={() => to(0.96)} onPressOut={() => to(1)} accessibilityRole="button" accessibilityLabel={label} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Blue gradient (with a soft shine fading down from the top) filling its parent (sized by measuring, so it always stretches). */
function BlueGradient() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {box.w > 0 && (
        <Svg width={box.w} height={box.h}>
          <Defs>
            <LinearGradient id="tcMain" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#3B82F6" />
              <Stop offset="1" stopColor="#1D4ED8" />
            </LinearGradient>
            <LinearGradient id="tcShine" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
              <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={box.w} height={box.h} fill="url(#tcMain)" />
          <Rect x={0} y={0} width={box.w} height={box.h} fill="url(#tcShine)" />
        </Svg>
      )}
    </View>
  );
}

/** "Task created" - shown right after a successful create, instead of just closing the form. */
export function TaskCreatedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { taskId, occurrences } = useRoute<RouteProp<TaskStackParamList, 'TaskCreated'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { task } = useTaskById(taskId);
  const { viewer } = useTasks();
  const pop = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    // two soft rings ripple out once, just after the badge lands
    Animated.timing(ripple, { toValue: 1, duration: 1400, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    setBurst(1);
  }, [pop, ripple]);

  const ring = (from: number) => ({
    opacity: ripple.interpolate({ inputRange: [0, from, 1], outputRange: [0, 0.5, 0], extrapolate: 'clamp' }),
    transform: [{ scale: ripple.interpolate({ inputRange: [0, from, 1], outputRange: [1, 1, 1.75], extrapolate: 'clamp' }) }],
  });
  const forMe = !task || task.assigned_to === viewer.id;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <CrmBackgroundWash />
      <ConfettiBurst burstKey={burst} originY={0.25} />
      <View style={styles.body}>
        <View style={styles.hero}>
          <Animated.View style={[styles.pulse, ring(0.05)]} />
          <Animated.View style={[styles.pulse, ring(0.35)]} />
          <Animated.View style={[styles.badgeWrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <View style={styles.halo} />
            <GradientBlock colors={TONE_GRADIENT.success} size={BADGE} radius={BADGE / 2} glow>
              <View style={styles.shine} />
              <CheckIcon size={50} color="#FFFFFF" />
            </GradientBlock>
          </Animated.View>
        </View>

        <Text style={styles.title}>Task created</Text>
        <Text style={styles.sub}>
          {forMe ? (
            'Added to your tasks.'
          ) : (
            <>
              Assigned to <Text style={styles.subName}>{task?.assigned_to_name}</Text>
            </>
          )}
        </Text>

        {task && (
          <View style={styles.ticket}>
            <View style={[styles.strip, { backgroundColor: toneSolid(theme, PRIORITY_META[task.priority].tone) }]} />
            <View style={styles.ticketTop}>
              <TaskIconSquare task={task} size={50} />
              <Text style={styles.ticketTitle} numberOfLines={2}>
                {task.title}
              </Text>
              <PriorityPill priority={task.priority} />
            </View>
            <View style={styles.divider} />
            <View style={styles.chips}>
              <View style={styles.chip}>
                <CalendarIcon size={14} color={theme.primary} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {dueLabel(task.due_date, task.due_time)}
                </Text>
              </View>
              <View style={styles.chip}>
                <Avatar name={task.assigned_to_name} id={task.assigned_to} size={20} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {forMe ? 'You' : task.assigned_to_name}
                </Text>
              </View>
              {!!occurrences && (
                <View style={styles.chip}>
                  <RepeatIcon size={14} color={theme.accent} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    Repeats · {occurrences} created
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <Squeeze label="View task" onPress={() => navigation.replace('TaskDetail', { taskId })} style={styles.mainBtn}>
            <BlueGradient />
            <Text style={styles.mainText}>View task</Text>
            <View style={styles.mainArrow}>
              <ChevronRightIcon size={20} color="#FFFFFF" />
            </View>
          </Squeeze>
          <Squeeze label="Create another" onPress={() => navigation.replace('NewTask')} style={styles.softBtn}>
            <View style={styles.softPlus}>
              <PlusIcon size={15} color="#FFFFFF" />
            </View>
            <Text style={styles.softText}>Create another</Text>
          </Squeeze>
          <Squeeze label="Back to Home" onPress={() => navigation.navigate('TaskTabs', { screen: 'Home' })} style={styles.homeLink}>
            <HomeIcon size={16} color={theme.textMuted} />
            <Text style={styles.homeText}>Back to Home</Text>
          </Squeeze>
        </View>
      </View>
    </SafeAreaView>
  );
}
