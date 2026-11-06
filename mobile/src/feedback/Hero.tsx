import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ChevronLeftIcon } from '../components/icons';
import { initialsOf } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { toneColors, type Tone } from '../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../theme';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAppSwitch } from '../navigation/AppSwitchContext';
import { SwapIcon } from '../tasks/ui/taskIcons';
import { GradientFill } from '../leads/ui';
import type { FeedbackStackParamList } from './navigation';

const factory = (t: CrmTheme) => ({
  bar: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, backgroundColor: t.surface, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, marginBottom: spacing.xs, ...t.cardShadow },
  wash: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' as const },
  blob: { position: 'absolute' as const, borderRadius: 999, backgroundColor: 'rgba(59,130,246,0.10)' },
  iconTile: { width: 46, height: 46, borderRadius: 15, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  eyebrow: { ...typography.overline, fontSize: 10, color: t.textMuted },
  title: { ...typography.title, fontSize: 23, lineHeight: 29, fontWeight: '800' as const, color: t.textPrimary },
  subtitle: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  me: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  meText: { ...typography.captionMedium, fontWeight: '800' as const, color: '#FFFFFF' },
  extra: { marginTop: spacing.sm, flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
  pill: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { ...typography.captionMedium },
  swap: { position: 'absolute' as const, right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  pressed: { opacity: 0.75 },
});

/**
 * The header card of a Customer Feedback page (only Home has the blue band): a white card with
 * rounded bottom corners, an optional page icon in a blue tile, the title, an optional
 * small line above it and a subtitle under it. With onBack: a back arrow on the left; without: the
 * user's avatar on the right, which opens "Switch app" (or Profile for a user with this app only).
 * children = small status chips under the title (a call's or ticket's status).
 */
export function HeroHeader({
  eyebrow,
  title,
  subtitle,
  onBack,
  icon: Icon,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** A page icon in a blue tile before the title (list pages). */
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  children?: React.ReactNode;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      {/* A soft light-blue wash with two faint circles: lively, but lighter than Home's blue band. */}
      <View style={styles.wash} pointerEvents="none">
        <GradientFill from="#E3EDFF" to="#FFFFFF" />
        <View style={[styles.blob, { width: 180, height: 180, top: -70, right: -50 }]} />
        <View style={[styles.blob, { width: 110, height: 110, bottom: -50, right: 90, opacity: 0.6 }]} />
      </View>
      <View style={styles.row}>
        {!!onBack && (
          <Pressable onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}>
            <ChevronLeftIcon size={22} color={theme.textPrimary} />
          </Pressable>
        )}
        {!!Icon && !onBack && (
          <View style={styles.iconTile}>
            <GradientFill from="#3B82F6" to="#1D4ED8" />
            <Icon size={22} color="#FFFFFF" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {!onBack && <MeButton />}
      </View>
      {!!children && <View style={styles.extra}>{children}</View>}
    </View>
  );
}

/** A small status chip under a page's title (a call's or ticket's status). */
export function HeroPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.pillDot, { backgroundColor: fg }]} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** The avatar: opens "Switch app" (with My profile in it), or Profile when there is no other app. */
function MeButton() {
  const { styles, theme } = useCrmStyles(factory);
  const navigation = useNavigation<NavigationProp<FeedbackStackParamList>>();
  const { user } = useAuth();
  const { canSwitch, openSwitcher } = useAppSwitch();
  return (
    <Pressable
      onPress={() => (canSwitch ? openSwitcher(() => navigation.navigate('Profile')) : navigation.navigate('Profile'))}
      style={({ pressed }) => [styles.me, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={canSwitch ? 'Switch app' : 'Profile'}
    >
      <Text style={styles.meText}>{initialsOf(user?.name || '')}</Text>
      {canSwitch && (
        <View style={styles.swap}>
          <SwapIcon size={10} color={theme.primary} />
        </View>
      )}
    </Pressable>
  );
}
