import React from 'react';
import { View } from 'react-native';
import { GlossyBadge } from '../components/GlossyBadge';
import { useCrmStyles, type CrmTheme } from '../crm/theme';

/**
 * Bottom-tab icons for the sales apps (LeadsNavigator, CrmNavigator) and Task Management (TaskNavigator). Every tab has its own colour:
 * the selected tab's icon sits on a glossy badge of that colour (white icon, like the app's tiles),
 * the others show the icon in their colour, a little softer. The technician / admin / supervisor
 * tab bars (tabIcons.tsx) are separate and unchanged.
 */

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;
type TabIconProps = { focused: boolean; color: string; size: number };
export type TabTone = 'primary' | 'accent' | 'warning' | 'success' | 'info';

const BADGE = 32;

const factory = (_t: CrmTheme) => ({
  slot: { width: BADGE, height: BADGE, alignItems: 'center' as const, justifyContent: 'center' as const },
  idle: { opacity: 0.75 },
});

function toneColor(t: CrmTheme, tone: TabTone): string {
  switch (tone) {
    case 'accent':
      return t.accent;
    case 'warning':
      return t.warning;
    case 'success':
      return t.success;
    case 'info':
      return t.textSecondary;
    default:
      return t.primary;
  }
}

function SalesTabIcon({ Icon, tone, focused }: { Icon: IconComponent; tone: TabTone; focused: boolean }) {
  const { styles, theme } = useCrmStyles(factory);
  const color = toneColor(theme, tone);
  return (
    <View style={[styles.slot, !focused && styles.idle]}>
      {focused ? (
        <GlossyBadge color={color} size={BADGE} icon={<Icon size={18} color="#FFFFFF" />} />
      ) : (
        <Icon size={22} color={color} />
      )}
    </View>
  );
}

/** A `tabBarIcon` for this icon and colour - made once at module scope, so navigators do not recreate it each render. */
export function salesTabIcon(Icon: IconComponent, tone: TabTone = 'primary') {
  return function TabIcon({ focused }: TabIconProps) {
    return <SalesTabIcon Icon={Icon} tone={tone} focused={focused} />;
  };
}
