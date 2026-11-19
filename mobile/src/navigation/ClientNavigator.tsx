import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AlertTriangleIcon } from '../components/icons';
import { ComplaintGlyph, HomeGlyph, JobsGlyph, MoreGlyph } from '../client/ui/ClientIcons';
import { FloatingTabBar } from '../client/ui/FloatingTabBar';
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
import { ClientSearchScreen } from '../client/screens/ClientSearchScreen';
import { useClientPush } from '../client/push';
import { ClientHomeSkeletonScreen } from '../client/ui/skeletons';
import { spacing, typography } from '../theme';

/** Route wrapper: the Documents page with every kind. */
const ClientDocumentsScreenRoute = () => <ClientDocumentsScreen />;

const Tab = createBottomTabNavigator<ClientTabParamList>();
const Stack = createNativeStackNavigator<ClientStackParamList>();

const TAB_ICONS = { Dashboard: HomeGlyph, Jobs: JobsGlyph, Complaints: ComplaintGlyph, More: MoreGlyph };
const renderTabBar = (props: BottomTabBarProps) => <FloatingTabBar {...props} icons={TAB_ICONS} />;

function ClientTabs() {
  const theme = useCrmTheme();
  // Push notifications: register this phone, show pushes, open the screen a tapped one is about.
  useClientPush();
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}>
      <Tab.Screen name="Dashboard" component={ClientDashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Jobs" component={ClientJobsScreen} />
      <Tab.Screen name="Complaints" component={ClientComplaintsScreen} />
      <Tab.Screen name="More" component={ClientMoreScreen} />
    </Tab.Navigator>
  );
}

/** While GET /me runs: a skeleton of Home. On failure (e.g. no active outlet linked): why, with Try again / Log out. */
function ClientGate({ children }: { children: React.ReactNode }) {
  const theme = useCrmTheme();
  const { portal, loading, error, reload } = useClientPortal();
  const { logout } = useAuth();
  if (portal) return <>{children}</>;
  // Opening an account shows the shape of Home, never a loading screen.
  if (loading) return <ClientHomeSkeletonScreen />;
  return (
    <View style={[styles.gate, { backgroundColor: theme.background }]}>
      <LeadWash />
      <GlossyBadge color="#B8202B" size={64} icon={<AlertTriangleIcon size={28} color="#fff" />} />
      <Text style={[styles.gateTitle, { color: theme.textPrimary }]}>Can't open your account</Text>
      <Text style={[styles.gateSub, { color: theme.textMuted }]}>{error || 'Please try again.'}</Text>
      <View style={styles.gateActions}>
        <PrimaryButton label="Try again" onPress={reload} />
        <PrimaryButton label="Log out" variant="secondary" onPress={() => logout()} />
      </View>
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
          <Stack.Screen name="ClientSearch" component={ClientSearchScreen} options={{ animation: 'fade' }} />
        </Stack.Navigator>
      </ClientGate>
    </ClientPortalProvider>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  gateTitle: { ...typography.subtitle, marginTop: spacing.sm, textAlign: 'center' },
  gateSub: { ...typography.body, textAlign: 'center' },
  gateActions: { gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.md },
});
