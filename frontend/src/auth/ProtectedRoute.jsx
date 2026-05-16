// import { Navigate } from "react-router-dom";

// export default function ProtectedRoute({ children, allowedRoles }) {
//   const role = localStorage.getItem("role");
//   const token = localStorage.getItem("token");

//   if (!token) {
//     return <Navigate to="/login" replace />;
//   }

//   if (!allowedRoles.includes(role)) {
//     return <Navigate to="/" replace />;
//   }

//   return children;
// }


import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRoles }) {

  const role = localStorage.getItem("role");
  const token = localStorage.getItem("token");

  // not logged in
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // role not allowed
  if (!allowedRoles.includes(role)) {

    switch (role) {
      case "admin":
        return <Navigate to="/admin" replace />;
      case "supervisor":
        return <Navigate to="/supervisor" replace />;
      case "technician":
        return <Navigate to="/technician" replace />;
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
