/**
 * Shapes of the Task Management (TaskPro) API - mirrors what
 * backend/src/routes/work-tasks.routes.js and work-task-series.routes.js
 * actually return (TASK_COLUMNS in backend/src/utils/workTasks.js).
 * Calendar dates are plain 'YYYY-MM-DD' strings, times 'HH:MM:SS' or null.
 */

/** PAUSED: the assignee put a started task on hold (with a reason); it must be resumed before completing. */
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface WorkTask {
  id: string;
  series_id: string | null;
  title: string;
  description: string | null;
  task_type: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  source_module: string | null;
  source_id: string | null;
  assigned_to: number;
  assigned_to_name?: string | null;
  created_by: number;
  created_by_name?: string | null;
  due_date: string | null;
  due_time: string | null;
  next_action: string | null;
  next_action_date: string | null;
  started_at: string | null;
  started_by: number | null;
  /** When the current pause began (null unless PAUSED). */
  paused_at?: string | null;
  /** Total seconds spent paused so far, left out of "time worked". */
  paused_seconds?: number | null;
  completed_at: string | null;
  completed_by: number | null;
  completion_note: string | null;
  created_at: string;
  updated_at: string;
  is_overdue?: boolean;
  comment_count?: number;
  attachment_count?: number;
  /** The task's current PENDING ask to move the due date, if any (GET /:id only). */
  pending_reschedule_request?: RescheduleRequest | null;
  /** Same, as just an id (GET /api/work-tasks list) - lightweight signal for notification diffing. */
  pending_reschedule_request_id?: string | null;
}

export type RescheduleRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

/** A plain assignee's ask to move a task's due date, needing the creator's or their manager's approval. */
export interface RescheduleRequest {
  id: string;
  task_id: string;
  requested_by: number;
  requested_by_name: string | null;
  from_due_date: string | null;
  from_due_time: string | null;
  to_due_date: string;
  to_due_time: string | null;
  reason: string | null;
  status: RescheduleRequestStatus;
  decided_by: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  task_title: string;
  task_status: TaskStatus;
  task_priority: TaskPriority;
  assigned_to: number;
  assigned_to_name: string | null;
  task_created_by: number;
}

export interface TaskComment {
  id: string;
  comment: string;
  created_at: string;
  user_id: number;
  user_name: string;
}

export interface TaskAttachment {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
}

export interface TaskHistoryEntry {
  id: number;
  action: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  note: string | null;
  changed_at: string;
  changed_by: number | null;
  changed_by_name: string | null;
}

/** One entry of GET /api/users/me/team. */
export interface TeamMember {
  id: number;
  name: string;
  email?: string;
  role?: string;
  designation?: string | null;
  unit_name?: string | null;
  is_direct?: boolean;
}

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurrenceEnd = 'NEVER' | 'ON_DATE' | 'AFTER_COUNT';

export interface RecurrenceInput {
  frequency: RecurrenceFrequency;
  interval_value: number;
  start_date: string;
  time_of_day: string;
  end_type: RecurrenceEnd;
  days_of_week?: number[];
  day_of_month?: number;
  use_last_day_of_month?: boolean;
  /** "Nth weekday(s) of the month" (e.g. the 1st and 3rd Monday and Friday): 1-4 = First..Fourth, -1 = Last. Pairs with `days_of_week`. */
  month_week?: number[];
  month_of_year?: number;
  end_date?: string;
  end_count?: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  task_type?: string;
  priority: TaskPriority;
  assigned_to: number;
  due_date?: string;
  due_time?: string;
  recurrence?: RecurrenceInput;
}

export interface CreateSeriesResponse {
  success: boolean;
  series_id: string;
  occurrences_created: number;
  next_occurrence_date: string | null;
  tasks: WorkTask[];
}

export type SeriesStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface TaskSeries {
  id: string;
  title: string;
  status: SeriesStatus;
  pause_from: string | null;
  pause_until: string | null;
  assigned_to: number;
  assigned_to_name: string | null;
  created_by: number;
  recurrence: (RecurrenceInput & { days_of_week?: number[] | string | null }) | null;
  next_occurrence_date: string | null;
  occurrences: { id: string; due_date: string; due_time: string | null; status: TaskStatus }[];
}

/** One row of GET /api/work-task-series - flat (recurrence fields inline, not nested). */
export interface SeriesListItem {
  id: string;
  title: string;
  assigned_to: number;
  assigned_to_name: string | null;
  created_by: number;
  status: SeriesStatus;
  frequency: RecurrenceFrequency;
  interval_value: number;
  days_of_week: number[] | string | null;
  day_of_month: number | null;
  use_last_day_of_month: boolean | number;
  month_week: number[] | string | null;
  time_of_day: string;
  start_date: string;
  end_type: RecurrenceEnd;
  occurrences_created: number;
  next_occurrence_date: string | null;
}
