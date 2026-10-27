// src/auth/roleBasePath.js

// Where each role's own panel lives. Roles are admin-configurable (Roles &
// Permissions can create any name — "Marketing Executive", "Tech Lead", ...)
// so this can never be an exhaustive list. Any role NOT listed here falls
// through to the generic self-service /staff panel instead of bouncing the
// user back to /login after a successful login — that silent bounce (a role
// with no entry here used to hit a "default: /login" case) is exactly what
// looked like "login doesn't work" for custom-role accounts.
export const ROLE_HOME = {
  admin: "/admin",
  branch_admin: "/admin",
  supervisor: "/supervisor",
  technician: "/technician",
  // The Accountant Panel belongs to "Collection Executive" (below); the old "accountant" role has no
  // panel of its own any more and falls through to /staff.
  client: "/client",
  temporary_worker: "/temp",
  staff: "/staff",

  // Lead Management (pages/leads). Each lands on /leads, which shows the
  // dashboard for that role: provider portal, telecaller or sales manager.
  lead_provider: "/leads",
  telecaller: "/leads",
  sales_manager: "/leads",
  // The sales executive works their leads, meetings and quotations there too.
  sales: "/leads",
  // The commercial sales executive ("Sales Executive", listed with the hierarchy roles
  // below) lands in Lead Management too, and opens Task Management from its sidebar.

  // The real org-hierarchy designations (see user_hierarchy / Roles &
  // Permissions) land in Task Management. Deliberately NOT "supervisor" —
  // that role name is shared with the existing, unrelated supervisor panel,
  // and most supervisor accounts have nothing to do with this hierarchy.
  "Managing Director": "/taskpro",
  "Personal Assistant": "/taskpro",
  "Technical Head": "/taskpro",
  "Technical Lead": "/taskpro",
  "Technical Team": "/taskpro",
  "Marketing Head": "/taskpro",
  "Marketing Executive": "/taskpro",
  "Sales Head": "/taskpro",
  "Sales Executive": "/leads",
  "Operations Head": "/taskpro",
  "Operations Manager": "/taskpro",
  "Service Coordinator": "/taskpro",
  "Quality Head": "/taskpro",
  "Accounts Head": "/taskpro",
  "Accounts Executive": "/taskpro",
  // Works in the Accountant Panel (payments); Task Management is a link from its sidebar.
  "Collection Executive": "/accountant",
  "Admin Executive": "/taskpro",

  // Brigade Group bookings, masters and analysis (pages/brigade).
  brigade_executive: "/brigade",
};

export const roleBasePath = (role) => ROLE_HOME[role] || "/staff";
