/**
 * Role names as shown to people - a label only. The backend role (and every permission check,
 * which compares the real name) is unchanged.
 *
 * The "Personal Assistant" role is shown as "Sales Manager" (asked for by management). It stays a
 * separate role from the real `sales_manager` one, with its own permissions.
 */
const SHOWN_AS: Record<string, string> = {
  'personal assistant': 'Sales Manager',
};

/** The label for a role, or the role itself when it has no other label. */
export function showRole(role: string | null | undefined): string {
  if (!role) return '';
  return SHOWN_AS[role.toLowerCase().trim()] ?? role;
}
