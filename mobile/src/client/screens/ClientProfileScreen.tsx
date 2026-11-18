import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { updateProfile } from '../../api/auth';
import { BuildingIcon, ChevronRightIcon, LockIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, NoticeBanner } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { radii, spacing, typography } from '../../theme';
import { useClientPortal } from '../ClientPortalContext';
import { ClientPage, SOFT, TONES } from '../ui/page';

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center' as const, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { color: '#FFFFFF', fontWeight: '800' as const, fontSize: 28 },
  name: { ...typography.title, fontSize: 22, color: t.textPrimary, marginTop: spacing.md, textAlign: 'center' as const },
  email: { ...typography.body, color: t.textMuted, marginTop: 2 },
  chip: { marginTop: spacing.sm, backgroundColor: TONES.blue.bg, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 4 },
  chipText: { ...typography.captionMedium, fontSize: 12.5, color: TONES.blue.fg },
  banners: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: { ...typography.subtitle, fontSize: 18, color: t.textPrimary },
  sectionSub: { ...typography.caption, color: t.textMuted, marginTop: 1, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  readonly: { ...typography.caption, color: t.textMuted, marginBottom: spacing.md },
  save: { borderRadius: radii.pill },
  rule: { height: 8, backgroundColor: SOFT(t), marginTop: spacing.xl, opacity: t.isDark ? 1 : 0.6 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, minHeight: 60 },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
});

/** Profile (web: PortalProfile) - personal details, password, which outlets this login sees. */
export function ClientProfileScreen() {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { portal, companyName, isCompanyAdmin, outlets, reload } = useClientPortal();
  const [name, setName] = useState(portal?.user?.name || '');
  const [phone, setPhone] = useState(portal?.user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(portal?.user?.name || '');
    setPhone(portal?.user?.phone || '');
  }, [portal?.user?.name, portal?.user?.phone]);

  const changed = name.trim() !== (portal?.user?.name || '') || phone.trim() !== (portal?.user?.phone || '');

  const save = async () => {
    if (!name.trim()) return setError('Please enter your name.');
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Email is the sign-in ID; it is sent unchanged (as on the web).
      await updateProfile({ name: name.trim(), phone: phone.trim(), email: portal?.user?.email || undefined });
      setNotice('Your details were saved.');
      reload();
    } catch (err) {
      setError((err as Error).message || 'Could not save your details');
    } finally {
      setSaving(false);
    }
  };

  const displayName = portal?.user?.name || 'Your profile';

  return (
    <ClientPage title="Profile" back>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={[styles.avatar, { backgroundColor: avatarColor(portal?.user?.id ?? displayName) }]}>
              <Text style={styles.avatarText}>{initials(displayName)}</Text>
            </View>
            <Text style={styles.name}>{displayName}</Text>
            {!!portal?.user?.email && <Text style={styles.email}>{portal.user.email}</Text>}
            <View style={styles.chip}>
              <Text style={styles.chipText}>{isCompanyAdmin ? 'Company admin' : 'Outlet user'}</Text>
            </View>
          </View>

          {(!!notice || !!error) && (
            <View style={styles.banners}>
              <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />
              <CrmErrorBanner message={error} />
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal details</Text>
            <Text style={styles.sectionSub}>How our team will address and reach you</Text>
            <View style={styles.field}>
              <CrmTextField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
            </View>
            <View style={styles.field}>
              <CrmTextField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>
            <Text style={styles.readonly}>Login ID: {portal?.user?.email || '—'} · contact BestServe to change it</Text>
            <PrimaryButton label="Save details" onPress={save} loading={saving} disabled={saving || !changed} style={styles.save} />
          </View>

          <View style={styles.section}>
            <Pressable onPress={() => navigation.navigate('ChangePassword')} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
              <View style={[styles.circle, { backgroundColor: TONES.rose.bg }]}>
                <LockIcon size={18} color={TONES.rose.fg} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.rowTitle}>Change password</Text>
                <Text style={styles.rowSub}>At least 6 characters</Text>
              </View>
              <ChevronRightIcon size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <View style={styles.rule} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your access</Text>
            <Text style={styles.sectionSub}>{isCompanyAdmin ? 'You can see every outlet of your company' : 'You can see these outlets'}</Text>
            <View style={styles.row}>
              <View style={[styles.circle, { backgroundColor: TONES.indigo.bg }]}>
                <BuildingIcon size={18} color={TONES.indigo.fg} />
              </View>
              <Text style={[styles.rowTitle, styles.flex1]}>{companyName}</Text>
            </View>
            {outlets.map((o) => (
              <View key={o.id} style={styles.row}>
                <View style={[styles.circle, { backgroundColor: TONES.teal.bg }]}>
                  <PinIcon size={18} color={TONES.teal.fg} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowTitle}>{o.name || o.id}</Text>
                  {!!o.city && <Text style={styles.rowSub}>{o.city}</Text>}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ClientPage>
  );
}
