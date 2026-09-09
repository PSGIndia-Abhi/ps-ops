import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
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

function raisedMyJobsGlyph() {
  return <BriefcaseIcon size={24} color={colors.textOnPrimary} />;
}

/**
 * "My Jobs" as a raised circular button floating above the bar (instead of
 * a plain flex icon like every other tab) - it's the technician's single
 * most-used destination, so it gets the visual weight of a FAB rather than
 * competing for attention with Home/Schedule/Performance/More.
 *
 * A custom `tabBarButton` (not just `tabBarIcon` wrapped in a styled View,
 * which this used to be) - a real-device report showed a stray white edge
 * above the row specifically on 3-button Android navigation, not gesture
 * navigation, which pointed at the circle's old `position:'absolute', top:
 * -26` being anchored inside React Navigation's own internally-centered
 * icon slot - a box this code doesn't control and can't verify stays
 * identical across navigation modes/OS versions. Rendering the whole button
 * here instead means the circle is anchored (`bottom`, not `top`) to a box
 * this component owns outright and every sibling tab shares the exact same
 * height of, which is a boundary that can't drift the way a library-managed
 * inner wrapper's top edge might. Module-scope (not inline in screenOptions
 * below) so it isn't recreated identity every render - see JobDetailScreen's
 * renderPlayIcon for the same pattern.
 *
 * Glyph is a briefcase - job-related, not a generic "+" (tried once, but
 * read too much like "create new" for a button that just opens My Jobs).
 */
function RaisedMyJobsButton({ onPress, onLongPress, accessibilityState, testID }: BottomTabBarButtonProps) {
  return (
    <View style={styles.raisedSlot}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityState={accessibilityState}
        accessibilityRole="button"
        testID={testID}
        style={styles.raisedWrap}
      >
        {raisedMyJobsGlyph()}
      </Pressable>
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
          tabBarButton: RaisedMyJobsButton,
        }}
        listeners={({ navigation }) => ({
          // This route is also reached with other filters (Home's stat
          // cards, its "Completed" Quick Access tile, More's "Completed
          // Jobs") via `navigation.navigate('MyJobs', { filter: ... })` -
          // and since bottom-tab screens stay mounted rather than
          // remounting, that filter param otherwise persists in nav state
          // even after leaving and coming back. A real reported bug: open
          // Completed from Home, then tap this raised button expecting
          // Today's Jobs - it kept showing Completed instead. Tapping the
          // tab bar button itself should always mean "today", regardless of
          // whatever filter this route was last opened with.
          tabPress: () => navigation.setParams({ filter: 'today' }),
        })}
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
  // The normal-flow flex slot this tab occupies in the bar's row - same
  // sizing every sibling tab gets (no custom width/height forced on it), so
  // its own box is exactly as tall as the row itself, a boundary shared
  // identically by every tab regardless of device/navigation mode.
  raisedSlot: {
    flex: 1,
    alignItems: 'center',
  },
  // Anchored to `raisedSlot`'s own BOTTOM edge (not its top) and pushed up
  // from there - unlike a top-anchored offset, which measured from wherever
  // React Navigation's own internal icon-slot wrapper happened to place its
  // top edge, every sibling tab's slot bottom lines up on the same row-wide
  // boundary, so this can't drift relative to the bar depending on
  // navigation mode/inset math the way the old approach could.
  raisedWrap: {
    position: 'absolute',
    bottom: 8,
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
