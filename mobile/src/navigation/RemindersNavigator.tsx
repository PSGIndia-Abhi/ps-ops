import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, HomeIcon, PersonIcon, PlusIcon } from '../components/icons';
import { useCrmTheme } from '../crm/theme';
import type { ReminderStackParamList, ReminderTabParamList } from '../reminders/navigation';
import { RemindersProvider } from '../reminders/RemindersContext';
import { CreateReminderScreen } from '../reminders/screens/CreateReminderScreen';
import { ReminderDetailScreen } from '../reminders/screens/ReminderDetailScreen';
import { ReminderHomeScreen } from '../reminders/screens/ReminderHomeScreen';
import { ReminderListScreen, RepeatingScreen } from '../reminders/screens/ReminderListScreen';
import { ReminderProfileScreen } from '../reminders/screens/ReminderProfileScreen';
import { RepeatIcon } from '../tasks/ui/taskIcons';
import { radii, shadows } from '../theme';

const Tab = createBottomTabNavigator<ReminderTabParamList>();
const Stack = createNativeStackNavigator<ReminderStackParamList>();

const BASE_HEIGHT = 66;
const BASE_PADDING_BOTTOM = 6;

type TabIconProps = { color: string; size: number };
const homeIcon = ({ color, size }: TabIconProps) => <HomeIcon size={size} color={color} />;
const remindersIcon = ({ color, size }: TabIconProps) => <BellIcon size={size} color={color} />;
const repeatingIcon = ({ color, size }: TabIconProps) => <RepeatIcon size={size} color={color} />;
const profileIcon = ({ color, size }: TabIconProps) => <PersonIcon size={size} color={color} />;

/** Tab label with a small dot under the active one (as in TaskNavigator). */
function TabLabel({ focused, color, children }: { focused: boolean; color: string; children: string }) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color }]}>{children}</Text>
      <View style={[styles.activeDot, focused && { backgroundColor: color }]} />
    </View>
  );
}
const tabLabel = (props: { focused: boolean; color: string; children: string }) => <TabLabel {...props} />;

/** The centre and Profile slots never show a screen - tapping them opens Create Reminder / Profile instead. */
function NewReminderPlaceholder() {
  // A real (empty) view, not null: two tab scenes with nothing in them crash the native tab container on mount.
  return <View collapsable={false} />;
}

/** Same raised circular "+" as Task Management's New Task button, for Create Reminder. */
function RaisedNewReminderButton({ onPress, onLongPress, accessibilityState, testID }: BottomTabBarButtonProps) {
  const theme = useCrmTheme();
  return (
    <View style={styles.raisedSlot}>
      <View style={[styles.raisedHalo, { backgroundColor: theme.crestRed }]} pointerEvents="none" />
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel="New Reminder"
        accessibilityState={accessibilityState}
        testID={testID}
        style={({ pressed }) => [styles.raisedCircle, { backgroundColor: theme.crestRed, borderColor: theme.surface }, pressed && styles.pressed]}
      >
        <PlusIcon size={26} color={theme.textOnPrimary} />
      </Pressable>
      <Text style={[styles.raisedLabel, { color: theme.textSecondary }]}>New Reminder</Text>
    </View>
  );
}

function ReminderTabs() {
  const theme = useCrmTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ReminderStackParamList>>();

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
      <Tab.Screen name="Home" component={ReminderHomeScreen} options={{ tabBarIcon: homeIcon }} />
      <Tab.Screen name="Reminders" component={ReminderListScreen} options={{ tabBarIcon: remindersIcon }} />
      <Tab.Screen
        name="NewReminderTab"
        component={NewReminderPlaceholder}
        options={{ title: 'New Reminder', tabBarLabel: () => null, tabBarButton: RaisedNewReminderButton }}
        listeners={() => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.navigate('CreateReminder');
          },
        })}
      />
      <Tab.Screen name="Repeating" component={RepeatingScreen} options={{ tabBarIcon: repeatingIcon }} />
      <Tab.Screen
        name="ProfileTab"
        component={NewReminderPlaceholder}
        options={{ title: 'Profile', tabBarIcon: profileIcon }}
        listeners={() => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.navigate('Profile');
          },
        })}
      />
    </Tab.Navigator>
  );
}

/**
 * Payment Reminders for the accountant (see auth/role.ts isAccountantRole): the mobile part of
 * the web's Accountant Panel. Self-contained like TaskNavigator and CrmNavigator - RoleTabs
 * mounts it when the accountant switches over from Task Management.
 */
export function RemindersNavigator() {
  const theme = useCrmTheme();
  return (
    <RemindersProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="ReminderTabs" component={ReminderTabs} />
        <Stack.Screen name="CreateReminder" component={CreateReminderScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ReminderDetail" component={ReminderDetailScreen} />
        <Stack.Screen name="Profile" component={ReminderProfileScreen} />
      </Stack.Navigator>
    </RemindersProvider>
  );
}

const styles = StyleSheet.create({
  raisedSlot: { flex: 1, alignItems: 'center' },
  // Soft glow ring around the raised "+".
  raisedHalo: { position: 'absolute', bottom: 14, width: 74, height: 74, borderRadius: 37, opacity: 0.14 },
  labelWrap: { alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '600' },
  activeDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  pressed: { opacity: 0.9 },
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
