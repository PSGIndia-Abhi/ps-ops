/** Mirrors GET/POST /api/companies exactly (backend/src/routes/companies.routes.js). */

export type CompanyType = 'INDIVIDUAL' | 'CORPORATE' | 'RWA';

export interface Company {
  id: string;
  name: string;
  code: string | null;
  gst_number: string | null;
  type: CompanyType | null;
  is_active: boolean;
  group_id: string | null;
  group_name: string | null;
  logo_object_key: string | null;
  logo_file_name: string | null;
  logo_file_type: string | null;
  logo_url: string | null;
}

export interface CreateCompanyInput {
  group_id?: string | null;
  name: string;
  code?: string;
  gst_number?: string;
  type?: CompanyType;
}
