import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TechnicianDashboardScreen } from '../screens/technician/TechnicianDashboardScreen';
import { MyJobsScreen } from '../screens/technician/MyJobsScreen';
import { MoreScreen } from '../screens/profile/MoreScreen';
import { homeTabIcon, jobsTabIcon, moreTabIcon } from './tabIcons';
import { sharedTabScreenOptions } from './tabBarOptions';
import type { TechnicianTabParamList } from './types';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();

/**
 * Deliberately the smallest tab set of the three roles - a technician's
 * whole job is "what do I work on now", which Home already answers; My Jobs
 * is just the fuller list.
 */
export function TechnicianTabNavigator() {
  return (
    <Tab.Navigator screenOptions={sharedTabScreenOptions}>
      <Tab.Screen
        name="Home"
        component={TechnicianDashboardScreen}
        options={{ tabBarIcon: homeTabIcon }}
      />
      <Tab.Screen
        name="MyJobs"
        component={MyJobsScreen}
        options={{ title: 'My Jobs', tabBarLabel: 'My Jobs', tabBarIcon: jobsTabIcon }}
      />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: moreTabIcon }} />
    </Tab.Navigator>
  );
}
