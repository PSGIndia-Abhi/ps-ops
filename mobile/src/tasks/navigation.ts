import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ListMode } from './format';

export type TaskTabParamList = {
  Home: undefined;
  Tasks: { mode?: ListMode } | undefined;
  Schedule: undefined;
  Profile: undefined;
};

export type TaskStackParamList = {
  TaskTabs: NavigatorScreenParams<TaskTabParamList> | undefined;
  TaskDetail: { taskId: string };
  /** `editId` opens the form in edit mode; `date` pre-fills the due date (from Schedule). */
  NewTask: { editId?: string; date?: string } | undefined;
};
