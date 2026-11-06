import type { NavigatorScreenParams } from '@react-navigation/native';

export type FeedbackTabParamList = {
  /** The month at a glance: tiles and the calls that need attention. */
  Home: undefined;
  /** The calls - one per site. `status` opens it on that filter (from Home's tiles); `at` makes a repeat tap count. */
  Calls: { status?: string; at?: number } | undefined;
  /** The tickets this user raised. */
  Tickets: undefined;
  /** Requests for the right number (after a wrong number) and the numbers the coordinator added. */
  Requests: undefined;
  /** How the month (or dates) went: progress, every status, tickets. */
  Insights: undefined;
};

export type FeedbackStackParamList = {
  FeedbackTabs: NavigatorScreenParams<FeedbackTabParamList> | undefined;
  /** A site's call for the month: call the customer, ask the questions, raise a ticket, follow up. */
  FeedbackCall: { callId: string };
  FeedbackTicket: { ticketId: string };
  /** Opened from the avatar on Home. */
  Profile: undefined;
};
