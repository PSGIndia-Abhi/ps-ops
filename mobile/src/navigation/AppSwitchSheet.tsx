import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../auth/AuthContext';
import { displayRole, useRawRole } from '../auth/role';
import { BellIcon, BriefcaseIcon, ChevronRightIcon, HomeIcon, PersonIcon, PhoneIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import type { Tone } from '../crm/ui/StatusBadge';
import { CheckIcon, ClipboardListIcon, StarIcon } from '../crm/ui/crmIcons';
import { initials } from '../tasks/format';
import { TONE_GRADIENT } from '../tasks/theme';
import { GradientBlock } from '../tasks/ui/parts';
import { radii, spacing, typography } from '../theme';
import type { AppKind } from './AppSwitchContext';

const HEAD_FROM = '#2563EB';
const HEAD_TO = '#1E3A8A';

const factory = (t: CrmTheme) => ({
  backdrop: { flex: 1, backgroundColor: t.overlay },
  // Hangs under the avatar in the top-right corner of each app's Home.
  card: {
    position: 'absolute' as const,
    right: spacing.md,
    left: spacing.xxxl,
    backgroundColor: t.surface,
    borderRadius: 24,
    borderWidth: t.isDark ? 1 : 0,
    borderColor: t.border,
    ...t.raisedShadow,
  },
  clip: { borderRadius: 24, overflow: 'hidden' as const },
  pointer: {
    position: 'absolute' as const,
    top: -7,
    right: 26,
    width: 16,
    height: 16,
    backgroundColor: HEAD_FROM,
    transform: [{ rotate: '45deg' }],
  },
  // who is signed in, on a blue gradient
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, padding: spacing.md, overflow: 'hidden' as const },
  headBubble: { position: 'absolute' as const, width: 120, height: 120, borderRadius: 60, top: -50, right: -30, backgroundColor: 'rgba(255,255,255,0.08)' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: { ...typography.bodyMedium, fontWeight: '800' as const, color: HEAD_FROM },
  text: { flex: 1 },
  name: { ...typography.subtitle, fontWeight: '800' as const, color: '#FFFFFF' },
  roleChip: {
    alignSelf: 'flex-start' as const,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  roleText: { ...typography.overline, fontSize: 10, color: '#FFFFFF' },

  body: { padding: spacing.sm },
  label: { ...typography.overline, fontSize: 10, color: t.textMuted, paddingHorizontal: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    minHeight: 62,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  rowOn: { backgroundColor: t.primarySoftBg, borderColor: t.primary },
  pressed: { opacity: 0.85 },
  nameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  appName: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary, flexShrink: 1 },
  about: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  aboutOn: { color: t.primary, fontWeight: '700' as const },
  defaultBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: t.warningBg,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '800' as const, color: t.warningText },
  setDefault: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, alignSelf: 'flex-start' as const, marginTop: 2 },
  setDefaultText: { ...typography.caption, fontWeight: '700' as const, color: t.primary },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  go: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  hint: { ...typography.caption, fontSize: 11, color: t.textMuted, paddingHorizontal: spacing.xs, marginTop: 2 },
  line: { height: 1, backgroundColor: t.border, marginVertical: spacing.sm },
  // What waits in that app, not seen yet.
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: '#DC2626', alignItems: 'center' as const, justifyContent: 'center' as const },
  countText: { fontSize: 11, fontWeight: '800' as const, color: '#FFFFFF' },
  profile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
  },
  profileIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  profileText: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
});

const APPS: { kind: AppKind; name: string; about: string }[] = [
  { kind: 'leads', name: 'Commercial Leads', about: 'Leads, visits and quotations' },
  { kind: 'residential', name: 'Residential Leads', about: 'Home-service leads and calls' },
  { kind: 'tasks', name: 'Task Management', about: 'Your tasks and your team' },
  { kind: 'sales', name: 'Sales', about: 'Sales leads and follow-ups' },
  { kind: 'reminders', name: 'Payment Reminders', about: 'Payments that are due' },
  { kind: 'feedback', name: 'Customer Feedback', about: 'Feedback tickets' },
];

/** The gradient colour of each app's icon tile. */
const APP_TONE: Record<AppKind, Tone> = {
  leads: 'success',
  residential: 'accent',
  tasks: 'info',
  sales: 'danger',
  reminders: 'warning',
  feedback: 'info',
};

function AppIcon({ kind, color }: { kind: AppKind; color: string }) {
  if (kind === 'sales') return <BriefcaseIcon size={20} color={color} />;
  if (kind === 'reminders') return <BellIcon size={20} color={color} />;
  if (kind === 'leads') return <PhoneIcon size={20} color={color} />;
  if (kind === 'residential') return <HomeIcon size={20} color={color} />;
  if (kind === 'feedback') return <StarIcon size={20} color={color} />;
  return <ClipboardListIcon size={20} color={color} />;
}

/** The header's blue gradient, drawn behind its content. */
function HeadGradient() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="switchHead" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={HEAD_FROM} />
          <Stop offset="1" stopColor={HEAD_TO} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#switchHead)" />
    </Svg>
  );
}

interface AppSwitchSheetProps {
  visible: boolean;
  current: AppKind;
  /** The apps this user has, in the order shown. */
  apps: AppKind[];
  /** What waits in each app, not seen yet (a red number on its row). */
  badges?: Partial<Record<AppKind, number>>;
  onPick: (app: AppKind) => void;
  /** The app this user opens in when they sign in (null: the first of `apps`). */
  defaultApp: AppKind | null;
  onSetDefault: (app: AppKind) => void;
  /** Absent when the opener has no profile screen to offer. */
  onProfile?: () => void;
  onClose: () => void;
}

/**
 * The "Switch app" menu: a card that drops down from the avatar with who is signed in (on a blue
 * header), the user's apps (the one showing now marked, the default with a star) and a link to the
 * profile.
 */
export function AppSwitchSheet({ visible, current, apps, badges = {}, onPick, defaultApp, onSetDefault, onProfile, onClose }: AppSwitchSheetProps) {
  const { styles, theme } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const rawRole = useRawRole();
  const name = user?.name ?? '';
  const role = displayRole(rawRole);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.card, { top: insets.top + 84 }]} accessibilityViewIsModal>
        <View style={styles.pointer} />
        <View style={styles.clip}>
          <View style={styles.head}>
            <HeadGradient />
            <View style={styles.headBubble} pointerEvents="none" />
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {!!role && (
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>{role.toUpperCase()}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.label}>SWITCH APP</Text>

            {APPS.filter((app) => apps.includes(app.kind)).map((app) => {
              const on = app.kind === current;
              const isDefault = app.kind === (defaultApp && apps.includes(defaultApp) ? defaultApp : apps[0]);
              return (
                <Pressable
                  key={app.kind}
                  onPress={() => (on ? onClose() : onPick(app.kind))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={on ? `${app.name}, current app` : `Switch to ${app.name}`}
                  testID={`switch-app-${app.kind}`}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
                >
                  <GradientBlock colors={TONE_GRADIENT[APP_TONE[app.kind] ?? 'info']} size={42} radius={13} glow>
                    <AppIcon kind={app.kind} color="#FFFFFF" />
                  </GradientBlock>
                  <View style={styles.text}>
                    <View style={styles.nameRow}>
                      <Text style={styles.appName} numberOfLines={1}>
                        {app.name}
                      </Text>
                      {isDefault && (
                        <View style={styles.defaultBadge}>
                          <StarIcon size={10} color={theme.warningText} />
                          <Text style={styles.defaultBadgeText}>Default</Text>
                        </View>
                      )}
                    </View>
                    {on ? (
                      <Text style={[styles.about, styles.aboutOn]}>You are here</Text>
                    ) : isDefault ? (
                      <Text style={styles.about} numberOfLines={1}>
                        {app.about}
                      </Text>
                    ) : (
                      <Pressable
                        onPress={() => onSetDefault(app.kind)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${app.name} when I sign in`}
                        testID={`default-app-${app.kind}`}
                        style={({ pressed }) => [styles.setDefault, pressed && styles.pressed]}
                      >
                        <StarIcon size={11} color={theme.primary} />
                        <Text style={styles.setDefaultText}>Set as default</Text>
                      </Pressable>
                    )}
                  </View>
                  {!on && !!badges[app.kind] && (
                    <View style={styles.count} accessibilityLabel={`${badges[app.kind]} new`}>
                      <Text style={styles.countText}>{badges[app.kind]! > 99 ? '99+' : badges[app.kind]}</Text>
                    </View>
                  )}
                  {on ? (
                    <View style={styles.check}>
                      <CheckIcon size={15} color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={styles.go}>
                      <ChevronRightIcon size={15} color={theme.textSecondary} />
                    </View>
                  )}
                </Pressable>
              );
            })}
            <Text style={styles.hint}>The default app opens when you sign in.</Text>

            {!!onProfile && (
              <>
                <View style={styles.line} />
                <Pressable
                  onPress={() => {
                    onClose();
                    onProfile();
                  }}
                  accessibilityRole="button"
                  testID="switch-app-profile"
                  style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
                >
                  <View style={styles.profileIcon}>
                    <PersonIcon size={18} color={theme.textPrimary} />
                  </View>
                  <Text style={styles.profileText}>View profile</Text>
                  <ChevronRightIcon size={16} color={theme.textMuted} />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
