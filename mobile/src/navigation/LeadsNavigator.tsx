import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useReminders } from '../reminders-engine/useReminders';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClockIcon, HomeIcon, MoreHorizontalIcon, PlusIcon } from '../components/icons';
import { LeadsProvider } from '../crm/LeadsContext';
import { CrmLeadDetailScreen } from '../crm/screens/CrmLeadDetailScreen';
import { CrmMoreScreen } from '../crm/screens/CrmMoreScreen';
import { CrmNewLeadScreen } from '../crm/screens/CrmNewLeadScreen';
import { CrmNewCommercialLeadScreen } from '../crm/screens/CrmNewCommercialLeadScreen';
import { useCrmTheme } from '../crm/theme';
import { ClipboardListIcon } from '../crm/ui/crmIcons';
import type { LeadRootStackParamList, LeadTabParamList } from '../leads/navigation';
import { LEAD_STACK_SCREENS } from '../leads/screens';
import { LeadListScreen } from '../leads/screens/LeadBrowseScreens';
import { LeadHomeScreen } from '../leads/screens/LeadHomeScreen';
import { LeadFollowUpsScreen } from '../leads/screens/LeadFollowUpsScreen';
import { useMe } from '../leads/ui';
import { radii, shadows } from '../theme';
import { salesTabIcon } from './salesTabIcon';

const Tab = createBottomTabNavigator<LeadTabParamList>();
const Stack = createNativeStackNavigator<LeadRootStackParamList>();

const BASE_HEIGHT = 60;
const BASE_PADDING_BOTTOM = 6;

const homeIcon = salesTabIcon(HomeIcon);
const leadsIcon = salesTabIcon(ClipboardListIcon, 'accent');
const tasksIcon = salesTabIcon(ClockIcon, 'warning');
const moreIcon = salesTabIcon(MoreHorizontalIcon, 'info');

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
  const { persona, myId } = useMe();
  // LeadTabs stays mounted under every pushed lead screen, so it keeps the reminders armed and is
  // where a tapped reminder opens its lead from.
  const stackNavigation = useNavigation<NativeStackNavigationProp<LeadRootStackParamList>>();
  useReminders(myId, 'lead', (route) => {
    const leadId = route.params?.leadId;
    if (route.screen === 'LeadDetail' && typeof leadId === 'string') stackNavigation.navigate('LeadDetail', { leadId });
    if (route.screen === 'LeadReminders') stackNavigation.navigate('LeadReminders');
  });

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
      {/* Telecallers verify leads; they do not add them (the server refuses it too). */}
      {persona !== 'telecaller' && (
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
      )}
      {/* Follow-ups live here, not in Task Management: their own (and their reminders), or for the
          sales manager the whole team's. */}
      <Tab.Screen name="Tasks" component={LeadFollowUpsScreen} options={{ title: 'Follow-ups', tabBarIcon: tasksIcon }} />
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
  // LeadsProvider: the New Lead form is the CRM's commercial form, which saves through the CRM's
  // lead store (offline outbox, photo uploads).
  return (
    <LeadsProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="LeadTabs" component={LeadTabs} />
        {LEAD_STACK_SCREENS.map((s) => (
          <Stack.Screen key={s.name} name={s.name} component={s.component} options={s.modal ? { animation: 'slide_from_bottom' } : undefined} />
        ))}
        {/* Residential leads (sales executive / manager): the CRM's own details and edit screens. */}
        <Stack.Screen name="CrmLeadDetail" component={CrmLeadDetailScreen} />
        <Stack.Screen name="CrmNewLead" component={CrmNewLeadScreen as React.ComponentType} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="CrmNewCommercialLead" component={CrmNewCommercialLeadScreen as React.ComponentType} options={{ animation: 'slide_from_bottom' }} />
      </Stack.Navigator>
    </LeadsProvider>
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
