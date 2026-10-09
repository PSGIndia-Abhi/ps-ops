import type { NavigatorScreenParams } from '@react-navigation/native';
import type { StageGroup } from './stage';
import type { PipelineStage } from './types';

/**
 * The lead screens that get pushed onto a stack. Registered in two places -
 * LeadsNavigator (telecaller / sales manager) and CrmNavigator (sales
 * executive) - so every route name here is prefixed "Lead" to stay clear of
 * the CRM stack's own names.
 */
export type LeadStackParamList = {
  LeadWork: { leadId: string };
  LeadList: { group?: StageGroup } | undefined;
  LeadNew: undefined;
  /** `canQualify`: the lead is at a stage where the call can also mark it genuine / not genuine. */
  LeadCall: { leadId: string; name: string; contact: string; stage: PipelineStage; canQualify: boolean };
  LeadMeetingNew: { leadId: string; name: string; address: string };
  LeadFollowUp: { leadId: string; name: string };
  LeadClose: { leadId: string; name: string; mode: 'reject' | 'lost' };
  LeadConvert: { leadId: string; name: string };
  /** `amount` pre-fills the total with the lead's approximate quote. */
  LeadQuote: { leadId: string; name: string; amount: number };
  LeadFeedback: { leadId: string; name: string };
  LeadMeetings: undefined;
  LeadMeeting: { meetingId: string };
  LeadTasks: undefined;
  /** No employeeId = the signed-in user's own numbers. */
  LeadPerformance: { employeeId?: number; name?: string } | undefined;
};

/** "NewLeadTab" is the raised centre action and never renders a screen (it opens LeadNew). */
export type LeadTabParamList = {
  Home: undefined;
  /** `at` changes on every navigation so re-opening with the same group still re-applies it. */
  Leads: { group?: StageGroup; at?: number } | undefined;
  NewLeadTab: undefined;
  Tasks: undefined;
  Team: undefined;
  More: undefined;
};

export type LeadRootStackParamList = {
  LeadTabs: NavigatorScreenParams<LeadTabParamList> | undefined;
} & LeadStackParamList;
