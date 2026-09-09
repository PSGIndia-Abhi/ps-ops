/** Mirrors GET/POST /api/sites exactly (backend/src/routes/sites.routes.js). */

export interface Site {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  company_id: string | null;
  company_name: string | null;
  company_code: string | null;
  company_type: string | null;
  group_id: string | null;
  group_name: string | null;
  latitude: number | null;
  longitude: number | null;
  provider_place_id: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface CreateSiteInput {
  company_id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  place_id?: string;
}
