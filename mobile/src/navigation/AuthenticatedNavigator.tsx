import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RoleTabs } from './RoleTabs';
import { JobDetailScreen } from '../screens/jobs/JobDetailScreen';
import { TeamOverviewScreen } from '../screens/admin/TeamOverviewScreen';
import { CompaniesListScreen } from '../screens/admin/CompaniesListScreen';
import { CompanyDetailScreen } from '../screens/admin/CompanyDetailScreen';
import { GroupsListScreen } from '../screens/admin/GroupsListScreen';
import { BookingDetailScreen } from '../screens/bookings/BookingDetailScreen';
import { CreateBookingScreen } from '../screens/bookings/CreateBookingScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ChangePasswordScreen } from '../screens/profile/ChangePasswordScreen';
import { HelpdeskHomeScreen } from '../helpdesk/screens/HelpdeskHomeScreen';
import { HelpdeskNewTicketScreen } from '../helpdesk/screens/HelpdeskNewTicketScreen';
import { HelpdeskTicketScreen } from '../helpdesk/screens/HelpdeskTicketScreen';
import { HelpdeskDeskScreen } from '../helpdesk/screens/HelpdeskDeskScreen';
import { HelpdeskPushBridge } from '../helpdesk/HelpdeskPushBridge';
import { colors } from '../theme';
import type { AuthenticatedStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthenticatedStackParamList>();

/** The role's apps, plus the listener that opens a Helpdesk ticket when its push is tapped. */
function TabsRoot() {
  return (
    <>
      <RoleTabs />
      <HelpdeskPushBridge />
    </>
  );
}

/**
 * The whole signed-in app is one stack: the role-appropriate tab navigator
 * (RoleTabs) plus the handful of screens any tab can push into. This is
 * what lets a technician's visit card, a supervisor's job list, and an
 * admin's job list all open the exact same JobDetail screen.
 */
export function AuthenticatedNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Tabs" component={TabsRoot} options={{ headerShown: false }} />
      {/* Own custom gradient header (back button + title, built into the hero) - see JobDetailScreen. */}
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="TeamOverview"
        component={TeamOverviewScreen}
        options={{ title: 'Supervisors & technicians' }}
      />
      <Stack.Screen name="Companies" component={CompaniesListScreen} options={{ title: 'Companies' }} />
      <Stack.Screen
        name="CompanyDetail"
        component={CompanyDetailScreen}
        options={({ route }) => ({ title: route.params.companyName })}
      />
      <Stack.Screen name="Groups" component={GroupsListScreen} options={{ title: 'Groups' }} />
      <Stack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ title: 'Booking details' }}
      />
      <Stack.Screen
        name="CreateBooking"
        component={CreateBookingScreen}
        options={{ title: 'New booking' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications' }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: 'Change password' }}
      />
      {/* Help & Support - own headers (helpdesk/screens). Opened from every app's Profile / More. */}
      <Stack.Screen name="Helpdesk" component={HelpdeskHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HelpdeskNew" component={HelpdeskNewTicketScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="HelpdeskTicket" component={HelpdeskTicketScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HelpdeskDesk" component={HelpdeskDeskScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
