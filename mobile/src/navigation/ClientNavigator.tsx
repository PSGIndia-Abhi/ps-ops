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
import { AlertTriangleIcon, BriefcaseIcon, HomeIcon, MoreHorizontalIcon, PlusIcon, SparkleIcon } from '../components/icons';
import { GlossyBadge } from '../components/GlossyBadge';
import { useCrmTheme } from '../crm/theme';
import { PrimaryButton } from '../crm/ui/PrimaryButton';
import { LeadWash } from '../leads/ui';
import { useAuth } from '../auth/AuthContext';
import { ClientPortalProvider, useClientPortal } from '../client/ClientPortalContext';
import type { ClientStackParamList, ClientTabParamList } from '../client/navigation';
import { ClientDashboardScreen } from '../client/screens/ClientDashboardScreen';
import { ClientMoreScreen } from '../client/screens/ClientMoreScreen';
import { ClientProfileScreen } from '../client/screens/ClientProfileScreen';
import { ClientJobsScreen } from '../client/screens/ClientJobsScreen';
import { ClientJobDetailScreen } from '../client/screens/ClientJobDetailScreen';
import { ClientRequestServiceScreen } from '../client/screens/ClientRequestServiceScreen';
import { ClientOutletsScreen } from '../client/screens/ClientOutletsScreen';
import { ClientOutletDetailScreen } from '../client/screens/ClientOutletDetailScreen';
import { ClientAuditsScreen, ClientDocumentsScreen } from '../client/screens/ClientDocumentsScreen';
import { ClientComplaintsScreen } from '../client/screens/ClientComplaintsScreen';
import { ClientNewComplaintScreen } from '../client/screens/ClientNewComplaintScreen';
import { ClientComplaintDetailScreen } from '../client/screens/ClientComplaintDetailScreen';
import { useClientPush } from '../client/push';
import { radii, shadows, spacing, typography } from '../theme';

/** Route wrapper: the Documents page with every kind. */
const ClientDocumentsScreenRoute = () => <ClientDocumentsScreen />;

const Tab = createBottomTabNavigator<ClientTabParamList>();
const Stack = createNativeStackNavigator<ClientStackParamList>();

type TabIconProps = { color: string; size: number };
const homeIcon = ({ color, size }: TabIconProps) => <HomeIcon size={size} color={color} />;
const jobsIcon = ({ color, size }: TabIconProps) => <BriefcaseIcon size={size} color={color} />;
const complaintsIcon = ({ color, size }: TabIconProps) => <AlertTriangleIcon size={size} color={color} />;
const moreIcon = ({ color, size }: TabIconProps) => <MoreHorizontalIcon size={size} color={color} />;

/** Tab label with a small dot under the active one (as in the Lead / Task apps). */
function TabLabel({ focused, color, children }: { focused: boolean; color: string; children: string }) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color }]}>{children}</Text>
      <View style={[styles.activeDot, focused && { backgroundColor: color }]} />
    </View>
  );
}
const tabLabel = (props: { focused: boolean; color: string; children: string }) => <TabLabel {...props} />;

/** The centre slot never shows a screen - tapping it opens Request a Service. */
function RequestPlaceholder() {
  // A real (empty) view, not null: an empty tab scene crashes the native tab container on mount.
  return <View collapsable={false} />;
}

/** Raised round "+" (same as New Lead / New Task) for Request a Service. */
function RaisedRequestButton({ onPress, onLongPress, accessibilityState, testID }: BottomTabBarButtonProps) {
  const theme = useCrmTheme();
  return (
    <View style={styles.raisedSlot}>
      <View style={[styles.raisedHalo, { backgroundColor: theme.primary }]} pointerEvents="none" />
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel="Request a service"
        accessibilityState={accessibilityState}
        testID={testID}
        style={({ pressed }) => [styles.raisedCircle, { backgroundColor: theme.primary, borderColor: theme.surface }, pressed && styles.pressed]}
      >
        <PlusIcon size={26} color={theme.textOnPrimary} />
      </Pressable>
      <Text style={[styles.raisedLabel, { color: theme.textSecondary }]}>Request</Text>
    </View>
  );
}

function ClientTabs() {
  const theme = useCrmTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ClientStackParamList>>();
  // Push notifications: register this phone, show pushes, open the screen a tapped one is about.
  useClientPush();
  const screenOptions: BottomTabNavigationOptions = {
    headerShown: false,
    tabBarActiveTintColor: theme.primary,
    tabBarInactiveTintColor: theme.textMuted,
    sceneStyle: { backgroundColor: theme.background },
    tabBarStyle: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      height: 66 + insets.bottom,
      paddingBottom: 6 + insets.bottom,
      paddingTop: 6,
    },
    tabBarLabel: tabLabel,
  };
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="Dashboard" component={ClientDashboardScreen} options={{ title: 'Home', tabBarIcon: homeIcon }} />
      <Tab.Screen name="Jobs" component={ClientJobsScreen} options={{ tabBarIcon: jobsIcon }} />
      <Tab.Screen
        name="RequestTab"
        component={RequestPlaceholder}
        options={{ title: 'Request', tabBarLabel: () => null, tabBarButton: RaisedRequestButton }}
        listeners={() => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.navigate('ClientRequestService');
          },
        })}
      />
      <Tab.Screen name="Complaints" component={ClientComplaintsScreen} options={{ tabBarIcon: complaintsIcon }} />
      <Tab.Screen name="More" component={ClientMoreScreen} options={{ tabBarIcon: moreIcon }} />
    </Tab.Navigator>
  );
}

/** Loading / error gate while GET /me runs - e.g. no active outlet is linked to this login. */
function ClientGate({ children }: { children: React.ReactNode }) {
  const theme = useCrmTheme();
  const { portal, loading, error, reload } = useClientPortal();
  const { logout } = useAuth();
  if (portal) return <>{children}</>;
  return (
    <View style={[styles.gate, { backgroundColor: theme.background }]}>
      <LeadWash />
      <GlossyBadge color="#2563EB" size={64} icon={<SparkleIcon size={28} color="#fff" />} />
      <Text style={[styles.gateTitle, { color: theme.textPrimary }]}>{loading ? 'Opening your portal…' : "Can't open your portal"}</Text>
      {!loading && (
        <>
          <Text style={[styles.gateSub, { color: theme.textMuted }]}>{error || 'Please try again.'}</Text>
          <View style={styles.gateActions}>
            <PrimaryButton label="Try again" onPress={reload} />
            <PrimaryButton label="Log out" variant="secondary" onPress={() => logout()} />
          </View>
        </>
      )}
    </View>
  );
}

/**
 * The Client Portal on mobile - the same sections as the web's /client portal
 * (frontend/src/clientPortal). RoleTabs mounts it for the "client" role.
 * What a login sees (every outlet for a company admin, only its own for an
 * outlet login) is decided by the backend.
 */
export function ClientNavigator() {
  const theme = useCrmTheme();
  return (
    <ClientPortalProvider>
      <ClientGate>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
          <Stack.Screen name="ClientTabs" component={ClientTabs} />
          <Stack.Screen name="ClientProfile" component={ClientProfileScreen} />
          <Stack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} />
          <Stack.Screen name="ClientNewComplaint" component={ClientNewComplaintScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ClientComplaintDetail" component={ClientComplaintDetailScreen} />
          <Stack.Screen name="ClientRequestService" component={ClientRequestServiceScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ClientDocuments" component={ClientDocumentsScreenRoute} />
          <Stack.Screen name="ClientAudits" component={ClientAuditsScreen} />
          <Stack.Screen name="ClientOutlets" component={ClientOutletsScreen} />
          <Stack.Screen name="ClientOutletDetail" component={ClientOutletDetailScreen} />
        </Stack.Navigator>
      </ClientGate>
    </ClientPortalProvider>
  );
}

const styles = StyleSheet.create({
  labelWrap: { alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '600' },
  activeDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  pressed: { opacity: 0.9 },
  raisedSlot: { flex: 1, alignItems: 'center' },
  raisedHalo: { position: 'absolute', bottom: 14, width: 74, height: 74, borderRadius: 37, opacity: 0.14 },
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
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  gateTitle: { ...typography.subtitle, marginTop: spacing.sm, textAlign: 'center' },
  gateSub: { ...typography.body, textAlign: 'center' },
  gateActions: { gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.md },
});
