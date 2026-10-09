import { useAuth } from './AuthContext';

/**
 * The roles this mobile app has a dedicated dashboard for. Anything else
 * (client, telecaller, or a future role) falls back to the generic Profile
 * screen rather than crashing or guessing - see RootNavigator.
 */
export type AppRole =
  | 'admin'
  | 'branch_admin'
  | 'supervisor'
  | 'technician'
  | 'sales'
  | 'marketing';

const KNOWN_ROLES: AppRole[] = [
  'admin',
  'branch_admin',
  'supervisor',
  'technician',
  'sales',
  'marketing',
];

/** The two roles that get the CRM app instead of the field-service tabs. */
export function isCrmRole(role: AppRole | null): boolean {
  return role === 'sales' || role === 'marketing';
}

/**
 * The real org-hierarchy designations that land in Task Management - the
 * exact list the web app routes to /taskpro on login (frontend/src/auth/
 * roleBasePath.js ROLE_HOME, frontend/src/pages/taskpro/access.js). These
 * are role names as stored (e.g. "Managing Director"), not AppRoles, so
 * they're matched on the raw role string. Deliberately NOT "supervisor" -
 * same reason as on the web (that name belongs to the field-service panel).
 */
const TASK_ROLES = [
  'Managing Director',
  'Personal Assistant',
  'Technical Head',
  'Technical Lead',
  'Technical Team',
  'Marketing Head',
  'Marketing Executive',
  'Sales Head',
  'Sales Executive',
  'Operations Head',
  'Operations Manager',
  'Service Coordinator',
  'Quality Head',
  'Accounts Head',
  'Accounts Executive',
  'Collection Executive',
  'Admin Executive',
].map((r) => r.toLowerCase());

export function isTaskRole(role: string | null | undefined): boolean {
  return !!role && TASK_ROLES.includes(role.toLowerCase().trim());
}

/**
 * Task Management roles that also work in the Sales (CRM) app and switch between the two without
 * signing out. They see every lead, not only their own - the backend grants these two roles the
 * CRM permissions plus CRM_VIEW_ALL_LEADS.
 */
const SALES_SWITCH_ROLES = ['managing director', 'personal assistant'];

export function canSwitchToSales(role: string | null | undefined): boolean {
  return !!role && SALES_SWITCH_ROLES.includes(role.toLowerCase().trim());
}

/**
 * The accountant opens in Task Management too, and switches to Payment Reminders (the mobile
 * part of the web's Accountant Panel) and back without signing out.
 */
export function isAccountantRole(role: string | null | undefined): boolean {
  return !!role && role.toLowerCase().trim() === 'accountant';
}

/** The signed-in user's role exactly as the backend sent it (no normalizing). */
export function useRawRole(): string | null {
  const { user, session } = useAuth();
  return (user?.role ?? session?.role ?? null) as string | null;
}

export function normalizeRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;
  const lower = role.toLowerCase().trim();
  return (KNOWN_ROLES as string[]).includes(lower) ? (lower as AppRole) : null;
}

/**
 * Role detection is derived from the existing session/user data
 * (AuthContext's `session.role`, backed by the login response, with
 * `user.role` from GET /api/auth/me as the source of truth once it's
 * loaded) - nothing new is fetched or hard-coded, and no role is assumed
 * when neither is available yet.
 */
export function useUserRole(): AppRole | null {
  const { user, session } = useAuth();
  return normalizeRole(user?.role ?? session?.role ?? null);
}

export function roleLabel(role: AppRole): string {
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'branch_admin':
      return 'Branch Admin';
    case 'supervisor':
      return 'Supervisor';
    case 'technician':
      return 'Technician';
    case 'sales':
      return 'Sales';
    case 'marketing':
      return 'Marketing';
    default:
      return role;
  }
}
