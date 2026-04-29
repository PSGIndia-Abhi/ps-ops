import { createBrowserRouter } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTeamManagement from "./pages/AdminTeamManagement";
import AdminCompanies from "./pages/AdminCompanies";
import AdminBranches from "./pages/AdminBranches";
import MapView from "./pages/MapView";
import JobPage from "./pages/JobPage";
import BookingsPage from "./pages/BookingsPage";
import SupervisorDashboard from "./pages/SupervisorDashboard";
import TechnicianDashboard from "./pages/TechnicianDashboard";
import SupervisorTeamMonitor from "./pages/SupervisorTeamMonitor";
import Login from "./pages/Login";
import Signup from "./pages/signup";
import AuthRedirect from "./auth/AuthRedirect";
import Terms from "./pages/terms";
import ProtectedRoute from "./auth/ProtectedRoute";
import SupervisorLayout from "./layouts/SupervisorLayout";
import TechnicianLayout from "./layouts/TechnicianLayout";
import ClientDashboard from "./pages/ClientDashboard";
import ClientLayout from "./layouts/ClientLayout";
import ClientJobsPage from "./pages/ClientJobsPage";
import ClientJobUpdates from "./pages/ClientJobUpdates";
import ClientTickets from "./pages/ClientTickets";
import ProfilePage from "./pages/ProfilePage";
import AcceptInvite from "./pages/AcceptInvite";
import SiteContactsPage from "./pages/SiteContactsPage";
import AdminTickets from "./pages/AdminTickets";
import ContactsPage from "./pages/ContactsPage";

if (typeof window !== "undefined") {
  window._0xA13H1 = () => {
    console.log(atob("QnVpbHQgYnkgQWJoaSDigJQgbGF0ZSBuaWdodHMgJiBkZWRpY2F0aW9uIPCfjJk="));
  };
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthRedirect />,
  },

  {
    path: "/terms",
    element: <Terms />,
  },

  {
    path: "/signup",
    element: <Signup />,
  },


  // -------------------------
  // ADMIN (protected)
  // -------------------------
  {
    path: "/admin",
    element: (
      <ProtectedRoute allowedRoles={["admin", "branch_admin"]}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: "team", element: <AdminTeamManagement /> },
      { path: "companies", element: <AdminCompanies /> },
      { path: "branches", element: <AdminBranches /> },
      { path: "map", element: <MapView /> },
      { path: "jobs/:jobId", element: <JobPage /> },
      { path: "bookings", element: <BookingsPage /> },
      { path: "sites/:siteId/contacts", element: <SiteContactsPage /> },
      { path: "tickets", element: <AdminTickets /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "contacts", element: <ContactsPage /> },
      { path: "contacts/:contactId", element: <ContactsPage /> }
    ],
  },

  // -------------------------
  // SUPERVISOR (protected)
  // -------------------------
  {
    path: "/supervisor",
    element: (
      <ProtectedRoute allowedRoles={["supervisor"]}>
        <SupervisorLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <SupervisorDashboard /> },
      { path: "team", element: <SupervisorTeamMonitor /> },
      { path: "map", element: <MapView /> },
      { path: "jobs/:jobId", element: <JobPage /> },
      { path: "bookings", element: <BookingsPage /> },
      { path: "sites/:siteId/contacts", element: <SiteContactsPage /> },
      { path: "tickets", element: <AdminTickets /> },
      { path: "profile", element: <ProfilePage /> }
    ],
  },

  // -------------------------
  // TECHNICIAN (protected)
  // -------------------------
  {
    path: "/technician",
    element: (
      <ProtectedRoute allowedRoles={["technician"]}>
        <TechnicianLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <TechnicianDashboard /> },
      { path: "jobs/:jobId", element: <JobPage /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },

  // -------------------------
  //Client  ROUTES
  // -------------------------
  {
    path: "/client",
    element: (
      <ProtectedRoute allowedRoles={["client"]}>
        <ClientLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ClientDashboard /> },
      { path: "jobs", element: <ClientJobsPage /> },
      { path: "jobs/:jobId", element: <ClientJobUpdates /> },
      { path: "tickets", element: <ClientTickets /> },
      { path: "profile", element: <ProfilePage /> }
    ]
  },

  {
    path: "/login",
    element: <Login />,
  },

  {
    path: "/invite/:token",
    element: <AcceptInvite />,
  },


]);

export default router;
