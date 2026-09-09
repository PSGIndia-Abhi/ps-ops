import { httpClient } from './httpClient';
import type { Group } from '../types/group';

/** GET /api/groups - requires VIEW_CONTACT. */
export async function listGroups(): Promise<Group[]> {
  const { data } = await httpClient.get<Group[]>('/api/groups');
  return data;
}

/** POST /api/groups - requires CREATE_CONTACT. Name only - no edit endpoint exists. */
export async function createGroup(name: string): Promise<Group> {
  const { data } = await httpClient.post<Group>('/api/groups', { name });
  return data;
}
