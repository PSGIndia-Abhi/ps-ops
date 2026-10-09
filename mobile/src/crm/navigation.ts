import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { LeadStackParamList } from '../leads/navigation';
import type { LeadType } from './types';

export type LeadFilter = 'all' | 'paid' | 'pending';

/** Exactly five bottom items; "NewLead" is the raised centre action and never renders a screen (it opens the CrmNewLead form). */
export type CrmTabParamList = {
  Home: undefined;
  /** `at` changes on every navigation so re-opening with the same filter still re-applies it. */
  Leads: { filter?: LeadFilter; kind?: LeadType; at?: number } | undefined;
  NewLead: undefined;
  Payments: undefined;
  More: undefined;
};

export type CrmStackParamList = {
  CrmTabs: NavigatorScreenParams<CrmTabParamList> | undefined;
  CrmNewLead: undefined;
  /** The commercial lead form (company, quote, photos - no payment). */
  CrmNewCommercialLead: undefined;
  CrmLeadDetail: { leadId: string };
  /** Shown right after saving; `note` explains anything the rep should still do (e.g. payment pending). */
  CrmLeadSaved: { leadId: string; note?: string };
  // The Lead Management screens (meetings, follow-ups, pipeline) are pushed onto this same stack.
} & LeadStackParamList;

/** Navigation prop for a tab screen that can also push the CRM stack's screens. */
export type CrmTabScreenNav<T extends keyof CrmTabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<CrmTabParamList, T>,
  NativeStackNavigationProp<CrmStackParamList>
>;
