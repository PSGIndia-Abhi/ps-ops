import React from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCrmTheme } from '../../crm/theme';
import { shadows } from '../../theme';
import { ICON_DEEP, ICON_SOFT, TILE_BG } from './ClientIcons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type IconType = React.ComponentType<{ size?: number; color?: string; fill?: string }>;

const BAR_HEIGHT = 64;

/** Bottom gap under the capsule (above the phone's navigation bar). */
const bottomGap = (insetBottom: number) => Math.max(insetBottom, 8) + 6;

/**
 * Space a tab screen must leave at the end of its scroll content so the last item can scroll
 * clear of the floating bar (the bar overlays the page; nothing is drawn behind it).
 */
export function useFloatingBarSpace(): number {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + bottomGap(insets.bottom) + 24;
}

/**
 * The client app's bottom bar: a white capsule floating above the screen edge. The active tab
 * opens into a tinted pill with its label; the others show only their icon. `icons` maps each
 * route name to its icon.
 */
export function FloatingTabBar({ state, descriptors, navigation, icons }: BottomTabBarProps & { icons: Record<string, IconType> }) {
  const theme = useCrmTheme();
  const insets = useSafeAreaInsets();

  return (
    // Overlays the page with no background of its own - only the capsule is drawn.
    <View style={[styles.wrap, { bottom: bottomGap(insets.bottom) }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: theme.isDark ? 1 : 0 }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const Icon = icons[route.name];
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY));
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={[styles.item, focused && styles.itemActive, focused && { backgroundColor: theme.isDark ? 'rgba(138,180,248,0.18)' : TILE_BG }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              hitSlop={6}
            >
              {!!Icon && <Icon size={24} color={focused ? ICON_DEEP : theme.textMuted} fill={focused ? ICON_SOFT : 'transparent'} />}
              {focused && (
                <Text style={[styles.label, { color: theme.isDark ? '#8AB4F8' : ICON_DEEP }]} numberOfLines={1}>
                  {label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: BAR_HEIGHT,
    borderRadius: 32,
    paddingHorizontal: 8,
    ...shadows.floating,
  },
  item: { height: 46, minWidth: 54, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 14 },
  itemActive: { paddingHorizontal: 18, gap: 8 },
  label: { fontSize: 14, fontWeight: '700' },
});
