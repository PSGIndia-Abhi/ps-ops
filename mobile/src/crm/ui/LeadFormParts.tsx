import React from 'react';
import { Text, View } from 'react-native';
import { spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';

const factory = (t: CrmTheme) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerText: { flex: 1 },
  headerTitle: { ...typography.subtitle, color: t.textPrimary },
  headerHint: { ...typography.caption, color: t.textMuted, marginTop: 1 },
});

/** A form section's title row: a tinted icon, the title, and an optional one-line hint. */
export function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.header}>
      <View style={styles.headerIcon}>{icon}</View>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        {!!hint && <Text style={styles.headerHint}>{hint}</Text>}
      </View>
    </View>
  );
}
