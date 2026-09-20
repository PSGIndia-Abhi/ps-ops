import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { BrandMark } from '../../components/BrandMark';
import { AvatarIcon, BellIcon } from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';

const factory = (t: CrmTheme) => ({
  outer: { marginHorizontal: spacing.md },
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    overflow: 'hidden' as const,
    borderWidth: t.isDark ? 1 : 0,
    borderColor: t.border,
    ...t.raisedShadow,
  },
  identity: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    flexShrink: 1,
  },
  textBlock: { flexShrink: 1 },
  name: { ...typography.bodyMedium, color: t.textPrimary },
  rolePill: {
    alignSelf: 'flex-start' as const,
    backgroundColor: t.primarySoftBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    marginTop: 2,
  },
  roleText: { ...typography.overline, fontSize: 10, color: t.primaryPressed },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  divider: { width: 1, height: 24, backgroundColor: t.border },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: { opacity: 0.75 },
});

function HeaderWave({ width, height, color }: { width: number; height: number; color: string }) {
  const gradId = useRef(`crmHeaderWave${Math.round(Math.random() * 1e6)}`).current;
  if (!width || !height) return null;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.6} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path
        d={`M0,0 L${width * 0.62},0 C${width * 0.48},${height * 0.55} ${width * 0.3},${height * 0.32} 0,${height} Z`}
        fill={`url(#${gradId})`}
      />
    </Svg>
  );
}

interface CrmHeaderProps {
  userName: string;
  roleLabel: string;
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
}

/** Technician Home's floating header card (brand mark, name + role pill, bell, avatar), themed for light/dark. */
export function CrmHeader({ userName, roleLabel, onProfilePress, onNotificationsPress }: CrmHeaderProps) {
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  return (
    <View style={[styles.outer, { marginTop: insets.top + spacing.xs }]}>
      <View style={styles.container} onLayout={onLayout}>
        {!!size && <HeaderWave width={size.width} height={size.height} color={theme.primarySoft} />}
        <View style={styles.identity}>
          <BrandMark size={32} />
          <View style={styles.textBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {userName}
            </Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onNotificationsPress}
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <BellIcon size={19} color={theme.primary} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={onProfilePress}
            hitSlop={8}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <AvatarIcon size={19} color={theme.textOnPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
