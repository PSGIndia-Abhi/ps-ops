import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radii, spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';

const factory = (t: CrmTheme) => ({
  base: {
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: t.primary },
  brand: { backgroundColor: t.crestRed },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: t.primary,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  content: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  label: { ...typography.button },
  labelPrimary: { color: t.textOnPrimary },
  labelSecondary: { color: t.primary },
});

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'brand' | 'secondary';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  testID,
}: PrimaryButtonProps) {
  const { styles, theme } = useCrmStyles(factory);
  const off = disabled || loading;
  const filled = variant !== 'secondary';

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        off && styles.disabled,
        pressed && !off && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={filled ? theme.textOnPrimary : theme.primary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, filled ? styles.labelPrimary : styles.labelSecondary]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
