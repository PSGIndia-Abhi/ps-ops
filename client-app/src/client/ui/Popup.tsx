import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { BRAND_RED } from './ClientIcons';

/**
 * The client app's popup: a centered card over a dimmed backdrop that springs in - used for every
 * dialog, picker and confirm (the shared Sheet in tasks/ui/sheets.tsx draws this too), so the whole
 * app has one professional popup style instead of bottom sheets.
 */

export type PopupTone = 'brand' | 'danger' | 'blue' | 'amber' | 'teal';

const TONE: Record<PopupTone, { from: string; to: string; halo: string; haloDark: string }> = {
  brand: { from: '#1A73E8', to: '#0B57D0', halo: '#E3ECFD', haloDark: 'rgba(138,180,248,0.16)' },
  danger: { from: '#F0626A', to: BRAND_RED, halo: '#FDE7E9', haloDark: 'rgba(242,139,130,0.16)' },
  blue: { from: '#5B8DEF', to: '#2F5BD3', halo: '#E3ECFD', haloDark: 'rgba(138,180,248,0.16)' },
  amber: { from: '#FFB547', to: '#D98A00', halo: '#FFF1D6', haloDark: 'rgba(252,211,77,0.16)' },
  teal: { from: '#2BC4B0', to: '#0F8F7E', halo: '#D8F5F0', haloDark: 'rgba(94,234,212,0.16)' },
};

const factory = (t: CrmTheme) => ({
  root: { flex: 1 },
  backdrop: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9,14,33,0.58)' },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 20 },
  card: {
    width: '100%' as const,
    maxWidth: 400,
    maxHeight: '86%' as const,
    backgroundColor: t.surface,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: t.isDark ? 1 : 0,
    borderColor: t.border,
    shadowColor: '#050A1F',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 24,
  },
  close: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#F1F3F7',
    zIndex: 2,
  },
  badgeHalo: { alignSelf: 'center' as const, width: 52, height: 52, borderRadius: 26, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 12, marginTop: 4 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  title: { fontSize: 18, fontWeight: '700' as const, color: t.textPrimary, letterSpacing: 0.1 },
  titleCentered: { textAlign: 'center' as const },
  titlePlain: { paddingRight: 40 },
  subtitle: { fontSize: 14, lineHeight: 20, color: t.textMuted, marginTop: 4 },
  head: { marginBottom: 14 },
  body: { flexGrow: 0 },
  // ---- buttons ----
  buttons: { flexDirection: 'row' as const, gap: 10, marginTop: 16 },
  btn: { flex: 1, minHeight: 46, borderRadius: 23, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  btnGhost: { backgroundColor: t.isDark ? 'rgba(168,199,250,0.12)' : '#EEF3FD' },
  btnGhostText: { fontSize: 15, fontWeight: '700' as const, color: t.isDark ? '#A8C7FA' : '#0B57D0' },
  btnText: { fontSize: 15, fontWeight: '700' as const, color: '#FFFFFF', letterSpacing: 0.2 },
  btnDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});

function Gradient({ from, to, radius = 0 }: { from: string; to: string; radius?: number }) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`pg${from}${to}`.replace(/#/g, '')} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} fill={`url(#${`pg${from}${to}`.replace(/#/g, '')})`} />
    </Svg>
  );
}

function CloseX({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

export interface PopupProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** A white icon shown in a gradient badge at the top (the title is then centered). */
  icon?: React.ReactNode;
  tone?: PopupTone;
  /** False while something is being saved - the backdrop, ✕ and back button then do nothing. */
  dismissible?: boolean;
  children?: React.ReactNode;
}

export function Popup({ visible, onClose, title, subtitle, icon, tone = 'brand', dismissible = true, children }: PopupProps) {
  const { styles, theme } = useCrmStyles(factory);
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.92);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [visible, scale, opacity]);

  const close = () => {
    if (dismissible) onClose();
  };
  const tc = TONE[tone];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior="padding" style={styles.center} pointerEvents="box-none">
          <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
            {dismissible && (
              <Pressable onPress={close} style={({ pressed }) => [styles.close, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                <CloseX color={theme.textMuted} />
              </Pressable>
            )}
            {(!!icon || !!title || !!subtitle) && (
              <View style={styles.head}>
                {!!icon && (
                  <View style={[styles.badgeHalo, { backgroundColor: theme.isDark ? tc.haloDark : tc.halo }]}>
                    <View style={styles.badge}>
                      <Gradient from={tc.from} to={tc.to} radius={22} />
                      {icon}
                    </View>
                  </View>
                )}
                {!!title && <Text style={[styles.title, icon ? styles.titleCentered : styles.titlePlain]}>{title}</Text>}
                {!!subtitle && <Text style={[styles.subtitle, !!icon && styles.titleCentered]}>{subtitle}</Text>}
              </View>
            )}
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** The popup's button row: a soft Cancel and a solid gradient main button (navy, or red for danger). */
export function PopupButtons({
  cancelLabel = 'Cancel',
  onCancel,
  confirmLabel,
  onConfirm,
  tone = 'brand',
  loading = false,
  disabled = false,
}: {
  cancelLabel?: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: PopupTone;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { styles } = useCrmStyles(factory);
  const tc = TONE[tone];
  const off = disabled || loading;
  return (
    <View style={styles.buttons}>
      <Pressable onPress={onCancel} disabled={loading} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]} accessibilityRole="button">
        <Text style={styles.btnGhostText}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        disabled={off}
        style={({ pressed }) => [styles.btn, disabled && styles.btnDisabled, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ disabled: off, busy: loading }}
      >
        <Gradient from={tc.from} to={tc.to} radius={23} />
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>{confirmLabel}</Text>}
      </Pressable>
    </View>
  );
}
