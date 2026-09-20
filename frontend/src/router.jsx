import { createBrowserRouter, Navigate } from "react-router-dom";
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
import TemporaryAccessLogin from "./pages/TemporaryAccessLogin";
import Signup from "./pages/signup";
import AuthRedirect from "./auth/AuthRedirect";
import Terms from "./pages/terms";
import ProtectedRoute from "./auth/ProtectedRoute";
import SupervisorLayout from "./layouts/SupervisorLayout";
import TechnicianLayout from "./layouts/TechnicianLayout";
import ClientDashboard from "./pages/ClientDashboard";
import ClientLayout from "./layouts/ClientLayout";
import AccountantLayout from "./layouts/AccountantLayout";
import AccountantPlaceholder from "./pages/AccountantPlaceholder";
import AccountantDashboard from "./pages/accountant/AccountantDashboard";
import UploadInvoice from "./pages/accountant/UploadInvoice";
import ReviewImport from "./pages/accountant/ReviewImport";
import InvoiceList from "./pages/accountant/InvoiceList";
import InvoiceDetails from "./pages/accountant/InvoiceDetails";
import TaskManagement from "./pages/accountant/TaskManagement";
import RecordPayment from "./pages/accountant/RecordPayment";
import PaymentTracking from "./pages/accountant/PaymentTracking";
import Outstanding from "./pages/accountant/Outstanding";
import PaymentList from "./pages/accountant/PaymentList";
import CustomerOutstanding from "./pages/accountant/CustomerOutstanding";
import ClientJobsPage from "./pages/ClientJobsPage";
import ClientJobUpdates from "./pages/ClientJobUpdates";
import ClientTickets from "./pages/ClientTickets";
import ProfilePage from "./pages/ProfilePage";
import AcceptInvite from "./pages/AcceptInvite";
import SiteContactsPage from "./pages/SiteContactsPage";
import AdminTickets from "./pages/AdminTickets";
import ContactsPage from "./pages/ContactsPage";
import TemporaryWorkerHome from "./pages/TemporaryWorkerHome";
import TrackingHistory from "./pages/TrackingHistory";
import AdminAnalysis from "./pages/AdminAnalysis";
import AnalysisDataPage from "./pages/AnalysisDataPage";
import UpcomingCalendarPage from "./pages/UpcomingCalendarPage";
import AdminUserManagement from "./pages/AdminUserManagement";
import AdminGroupManagement from "./pages/AdminGroupManagement";
import InvoicesPage from "./pages/InvoicesPage";
import PaymentsPage from "./pages/PaymentsPage";
import TasksPage from "./pages/TasksPage";

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
      { path: "analysis", element: <AdminAnalysis /> },
      { path: "analysis/upcoming-calendar", element: <UpcomingCalendarPage /> },
      { path: "analysis/:dataset", element: <AnalysisDataPage /> },
      { path: "team", element: <AdminTeamManagement /> },
      { path: "user-management", element: <AdminUserManagement /> },
      { path: "group-management", element: <AdminGroupManagement /> },
      { path: "companies", element: <AdminCompanies /> },
      { path: "branches", element: <AdminBranches /> },
      { path: "map", element: <MapView /> },
      { path: "jobs/:jobId", element: <JobPage /> },
      { path: "bookings", element: <BookingsPage /> },
      { path: "sites/:siteId/contacts", element: <SiteContactsPage /> },
      { path: "tickets", element: <AdminTickets /> },
      { path: "invoices", element: <InvoicesPage /> },
      { path: "payments", element: <PaymentsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "contacts", element: <ContactsPage /> },
      { path: "contacts/:contactId", element: <ContactsPage /> },
      { path: "tracking/history/:technicianId", element: <TrackingHistory />}
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

  // -------------------------
  // ACCOUNTANT (protected)
  // -------------------------
  {
    path: "/accountant",
    element: (
      <ProtectedRoute allowedRoles={["accountant"]}>
        <AccountantLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AccountantDashboard /> },
      { path: "invoices", element: <Navigate to="/accountant/invoices/list" replace /> },
      { path: "invoices/upload", element: <UploadInvoice /> },
      { path: "invoices/review", element: <ReviewImport /> },
      { path: "invoices/list", element: <InvoiceList /> },
      { path: "invoices/:invoiceId", element: <InvoiceDetails /> },
      { path: "invoices/tracking", element: <PaymentTracking /> },
      { path: "invoices/outstanding", element: <Outstanding /> },
      { path: "payments", element: <Navigate to="/accountant/payments/list" replace /> },
      { path: "payments/record", element: <RecordPayment /> },
      { path: "payments/list", element: <PaymentList /> },
      { path: "payments/pending", element: <AccountantPlaceholder title="Payment Pending" /> },
      { path: "payments/customer-outstanding", element: <CustomerOutstanding /> },
      { path: "tasks", element: <TaskManagement /> },
      { path: "settings", element: <AccountantPlaceholder title="Settings" /> },
    ],
  },

  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/temp-access",
    element: <TemporaryAccessLogin />,
  },
  {
    path: "/temp",
    element: (
      <ProtectedRoute allowedRoles={["temporary_worker"]}>
        <TemporaryWorkerHome />
      </ProtectedRoute>
    ),
  },
  {
    path: "/temp/jobs/:jobId",
    element: (
      <ProtectedRoute allowedRoles={["temporary_worker"]}>
        <JobPage />
      </ProtectedRoute>
    ),
  },

  {
    path: "/invite/:token",
    element: <AcceptInvite />,
  },


]);

export default router;
