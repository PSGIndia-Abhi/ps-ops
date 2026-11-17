import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from '../../api/auth';
import { BuildingIcon, ChevronRightIcon, EmailIcon, LockIcon, PhoneIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmScreen, NoticeBanner } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { Avatar, ScreenHeader } from '../../tasks/ui/parts';
import { radii, spacing, typography } from '../../theme';
import { useClientPortal } from '../ClientPortalContext';
import { SUPPORT_CONTACT } from '../format';
import { ClientCard } from '../ui/parts';
import { LeadWash } from '../../leads/ui';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  profile: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, marginBottom: spacing.md },
  name: { ...typography.subtitle, color: t.textPrimary },
  email: { ...typography.caption, color: t.textMuted, marginBottom: 4 },
  field: { marginBottom: spacing.sm },
  readonly: { ...typography.caption, color: t.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.xs },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowIcon: { width: 32, height: 32, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted },
  pressed: { opacity: 0.7 },
});

/** Profile (web: PortalProfile) - personal details, password, which outlets this login sees, support. */
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

  return (
    <View style={styles.screen}>
      <LeadWash />
      <SafeAreaView edges={['top']}>
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
      </SafeAreaView>
      <CrmScreen edges={[]} transparent>
        <View style={styles.profile}>
          <Avatar name={portal?.user?.name} id={portal?.user?.id} size={56} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {portal?.user?.name || 'Your profile'}
            </Text>
            {!!portal?.user?.email && <Text style={styles.email}>{portal.user.email}</Text>}
            <StatusBadge label={isCompanyAdmin ? 'Company admin' : 'Outlet user'} tone="info" dot={false} />
          </View>
        </View>

        <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />
        {!!error && <CrmErrorBanner message={error} />}

        <ClientCard title="Personal details" subtitle="How our team will address and reach you">
          <View style={styles.field}>
            <CrmTextField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          </View>
          <View style={styles.field}>
            <CrmTextField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </View>
          <Text style={styles.readonly}>Login ID: {portal?.user?.email || '—'} (contact BestServe to change it)</Text>
          <PrimaryButton label="Save details" onPress={save} loading={saving} />
        </ClientCard>

        <ClientCard>
          <Pressable onPress={() => navigation.navigate('ChangePassword')} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.rowIcon}>
              <LockIcon size={16} color={theme.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Change password</Text>
              <Text style={styles.rowSub}>At least 6 characters</Text>
            </View>
            <ChevronRightIcon size={16} color={theme.textMuted} />
          </Pressable>
        </ClientCard>

        <ClientCard title="Your access" subtitle={isCompanyAdmin ? 'You can see every outlet of your company' : 'You can see these outlets'}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <BuildingIcon size={16} color={theme.primary} />
            </View>
            <Text style={[styles.rowTitle, styles.flex]}>{companyName}</Text>
          </View>
          {outlets.map((o) => (
            <View key={o.id} style={[styles.row, styles.rowDivider]}>
              <View style={styles.rowIcon}>
                <PinIcon size={16} color={theme.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{o.name || o.id}</Text>
                {!!o.city && <Text style={styles.rowSub}>{o.city}</Text>}
              </View>
            </View>
          ))}
        </ClientCard>

        <ClientCard title="Need help?" subtitle="Our support team is happy to help">
          <Pressable onPress={() => Linking.openURL(`tel:${SUPPORT_CONTACT.phone}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.rowIcon}>
              <PhoneIcon size={16} color={theme.primary} />
            </View>
            <Text style={[styles.rowTitle, styles.flex]}>{SUPPORT_CONTACT.phoneDisplay}</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(`mailto:${SUPPORT_CONTACT.email}`)}
            style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={styles.rowIcon}>
              <EmailIcon size={16} color={theme.primary} />
            </View>
            <Text style={[styles.rowTitle, styles.flex]}>{SUPPORT_CONTACT.email}</Text>
          </Pressable>
        </ClientCard>
      </CrmScreen>
    </View>
  );
}
