import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ChevronLeftIcon } from '../components/icons';
import { initialsOf } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { useAppSwitch } from '../navigation/AppSwitchContext';
import { BandBackground } from '../tasks/screens/TaskHomeScreen';
import { SwapIcon } from '../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../theme';
import type { Tone } from '../crm/ui/StatusBadge';
import type { FeedbackStackParamList } from './navigation';

const DOT: Record<Tone, string> = { success: '#4ADE80', danger: '#FCA5A5', warning: '#FCD34D', info: '#BFDBFE', accent: '#DDD6FE', neutral: '#E5E7EB' };

const factory = (t: CrmTheme) => ({
  band: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const },
  eyebrow: { ...typography.overline, fontSize: 10, color: 'rgba(255,255,255,0.75)' },
  title: { ...typography.title, fontSize: 21, lineHeight: 26, color: '#FFFFFF' },
  subtitle: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  me: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  meText: { ...typography.captionMedium, fontWeight: '800' as const, color: t.primary },
  swap: { position: 'absolute' as const, right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  extra: { marginTop: spacing.md, flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
  pill: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { ...typography.captionMedium, color: '#FFFFFF' },
  pressed: { opacity: 0.75 },
});

/**
 * The blue gradient band at the top of every Customer Feedback page (same look as Home).
 * With onBack: a back arrow on the left. Without: the user's avatar on the right, which opens
 * "Switch app" (or Profile for a user with this app only).
 */
export function HeroHeader({
  eyebrow,
  title,
  subtitle,
  onBack,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children?: React.ReactNode;
}) {
  const { styles } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.band, { paddingTop: insets.top + spacing.sm }]}>
      <BandBackground />
      <View style={styles.row}>
        {!!onBack && (
          <Pressable onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}>
            <ChevronLeftIcon size={22} color="#FFFFFF" />
          </Pressable>
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

/** A status shown as a light pill on the blue band. */
export function HeroPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: DOT[tone] }]} />
      <Text style={styles.pillText}>{label}</Text>
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
