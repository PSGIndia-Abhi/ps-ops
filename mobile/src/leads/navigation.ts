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
  /** A tap on a lead opens this first: details, contact buttons, then Manage lead / Follow-up. */
  LeadDetail: { leadId: string };
  LeadWork: { leadId: string };
  LeadList: { group?: StageGroup } | undefined;
  LeadNew: undefined;
  /** `canQualify`: the lead is at a stage where the call can also mark it genuine / not genuine. */
  LeadCall: { leadId: string; name: string; contact: string; stage: PipelineStage; canQualify: boolean };
  LeadMeetingNew: { leadId: string; name: string; address: string };
  /** Move a meeting to a new date and time (with a reason and an optional reminder). */
  LeadMeetingReschedule: { meetingId: string; title: string; date: string; time: string };
  /** `taskId`: change that one follow-up (date, time, note) - else the lead's follow-ups + add a new one. */
  LeadFollowUp: { leadId: string; name: string; taskId?: string };
  /** One lead's follow-ups (like the web's follow-up page): the open ones and their history. */
  LeadFollowUpHistory: { leadId: string; name: string; number: string | null; phone: string; leadType?: 'commercial' | 'consumer' };
  /** The Follow-ups screen pushed from More - the Residential app's (residential leads' follow-ups). */
  LeadFollowUpsList: { leadType: 'consumer' };
  /** Sales manager: give the lead to a sales executive, a telecaller or themselves. */
  LeadAssign: { leadId: string; name: string; salesId: string | null; telecallerId: string | null };
  /** Residential lead: log a call and set the next one. */
  LeadResidentialCall: { leadId: string; name: string };
  /** Residential lead: it became a customer. `amount` pre-fills the final amount. */
  LeadResidentialConvert: { leadId: string; name: string; amount: number };
  LeadClose: { leadId: string; name: string; mode: 'reject' | 'lost' };
  LeadConvert: { leadId: string; name: string };
  /** `amount` pre-fills the total with the lead's approximate quote. */
  LeadQuote: { leadId: string; name: string; amount: number };
  /** Build a quotation from the quotation master (services, plans, prices, terms) - the PDF is made by the server. */
  /** `fromId` + `mode`: open a saved quotation - "edit" saves a replacement, "duplicate" a new one. */
  LeadQuoteBuild: { leadId: string; name: string; fromId?: string; mode?: 'edit' | 'duplicate' };
  LeadFeedback: { leadId: string; name: string };
  LeadMeetings: undefined;
  LeadMeeting: { meetingId: string };
  LeadTasks: undefined;
  /** Everything that will ring for me: my reminders, meetings, follow-ups. */
  LeadReminders: undefined;
  /** Change the reminder set on a follow-up / meeting / task (`parentTaskId` = that task). */
  LeadReminderTime: { parentTaskId: string; title: string; date: string; time: string | null };
  /** New reminder (optionally for a lead), or edit one (taskId). */
  LeadReminderEdit: { taskId?: string; leadId?: string; leadName?: string } | undefined;
  /** Sales manager: the team's numbers (and their targets). */
  LeadTeam: undefined;
  /** Sales manager: one day's visits by the team, with start / end times and GPS. */
  LeadTeamVisits: undefined;
  /** Sales manager: residential (home-service) leads, read-only. */
  LeadResidential: undefined;
  /** More -> Profile in the sales apps (CRM and Lead Management). */
  LeadProfile: undefined;
  /** The bell on Home: lead notifications, newest first. */
  LeadNotifications: undefined;
  /** No employeeId = the signed-in user's own numbers. */
  LeadPerformance: { employeeId?: number; name?: string } | undefined;
  /** The records behind one number of a performance report (a tapped tile). */
  LeadPerformanceItems: {
    metric: import('./api').PerformanceMetric;
    label: string;
    from: string;
    to: string;
    employeeId?: number;
    /** Whose numbers - shown under the title. */
    name: string;
    periodLabel: string;
  };
};

/** "NewLeadTab" is the raised centre action and never renders a screen (it opens LeadNew). */
export type LeadTabParamList = {
  Home: undefined;
  /** `at` changes on every navigation so re-opening with the same group still re-applies it. */
  Leads: { group?: StageGroup; at?: number } | undefined;
  NewLeadTab: undefined;
  Tasks: undefined;
  More: undefined;
};

export type LeadRootStackParamList = {
  LeadTabs: NavigatorScreenParams<LeadTabParamList> | undefined;
  /** The residential lead's details and its edit form - the CRM's own screens. */
  CrmLeadDetail: { leadId: string };
  CrmNewLead: { editLeadId?: string } | undefined;
  /** Edit a commercial lead's details (allowed until it is converted to a customer). */
  CrmNewCommercialLead: { editLeadId?: string } | undefined;
} & LeadStackParamList;
