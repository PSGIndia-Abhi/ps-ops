import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { JobsListScreen } from '../screens/jobs/JobsListScreen';
import { BookingsListScreen } from '../screens/bookings/BookingsListScreen';
import { MoreScreen } from '../screens/profile/MoreScreen';
import { bookingsTabIcon, homeTabIcon, jobsTabIcon, moreTabIcon } from './tabIcons';
import { useSharedTabScreenOptions } from './tabBarOptions';
import type { AdminTabParamList } from './types';

const Tab = createBottomTabNavigator<AdminTabParamList>();

export function AdminTabNavigator() {
  const screenOptions = useSharedTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="Home" component={AdminDashboardScreen} options={{ tabBarIcon: homeTabIcon }} />
      <Tab.Screen name="Jobs" component={JobsListScreen} options={{ tabBarIcon: jobsTabIcon }} />
      <Tab.Screen
        name="Bookings"
        component={BookingsListScreen}
        options={{ tabBarIcon: bookingsTabIcon }}
      />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: moreTabIcon }} />
    </Tab.Navigator>
  );
}
