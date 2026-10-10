import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useRawRole } from '../auth/role';
import { BellIcon, BriefcaseIcon, ChevronRightIcon, PersonIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { CheckIcon, ClipboardListIcon } from '../crm/ui/crmIcons';
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
});

const APPS: { kind: AppKind; name: string; about: string }[] = [
  { kind: 'tasks', name: 'Task Management', about: 'Your tasks, your team and the calendar' },
  { kind: 'sales', name: 'Sales', about: 'Leads, quotes and payments' },
  { kind: 'reminders', name: 'Payment Reminders', about: 'Customer and invoice reminders' },
];

/** Soft tile colour and icon colour per app. */
function appTint(kind: AppKind, t: CrmTheme): { bg: string; fg: string } {
  if (kind === 'sales') return { bg: t.dangerBg, fg: t.crestRed };
  if (kind === 'reminders') return { bg: t.warningBg, fg: t.warningText };
  return { bg: t.primarySoftBg, fg: t.primary };
}

function AppIcon({ kind, color }: { kind: AppKind; color: string }) {
  if (kind === 'sales') return <BriefcaseIcon size={22} color={color} />;
  if (kind === 'reminders') return <BellIcon size={22} color={color} />;
  return <ClipboardListIcon size={22} color={color} />;
}

interface AppSwitchSheetProps {
  visible: boolean;
  current: AppKind;
  /** The apps this user has, in the order shown. */
  apps: AppKind[];
  onPick: (app: AppKind) => void;
  /** Absent when the opener has no profile screen to offer. */
  onProfile?: () => void;
  onClose: () => void;
}

/**
 * The "Switch app" menu: a card that drops down from the avatar with who is signed in, the
 * user's apps (the one showing now marked Current) and a link to the profile.
 */
export function AppSwitchSheet({ visible, current, apps, onPick, onProfile, onClose }: AppSwitchSheetProps) {
  const { styles, theme } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const rawRole = useRawRole();
  const name = user?.name ?? '';
  const role = rawRole ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1) : '';

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
                <Text style={styles.about}>{on ? 'Current' : app.about}</Text>
              </View>
              {on ? <CheckIcon size={20} color={theme.primary} /> : <ChevronRightIcon size={18} color={theme.textMuted} />}
            </Pressable>
          );
        })}

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
