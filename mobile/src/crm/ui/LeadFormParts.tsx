import React from 'react';
import { Text, View } from 'react-native';
import { GlossyBadge } from '../../components/GlossyBadge';
import { spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';

const factory = (t: CrmTheme) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerText: { flex: 1 },
  headerTitle: { ...typography.subtitle, color: t.textPrimary },
  headerHint: { ...typography.caption, color: t.textMuted, marginTop: 1 },
});

/**
 * A form section's title row: a glossy coloured icon badge, the title, and an optional one-line
 * hint. The badge takes the colour of the icon passed in (each section its own colour) and draws
 * the icon white on it.
 */
export function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  const { styles, theme } = useCrmStyles(factory);
  const tone = React.isValidElement<{ color?: string }>(icon) ? icon.props.color ?? theme.primary : theme.primary;
  const glyph = React.isValidElement<{ color?: string; size?: number }>(icon)
    ? React.cloneElement(icon, { color: '#FFFFFF', size: 19 })
    : icon;
  return (
    <View style={styles.header}>
      <GlossyBadge color={tone} size={40} icon={glyph} />
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        {!!hint && <Text style={styles.headerHint}>{hint}</Text>}
      </View>
    </View>
  );
}
