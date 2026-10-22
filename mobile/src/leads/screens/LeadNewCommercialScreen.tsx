import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CrmNewCommercialLeadScreen } from '../../crm/screens/CrmNewCommercialLeadScreen';
import type { LeadStackParamList } from '../navigation';
import { useMe } from '../ui';

/**
 * New Lead for the Lead Management roles: the production commercial form (industry, designation,
 * services, GPS location, photos) without its Residential tab - residential leads have their own
 * app (the switch). A saved lead opens on its details page; one kept on the phone for lack of a
 * connection has no server id yet, so the form just closes (the CRM outbox sends it later).
 */
export function LeadNewCommercialScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { persona, myIdNum } = useMe();
  return (
    <CrmNewCommercialLeadScreen
      commercialOnly
      // The sales manager decides who the lead goes to: a sales executive, a telecaller, or themselves.
      assign={persona === 'sales_manager' ? { myId: myIdNum } : undefined}
      onCreated={(lead) => (lead.pendingSync ? navigation.goBack() : navigation.replace('LeadDetail', { leadId: lead.id }))}
    />
  );
}
