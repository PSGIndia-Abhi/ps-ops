import { httpClient } from './httpClient';
import type { ShiftTechniciansResponse, TeamMember, TeamOverview } from '../types/team';

/** GET /api/teams/my/team - requires VIEW_USER. A supervisor's own technicians. */
export async function listMyTeam(): Promise<TeamMember[]> {
  const { data } = await httpClient.get<TeamMember[]>('/api/teams/my/team');
  return data;
}

/** GET /api/teams/overview - requires VIEW_USER. Org-wide supervisors + their technicians (admin use). */
export async function getTeamOverview(): Promise<TeamOverview> {
  const { data } = await httpClient.get<TeamOverview>('/api/teams/overview');
  return data;
}

/**
 * GET /api/shifts/technicians - requires only auth (no extra permission).
 * Used to cross-reference a team roster with genuine on/off-shift status -
 * never fabricated, always this real endpoint.
 */
export async function getShiftStatusByTechnician(): Promise<ShiftTechniciansResponse> {
  const { data } = await httpClient.get<ShiftTechniciansResponse>('/api/shifts/technicians');
  return data;
}
