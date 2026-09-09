import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

/**
 * The one section-title treatment (uppercase, muted, tracked-out caption)
 * every dashboard/detail screen already used via copy-pasted inline styles -
 * centralized so a future tweak to the app's section-header language happens
 * in one file, not fifteen.
 */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      {/*
        Uppercased in JS, not via `textTransform: 'uppercase'` - inside this
        flex row, Android measures the Text's intrinsic layout box from the
        pre-transform (lowercase) string but paints the wider transformed
        (uppercase) glyphs into it, clipping the last character or two (e.g.
        "Work" -> "WOR"). Passing the already-uppercase string sidesteps the
        mismatch entirely. Screens that render a section title as a plain
        Text with no flex-row ancestor don't hit this (their width isn't
        computed via a flex measurement pass), which is why this only showed
        up here.
      */}
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      {!!action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.captionMedium,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  action: {
    ...typography.captionMedium,
    color: colors.primary,
  },
});
