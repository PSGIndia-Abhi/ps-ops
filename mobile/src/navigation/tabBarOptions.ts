import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';

/**
 * One shared visual language for every role's bottom tab bar - only the set
 * of tabs differs per role (see the three *TabNavigator files), never the
 * styling, so switching roles never feels like a different app.
 */
export const sharedTabScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 58,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '600',
  },
};
