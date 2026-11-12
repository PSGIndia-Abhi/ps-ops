import React, { useCallback, useEffect, useState } from 'react';
import { useUnseen } from '../feedback/unseen';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartIcon, HomeIcon, PhoneIcon, SendIcon } from '../components/icons';
import { useCrmTheme } from '../crm/theme';
import { ClipboardListIcon } from '../crm/ui/crmIcons';
import { getDeskBadges } from '../feedback/api';
import { FeedbackProvider, useFeedback } from '../feedback/FeedbackContext';
import type { FeedbackStackParamList, FeedbackTabParamList } from '../feedback/navigation';
import { FeedbackCallScreen } from '../feedback/screens/FeedbackCallScreen';
import { FeedbackCallsScreen } from '../feedback/screens/FeedbackCallsScreen';
import { FeedbackHomeScreen } from '../feedback/screens/FeedbackHomeScreen';
import { FeedbackInsightsScreen } from '../feedback/screens/FeedbackInsightsScreen';
import { FeedbackProfileScreen } from '../feedback/screens/FeedbackProfileScreen';
import { FeedbackRequestsScreen } from '../feedback/screens/FeedbackRequestsScreen';
import { FeedbackTicketScreen } from '../feedback/screens/FeedbackTicketScreen';
import { FeedbackTicketsScreen } from '../feedback/screens/FeedbackTicketsScreen';

const Tab = createBottomTabNavigator<FeedbackTabParamList>();
const Stack = createNativeStackNavigator<FeedbackStackParamList>();

const BASE_HEIGHT = 66;
const BASE_PADDING_BOTTOM = 6;

type TabIconProps = { color: string; size: number };
const homeIcon = ({ color, size }: TabIconProps) => <HomeIcon size={size} color={color} />;
const callsIcon = ({ color, size }: TabIconProps) => <PhoneIcon size={size} color={color} />;
const ticketsIcon = ({ color, size }: TabIconProps) => <ClipboardListIcon size={size} color={color} />;
const insightsIcon = ({ color, size }: TabIconProps) => <ChartIcon size={size} color={color} />;
const requestsIcon = ({ color, size }: TabIconProps) => <SendIcon size={size} color={color} />;

/** Tab label with a small dot under the active one (as in RemindersNavigator). */
function TabLabel({ focused, color, children }: { focused: boolean; color: string; children: string }) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color }]}>{children}</Text>
      <View style={[styles.activeDot, focused && { backgroundColor: color }]} />
    </View>
  );
}
const tabLabel = (props: { focused: boolean; color: string; children: string }) => <TabLabel {...props} />;

function FeedbackTabs() {
  const theme = useCrmTheme();
  const insets = useSafeAreaInsets();
  // An Operations / Accounts team member works their department's tickets only.
  const { deptOnly } = useFeedback();
  // The numbers on Requests (wrong-number requests waiting) and Tickets (open tickets), every minute and
  // on each tab change. Each clears once its tab is opened; only new ones show after (as on the web).
  const { userId } = useFeedback();
  const [counts, setCounts] = useState<{ open_requests: number; open_tickets: number } | null>(null);
  const loadWaiting = useCallback(() => {
    getDeskBadges()
      .then(setCounts)
      .catch(() => {});
  }, []);
  const scope = userId ? String(userId) : '';
  const requestsSeen = useUnseen(scope, 'desk.requests', counts ? counts.open_requests : null);
  const ticketsSeen = useUnseen(scope, 'desk.tickets', counts ? counts.open_tickets : null);
  useEffect(() => {
    if (deptOnly) return undefined;
    loadWaiting();
    const timer = setInterval(loadWaiting, 60000);
    return () => clearInterval(timer);
  }, [deptOnly, loadWaiting]);

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
    <Tab.Navigator key={deptOnly ? 'dept' : 'all'} screenOptions={screenOptions} screenListeners={{ state: loadWaiting }}>
      {!deptOnly && <Tab.Screen name="Home" component={FeedbackHomeScreen} options={{ tabBarIcon: homeIcon }} />}
      {!deptOnly && <Tab.Screen name="Calls" component={FeedbackCallsScreen} options={{ tabBarIcon: callsIcon }} />}
      <Tab.Screen name="Tickets" component={FeedbackTicketsScreen} options={{ tabBarIcon: ticketsIcon, tabBarBadge: ticketsSeen.unseen || undefined }} listeners={{ focus: ticketsSeen.markSeen }} />
      {!deptOnly && <Tab.Screen name="Requests" component={FeedbackRequestsScreen} options={{ tabBarIcon: requestsIcon, tabBarBadge: requestsSeen.unseen || undefined }} listeners={{ focus: requestsSeen.markSeen }} />}
      {!deptOnly && <Tab.Screen name="Insights" component={FeedbackInsightsScreen} options={{ tabBarIcon: insightsIcon }} />}
    </Tab.Navigator>
  );
}

/**
 * Customer Feedback: the mobile part of the web's Feedback Desk for whoever collects feedback
 * (FEEDBACK_* permissions - see RoleTabs). Self-contained like RemindersNavigator; RoleTabs mounts it.
 */
export function FeedbackNavigator() {
  const theme = useCrmTheme();
  return (
    <FeedbackProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="FeedbackTabs" component={FeedbackTabs} />
        <Stack.Screen name="FeedbackCall" component={FeedbackCallScreen} />
        <Stack.Screen name="FeedbackTicket" component={FeedbackTicketScreen} />
        <Stack.Screen name="Profile" component={FeedbackProfileScreen} />
      </Stack.Navigator>
    </FeedbackProvider>
  );
}

const styles = StyleSheet.create({
  labelWrap: { alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '600' },
  activeDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
});
