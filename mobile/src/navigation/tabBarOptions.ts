import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';

const BASE_HEIGHT = 58;
const BASE_PADDING_BOTTOM = 6;

/**
 * One shared visual language for every role's bottom tab bar - only the set
 * of tabs differs per role (see the three *TabNavigator files), never the
 * styling, so switching roles never feels like a different app.
 *
 * A hook (not a static object) because the tab bar's height/bottom padding
 * must include the device's actual safe-area bottom inset. React
 * Navigation's own BottomTabBar normally does this automatically - but only
 * as long as `tabBarStyle` leaves `height`/`paddingBottom` unset; the
 * moment those are given fixed values (needed here for a consistent look
 * across devices), that automatic handling is silently skipped for them.
 * Without adding the inset back in ourselves, a phone using the classic
 * 3-button Android navigation bar (which reports a much larger bottom
 * inset than the gesture-nav pill most test devices use) would render the
 * tab bar's icons/labels flush against, or physically overlapped by, the
 * on-screen nav buttons.
 */
export function useSharedTabScreenOptions(): BottomTabNavigationOptions {
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      height: BASE_HEIGHT + insets.bottom,
      paddingBottom: BASE_PADDING_BOTTOM + insets.bottom,
      paddingTop: 6,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600',
    },
  };
}
