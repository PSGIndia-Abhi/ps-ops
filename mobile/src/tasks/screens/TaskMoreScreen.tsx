import React from 'react';
import { Text } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { ChartIcon } from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { MenuGroup, MenuRow, SignOutButton } from '../../crm/screens/CrmMoreScreen';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmScreen } from '../../crm/ui/CrmScreen';
import { ClipboardListIcon } from '../../crm/ui/crmIcons';
import { useTicketsTab } from '../../feedback/ticketsTabContext';
import { spacing, typography } from '../../theme';
import type { TaskStackParamList } from '../navigation';

const factory = (t: CrmTheme) => ({
  title: { ...typography.display, color: t.textPrimary, marginBottom: spacing.md },
});

/**
 * Task Management's More tab, for people who also work Customer Feedback tickets (accountants and
 * others): Insights and Tickets in one place instead of a tab each, so the tab bar stays readable.
 */
export function TaskMoreScreen() {
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const { styles } = useCrmStyles(factory);
  const tickets = useTicketsTab();
  const { logout } = useAuth();
  return (
    <CrmScreen>
      <Text style={styles.title}>More</Text>
      <MenuGroup>
        <MenuRow
          icon={ClipboardListIcon}
          tone="danger"
          label="Tickets"
          hint={tickets.count ? `${tickets.count} waiting for you` : 'Customer feedback tickets for you'}
          onPress={() => navigation.navigate('FeedbackTickets')}
        />
        <MenuRow icon={ChartIcon} tone="success" label="Insights" hint="How your tasks are going" divider onPress={() => navigation.navigate('InsightsPage')} />
      </MenuGroup>
      <SignOutButton onPress={logout} />
    </CrmScreen>
  );
}
