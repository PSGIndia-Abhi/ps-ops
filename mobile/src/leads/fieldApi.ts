import { httpClient } from '../api/httpClient';
import type { Coords, Meeting } from './types';
import { getMeeting } from './api';

/**
 * Sales Executive Field Tracking - the executive's field day (shift) and unplanned visits.
 * Contracts match backend/src/routes/sales-field-tracking.routes.js and
 * POST /api/crm/leads/:id/unplanned-visit in crm-lead-meetings.routes.js.
 * Punching in / out at a booked meeting is the existing meeting check-in / complete.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

export type ShiftStatus = 'ACTIVE' | 'ENDED' | 'AUTO_ENDED';

export interface FieldShift {
  id: string;
  status: ShiftStatus;
  /** Wall-clock 'YYYY-MM-DD HH:MM:SS'. */
  startedAt: string;
  endedAt: string | null;
}

function toShift(row: Row): FieldShift {
  return {
    id: str(row.id),
    status: str(row.status) as ShiftStatus,
    startedAt: str(row.started_at),
    endedAt: strOrNull(row.ended_at),
  };
}

/** GET /api/field-tracking/shift/current - the open shift, or null. */
export async function currentShift(): Promise<FieldShift | null> {
  const { data } = await httpClient.get<{ shift: Row | null }>('/api/field-tracking/shift/current');
  return data.shift ? toShift(data.shift) : null;
}

/** POST /shift/start - location is required. Returns the already-open shift if there is one. */
export async function startShift(coords: Coords): Promise<FieldShift> {
  const { data } = await httpClient.post<{ shift: Row }>('/api/field-tracking/shift/start', {
    latitude: coords.lat,
    longitude: coords.lng,
  });
  return toShift(data.shift);
}

/** POST /shift/end - location is optional (the day can be closed with GPS unavailable). */
export async function endShift(coords: Coords | null): Promise<FieldShift> {
  const { data } = await httpClient.post<{ shift: Row }>(
    '/api/field-tracking/shift/end',
    coords ? { latitude: coords.lat, longitude: coords.lng } : {},
  );
  return toShift(data.shift);
}

export interface DaySummary {
  /** Shifts started that day, oldest first. */
  shifts: FieldShift[];
  gpsKm: number;
  visitCount: number;
  unplannedVisitCount: number;
  /** Meeting ids punched in that day that were unplanned visits. */
  unplannedMeetingIds: Set<string>;
}

/** GET /api/field-tracking/day/:userId?date= - the executive's own day (summary parts only). */
export async function myDay(userId: number, date: string): Promise<DaySummary> {
  const { data } = await httpClient.get<Row>(`/api/field-tracking/day/${userId}`, { params: { date } });
  const summary = (data.summary ?? {}) as Row;
  const visits = (data.visits ?? []) as Row[];
  return {
    shifts: ((data.shifts ?? []) as Row[]).map((s) => ({
      id: str(s.id),
      status: str(s.status) as ShiftStatus,
      startedAt: str(s.startedAt),
      endedAt: strOrNull(s.endedAt),
    })),
    gpsKm: Number(summary.gpsKm ?? 0),
    visitCount: Number(summary.visitCount ?? 0),
    unplannedVisitCount: Number(summary.unplannedVisitCount ?? 0),
    unplannedMeetingIds: new Set(visits.filter((v) => v.unplanned).map((v) => str(v.meetingId))),
  };
}

/**
 * POST /api/crm/leads/:id/unplanned-visit - at a client with no meeting booked: creates the
 * meeting and punches in. Coordinates are optional, like a normal check-in. If the executive
 * already has a booked meeting on that lead, the server checks in to that one instead.
 */
export async function unplannedVisit(leadId: string, coords: Coords | null, notes?: string): Promise<Meeting> {
  const { data } = await httpClient.post<Row>(`/api/crm/leads/${leadId}/unplanned-visit`, {
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    ...(notes ? { notes } : {}),
  });
  // The response is the raw meeting row; re-read it in the shape every other screen uses.
  return getMeeting(str(data.id));
}
