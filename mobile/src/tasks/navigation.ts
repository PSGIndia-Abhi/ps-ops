import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ListMode } from './format';

export type TaskTabParamList = {
  Home: undefined;
  /** `q` pre-fills the search (e.g. a person's name from Insights' Team workload). */
  Tasks: { mode?: ListMode; q?: string; at?: number } | undefined;
  /** Centre "+" slot - never shown; tapping it opens NewTask. */
  NewTaskTab: undefined;
  Schedule: undefined;
  Insights: undefined;
};

export type TaskStackParamList = {
  TaskTabs: NavigatorScreenParams<TaskTabParamList> | undefined;
  TaskDetail: { taskId: string };
  /** `editId` opens the form in edit mode; `date` pre-fills the due date (from Calendar). */
  NewTask: { editId?: string; date?: string } | undefined;
  TaskCreated: { taskId: string; occurrences?: number };
  Reassign: { taskId: string };
  Reschedule: { taskId: string };
  /** Opened from the avatar on Home (was the "More" tab). */
  Profile: undefined;
  /** Opened from the bell on Home. */
  Notifications: undefined;
};
