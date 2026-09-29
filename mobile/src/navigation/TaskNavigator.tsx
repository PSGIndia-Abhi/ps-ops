import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, HomeIcon, PersonIcon } from '../components/icons';
import type { TaskStackParamList, TaskTabParamList } from '../tasks/navigation';
import { TasksProvider, useTasks } from '../tasks/TasksContext';
import { NewTaskScreen } from '../tasks/screens/NewTaskScreen';
import { TaskDetailScreen } from '../tasks/screens/TaskDetailScreen';
import { TaskHomeScreen } from '../tasks/screens/TaskHomeScreen';
import { TaskListScreen } from '../tasks/screens/TaskListScreen';
import { TaskProfileScreen } from '../tasks/screens/TaskProfileScreen';
import { TaskScheduleScreen } from '../tasks/screens/TaskScheduleScreen';
import { font, t } from '../tasks/theme';
import { ClipboardIcon } from '../tasks/ui/taskIcons';

const Tab = createBottomTabNavigator<TaskTabParamList>();
const Stack = createNativeStackNavigator<TaskStackParamList>();

const TAB_META: Record<keyof TaskTabParamList, { label: string; Icon: typeof HomeIcon }> = {
  Home: { label: 'Home', Icon: HomeIcon },
  Tasks: { label: 'Tasks', Icon: ClipboardIcon },
  Schedule: { label: 'Calendar', Icon: CalendarIcon },
  Profile: { label: 'Profile', Icon: PersonIcon },
};

/** The floating white pill bar from the design, with the active tab as a dark capsule. */
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barWrap, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { label, Icon } = TAB_META[route.name as keyof TaskTabParamList];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={[styles.item, focused && styles.itemOn]}
            >
              <Icon size={22} color={focused ? t.onInk : t.ink} />
              <Text style={[styles.label, focused && { color: t.onInk }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const renderTabBar = (props: BottomTabBarProps) => <FloatingTabBar {...props} />;

function TaskTabs() {
  // TaskTabs stays mounted under every pushed screen, so its stack navigation
  // is what lets a notification open a task from anywhere in the module.
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { registerNavigator } = useTasks();
  useEffect(() => registerNavigator(navigation), [navigation, registerNavigator]);

  return (
    <Tab.Navigator
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.washBase } }}
    >
      <Tab.Screen name="Home" component={TaskHomeScreen} />
      <Tab.Screen name="Tasks" component={TaskListScreen} />
      <Tab.Screen name="Schedule" component={TaskScheduleScreen} />
      <Tab.Screen name="Profile" component={TaskProfileScreen} />
    </Tab.Navigator>
  );
}

/**
 * Task Management for the org-hierarchy roles (Managing Director, Heads,
 * Executives... - see auth/role.ts isTaskRole). Self-contained like
 * CrmNavigator: mounted by RoleTabs in place of the field-service tabs, so
 * Technician/Supervisor/CRM flows are untouched. Profile's "Change password"
 * reaches the existing shared screen on the parent stack.
 */
export function TaskNavigator() {
  return (
    <TasksProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.washBase } }}>
        <Stack.Screen name="TaskTabs" component={TaskTabs} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ animation: 'slide_from_bottom' }} />
      </Stack.Navigator>
    </TasksProvider>
  );
}

const styles = StyleSheet.create({
  barWrap: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: t.washBase },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: t.surface,
    borderRadius: 40,
    padding: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 68, borderRadius: 34, gap: 4 },
  itemOn: { backgroundColor: t.ink },
  label: { fontSize: 12, color: t.ink, fontFamily: font.medium },
});
