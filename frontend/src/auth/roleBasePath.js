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
  client: "/client",
  temporary_worker: "/temp",
  staff: "/staff",
};

export const roleBasePath = (role) => {
  switch (role) {
    case "admin":
      return "/admin";
    case "supervisor":
      return "/supervisor";
    case "technician":
      return "/technician";
    case "branch_admin":
      return "/admin";
    case "accountant":
      return "/accountant";
    case "client":
      return "/client";
    case "temporary_worker":
      return "/temp";
    default:
      return "/login";
  }
};
// export const roleBasePath = (role) => ROLE_HOME[role] || "/staff";
