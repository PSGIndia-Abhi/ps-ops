import { httpClient } from './httpClient';
import type { Contact } from '../types/contact';

/** GET /api/contacts - requires VIEW_CONTACT. Branch-scoped for supervisor/branch_admin server-side. */
export async function listContacts(): Promise<Contact[]> {
  const { data } = await httpClient.get<Contact[]>('/api/contacts');
  return data;
}
