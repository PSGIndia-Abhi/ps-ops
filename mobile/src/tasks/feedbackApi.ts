import { httpClient } from '../api/httpClient';

// Employee feedback - the Managing Director's private notes on their team (Task Management).
// The server refuses everyone else; the app only shows the way in to the Managing Director.

export const FEEDBACK_ROLE = 'Managing Director';

export interface FeedbackEntry {
  id: string;
  employee_id: number;
  employee_name: string;
  feedback_type: string;
  comments: string;
  rating: number;
  created_at: string;
  updated_at: string | null;
}

export interface FeedbackInput {
  employee_id: number;
  feedback_type: string;
  comments: string;
  rating: number;
}

/** Newest first; `employeeId` narrows it to one person. */
export async function listFeedback(employeeId?: number): Promise<FeedbackEntry[]> {
  const { data } = await httpClient.get<FeedbackEntry[]>('/api/employee-feedback', { params: { employee_id: employeeId } });
  return data.map((e) => ({ ...e, employee_id: Number(e.employee_id), rating: Number(e.rating) }));
}

/** Types used before - offered as chips on the form (like the task type). */
export async function feedbackTypes(): Promise<string[]> {
  const { data } = await httpClient.get<string[]>('/api/employee-feedback/types');
  return data;
}

export async function createFeedback(input: FeedbackInput): Promise<FeedbackEntry> {
  const { data } = await httpClient.post<FeedbackEntry>('/api/employee-feedback', input);
  return data;
}

export async function updateFeedback(id: string, input: FeedbackInput): Promise<FeedbackEntry> {
  const { data } = await httpClient.put<FeedbackEntry>(`/api/employee-feedback/${id}`, input);
  return data;
}

export async function deleteFeedback(id: string): Promise<void> {
  await httpClient.delete(`/api/employee-feedback/${id}`);
}
