import { httpClient } from './httpClient';
import type { CurrentShift } from '../types/shift';

/** GET /api/shifts/current - requires VIEW_OWN_SHIFT. */
export async function getCurrentShift(): Promise<CurrentShift> {
  const { data } = await httpClient.get<CurrentShift>('/api/shifts/current');
  return data;
}

/** POST /api/shifts/start - requires START_SHIFT. The backend insists on the technician's location. */
export async function startShift(latitude: number, longitude: number): Promise<CurrentShift> {
  const { data } = await httpClient.post<CurrentShift>('/api/shifts/start', { latitude, longitude });
  return data;
}

/** POST /api/shifts/end - requires END_SHIFT. Returns the finished shift (with `ended_at`). */
export async function endShift(latitude: number, longitude: number): Promise<CurrentShift> {
  const { data } = await httpClient.post<CurrentShift>('/api/shifts/end', { latitude, longitude });
  return data;
}
