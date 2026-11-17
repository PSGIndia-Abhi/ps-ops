import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRightIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { radii, spacing, typography } from '../../theme';

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.sm },
  headText: { flex: 1 },
  title: { ...typography.subtitle, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, paddingVertical: 4 },
  linkText: { ...typography.captionMedium, color: t.primary },
  pressed: { opacity: 0.7 },
});

/** A white card with an optional title row and "View all" link - the mobile version of the web's cp-card. */
export function ClientCard({
  title,
  subtitle,
  linkLabel,
  onLink,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  linkLabel?: string;
  onLink?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={[styles.card, style]}>
      {!!title && (
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
          </View>
          {!!linkLabel && !!onLink && (
            <Pressable onPress={onLink} hitSlop={8} style={({ pressed }) => [styles.link, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.linkText}>{linkLabel}</Text>
              <ChevronRightIcon size={14} color={theme.primary} />
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const dateFactory = (t: CrmTheme) => ({
  box: {
    width: 48,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
  },
  day: { ...typography.subtitle, color: t.primary, lineHeight: 22 },
  month: { ...typography.caption, color: t.primary, textTransform: 'uppercase' as const },
});

/** The small "12 / NOV" date block used in visit lists. */
export function DateBlock({ day, month }: { day: string; month: string }) {
  const { styles } = useCrmStyles(dateFactory);
  return (
    <View style={styles.box}>
      <Text style={styles.day}>{day}</Text>
      <Text style={styles.month}>{month}</Text>
    </View>
  );
}
