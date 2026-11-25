import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { radii, spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';
import { AlertCircleIcon, CheckCircleIcon, CloseIcon, InboxIcon } from '../../components/icons';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  screenTransparent: { backgroundColor: 'transparent' },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl },
  skeleton: { backgroundColor: t.surfaceAlt },
  emptyWrap: { alignItems: 'center' as const, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary, textAlign: 'center' as const },
  emptySub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xxs },
  notice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.successBg,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: { ...typography.captionMedium, color: t.successText, flex: 1 },
  noticeWarn: { backgroundColor: t.warningBg },
  noticeTextWarn: { color: t.warningText },
  errorBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.dangerBg,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.captionMedium, color: t.dangerText, flex: 1 },
  errorRetry: { ...typography.captionMedium, color: t.dangerText, textDecorationLine: 'underline' as const },
  section: { ...typography.overline, color: t.textMuted, marginBottom: spacing.xs },
});

interface CrmScreenProps {
  children: React.ReactNode;
  edges?: Edge[];
  /** false = plain container (for screens that own a FlatList). */
  scroll?: boolean;
  /** Lets a decoration rendered behind the screen (Home's background wash) show through. */
  transparent?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboardShouldPersistTaps?: 'handled' | 'always' | 'never';
  contentStyle?: StyleProp<ViewStyle>;
}

/** The CRM's screen scaffold: safe area, themed background, optional pull-to-refresh. */
export function CrmScreen({
  children,
  edges = ['top'],
  scroll = true,
  transparent = false,
  refreshing = false,
  onRefresh,
  keyboardShouldPersistTaps = 'handled',
  contentStyle,
}: CrmScreenProps) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <SafeAreaView style={[styles.screen, transparent && styles.screenTransparent]} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return <Text style={styles.section}>{children}</Text>;
}

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Pulsing placeholder shown while data loads. */
export function CrmSkeleton({ width = '100%', height = 16, radius = radii.sm, style }: SkeletonProps) {
  const { styles } = useCrmStyles(factory);
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.skeleton, { width, height, borderRadius: radius, opacity }, style]} />;
}

interface EmptyProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function CrmEmptyState({ title, subtitle, icon, action }: EmptyProps) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>{icon ?? <InboxIcon size={32} color={theme.textMuted} />}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.emptySub}>{subtitle}</Text>}
      {!!action && <View style={{ marginTop: spacing.md }}>{action}</View>}
    </View>
  );
}

/** Dismissible confirmation line ("Lead saved - Rajesh Kumar"). */
export function NoticeBanner({
  message,
  onDismiss,
  tone = 'success',
}: {
  message: string | null;
  onDismiss: () => void;
  tone?: 'success' | 'warning';
}) {
  const { styles, theme } = useCrmStyles(factory);
  if (!message) return null;
  const warn = tone === 'warning';
  const color = warn ? theme.warningText : theme.successText;
  return (
    <View style={[styles.notice, warn && styles.noticeWarn]} accessibilityLiveRegion="polite">
      {warn ? <AlertCircleIcon size={18} color={color} /> : <CheckCircleIcon size={18} color={color} />}
      <Text style={[styles.noticeText, warn && styles.noticeTextWarn]}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
        <CloseIcon size={16} color={color} />
      </Pressable>
    </View>
  );
}

/** A load / save failure, with an optional Retry. */
export function CrmErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite">
      <AlertCircleIcon size={18} color={theme.dangerText} />
      <Text style={styles.errorText}>{message}</Text>
      {!!onRetry && (
        <Pressable onPress={onRetry} hitSlop={10} accessibilityRole="button">
          <Text style={styles.errorRetry}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}
