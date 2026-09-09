import { httpClient } from './httpClient';
import type { Site, CreateSiteInput } from '../types/site';

/**
 * GET /api/sites - requires VIEW_CONTACT. Non-admins are auto-scoped to
 * their branch server-side (403 if no branch assigned) - the client just
 * renders what comes back.
 */
export async function listSites(companyId?: string): Promise<Site[]> {
  const { data } = await httpClient.get<Site[]>('/api/sites', {
    params: companyId ? { company_id: companyId } : undefined,
  });
  return data;
}

/**
 * POST /api/sites - requires CREATE_CONTACT. No PATCH/PUT exists on the
 * backend (nor in the web app) - editing a site isn't implemented anywhere,
 * so it isn't invented here either.
 */
export async function createSite(input: CreateSiteInput): Promise<Site> {
  const { data } = await httpClient.post<Site>('/api/sites', input);
  return data;
}
