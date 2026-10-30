import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AlertCircleIcon, AlertTriangleIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';
import { Badge, Card, NameChip } from './QuotationDialogs';

// One popup look for the sales app, the same as the quotation popups: a glossy badge, a bold
// title, a short line, and one or two buttons. `appAlert` is a drop-in for Alert.alert.

export type DialogTone = 'primary' | 'danger' | 'warning' | 'success';
type IconType = React.ComponentType<{ size?: number; color: string }>;
export type DialogButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
export type DialogOptions = { tone?: DialogTone; Icon?: IconType; chip?: string };

export function AppDialog({
  title,
  message,
  buttons,
  tone,
  Icon,
  chip,
  onClose,
}: {
  title: string;
  message?: string;
  buttons: DialogButton[];
  tone?: DialogTone;
  Icon?: IconType;
  chip?: string;
  /** The ✕, back button or a tap outside: runs the cancel button, if there is one. */
  onClose: () => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const danger = buttons.some((b) => b.style === 'destructive');
  const t = tone ?? (danger ? 'danger' : 'primary');
  const color = { primary: theme.primary, danger: theme.danger, warning: theme.warning, success: theme.success }[t];
  const BadgeIcon = Icon ?? (danger ? TrashIcon : t === 'warning' ? AlertTriangleIcon : AlertCircleIcon);
  return (
    <Card onClose={onClose}>
      <Badge color={color} icon={<BadgeIcon size={24} color="#fff" />} />
      <Text style={styles.title}>{title}</Text>
      {!!chip && <NameChip name={chip} />}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <View style={styles.row}>
        {buttons.map((b, i) => {
          const cancel = b.style === 'cancel' && buttons.length > 1;
          const bg = b.style === 'destructive' ? theme.danger : color;
          return (
            <Pressable
              key={i}
              onPress={b.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, cancel ? styles.btnOutline : { backgroundColor: bg }, pressed && styles.pressed]}
            >
              <Text style={[styles.btnText, cancel ? styles.btnOutlineText : styles.btnSolidText]} numberOfLines={1}>
                {b.text ?? 'OK'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

// ---- appAlert: the same arguments as Alert.alert, shown with AppDialog by <AppAlertHost />.

type AlertState = { title: string; message?: string; buttons: DialogButton[]; options?: DialogOptions };
let show: ((s: AlertState | null) => void) | null = null;

export function appAlert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions) {
  if (!show) {
    Alert.alert(title, message, buttons);
    return;
  }
  show({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], options });
}

/** Mounted once at the app root. */
export function AppAlertHost() {
  const [state, setState] = useState<AlertState | null>(null);
  useEffect(() => {
    show = setState;
    return () => {
      if (show === setState) show = null;
    };
  }, []);
  if (!state) return null;
  const press = (b?: DialogButton) => {
    setState(null);
    b?.onPress?.();
  };
  // Like Android, two-button alerts put the cancel one first.
  const buttons = [...state.buttons].sort((a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel'));
  return (
    <AppDialog
      title={state.title}
      message={state.message}
      tone={state.options?.tone}
      Icon={state.options?.Icon}
      chip={state.options?.chip}
      buttons={buttons.map((b) => ({ ...b, onPress: () => press(b) }))}
      onClose={() => press(state.buttons.find((b) => b.style === 'cancel'))}
    />
  );
}

/** Bin - same 24-grid line style as components/icons. */
export function TrashIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const factory = (t: CrmTheme) => ({
  title: { ...typography.title, color: t.textPrimary, textAlign: 'center' as const },
  message: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.sm, paddingHorizontal: spacing.sm },
  row: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xs, alignSelf: 'stretch' as const },
  btn: { flex: 1, minHeight: 50, borderRadius: radii.lg, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: spacing.sm },
  btnOutline: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
  btnText: { ...typography.button },
  btnOutlineText: { color: t.textPrimary },
  btnSolidText: { color: '#fff' },
  pressed: { opacity: 0.75 },
});
