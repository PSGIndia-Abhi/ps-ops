import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon } from '../components/icons';
import { GlossyBadge } from '../components/GlossyBadge';
import { useCrmTheme } from '../crm/theme';
import { PrimaryButton } from '../crm/ui/PrimaryButton';
import { BrandWash } from '../client/ui/wash';
import { useAuth } from '../auth/AuthContext';
import { ClientPortalProvider, useClientPortal } from '../client/ClientPortalContext';
import { ToastProvider } from '../client/ui/Toast';
import type { ClientStackParamList } from '../client/navigation';
import { ClientDashboardScreen } from '../client/screens/ClientDashboardScreen';
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
import { ClientNotificationsScreen } from '../client/screens/ClientNotificationsScreen';
import { ClientPhotosScreen } from '../client/screens/ClientPhotosScreen';
import { useClientPush } from '../client/push';
import { ClientHomeSkeletonScreen } from '../client/ui/skeletons';
import { ClientChangePasswordScreen } from '../client/screens/ClientChangePasswordScreen';
import { spacing, typography } from '../theme';

/** Route wrapper: the Documents page, optionally opened on one tab (e.g. invoices). */
function ClientDocumentsScreenRoute() {
  const { params } = useRoute<RouteProp<ClientStackParamList, 'ClientDocuments'>>();
  return <ClientDocumentsScreen initialKind={params?.kind} />;
}

const Stack = createNativeStackNavigator<ClientStackParamList>();

/**
 * Home is the app's one main screen (no bottom bar): its shortcuts open every other screen on top,
 * each with a back button. Push notifications are set up here, once, for the whole session.
 */
function ClientHome() {
  // Register this phone, show pushes, open the screen a tapped one is about.
  useClientPush();
  return <ClientDashboardScreen />;
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
      <BrandWash />
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
 * The BestServe Client app once signed in - the same sections as the web's /client portal
 * (frontend/src/clientPortal). Only "client" logins get here (AuthContext refuses others).
 * What a login sees (every outlet for a company admin, only its own for an
 * outlet login) is decided by the backend.
 */
export function ClientNavigator() {
  const theme = useCrmTheme();
  return (
    <ClientPortalProvider>
      <ToastProvider>
      <ClientGate>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
          <Stack.Screen name="ClientHome" component={ClientHome} />
          <Stack.Screen name="Jobs" component={ClientJobsScreen} />
          <Stack.Screen name="Complaints" component={ClientComplaintsScreen} />
          <Stack.Screen name="ClientProfile" component={ClientProfileScreen} />
          <Stack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} />
          <Stack.Screen name="ClientNewComplaint" component={ClientNewComplaintScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ClientComplaintDetail" component={ClientComplaintDetailScreen} />
          <Stack.Screen name="ClientRequestService" component={ClientRequestServiceScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ClientDocuments" component={ClientDocumentsScreenRoute} />
          <Stack.Screen name="ClientAudits" component={ClientAuditsScreen} />
          <Stack.Screen name="ClientPhotos" component={ClientPhotosScreen} />
          <Stack.Screen name="ClientOutlets" component={ClientOutletsScreen} />
          <Stack.Screen name="ClientOutletDetail" component={ClientOutletDetailScreen} />
          <Stack.Screen name="ClientSearch" component={ClientSearchScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="ChangePassword" component={ClientChangePasswordScreen} />
          <Stack.Screen name="ClientNotifications" component={ClientNotificationsScreen} />
        </Stack.Navigator>
      </ClientGate>
      </ToastProvider>
    </ClientPortalProvider>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  gateTitle: { ...typography.subtitle, marginTop: spacing.sm, textAlign: 'center' },
  gateSub: { ...typography.body, textAlign: 'center' },
  gateActions: { gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.md },
});
