import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BriefcaseIcon, ChevronRightIcon, PersonIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { CheckIcon, ClipboardListIcon } from '../crm/ui/crmIcons';
import { Sheet } from '../tasks/ui/sheets';
import { radii, spacing, typography } from '../theme';
import type { AppKind } from './AppSwitchContext';

const factory = (t: CrmTheme) => ({
  intro: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: t.border,
    backgroundColor: t.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  pressed: { opacity: 0.85 },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tileTasks: { backgroundColor: t.primary },
  tileSales: { backgroundColor: t.crestRed },
  text: { flex: 1 },
  name: { ...typography.subtitle, color: t.textPrimary },
  about: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  current: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  currentText: { ...typography.captionMedium, color: t.textOnPrimary },
  profile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    minHeight: 48,
    marginTop: spacing.xs,
  },
  profileText: { ...typography.bodyMedium, color: t.textSecondary },
});

const APPS: { kind: AppKind; name: string; about: string }[] = [
  { kind: 'tasks', name: 'Task Management', about: 'Your tasks, your team and the calendar' },
  { kind: 'sales', name: 'Sales', about: 'Leads, quotes and payments' },
];

interface AppSwitchSheetProps {
  visible: boolean;
  current: AppKind;
  onPick: (app: AppKind) => void;
  /** Absent when the opener has no profile screen to offer. */
  onProfile?: () => void;
  onClose: () => void;
}

/** The "Switch app" sheet: the two apps as cards, the one showing now marked Current. */
export function AppSwitchSheet({ visible, current, onPick, onProfile, onClose }: AppSwitchSheetProps) {
  const { styles, theme } = useCrmStyles(factory);

  return (
    <Sheet visible={visible} onClose={onClose} title="Switch app">
      <Text style={styles.intro}>You stay signed in - pick where you want to work.</Text>

      {APPS.map(app => {
        const on = app.kind === current;
        return (
          <Pressable
            key={app.kind}
            onPress={() => (on ? onClose() : onPick(app.kind))}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={on ? `${app.name}, current app` : `Switch to ${app.name}`}
            testID={`switch-app-${app.kind}`}
            style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && styles.pressed]}
          >
            <View style={[styles.tile, app.kind === 'tasks' ? styles.tileTasks : styles.tileSales]}>
              {app.kind === 'tasks' ? (
                <ClipboardListIcon size={26} color="#FFFFFF" />
              ) : (
                <BriefcaseIcon size={26} color="#FFFFFF" />
              )}
            </View>
            <View style={styles.text}>
              <Text style={styles.name}>{app.name}</Text>
              <Text style={styles.about}>{app.about}</Text>
            </View>
            {on ? (
              <View style={styles.current}>
                <CheckIcon size={13} color={theme.textOnPrimary} />
                <Text style={styles.currentText}>Current</Text>
              </View>
            ) : (
              <ChevronRightIcon size={18} color={theme.textMuted} />
            )}
          </Pressable>
        );
      })}

      {!!onProfile && (
        <Pressable
          onPress={() => {
            onClose();
            onProfile();
          }}
          accessibilityRole="button"
          testID="switch-app-profile"
          style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
        >
          <PersonIcon size={18} color={theme.textSecondary} />
          <Text style={styles.profileText}>My profile</Text>
        </Pressable>
      )}
    </Sheet>
  );
}
