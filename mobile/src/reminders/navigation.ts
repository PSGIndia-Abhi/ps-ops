import type { NavigatorScreenParams } from '@react-navigation/native';

/** The tabs of the Reminders list (same as the web's Tasks & Reminders page, minus Repeating). */
export type ReminderListTab = 'ALL' | 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'COMPLETED';

export type ReminderTabParamList = {
  Home: undefined;
  /** `tab` opens the list on that tab (from Home's tiles); `at` makes a repeat tap count as new. */
  Reminders: { tab?: ReminderListTab; at?: number } | undefined;
  /** Centre "+" slot - never shown; tapping it opens CreateReminder. */
  NewReminderTab: undefined;
  Repeating: undefined;
  /** Never shown either; tapping it opens Profile. */
  ProfileTab: undefined;
};

export type ReminderStackParamList = {
  ReminderTabs: NavigatorScreenParams<ReminderTabParamList> | undefined;
  CreateReminder: undefined;
  ReminderDetail: { reminderId: string };
  /** Opened from the avatar on Home. */
  Profile: undefined;
};
