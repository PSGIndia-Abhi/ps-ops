import { Navigate } from "react-router-dom";
import { ROLE_HOME } from "./roleBasePath";

export default function ProtectedRoute({ children, allowedRoles }) {

  const role = localStorage.getItem("role");
  const token = localStorage.getItem("token");

  // not logged in
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const roleIsKnown = Object.prototype.hasOwnProperty.call(ROLE_HOME, role);

  // "*" marks the generic /staff panel: any role WITHOUT a dedicated home
  // (a custom role created via Roles & Permissions, e.g. "Marketing
  // Executive") belongs here. A role that DOES have a dedicated home is sent
  // there instead, even if it wandered onto this route.
  if (allowedRoles.includes("*")) {
    if (!roleIsKnown || role === "staff") return children;
    return <Navigate to={ROLE_HOME[role]} replace />;
  }

  // role not allowed here — send them to their own home instead of /login,
  // since they're already signed in
  if (!allowedRoles.includes(role)) {
    return <Navigate to={(roleIsKnown && ROLE_HOME[role]) || "/staff"} replace />;
    switch (role) {
      case "admin":
        return <Navigate to="/admin" replace />;
      case "supervisor":
        return <Navigate to="/supervisor" replace />;
      case "technician":
        return <Navigate to="/technician" replace />;
      case "accountant":
        return <Navigate to="/accountant" replace />;
      case "client":
        return <Navigate to="/client" replace />;
      case "branch_admin":
        return <Navigate to="/admin" replace />;
      case "temporary_worker":
        return <Navigate to="/temp" replace />;
      default:
        return <Navigate to="/login" replace />;
    }
  }

  return children;
}
