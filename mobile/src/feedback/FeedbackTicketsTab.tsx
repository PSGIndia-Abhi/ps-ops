import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCrmTheme } from '../crm/theme';
import { ClipboardListIcon } from '../crm/ui/crmIcons';
import { FeedbackProvider } from './FeedbackContext';
import type { FeedbackStackParamList } from './navigation';
import { FeedbackProfileScreen } from './screens/FeedbackProfileScreen';
import { FeedbackTicketScreen } from './screens/FeedbackTicketScreen';
import { FeedbackTicketsScreen } from './screens/FeedbackTicketsScreen';

/**
 * Customer Feedback "Tickets" as a tab inside the app a person already uses (Task Management, Lead
 * Management, Reminders, the supervisor app), for those who only work tickets: a department's team
 * (e.g. Accounts - FEEDBACK_DEPT) and the supervisors / salespeople a ticket's next step is assigned
 * to (FEEDBACK_ASSIGNED). They see their tickets, update them and mark their part done; the collector
 * sees it on the ticket and calls the customer back. RoleTabs says whether to show it.
 */
export { TicketsTabContext, useTicketsTab, type TicketsTab } from './ticketsTabContext';
import { TicketsBackContext } from './ticketsTabContext';

/** The permissions that only give tickets (anything else opens the full Customer Feedback app). */
export const TICKETS_ONLY = ['FEEDBACK_DEPT', 'FEEDBACK_ASSIGNED'];

export const ticketsTabIcon = ({ color, size }: { color: string; size: number }) => <ClipboardListIcon size={size} color={color} />;

const Stack = createNativeStackNavigator<FeedbackStackParamList>();

export function FeedbackTicketsTab() {
  const theme = useCrmTheme();
  return (
    <FeedbackProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        {/* The list sits where the Feedback app's tabs would; it opens a ticket on top. */}
        <Stack.Screen name="FeedbackTabs" component={FeedbackTicketsScreen} />
        <Stack.Screen name="FeedbackTicket" component={FeedbackTicketScreen} />
        <Stack.Screen name="Profile" component={FeedbackProfileScreen} />
      </Stack.Navigator>
    </FeedbackProvider>
  );
}

/** The same tickets as a page pushed from More (sales, accountants): the list gets a back arrow. */
export function FeedbackTicketsPage({ navigation }: { navigation: { goBack: () => void } }) {
  return (
    <TicketsBackContext.Provider value={() => navigation.goBack()}>
      <FeedbackTicketsTab />
    </TicketsBackContext.Provider>
  );
}
