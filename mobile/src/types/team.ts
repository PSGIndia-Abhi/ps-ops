/**
 * Mirrors GET /api/teams/my/team, GET /api/teams/:supervisorId,
 * GET /api/teams/overview, and GET /api/shifts/technicians
 * (backend/src/routes/teams.routes.js, backend/src/routes/shifts.routes.js).
 */

export interface TeamMember {
  id: string | number;
  name: string;
  role: string;
  email?: string;
  branch_id?: string | null;
  branch_name?: string | null;
}

export interface SupervisorWithTeam extends TeamMember {
  technicians: TeamMember[];
}

export interface TeamOverview {
  supervisors: SupervisorWithTeam[];
  unassignedTechnicians: TeamMember[];
}

/** One entry of GET /api/shifts/technicians's `online` array. */
export interface OnlineTechnicianShift {
  technician_id: string | number;
  name: string;
  online: true;
  started_at: string;
  location: { latitude: number; longitude: number } | null;
}

/** One entry of GET /api/shifts/technicians's `offline` array. */
export interface OfflineTechnicianShift {
  technician_id: string | number;
  name: string;
  online: false;
  last_shift_end: string | null;
}

export type TechnicianShiftStatus = OnlineTechnicianShift | OfflineTechnicianShift;

export interface ShiftTechniciansResponse {
  online: OnlineTechnicianShift[];
  offline: OfflineTechnicianShift[];
}
