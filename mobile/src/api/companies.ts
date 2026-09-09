import { httpClient } from './httpClient';
import type { Company, CreateCompanyInput } from '../types/company';

/** GET /api/companies - requires VIEW_CONTACT. */
export async function listCompanies(groupId?: string): Promise<Company[]> {
  const { data } = await httpClient.get<Company[]>('/api/companies', {
    params: groupId ? { group_id: groupId } : undefined,
  });
  return data;
}

/**
 * POST /api/companies - requires CREATE_CONTACT (a real backend naming
 * quirk - company creation shares the same permission as contact creation,
 * not a mobile-side mistake).
 *
 * Note: the backend has no PATCH/PUT for companies, and neither does the
 * existing web app (frontend/src/pages/AdminCompanies.jsx only lists,
 * creates, and uploads a logo) - editing/deactivating a company is not
 * implemented anywhere in the system, so it isn't invented here either.
 */
export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const { data } = await httpClient.post<Company>('/api/companies', input);
  return data;
}
