import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChartIcon, HomeIcon, PlusIcon } from '../components/icons';
import { useCrmTheme } from '../crm/theme';
import { ClipboardListIcon } from '../crm/ui/crmIcons';
import { radii, shadows } from '../theme';
import type { TaskStackParamList, TaskTabParamList } from '../tasks/navigation';
import { TasksProvider, useTasks } from '../tasks/TasksContext';
import { NewTaskScreen } from '../tasks/screens/NewTaskScreen';
import { ReassignScreen, RescheduleScreen } from '../tasks/screens/TaskActionScreens';
import { TaskCreatedScreen } from '../tasks/screens/TaskCreatedScreen';
import { TaskDetailScreen } from '../tasks/screens/TaskDetailScreen';
import { TaskHomeScreen } from '../tasks/screens/TaskHomeScreen';
import { TaskInsightsScreen } from '../tasks/screens/TaskInsightsScreen';
import { TaskListScreen } from '../tasks/screens/TaskListScreen';
import { TaskNotificationsScreen } from '../tasks/screens/TaskNotificationsScreen';
import { TaskProfileScreen } from '../tasks/screens/TaskProfileScreen';
import { TaskScheduleScreen } from '../tasks/screens/TaskScheduleScreen';

const Tab = createBottomTabNavigator<TaskTabParamList>();
const Stack = createNativeStackNavigator<TaskStackParamList>();

const BASE_HEIGHT = 66;
const BASE_PADDING_BOTTOM = 6;

type TabIconProps = { color: string; size: number };
const homeIcon = ({ color, size }: TabIconProps) => <HomeIcon size={size} color={color} />;
const tasksIcon = ({ color, size }: TabIconProps) => <ClipboardListIcon size={size} color={color} />;
const calendarIcon = ({ color, size }: TabIconProps) => <CalendarIcon size={size} color={color} />;
const insightsIcon = ({ color, size }: TabIconProps) => <ChartIcon size={size} color={color} />;

/** Tab label with a small dot under the active one. */
function TabLabel({ focused, color, children }: { focused: boolean; color: string; children: string }) {
  return (
    <View style={styles.labelWrap}>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{children}</Text>
      <View style={[styles.activeDot, { backgroundColor: focused ? color : 'transparent' }]} />
    </View>
  );
}
const tabLabel = (props: { focused: boolean; color: string; children: string }) => <TabLabel {...props} />;

/** The centre slot never shows a screen - tapping it opens Create Task instead. */
function NewTaskPlaceholder() {
  return null;
}

/** Same raised circular "+" as the CRM's New Lead button, for Create Task. */
function RaisedNewTaskButton({ onPress, onLongPress, accessibilityState, testID }: BottomTabBarButtonProps) {
  const theme = useCrmTheme();
  return (
    <View style={styles.raisedSlot}>
      <View style={[styles.raisedHalo, { backgroundColor: theme.crestRed }]} pointerEvents="none" />
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel="New Task"
        accessibilityState={accessibilityState}
        testID={testID}
        style={({ pressed }) => [
          styles.raisedCircle,
          { backgroundColor: theme.crestRed, borderColor: theme.surface },
          pressed && { opacity: 0.9 },
        ]}
      >
        <PlusIcon size={26} color={theme.textOnPrimary} />
      </Pressable>
      <Text style={[styles.raisedLabel, { color: theme.textSecondary }]}>New Task</Text>
    </View>
  );
}

function TaskTabs() {
  const theme = useCrmTheme();
  const insets = useSafeAreaInsets();
  // TaskTabs stays mounted under every pushed screen, so its stack navigation
  // is what lets a notification open a task from anywhere in the module.
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { registerNavigator } = useTasks();
  useEffect(() => registerNavigator(navigation), [navigation, registerNavigator]);

  const screenOptions: BottomTabNavigationOptions = {
    headerShown: false,
    tabBarActiveTintColor: theme.primary,
    tabBarInactiveTintColor: theme.textMuted,
    sceneStyle: { backgroundColor: theme.background },
    tabBarStyle: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      height: BASE_HEIGHT + insets.bottom,
      paddingBottom: BASE_PADDING_BOTTOM + insets.bottom,
      paddingTop: 6,
    },
    tabBarLabel: tabLabel,
  };

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="Home" component={TaskHomeScreen} options={{ tabBarIcon: homeIcon }} />
      <Tab.Screen
        name="Tasks"
        component={TaskListScreen}
        options={{ tabBarIcon: tasksIcon }}
        listeners={({ navigation: tabNav }) => ({
          // Tapping the Tasks tab always opens My Tasks (no search), even if a Home
          // shortcut left it on Completed / In Progress. My Team is one tap away.
          tabPress: (event) => {
            event.preventDefault();
            tabNav.navigate('Tasks', { mode: 'my', q: '', at: Date.now() });
          },
        })}
      />
      <Tab.Screen
        name="NewTaskTab"
        component={NewTaskPlaceholder}
        options={{ title: 'New Task', tabBarLabel: () => null, tabBarButton: RaisedNewTaskButton }}
        listeners={() => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.navigate('NewTask');
          },
        })}
      />
      <Tab.Screen name="Schedule" component={TaskScheduleScreen} options={{ title: 'Calendar', tabBarIcon: calendarIcon }} />
      <Tab.Screen name="Insights" component={TaskInsightsScreen} options={{ tabBarIcon: insightsIcon }} />
    </Tab.Navigator>
  );
}

/**
 * Task Management for the org-hierarchy roles (Managing Director, Heads,
 * Executives... - see auth/role.ts isTaskRole). Styled like the CRM and
 * Technician apps (CRM theme + components) and self-contained like
 * CrmNavigator: RoleTabs mounts it in place of the field-service tabs.
 * Profile (opened from Home's avatar) reaches the existing shared
 * Change password screen on the parent stack.
 */
export function TaskNavigator() {
  const theme = useCrmTheme();
  return (
    <TasksProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="TaskTabs" component={TaskTabs} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
        <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="TaskCreated" component={TaskCreatedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="Reassign" component={ReassignScreen} />
        <Stack.Screen name="Reschedule" component={RescheduleScreen} />
        <Stack.Screen name="Profile" component={TaskProfileScreen} />
        <Stack.Screen name="Notifications" component={TaskNotificationsScreen} />
      </Stack.Navigator>
    </TasksProvider>
  );
}

const styles = StyleSheet.create({
  raisedSlot: { flex: 1, alignItems: 'center' },
  // Soft glow ring around the raised "+".
  raisedHalo: { position: 'absolute', bottom: 14, width: 74, height: 74, borderRadius: 37, opacity: 0.14 },
  labelWrap: { alignItems: 'center' },
  activeDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  raisedCircle: {
    position: 'absolute',
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    ...shadows.raised,
  },
  raisedLabel: { position: 'absolute', bottom: 2, fontSize: 11, fontWeight: '600' },
});
