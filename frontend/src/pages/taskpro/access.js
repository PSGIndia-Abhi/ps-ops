// Who may open the TaskPro (task management) area.
//
// Kept in one place on purpose: roles & permissions are decided later, and
// then this list (and the login redirect in auth/roleBasePath.js) is the only
// thing to change.
export const TASKPRO_ROLES = ["admin", "branch_admin"];

export const TASKPRO_HOME = "/taskpro";
