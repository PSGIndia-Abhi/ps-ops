import { httpClient } from './httpClient';
import type { TeamMember } from '../types/team';

/**
 * GET /api/users?role= - requires VIEW_USER. The actual source the real web
 * app's assignment modal uses for admin's supervisor/technician pickers
 * (frontend/src/components/AssignWorkOrderModal.jsx), rather than the
 * grouped /api/teams/overview shape - flat lists are what that UX needs.
 */
export async function listUsersByRole(role: 'supervisor' | 'technician'): Promise<TeamMember[]> {
  const { data } = await httpClient.get<TeamMember[]>('/api/users', { params: { role } });
  return data;
}
