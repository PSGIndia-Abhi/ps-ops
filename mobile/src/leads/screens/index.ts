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
import { LeadListScreen, LeadTasksScreen } from './LeadBrowseScreens';
import { LeadNewScreen } from './LeadNewScreen';
import { LeadWorkScreen } from './LeadWorkScreen';
import { MeetingScreen, MeetingsScreen } from './MeetingScreens';
import { PerformanceScreen } from './ReportScreens';

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
  { name: 'LeadWork', component: LeadWorkScreen },
  { name: 'LeadList', component: LeadListScreen },
  { name: 'LeadNew', component: LeadNewScreen, modal: true },
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
];
