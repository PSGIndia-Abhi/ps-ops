import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: Edge[];
}

/**
 * The one screen scaffold every dashboard/list screen sits in - same safe
 * area handling, same pull-to-refresh, same base padding - so all of them
 * feel like one app rather than three separately-built ones.
 */
export function ScreenContainer({
  children,
  onRefresh,
  refreshing = false,
  edges = ['bottom'],
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
  },
  inner: {
    padding: spacing.lg,
  },
});
