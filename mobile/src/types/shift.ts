/** Mirrors GET/POST /api/shifts/* (backend/src/routes/shifts.routes.js). */

export interface TechnicianShift {
  id: string;
  technician_id: string | number;
  started_at: string;
  ended_at: string | null;
  status: 'ACTIVE' | 'ENDED';
}

/** The visit the technician has running right now, if any (shown on the Shift screen so it is one tap away). */
export interface ShiftActiveVisit {
  id: string;
  job_id: string;
  visit_number: number;
  status: string;
  started_at: string | null;
  job_title: string;
}

export interface CurrentShift {
  active: boolean;
  shift: TechnicianShift | null;
  activeVisit?: ShiftActiveVisit | null;
}
