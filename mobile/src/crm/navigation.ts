import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type LeadFilter = 'all' | 'paid' | 'pending';

/** Exactly five bottom items; "NewLead" is the raised centre action and never renders a screen (it opens the CrmNewLead form). */
export type CrmTabParamList = {
  Home: undefined;
  /** `at` changes on every navigation so re-opening with the same filter still re-applies it. */
  Leads: { filter?: LeadFilter; at?: number } | undefined;
  NewLead: undefined;
  Payments: undefined;
  More: undefined;
};

export type CrmStackParamList = {
  CrmTabs: NavigatorScreenParams<CrmTabParamList> | undefined;
  CrmNewLead: undefined;
  CrmLeadDetail: { leadId: string };
  /** Shown right after saving; `note` explains anything the rep should still do (e.g. payment pending). */
  CrmLeadSaved: { leadId: string; note?: string };
};

/** Navigation prop for a tab screen that can also push the CRM stack's screens. */
export type CrmTabScreenNav<T extends keyof CrmTabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<CrmTabParamList, T>,
  NativeStackNavigationProp<CrmStackParamList>
>;
