import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SparkleIcon } from '../../components/icons';
import { GlossyBadge } from '../../components/GlossyBadge';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { LeadWash } from '../../leads/ui';
import { ScreenHeader } from '../../tasks/ui/parts';
import { spacing, typography } from '../../theme';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  title: { ...typography.title, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  wrap: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.xl, gap: spacing.sm },
  heading: { ...typography.subtitle, color: t.textPrimary, marginTop: spacing.sm },
  sub: { ...typography.body, color: t.textMuted, textAlign: 'center' as const },
});

/** Stand-in for a client screen that is still being built (tab: big title; pushed: back header). */
export function ClientComingSoonScreen({ title, pushed }: { title: string; pushed?: boolean }) {
  const { styles } = useCrmStyles(factory);
  const navigation = useNavigation();
  return (
    <View style={styles.screen}>
      <LeadWash />
      <SafeAreaView edges={['top']}>
        {pushed ? <ScreenHeader title={title} onBack={() => navigation.goBack()} /> : <Text style={styles.title}>{title}</Text>}
      </SafeAreaView>
      <View style={styles.wrap}>
        <GlossyBadge color="#2563EB" size={64} icon={<SparkleIcon size={28} color="#fff" />} />
        <Text style={styles.heading}>Coming soon</Text>
        <Text style={styles.sub}>{title} will be available here shortly.</Text>
      </View>
    </View>
  );
}

export const ClientComplaintsPlaceholder = () => <ClientComingSoonScreen title="Complaints" />;
export const ClientRequestPlaceholder = () => <ClientComingSoonScreen title="Request a Service" pushed />;
export const ClientDocumentsPlaceholder = () => <ClientComingSoonScreen title="Documents" pushed />;
export const ClientAuditsPlaceholder = () => <ClientComingSoonScreen title="Audit Reports" pushed />;
export const ClientOutletsPlaceholder = () => <ClientComingSoonScreen title="Outlets" pushed />;
