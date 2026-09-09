import { useAuth } from './AuthContext';

/**
 * The roles this mobile app has a dedicated dashboard for. Anything else
 * (client, telecaller, or a future role) falls back to the generic Profile
 * screen rather than crashing or guessing - see RootNavigator.
 */
export type AppRole = 'admin' | 'branch_admin' | 'supervisor' | 'technician';

const KNOWN_ROLES: AppRole[] = ['admin', 'branch_admin', 'supervisor', 'technician'];

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
    default:
      return role;
  }
}
