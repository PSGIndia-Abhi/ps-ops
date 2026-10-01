// Who may open the TaskPro (task management) area.
//
// This is only a client-side gate — it decides what the UI shows, never
// what the server allows (the real work-tasks API enforces its own rules
// regardless of this list). Kept in one place, and mirrored by ROLE_HOME
// in auth/roleBasePath.js so a role that can open TaskPro also lands there
// on login.
export const TASKPRO_ROLES = [
  // Deliberately NOT "admin" — admin manages the whole app from /admin and
  // should never be bounced into TaskPro, including by typing /taskpro
  // directly. "branch_admin" is unaffected (not asked for).
  "branch_admin",
  "Managing Director",
  "Personal Assistant",
  "Technical Head",
  "Technical Lead",
  "Technical Team",
  "Marketing Head",
  "Marketing Executive",
  "Sales Head",
  "Sales Executive",
  "Operations Head",
  "Operations Manager",
  "Service Coordinator",
  "Quality Head",
  "Accounts Head",
  "Accounts Executive",
  "Collection Executive",
  "Admin Executive",
];

export const TASKPRO_HOME = "/taskpro";
