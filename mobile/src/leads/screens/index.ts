import type React from 'react';
import type { LeadStackParamList } from '../navigation';
import {
  LeadCallScreen,
  LeadCloseScreen,
  LeadConvertScreen,
  LeadFeedbackScreen,
  LeadFollowUpScreen,
  LeadMeetingNewScreen,
  LeadQuoteScreen,
} from './LeadActionScreens';
import { LeadListScreen } from './LeadBrowseScreens';
import { LeadTasksScreen } from './LeadTodayScreen';
import { LeadDetailScreen } from './LeadDetailScreen';
import { LeadNewCommercialScreen } from './LeadNewCommercialScreen';
import { LeadNotificationsScreen } from './LeadNotificationsScreen';
import { LeadProfileScreen } from './LeadProfileScreen';
import { LeadWorkScreen } from './LeadWorkScreen';
import { MeetingScreen, MeetingsScreen } from './MeetingScreens';
import { ReminderEditScreen, RemindersScreen } from './RemindersScreens';
import { PerformanceScreen } from './ReportScreens';
import { ResidentialLeadsScreen } from './ResidentialLeadsScreen';
import { TeamVisitsScreen } from './TeamVisitsScreen';

/**
 * Every pushed lead screen, in one list, so the two navigators that host them
 * (LeadsNavigator and CrmNavigator) register exactly the same set.
 */
export const LEAD_STACK_SCREENS: {
  name: keyof LeadStackParamList;
  component: React.ComponentType;
  /** Forms slide up like the CRM's New Lead form. */
  modal?: boolean;
}[] = [
  { name: 'LeadDetail', component: LeadDetailScreen },
  { name: 'LeadWork', component: LeadWorkScreen },
  { name: 'LeadList', component: LeadListScreen },
  // The production commercial form (see LeadNewCommercialScreen).
  { name: 'LeadNew', component: LeadNewCommercialScreen, modal: true },
  { name: 'LeadCall', component: LeadCallScreen, modal: true },
  { name: 'LeadMeetingNew', component: LeadMeetingNewScreen, modal: true },
  { name: 'LeadFollowUp', component: LeadFollowUpScreen, modal: true },
  { name: 'LeadClose', component: LeadCloseScreen, modal: true },
  { name: 'LeadConvert', component: LeadConvertScreen, modal: true },
  { name: 'LeadQuote', component: LeadQuoteScreen, modal: true },
  { name: 'LeadFeedback', component: LeadFeedbackScreen, modal: true },
  { name: 'LeadMeetings', component: MeetingsScreen },
  { name: 'LeadMeeting', component: MeetingScreen },
  { name: 'LeadTasks', component: LeadTasksScreen },
  { name: 'LeadPerformance', component: PerformanceScreen },
  { name: 'LeadNotifications', component: LeadNotificationsScreen },
  { name: 'LeadProfile', component: LeadProfileScreen },
  { name: 'LeadTeamVisits', component: TeamVisitsScreen },
  { name: 'LeadResidential', component: ResidentialLeadsScreen },
  { name: 'LeadReminders', component: RemindersScreen },
  { name: 'LeadReminderEdit', component: ReminderEditScreen, modal: true },
];
