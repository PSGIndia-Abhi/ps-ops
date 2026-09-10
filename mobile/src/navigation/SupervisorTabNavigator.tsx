import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SupervisorDashboardScreen } from '../screens/supervisor/SupervisorDashboardScreen';
import { JobsListScreen } from '../screens/jobs/JobsListScreen';
import { TeamScreen } from '../screens/supervisor/TeamScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { homeTabIcon, jobsTabIcon, moreTabIcon, teamTabIcon } from './tabIcons';
import { useSharedTabScreenOptions } from './tabBarOptions';
import type { SupervisorTabParamList } from './types';

const Tab = createBottomTabNavigator<SupervisorTabParamList>();

export function SupervisorTabNavigator() {
  const screenOptions = useSharedTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen
        name="Home"
        component={SupervisorDashboardScreen}
        options={{ tabBarIcon: homeTabIcon }}
      />
      <Tab.Screen name="Jobs" component={JobsListScreen} options={{ tabBarIcon: jobsTabIcon }} />
      <Tab.Screen name="Team" component={TeamScreen} options={{ tabBarIcon: teamTabIcon }} />
      {/* Same fix as TechnicianTabNavigator - "More" used to open MoreScreen,
          which for a non-technician role was just an empty state pointing
          back at the header avatar. Renders Profile directly now. */}
      <Tab.Screen name="More" component={ProfileScreen} options={{ tabBarIcon: moreTabIcon }} />
    </Tab.Navigator>
  );
}
