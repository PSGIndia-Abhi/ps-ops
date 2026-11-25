import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { ApiError, authApi } from '../../api';
import { EyeIcon, EyeOffIcon, LockIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { useToast } from '../ui/Toast';

/** Minimum length - the backend rule (POST /api/auth/me/password). */
const MIN_LENGTH = 6;

type InputRef = React.ComponentRef<typeof TextInput>;

const palette = (t: CrmTheme) => ({
  page: t.isDark ? t.background : '#FFFFFF',
  ink: t.isDark ? '#E6E7EA' : '#1B1C1F',
  sub: t.isDark ? '#A3A7AE' : '#5E6470',
  faint: t.isDark ? '#6E737C' : '#9AA1AD',
  blue: t.isDark ? '#A8C7FA' : '#0B57D0',
  blueSoft: t.isDark ? 'rgba(168,199,250,0.16)' : '#E3ECFD',
  field: t.isDark ? t.surfaceAlt : '#F2F5FB',
  track: t.isDark ? 'rgba(255,255,255,0.10)' : '#E4E9F2',
  green: t.isDark ? '#81C995' : '#188038',
  red: t.isDark ? '#F28B82' : '#B3261E',
  amber: t.isDark ? '#FDD663' : '#E37400',
});

const factory = (t: CrmTheme) => {
  const c = palette(t);
  return {
    flex1: { flex: 1 },
    screen: { flex: 1, backgroundColor: c.page },
    pressed: { opacity: 0.6 },
    backRow: { height: 52, justifyContent: 'center' as const, paddingHorizontal: 8 },
    back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    badge: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 4 },
    title: { fontSize: 28, lineHeight: 36, fontWeight: '400' as const, color: c.ink, marginTop: 18 },
    lead: { fontSize: 15, lineHeight: 22, color: c.sub, marginTop: 6 },
    form: { marginTop: 28, gap: 18 },
    label: { fontSize: 14, fontWeight: '600' as const, color: c.ink, marginBottom: 8 },
    box: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      minHeight: 56,
      borderRadius: 16,
      paddingLeft: 16,
      paddingRight: 6,
      backgroundColor: c.field,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    boxFocused: { borderColor: c.blue, backgroundColor: c.page },
    boxError: { borderColor: c.red },
    input: { flex: 1, fontSize: 16, color: c.ink, paddingVertical: 14 },
    eye: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
    fieldError: { fontSize: 13.5, color: c.red, marginTop: 6, marginLeft: 4 },
    meter: { flexDirection: 'row' as const, gap: 6, marginTop: 12 },
    seg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.track },
    meterRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 8 },
    meterLabel: { fontSize: 13, fontWeight: '600' as const },
    rules: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 12 },
    rule: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingLeft: 6, paddingRight: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.field },
    ruleOn: { backgroundColor: t.isDark ? 'rgba(129,201,149,0.14)' : '#E6F4EA' },
    ruleText: { fontSize: 12.5, color: c.sub },
    ruleTextOn: { color: c.green, fontWeight: '600' as const },
    match: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 8, marginLeft: 4 },
    matchText: { fontSize: 13.5, fontWeight: '600' as const },
    footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: c.page },
    button: { minHeight: 54, borderRadius: 27, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.blue },
    buttonOff: { opacity: 0.38 },
    buttonText: { fontSize: 16, fontWeight: '700' as const, color: t.isDark ? '#0B1B3A' : '#FFFFFF', letterSpacing: 0.2 },
    formError: { fontSize: 14, color: c.red, textAlign: 'center' as const, marginBottom: 10 },
  };
};

function BackArrow({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M20 12H5M11 5l-7 7 7 7" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A shield with a keyhole - the page's badge. */
function ShieldKey({ color }: { color: string }) {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24">
      <Path d="M12 2.8l7 2.7v5.6c0 4.5-3 8.4-7 9.9-4-1.5-7-5.4-7-9.9V5.5z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Circle cx="12" cy="10.6" r="1.9" fill={color} />
      <Path d="M12 12.4v3.2" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function Check({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="11" fill={color} />
      <Path d="M7.2 12.3l3.2 3.1 6.4-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth={2.2} />
    </Svg>
  );
}

/** 0-4 strength from length and variety. */
function strength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= MIN_LENGTH) s += 1;
  if (pw.length >= 10) s += 1;
  if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 0.5;
  if (/[^A-Za-z0-9]/.test(pw)) s += 0.5;
  return Math.min(4, Math.max(1, Math.round(s)));
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  inputRef?: React.RefObject<InputRef | null>;
  onSubmit?: () => void;
  last?: boolean;
  children?: React.ReactNode;
}

function PasswordField({ label, value, onChange, error, inputRef, onSubmit, last, children }: FieldProps) {
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused, !!error && styles.boxError]}>
        <LockIcon size={19} color={focused ? c.blue : c.faint} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={c.faint}
          returnKeyType={last ? 'done' : 'next'}
          onSubmitEditing={onSubmit}
          blurOnSubmit={!!last}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Pressable onPress={() => setShown((s) => !s)} style={({ pressed }) => [styles.eye, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={4}>
          {shown ? <EyeOffIcon size={20} color={c.sub} /> : <EyeIcon size={20} color={c.sub} />}
        </Pressable>
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
      {children}
    </View>
  );
}

/** Change password (POST /api/auth/me/password) - clean form with live strength and match checks. */
export function ClientChangePasswordScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const c = palette(theme);
  const toast = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextRef = useRef<InputRef>(null);
  const confirmRef = useRef<InputRef>(null);

  const level = strength(next);
  const levelMeta = [
    { label: '', color: c.track },
    { label: 'Weak', color: c.red },
    { label: 'Fair', color: c.amber },
    { label: 'Good', color: c.blue },
    { label: 'Strong', color: c.green },
  ][level];
  const rules = [
    { key: 'len', label: `${MIN_LENGTH}+ characters`, ok: next.length >= MIN_LENGTH },
    { key: 'num', label: 'A number', ok: /\d/.test(next) },
    { key: 'case', label: 'A capital letter', ok: /[A-Z]/.test(next) },
  ];
  const matches = !!confirm && confirm === next;
  const sameAsOld = !!next && next === current;
  const valid = !!current && next.length >= MIN_LENGTH && matches && !sameAsOld;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setCurrentError(null);
    setFormError(null);
    try {
      await authApi.changePassword(current, next);
      toast.show('Password updated');
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) setFormError('No connection. Please try again.');
      else if (err instanceof ApiError && (err.status === 400 || err.status === 401)) setCurrentError(err.message || 'Current password is incorrect.');
      else setFormError(err instanceof ApiError ? err.message : 'Could not update your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.flex1, { paddingTop: insets.top }]}>
        <View style={styles.backRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}>
            <BackArrow color={c.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.badge}>
            <ShieldKey color={c.blue} />
          </View>
          <Text style={styles.title}>Change password</Text>
          <Text style={styles.lead}>Choose a strong password you don't use anywhere else.</Text>

          <View style={styles.form}>
            <PasswordField
              label="Current password"
              value={current}
              onChange={(v) => {
                setCurrent(v);
                if (currentError) setCurrentError(null);
              }}
              error={currentError}
              onSubmit={() => nextRef.current?.focus()}
            />

            <PasswordField label="New password" value={next} onChange={setNext} inputRef={nextRef} onSubmit={() => confirmRef.current?.focus()} error={sameAsOld ? 'Use a password different from your current one.' : null}>
              {!!next && (
                <>
                  <View style={styles.meter}>
                    {[1, 2, 3, 4].map((i) => (
                      <View key={i} style={[styles.seg, i <= level && { backgroundColor: levelMeta.color }]} />
                    ))}
                  </View>
                  <View style={styles.meterRow}>
                    <Text style={[styles.meterLabel, { color: levelMeta.color }]}>{levelMeta.label}</Text>
                  </View>
                </>
              )}
              <View style={styles.rules}>
                {rules.map((r) => (
                  <View key={r.key} style={[styles.rule, r.ok && styles.ruleOn]}>
                    {r.ok ? <Check color={c.green} /> : <Dot color={c.faint} />}
                    <Text style={[styles.ruleText, r.ok && styles.ruleTextOn]}>{r.label}</Text>
                  </View>
                ))}
              </View>
            </PasswordField>

            <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} inputRef={confirmRef} onSubmit={submit} last>
              {!!confirm && (
                <View style={styles.match}>
                  {matches ? <Check color={c.green} size={15} /> : <Dot color={c.red} />}
                  <Text style={[styles.matchText, { color: matches ? c.green : c.red }]}>{matches ? 'Passwords match' : "Doesn't match yet"}</Text>
                </View>
              )}
            </PasswordField>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          {!!formError && <Text style={styles.formError}>{formError}</Text>}
          <Pressable
            onPress={submit}
            disabled={!valid || saving}
            style={({ pressed }) => [styles.button, (!valid || saving) && styles.buttonOff, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || saving, busy: saving }}
          >
            {saving ? <ActivityIndicator color={theme.isDark ? '#0B1B3A' : '#FFFFFF'} /> : <Text style={styles.buttonText}>Update password</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
