import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { ConfettiBurst } from '../../crm/ui/Celebration';
import { CrmBackgroundWash } from '../../crm/ui/CrmBackgroundWash';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { spacing, typography } from '../../theme';
import { dueLabel } from '../notifications';
import type { TaskStackParamList } from '../navigation';
import { useTaskById } from '../TasksContext';
import { Avatar, Card, TaskIconSquare } from '../ui/parts';
import { CheckIcon } from '../ui/taskIcons';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  body: { flex: 1, justifyContent: 'center' as const, padding: spacing.lg },
  ringOuter: {
    alignSelf: 'center' as const,
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: t.successBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.lg,
  },
  ringInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...t.cardShadow,
  },
  title: { ...typography.display, color: t.textPrimary, textAlign: 'center' as const },
  sub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xxs, marginBottom: spacing.xl },
  cardRow: { flexDirection: 'row' as const, gap: spacing.sm },
  cardBody: { flex: 1, gap: spacing.xxs },
  cardTitle: { ...typography.bodyMedium, color: t.textPrimary },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  metaText: { ...typography.caption, color: t.textSecondary },
  primary: { marginTop: spacing.xl },
  link: { alignSelf: 'center' as const, padding: spacing.md },
  linkText: { ...typography.bodyMedium, color: t.primary },
  note: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.sm },
});

/** "Task Created!" - shown right after a successful create, instead of just closing the form. */
export function TaskCreatedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { taskId, occurrences } = useRoute<RouteProp<TaskStackParamList, 'TaskCreated'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { task } = useTaskById(taskId);
  const pop = useRef(new Animated.Value(0)).current;
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    setBurst(1);
  }, [pop]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <CrmBackgroundWash />
      <ConfettiBurst burstKey={burst} originY={0.25} />
      <View style={styles.body}>
        <Animated.View
          style={[
            styles.ringOuter,
            { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}
        >
          <View style={styles.ringInner}>
            <CheckIcon size={52} color={theme.success} />
          </View>
        </Animated.View>
        <Text style={styles.title}>Task Created!</Text>
        <Text style={styles.sub}>Your task has been added to the list.</Text>

        {task && (
          <Card>
            <View style={styles.cardRow}>
              <TaskIconSquare task={task} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {task.title}
                </Text>
                <View style={styles.meta}>
                  <CalendarIcon size={14} color={theme.textSecondary} />
                  <Text style={styles.metaText}>{dueLabel(task.due_date, task.due_time)}</Text>
                </View>
                <View style={styles.meta}>
                  <Avatar name={task.assigned_to_name} id={task.assigned_to} size={22} />
                  <Text style={styles.metaText}>{task.assigned_to_name}</Text>
                </View>
              </View>
            </View>
          </Card>
        )}
        {!!occurrences && (
          <Text style={styles.note}>
            Recurring schedule · {occurrences} occurrence{occurrences === 1 ? '' : 's'} created so far
          </Text>
        )}

        <PrimaryButton label="View Task" style={styles.primary} onPress={() => navigation.replace('TaskDetail', { taskId })} />
        <Pressable style={styles.link} onPress={() => navigation.navigate('TaskTabs', { screen: 'Home' })} accessibilityRole="button">
          <Text style={styles.linkText}>Back to Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

