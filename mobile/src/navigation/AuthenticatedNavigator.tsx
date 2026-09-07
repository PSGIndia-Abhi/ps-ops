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
import { MyPerformanceScreen } from '../screens/technician/MyPerformanceScreen';
import { colors } from '../theme';
import type { AuthenticatedStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthenticatedStackParamList>();

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
      <Stack.Screen name="Tabs" component={RoleTabs} options={{ headerShown: false }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job details' }} />
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
      <Stack.Screen
        name="MyPerformance"
        component={MyPerformanceScreen}
        options={{ title: 'My Performance' }}
      />
    </Stack.Navigator>
  );
}
