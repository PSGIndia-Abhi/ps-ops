import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { displayRole, useRawRole } from '../auth/role';
import { BellIcon, BriefcaseIcon, ChevronRightIcon, HomeIcon, PersonIcon, PhoneIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { CheckIcon, ClipboardListIcon, StarIcon } from '../crm/ui/crmIcons';
import { initials } from '../tasks/format';
import { radii, spacing, typography } from '../theme';
import type { AppKind } from './AppSwitchContext';

const factory = (t: CrmTheme) => ({
  backdrop: { flex: 1, backgroundColor: t.overlay },
  // Hangs under the avatar in the top-right corner of each app's Home.
  card: {
    position: 'absolute' as const,
    right: spacing.md,
    left: spacing.xxxl,
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: t.isDark ? 1 : 0,
    borderColor: t.border,
    padding: spacing.sm,
    ...t.raisedShadow,
  },
  pointer: {
    position: 'absolute' as const,
    top: -7,
    right: 26,
    width: 16,
    height: 16,
    backgroundColor: t.surface,
    transform: [{ rotate: '45deg' }],
  },
  who: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.xs },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { ...typography.bodyMedium, color: t.textOnPrimary },
  text: { flex: 1 },
  name: { ...typography.subtitle, color: t.textPrimary },
  role: { ...typography.caption, color: t.textSecondary, marginTop: 1 },
  line: { height: 1, backgroundColor: t.border, marginVertical: spacing.xs },
  label: { ...typography.overline, color: t.textMuted, paddingHorizontal: spacing.xs, marginVertical: spacing.xs },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 64,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowOn: { backgroundColor: t.primarySoftBg },
  pressed: { opacity: 0.85 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  appName: { ...typography.bodyMedium, color: t.textPrimary },
  about: { ...typography.caption, color: t.textSecondary, marginTop: 1 },
  profile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
  },
  profileText: { ...typography.bodyMedium, color: t.textPrimary },
  // "Default" badge / "Set default" button on each app
  defaultBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: t.warningBg,
    alignSelf: 'flex-start' as const,
    marginTop: 4,
  },
  defaultBadgeText: { ...typography.caption, fontWeight: '700' as const, color: t.warningText },
  setDefault: {
    alignSelf: 'flex-start' as const,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
  },
  setDefaultText: { ...typography.caption, fontWeight: '600' as const, color: t.primary },
  hint: { ...typography.caption, color: t.textMuted, paddingHorizontal: spacing.xs, marginTop: spacing.xs },
});

const APPS: { kind: AppKind; name: string }[] = [
  { kind: 'leads', name: 'Commercial Leads' },
  { kind: 'residential', name: 'Residential Leads' },
  { kind: 'tasks', name: 'Task Management' },
  { kind: 'sales', name: 'Sales' },
  { kind: 'reminders', name: 'Payment Reminders' },
];

/** Soft tile colour and icon colour per app. */
function appTint(kind: AppKind, t: CrmTheme): { bg: string; fg: string } {
  if (kind === 'sales') return { bg: t.dangerBg, fg: t.crestRed };
  if (kind === 'reminders') return { bg: t.warningBg, fg: t.warningText };
  if (kind === 'leads') return { bg: t.successBg, fg: t.successText };
  if (kind === 'residential') return { bg: t.accentBg, fg: t.accent };
  return { bg: t.primarySoftBg, fg: t.primary };
}

function AppIcon({ kind, color }: { kind: AppKind; color: string }) {
  if (kind === 'sales') return <BriefcaseIcon size={22} color={color} />;
  if (kind === 'reminders') return <BellIcon size={22} color={color} />;
  if (kind === 'leads') return <PhoneIcon size={22} color={color} />;
  if (kind === 'residential') return <HomeIcon size={22} color={color} />;
  return <ClipboardListIcon size={22} color={color} />;
}

interface AppSwitchSheetProps {
  visible: boolean;
  current: AppKind;
  /** The apps this user has, in the order shown. */
  apps: AppKind[];
  onPick: (app: AppKind) => void;
  /** The app this user opens in when they sign in (null: the first of `apps`). */
  defaultApp: AppKind | null;
  onSetDefault: (app: AppKind) => void;
  /** Absent when the opener has no profile screen to offer. */
  onProfile?: () => void;
  onClose: () => void;
}

/**
 * The "Switch app" menu: a card that drops down from the avatar with who is signed in, the
 * user's apps (the one showing now marked Current) and a link to the profile.
 */
export function AppSwitchSheet({ visible, current, apps, onPick, defaultApp, onSetDefault, onProfile, onClose }: AppSwitchSheetProps) {
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
        <View style={styles.who}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {!!role && <Text style={styles.role}>{role}</Text>}
          </View>
        </View>
        <View style={styles.line} />
        <Text style={styles.label}>Switch to</Text>

        {APPS.filter(app => apps.includes(app.kind)).map(app => {
          const on = app.kind === current;
          const isDefault = app.kind === (defaultApp && apps.includes(defaultApp) ? defaultApp : apps[0]);
          const tint = appTint(app.kind, theme);
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
              <View style={[styles.tile, { backgroundColor: on ? theme.surface : tint.bg }]}>
                <AppIcon kind={app.kind} color={tint.fg} />
              </View>
              <View style={styles.text}>
                <Text style={styles.appName}>{app.name}</Text>
                {on && <Text style={styles.about}>Current</Text>}
                {isDefault ? (
                  <View style={styles.defaultBadge}>
                    <StarIcon size={12} color={theme.warningText} />
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => onSetDefault(app.kind)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${app.name} when I sign in`}
                    testID={`default-app-${app.kind}`}
                    style={({ pressed }) => [styles.setDefault, pressed && styles.pressed]}
                  >
                    <Text style={styles.setDefaultText}>Set as default</Text>
                  </Pressable>
                )}
              </View>
              {on ? <CheckIcon size={20} color={theme.primary} /> : <ChevronRightIcon size={18} color={theme.textMuted} />}
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
              <PersonIcon size={20} color={theme.textPrimary} />
              <Text style={styles.profileText}>View profile</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}
