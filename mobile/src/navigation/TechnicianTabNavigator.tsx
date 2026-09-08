import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TechnicianDashboardScreen } from '../screens/technician/TechnicianDashboardScreen';
import { MyJobsScreen } from '../screens/technician/MyJobsScreen';
import { MyPerformanceScreen } from '../screens/technician/MyPerformanceScreen';
import { MoreScreen } from '../screens/profile/MoreScreen';
import { BriefcaseIcon } from '../components/icons';
import { homeTabIcon, moreTabIcon, performanceTabIcon, scheduleTabIcon } from './tabIcons';
import { useSharedTabScreenOptions } from './tabBarOptions';
import { colors, radii, shadows } from '../theme';
import type { TechnicianTabParamList } from './types';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();

/**
 * "My Jobs" as a raised circular button floating above the bar (instead of
 * a plain flex icon like every other tab) - it's the technician's single
 * most-used destination, so it gets the visual weight of a FAB rather than
 * competing for attention with Home/Schedule/Performance/More. Module-scope
 * (not inline in screenOptions below) so it isn't recreated identity every
 * render - see JobDetailScreen's renderPlayIcon for the same pattern.
 */
function raisedMyJobsIcon() {
  return (
    <View style={styles.raisedWrap}>
      <BriefcaseIcon size={26} color={colors.textOnPrimary} />
    </View>
  );
}

/**
 * Five destinations, not the three-tab set every other role gets - a
 * technician checks Schedule and Performance often enough that they earned
 * their own tap rather than living one level deeper in Quick Access/More
 * (which both still also link here - shortcuts to the same real
 * screens, not a different way of reaching them). "My Jobs" in the
 * raised middle slot is still exactly the same screen/behavior as before,
 * just given the most prominent position since it's what a technician
 * reaches for the most.
 */
export function TechnicianTabNavigator() {
  const screenOptions = useSharedTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen
        name="Home"
        component={TechnicianDashboardScreen}
        options={{ tabBarIcon: homeTabIcon }}
      />
      <Tab.Screen
        name="Schedule"
        component={MyJobsScreen}
        initialParams={{ filter: 'tomorrow' }}
        options={{ tabBarIcon: scheduleTabIcon }}
      />
      <Tab.Screen
        name="MyJobs"
        component={MyJobsScreen}
        initialParams={{ filter: 'today' }}
        options={{
          title: 'My Jobs',
          tabBarLabel: () => null,
          tabBarIcon: raisedMyJobsIcon,
        }}
      />
      <Tab.Screen
        name="Performance"
        component={MyPerformanceScreen}
        options={{ tabBarIcon: performanceTabIcon }}
      />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: moreTabIcon }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  // Positioned to overflow above the tab bar's own top edge (a negative
  // top offset larger than the icon slot React Navigation gives tabBarIcon)
  // rather than living inside the bar's normal flex row - the classic
  // "raised FAB" tab treatment from the reference, not a plain inline icon.
  raisedWrap: {
    position: 'absolute',
    top: -26,
    width: 60,
    height: 60,
    borderRadius: radii.pill,
    backgroundColor: colors.crestRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadows.raised,
  },
});
