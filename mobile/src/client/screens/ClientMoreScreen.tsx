import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import {
  ChevronRightIcon,
  DocumentIcon,
  EmailIcon,
  LockIcon,
  LogoutIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  ShieldIcon,
} from '../../components/icons';
import { APP_VERSION } from '../../config/appVersion';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { initials } from '../../tasks/format';
import { avatarColor } from '../../tasks/theme';
import { Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { useClientPortal } from '../ClientPortalContext';
import { SUPPORT_CONTACT, plural } from '../format';
import type { ClientStackParamList } from '../navigation';
import { ClientPage, SOFT, TONES, type ToneKey } from '../ui/page';

type Nav = NavigationProp<ClientStackParamList & AuthenticatedStackParamList>;

const factory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingBottom: spacing.xxxl },
  profile: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.xs, padding: spacing.md, borderRadius: 20, backgroundColor: SOFT(t) },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 20 },
  name: { ...typography.subtitle, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  chip: { alignSelf: 'flex-start' as const, marginTop: 6, backgroundColor: TONES.blue.bg, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 2 },
  chipText: { ...typography.caption, fontSize: 11, fontWeight: '700' as const, color: TONES.blue.fg },
  label: { ...typography.overline, color: t.textMuted, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.xxs },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.lg },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowLabel: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  danger: { color: TONES.red.fg },
  version: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xl },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
});

interface Item {
  key: string;
  label: string;
  sub?: string;
  tone: ToneKey;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
}

/** The "More" tab: the portal's other sections, account and support, sign out. */
export function ClientMoreScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const { logout } = useAuth();
  const { portal, companyName, isCompanyAdmin, outlets } = useClientPortal();
  const [confirmOut, setConfirmOut] = useState(false);
  const name = portal?.user?.name || 'Client';

  const groups: { label: string; items: Item[] }[] = [
    {
      label: 'SERVICES',
      items: [
        { key: 'request', label: 'Request a service', sub: 'Book a visit for your outlet', tone: 'blue', Icon: PlusIcon, onPress: () => navigation.navigate('ClientRequestService') },
        { key: 'outlets', label: 'Outlets', sub: plural(outlets.length, 'outlet'), tone: 'teal', Icon: PinIcon, onPress: () => navigation.navigate('ClientOutlets') },
      ],
    },
    {
      label: 'RECORDS',
      items: [
        { key: 'documents', label: 'Documents', sub: 'Certificates, reports and invoices', tone: 'violet', Icon: DocumentIcon, onPress: () => navigation.navigate('ClientDocuments') },
        { key: 'audits', label: 'Audit reports', sub: 'Hygiene and pest audits', tone: 'green', Icon: ShieldIcon, onPress: () => navigation.navigate('ClientAudits') },
      ],
    },
    {
      label: 'ACCOUNT',
      items: [
        { key: 'profile', label: 'Profile', sub: 'Your details and access', tone: 'indigo', Icon: PersonIcon, onPress: () => navigation.navigate('ClientProfile') },
        { key: 'password', label: 'Change password', tone: 'rose', Icon: LockIcon, onPress: () => navigation.navigate('ChangePassword') },
      ],
    },
    {
      label: 'HELP',
      items: [
        { key: 'call', label: 'Call support', sub: SUPPORT_CONTACT.phoneDisplay, tone: 'orange', Icon: PhoneIcon, onPress: () => Linking.openURL(`tel:${SUPPORT_CONTACT.phone}`) },
        { key: 'mail', label: 'Email support', sub: SUPPORT_CONTACT.email, tone: 'blue', Icon: EmailIcon, onPress: () => Linking.openURL(`mailto:${SUPPORT_CONTACT.email}`) },
      ],
    },
  ];

  return (
    <ClientPage title="More">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => navigation.navigate('ClientProfile')} style={({ pressed }) => [styles.profile, pressed && styles.pressed]} accessibilityRole="button">
          <View style={[styles.avatar, { backgroundColor: avatarColor(portal?.user?.id ?? name) }]}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {companyName}
            </Text>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{isCompanyAdmin ? 'Company admin' : 'Outlet user'}</Text>
            </View>
          </View>
          <ChevronRightIcon size={18} color={theme.textMuted} />
        </Pressable>

        {groups.map((g) => (
          <View key={g.label}>
            <Text style={styles.label}>{g.label}</Text>
            {g.items.map((item) => (
              <Pressable key={item.key} onPress={item.onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
                <View style={[styles.circle, { backgroundColor: TONES[item.tone].bg }]}>
                  <item.Icon size={19} color={TONES[item.tone].fg} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {!!item.sub && <Text style={styles.rowSub}>{item.sub}</Text>}
                </View>
                <ChevronRightIcon size={16} color={theme.textMuted} />
              </Pressable>
            ))}
          </View>
        ))}

        <Text style={styles.label}> </Text>
        <Pressable onPress={() => setConfirmOut(true)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
          <View style={[styles.circle, { backgroundColor: TONES.red.bg }]}>
            <LogoutIcon size={19} color={TONES.red.fg} />
          </View>
          <Text style={[styles.rowLabel, styles.danger, styles.flex1]}>Log out</Text>
        </Pressable>
        <Text style={styles.version}>BestServe · v{APP_VERSION}</Text>
      </ScrollView>

      <Sheet visible={confirmOut} onClose={() => setConfirmOut(false)} title="Log out?">
        <Text style={styles.sheetText}>You will need your login ID and password to sign in again.</Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setConfirmOut(false)} style={styles.flex1} />
          <PrimaryButton
            label="Log out"
            variant="brand"
            onPress={() => {
              setConfirmOut(false);
              logout();
            }}
            style={styles.flex1}
          />
        </View>
      </Sheet>
    </ClientPage>
  );
}
