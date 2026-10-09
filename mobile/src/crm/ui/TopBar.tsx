import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeftIcon, CloseIcon } from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';

const factory = (t: CrmTheme) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: t.background,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  titleWrap: { flex: 1, marginHorizontal: spacing.sm },
  title: { ...typography.subtitle, color: t.textPrimary },
  subtitle: { ...typography.caption, color: t.textMuted },
  spacer: { width: 40 },
  action: {
    minHeight: 40,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
  },
  actionPressed: { opacity: 0.75 },
  actionText: { ...typography.captionMedium, color: t.primary },
});

interface TopBarProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** 'close' (X) for the New Lead form, 'back' (chevron) for drill-in screens. */
  icon?: 'back' | 'close';
  /** A text action at the right end, e.g. Edit. */
  action?: { label: string; onPress: () => void };
}

export function TopBar({ title, subtitle, onBack, icon = 'back', action }: TopBarProps) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={icon === 'close' ? 'Close' : 'Back'}
        style={styles.button}
      >
        {icon === 'close' ? (
          <CloseIcon size={18} color={theme.textPrimary} />
        ) : (
          <ChevronLeftIcon size={20} color={theme.textPrimary} />
        )}
      </Pressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID="topbar-action"
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}
