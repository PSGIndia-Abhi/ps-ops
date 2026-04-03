// src/auth/roleBasePath.js
export const roleBasePath = role => {
  switch (role) {
    case "admin":
      return "/admin";
    case "supervisor":
      return "/supervisor";
    case "technician":
      return "/technician";
    case "branch_admin":
      return "/admin";
    default:
      return "/login";
    case "client":
      return "/client";
  }
};
