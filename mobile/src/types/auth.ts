/**
 * Shapes mirror the ACTUAL backend contracts verified in
 * backend/src/routes/auth.routes.js — nothing here is invented.
 */

/** The set of roles that currently exist in the `roles` table / role UI. */
export type UserRole =
  | 'admin'
  | 'branch_admin'
  | 'supervisor'
  | 'technician'
  | 'client'
  | 'telecaller'
  | (string & {});

/** Response body of POST /api/auth/login */
export interface LoginResponse {
  token: string;
  role: UserRole;
  user_id?: number | string;
  contact_id?: number | string;
}

/**
 * Response body of GET /api/auth/me - verified against the actual handler
 * (backend/src/routes/auth.routes.js `router.get("/me", ...)`). Note this
 * endpoint does NOT return a `permissions` array - permission checks happen
 * server-side per request, not by the client reading a cached list.
 */
export interface CurrentUser {
  id: number | string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  is_active?: boolean;
  created_at?: string;
  contact_id?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  branch?: { id: string; name: string | null } | null;
  branch_admin?: {
    id: number | string;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  contact_name?: string | null;
  site_id?: string | null;
  company_site?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  company_code?: string | null;
  [key: string]: unknown;
}

export interface AuthSession {
  token: string;
  role: UserRole;
  userId?: string;
  contactId?: string;
}
