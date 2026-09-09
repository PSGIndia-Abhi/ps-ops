import { httpClient } from './httpClient';
import type { DashboardSummary } from '../types/dashboard';

/** GET /api/dashboard/summary - requires VIEW_ANALYTICS. */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await httpClient.get<DashboardSummary>('/api/dashboard/summary');
  return data;
}
