import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { GlossyBadge } from '../../components/GlossyBadge';
import {
  ChevronRightIcon,
  DocumentIcon,
  LockIcon,
  LogoutIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  ShieldIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { LeadWash } from '../../leads/ui';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { Avatar } from '../../tasks/ui/parts';
import { Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { APP_VERSION } from '../../config/appVersion';
import { useClientPortal } from '../ClientPortalContext';
import { SUPPORT_CONTACT, plural } from '../format';
import type { ClientStackParamList } from '../navigation';

type Nav = NavigationProp<ClientStackParamList & AuthenticatedStackParamList>;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: t.textPrimary, marginBottom: spacing.md, paddingHorizontal: 4 },
  profile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    backgroundColor: t.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...t.cardShadow,
  },
  flex: { flex: 1 },
  name: { ...typography.subtitle, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  chip: { alignSelf: 'flex-start' as const, marginTop: 6, backgroundColor: t.primarySoftBg, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipText: { ...typography.overline, fontSize: 10, color: t.primary },
  label: { ...typography.overline, color: t.textMuted, marginBottom: spacing.xs, paddingHorizontal: 4 },
  group: {
    backgroundColor: t.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
    ...t.cardShadow,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 62, paddingHorizontal: spacing.md, gap: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowLabel: { ...typography.bodyMedium, color: t.textPrimary },
  rowSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  rowLabelDanger: { color: t.dangerText },
  pressed: { opacity: 0.7 },
  version: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.sm },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
});

interface Item {
  key: string;
  label: string;
  sub?: string;
  color: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
}

/** The "More" tab: the web portal's other sections, account and support, sign out. */
export function ClientMoreScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const { logout } = useAuth();
  const { portal, companyName, isCompanyAdmin, outlets } = useClientPortal();
  const [confirmOut, setConfirmOut] = useState(false);

  const groups: { label: string; items: Item[] }[] = [
    {
      label: 'SERVICES',
      items: [
        { key: 'request', label: 'Request a Service', sub: 'Book a visit for your outlet', color: '#2563EB', Icon: PlusIcon, onPress: () => navigation.navigate('ClientRequestService') },
        { key: 'outlets', label: 'Outlets', sub: plural(outlets.length, 'outlet'), color: '#0891B2', Icon: PinIcon, onPress: () => navigation.navigate('ClientOutlets') },
      ],
    },
    {
      label: 'RECORDS',
      items: [
        { key: 'documents', label: 'Documents', sub: 'Certificates, reports and files', color: '#7C3AED', Icon: DocumentIcon, onPress: () => navigation.navigate('ClientDocuments') },
        { key: 'audits', label: 'Audit Reports', sub: 'Hygiene and pest audits', color: '#16A34A', Icon: ShieldIcon, onPress: () => navigation.navigate('ClientAudits') },
      ],
    },
    {
      label: 'ACCOUNT',
      items: [
        { key: 'profile', label: 'Profile', sub: 'Your details and access', color: '#4F46E5', Icon: PersonIcon, onPress: () => navigation.navigate('ClientProfile') },
        { key: 'password', label: 'Change password', color: '#DB2777', Icon: LockIcon, onPress: () => navigation.navigate('ChangePassword') },
        { key: 'support', label: 'Call support', sub: SUPPORT_CONTACT.phoneDisplay, color: '#EA580C', Icon: PhoneIcon, onPress: () => Linking.openURL(`tel:${SUPPORT_CONTACT.phone}`) },
      ],
    },
  ];

  return (
    <View style={styles.screen}>
      <LeadWash />
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>More</Text>
          <Pressable onPress={() => navigation.navigate('ClientProfile')} style={({ pressed }) => [styles.profile, pressed && styles.pressed]} accessibilityRole="button">
            <Avatar name={portal?.user?.name} id={portal?.user?.id} size={56} />
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {portal?.user?.name || 'Client'}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {companyName}
              </Text>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{isCompanyAdmin ? 'COMPANY ADMIN' : 'OUTLET USER'}</Text>
              </View>
            </View>
            <ChevronRightIcon size={18} color={theme.textMuted} />
          </Pressable>

          {groups.map((g) => (
            <View key={g.label}>
              <Text style={styles.label}>{g.label}</Text>
              <View style={styles.group}>
                {g.items.map((item, i) => (
                  <Pressable
                    key={item.key}
                    onPress={item.onPress}
                    style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <GlossyBadge color={item.color} size={38} icon={<item.Icon size={18} color="#fff" />} />
                    <View style={styles.flex}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      {!!item.sub && <Text style={styles.rowSub}>{item.sub}</Text>}
                    </View>
                    <ChevronRightIcon size={16} color={theme.textMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.group}>
            <Pressable onPress={() => setConfirmOut(true)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
              <GlossyBadge color="#DC2626" size={38} icon={<LogoutIcon size={18} color="#fff" />} />
              <Text style={[styles.rowLabel, styles.rowLabelDanger, styles.flex]}>Log out</Text>
            </Pressable>
          </View>
          <Text style={styles.version}>BestServe · v{APP_VERSION}</Text>
        </ScrollView>
      </SafeAreaView>

      <Sheet visible={confirmOut} onClose={() => setConfirmOut(false)} title="Log out?">
        <Text style={styles.sheetText}>You will need your login ID and password to sign in again.</Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setConfirmOut(false)} style={styles.flex} />
          <PrimaryButton
            label="Log out"
            variant="brand"
            onPress={() => {
              setConfirmOut(false);
              logout();
            }}
            style={styles.flex}
          />
        </View>
      </Sheet>
    </View>
  );
}
