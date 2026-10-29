import React from 'react';
import { View } from 'react-native';
import { radii } from '../theme';
import { useCrmStyles, type CrmTheme } from '../crm/theme';

/**
 * Bottom-tab icons for the sales apps (LeadsNavigator, CrmNavigator): the selected tab's icon sits
 * in a soft pill of the app colour, the others are plain and muted. The technician / admin /
 * supervisor tab bars (tabIcons.tsx) are separate and unchanged.
 */

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;
type TabIconProps = { focused: boolean; color: string; size: number };

const factory = (t: CrmTheme) => ({
  pill: {
    width: 52,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pillOn: { backgroundColor: t.primarySoftBg },
});

function SalesTabIcon({ Icon, focused, color }: { Icon: IconComponent; focused: boolean; color: string }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={[styles.pill, focused && styles.pillOn]}>
      <Icon size={focused ? 22 : 21} color={focused ? theme.primary : color} />
    </View>
  );
}

/** A `tabBarIcon` for this icon - made once at module scope, so navigators do not recreate it each render. */
export function salesTabIcon(Icon: IconComponent) {
  return function TabIcon({ focused, color }: TabIconProps) {
    return <SalesTabIcon Icon={Icon} focused={focused} color={color} />;
  };
}
