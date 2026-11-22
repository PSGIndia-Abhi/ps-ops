/**
 * Role names as shown to people - a label only. The backend role (and every permission check,
 * which compares the real name) is unchanged. Admin user-management screens keep the real name.
 *
 * The "Personal Assistant" role is shown as "Sales Manager" (asked for by management). It stays a
 * separate role from the real `sales_manager` one, with its own permissions.
 */
const SHOWN_AS = {
  "personal assistant": "Sales Manager",
};

/** The label for a role, or the role itself when it has no other label. */
export function showRole(role) {
  if (!role) return "";
  return SHOWN_AS[String(role).toLowerCase().trim()] ?? role;
}
