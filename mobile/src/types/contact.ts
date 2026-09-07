/** Mirrors GET /api/contacts exactly (backend/src/routes/contacts.routes.js). */
export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company_id: string | null;
  company_name: string | null;
  company_code: string | null;
  company_type: string | null;
  company_site: string | null;
  group_name: string | null;
  user_id: string | number | null;
  invite_status: string | null;
}
