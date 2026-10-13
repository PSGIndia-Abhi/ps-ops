import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CrmNewCommercialLeadScreen } from '../../crm/screens/CrmNewCommercialLeadScreen';
import type { LeadStackParamList } from '../navigation';

/**
 * New Lead for the Lead Management roles: the production commercial form (industry, designation,
 * services, GPS location, photos) without its Residential tab. A saved lead opens on its details
 * page; one kept on the phone for lack of a connection has no server id yet, so the
 * form just closes (the CRM outbox sends it later).
 */
export function LeadNewCommercialScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  return (
    <CrmNewCommercialLeadScreen
      commercialOnly
      onCreated={(lead) => (lead.pendingSync ? navigation.goBack() : navigation.replace('LeadDetail', { leadId: lead.id }))}
    />
  );
}
