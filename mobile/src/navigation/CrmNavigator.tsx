import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useReminders } from '../reminders-engine/useReminders';
import { useMe } from '../leads/ui';
import { useAppSwitch } from './AppSwitchContext';
import { HomeIcon, MoreHorizontalIcon, PlusIcon } from '../components/icons';
import { LeadsProvider } from '../crm/LeadsContext';
import type { CrmStackParamList, CrmTabParamList } from '../crm/navigation';
import { CrmHomeScreen } from '../crm/screens/CrmHomeScreen';
import { CrmLeadDetailScreen } from '../crm/screens/CrmLeadDetailScreen';
import { CrmLeadSavedScreen } from '../crm/screens/CrmLeadSavedScreen';
import { CrmLeadsScreen } from '../crm/screens/CrmLeadsScreen';
import { CrmMoreScreen } from '../crm/screens/CrmMoreScreen';
import { CrmNewCommercialLeadScreen } from '../crm/screens/CrmNewCommercialLeadScreen';
import { CrmNewLeadScreen } from '../crm/screens/CrmNewLeadScreen';
import { CrmPaymentsScreen } from '../crm/screens/CrmPaymentsScreen';
import { useCrmTheme } from '../crm/theme';
import { LEAD_STACK_SCREENS } from '../leads/screens';
import { ClipboardListIcon, WalletIcon } from '../crm/ui/crmIcons';
import { radii, shadows } from '../theme';
import { salesTabIcon } from './salesTabIcon';

const Tab = createBottomTabNavigator<CrmTabParamList>();
const Stack = createNativeStackNavigator<CrmStackParamList>();

const BASE_HEIGHT = 60;
const BASE_PADDING_BOTTOM = 6;

const homeIcon = salesTabIcon(HomeIcon);
const leadsIcon = salesTabIcon(ClipboardListIcon, 'accent');
const paymentsIcon = salesTabIcon(WalletIcon, 'success');
const moreIcon = salesTabIcon(MoreHorizontalIcon, 'info');

/** The centre slot never shows a screen - tapping it opens the New Lead form instead. */
function NewLeadPlaceholder() {
  return null;
}

/**
 * The primary action: a raised circular "+" that sits above the bar with its
 * "New Lead" label underneath, so it reads as the one thing to reach for.
 * Built as a full custom tabBarButton (anchored to the slot's own bottom
 * edge) for the same reason the Technician bar's raised button is - its
 * position can't drift with the OS navigation mode.
 */
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

function CrmTabs() {
  const theme = useCrmTheme();
  const insets = useSafeAreaInsets();
  const { current } = useAppSwitch();
  return current === 'residential' ? <ResidentialReminders><CrmTabBar theme={theme} bottom={insets.bottom} /></ResidentialReminders> : <CrmTabBar theme={theme} bottom={insets.bottom} />;
}

/** Keeps the reminders armed while the Residential app is open; a tapped one opens its lead. */
function ResidentialReminders({ children }: { children: React.ReactNode }) {
  const { myId } = useMe();
  const navigation = useNavigation<NativeStackNavigationProp<CrmStackParamList>>();
  useReminders(myId, 'lead', (route) => {
    const leadId = route.params?.leadId;
    if (route.screen === 'LeadDetail' && typeof leadId === 'string') navigation.navigate('CrmLeadDetail', { leadId });
    if (route.screen === 'LeadReminders') navigation.navigate('LeadReminders');
  });
  return <>{children}</>;
}

function CrmTabBar({ theme, bottom }: { theme: ReturnType<typeof useCrmTheme>; bottom: number }) {
  const insets = { bottom };

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
      <Tab.Screen name="Home" component={CrmHomeScreen} options={{ tabBarIcon: homeIcon }} />
      <Tab.Screen name="Leads" component={CrmLeadsScreen} options={{ tabBarIcon: leadsIcon }} />
      <Tab.Screen
        name="NewLead"
        component={NewLeadPlaceholder}
        options={{ title: 'New Lead', tabBarLabel: () => null, tabBarButton: RaisedNewLeadButton }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.getParent<NativeStackNavigationProp<CrmStackParamList>>()?.navigate('CrmNewLead');
          },
        })}
      />
      <Tab.Screen name="Payments" component={CrmPaymentsScreen} options={{ tabBarIcon: paymentsIcon }} />
      <Tab.Screen name="More" component={CrmMoreScreen} options={{ tabBarIcon: moreIcon }} />
    </Tab.Navigator>
  );
}

/**
 * The whole CRM app for the Sales and Marketing roles: the five-item tab bar
 * plus the New Lead form and Lead Details pushed over it. Self-contained -
 * the existing signed-in stack (AuthenticatedNavigator) is not modified; it
 * just mounts this in place of the field-service tabs for these two roles.
 */
export function CrmNavigator() {
  const theme = useCrmTheme();
  return (
    <LeadsProvider>
      <Stack.Navigator
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}
      >
        <Stack.Screen name="CrmTabs" component={CrmTabs} />
        <Stack.Screen name="CrmNewLead" component={CrmNewLeadScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="CrmNewCommercialLead" component={CrmNewCommercialLeadScreen} options={{ animation: 'none' }} />
        <Stack.Screen name="CrmLeadDetail" component={CrmLeadDetailScreen} />
        <Stack.Screen name="CrmLeadSaved" component={CrmLeadSavedScreen} options={{ gestureEnabled: false }} />
        {LEAD_STACK_SCREENS.map((s) => (
          <Stack.Screen key={s.name} name={s.name} component={s.component} options={s.modal ? { animation: 'slide_from_bottom' } : undefined} />
        ))}
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
