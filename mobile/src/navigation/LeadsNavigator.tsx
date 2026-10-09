import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartIcon, ClockIcon, HomeIcon, MoreHorizontalIcon, PlusIcon } from '../components/icons';
import { CrmMoreScreen } from '../crm/screens/CrmMoreScreen';
import { useCrmTheme } from '../crm/theme';
import { ClipboardListIcon } from '../crm/ui/crmIcons';
import type { LeadRootStackParamList, LeadTabParamList } from '../leads/navigation';
import { LEAD_STACK_SCREENS } from '../leads/screens';
import { LeadListScreen, LeadTasksScreen } from '../leads/screens/LeadBrowseScreens';
import { LeadHomeScreen } from '../leads/screens/LeadHomeScreen';
import { TeamScreen } from '../leads/screens/ReportScreens';
import { useMe } from '../leads/ui';
import { radii, shadows } from '../theme';

const Tab = createBottomTabNavigator<LeadTabParamList>();
const Stack = createNativeStackNavigator<LeadRootStackParamList>();

const BASE_HEIGHT = 60;
const BASE_PADDING_BOTTOM = 6;

type TabIconProps = { color: string; size: number };
const homeIcon = ({ color, size }: TabIconProps) => <HomeIcon size={size} color={color} />;
const leadsIcon = ({ color, size }: TabIconProps) => <ClipboardListIcon size={size} color={color} />;
const tasksIcon = ({ color, size }: TabIconProps) => <ClockIcon size={size} color={color} />;
const teamIcon = ({ color, size }: TabIconProps) => <ChartIcon size={size} color={color} />;
const moreIcon = ({ color, size }: TabIconProps) => <MoreHorizontalIcon size={size} color={color} />;

/** The centre slot never shows a screen - tapping it opens the New Lead form instead. */
function NewLeadPlaceholder() {
  return null;
}

/** Same raised circular "+" as the CRM's New Lead button (see CrmNavigator for why it is a custom tabBarButton). */
function RaisedNewLeadButton({ onPress, onLongPress, accessibilityState, testID }: BottomTabBarButtonProps) {
  const theme = useCrmTheme();
  return (
    <View style={styles.raisedSlot}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel="New Lead"
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
      <Text style={[styles.raisedLabel, { color: theme.textSecondary }]}>New Lead</Text>
    </View>
  );
}

function LeadTabs() {
  const theme = useCrmTheme();
  const insets = useSafeAreaInsets();
  const { persona } = useMe();

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
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
  };

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="Home" component={LeadHomeScreen} options={{ tabBarIcon: homeIcon }} />
      <Tab.Screen name="Leads" component={LeadListScreen} options={{ tabBarIcon: leadsIcon }} />
      <Tab.Screen
        name="NewLeadTab"
        component={NewLeadPlaceholder}
        options={{ title: 'New Lead', tabBarLabel: () => null, tabBarButton: RaisedNewLeadButton }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.getParent<NativeStackNavigationProp<LeadRootStackParamList>>()?.navigate('LeadNew');
          },
        })}
      />
      {/* The fourth slot is the one thing that differs by role: a telecaller's
          day is their follow-up calls, a manager's is their team's numbers. */}
      {persona === 'sales_manager' ? (
        <Tab.Screen name="Team" component={TeamScreen} options={{ tabBarIcon: teamIcon }} />
      ) : (
        <Tab.Screen name="Tasks" component={LeadTasksScreen} options={{ title: 'Today', tabBarIcon: tasksIcon }} />
      )}
      <Tab.Screen name="More" component={CrmMoreScreen} options={{ tabBarIcon: moreIcon }} />
    </Tab.Navigator>
  );
}

/**
 * Lead Management for the telecaller and sales manager roles: a five-item tab
 * bar plus the lead screens pushed over it. Self-contained like CrmNavigator
 * and TaskNavigator - RoleTabs mounts it in place of the field-service tabs.
 * Sales executives reach the same pushed screens from inside the CRM app.
 */
export function LeadsNavigator() {
  const theme = useCrmTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
      <Stack.Screen name="LeadTabs" component={LeadTabs} />
      {LEAD_STACK_SCREENS.map((s) => (
        <Stack.Screen key={s.name} name={s.name} component={s.component} options={s.modal ? { animation: 'slide_from_bottom' } : undefined} />
      ))}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  raisedSlot: { flex: 1, alignItems: 'center' },
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
