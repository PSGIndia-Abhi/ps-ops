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
import TdsSettings from "./pages/accountant/TdsSettings";
import FollowUpDetails from "./pages/accountant/FollowUpDetails";
import CustomerContactsPage from "./pages/accountant/CustomerContactsPage";
import ClientJobsPage from "./pages/ClientJobsPage";
import ClientJobUpdates from "./pages/ClientJobUpdates";
import ClientTickets from "./pages/ClientTickets";
import ProfilePage from "./pages/ProfilePage";
import AcceptInvite from "./pages/AcceptInvite";
import SiteContactsPage from "./pages/SiteContactsPage";
import AdminTickets from "./pages/AdminTickets";
import ContactsPage from "./pages/contactsPage";
import TemporaryWorkerHome from "./pages/TemporaryWorkerHome";
import TrackingHistory from "./pages/TrackingHistory";
import AdminAnalysis from "./pages/AdminAnalysis";
import AnalysisDataPage from "./pages/AnalysisDataPage";
import UpcomingCalendarPage from "./pages/UpcomingCalendarPage";
import AdminUserManagement from "./pages/AdminUserManagement";
import AdminGroupManagement from "./pages/AdminGroupManagement";
import AdminUserHierarchy from "./pages/AdminUserHierarchy";
import AdminDepartments from "./pages/AdminDepartments";
import AdminUserActivity from "./pages/AdminUserActivity";
import StaffLayout from "./layouts/StaffLayout";
// TaskPro (task management) — self-contained module, see pages/taskpro/
import TaskProLayout from "./pages/taskpro/TaskProLayout";
import TaskDashboard from "./pages/taskpro/TaskDashboard";
import TaskList from "./pages/taskpro/TaskList";
import TaskDetail from "./pages/taskpro/TaskDetail";
import TaskProRequests from "./pages/taskpro/RescheduleRequests";
import TaskProReports from "./pages/taskpro/TaskReports";
import TaskProProfile from "./pages/taskpro/TaskProfile";
import TaskProNotifications from "./pages/taskpro/Notifications";
import TaskProFeedback from "./pages/taskpro/Feedback";
import { ACCOUNTANT_PANEL_ROLES, TASKPRO_HOME, TASKPRO_ROLES } from "./pages/taskpro/access";
import LeadsLayout from "./pages/leads/LeadsLayout";
import LeadsHome from "./pages/leads/Home";
import LeadsList from "./pages/leads/LeadsList";
import LeadDetail from "./pages/leads/LeadDetail";
import ResidentialLeads from "./pages/leads/ResidentialLeads";
import { ResidentialDashboard, ResidentialLeadPage, ResidentialNewLead } from "./pages/leads/residential";
import { FollowUps, LeadFollowUps, Meetings, Providers, SubmitLead } from "./pages/leads/Pages";
import LeadsPerformance from "./pages/leads/Performance";
import LeadSources from "./pages/leads/LeadSources";
import QuoteMaster from "./pages/leads/QuoteMaster";
import TeamVisits from "./pages/leads/TeamVisits";
import LeadReminders from "./pages/leads/Reminders";
import { LEADS_HOME, LEADS_ROLES } from "./pages/leads/access";
import StaffHome from "./pages/StaffHome";
import InvoicesPage from "./pages/InvoicesPage";
import PaymentsPage from "./pages/PaymentsPage";
import TasksPage from "./pages/TasksPage";
// Brigade Executive module — see pages/brigade/
import BrigadeLayout from "./pages/brigade/BrigadeLayout";
import BrigadeDashboard from "./pages/brigade/BrigadeDashboard";
import BrigadeMasters from "./pages/brigade/BrigadeMasters";
import BrigadeBilling from "./pages/brigade/BrigadeBilling";
import BrigadePos from "./pages/brigade/BrigadePos";

if (typeof window !== "undefined") {
  window._0xA13H1 = () => {
    console.log(
      atob("QnVpbHQgYnkgQWJoaSDigJQgbGF0ZSBuaWdodHMgJiBkZWRpY2F0aW9uIPCfjJk="),
    );
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
      { path: "user-hierarchy", element: <AdminUserHierarchy /> },
      { path: "departments", element: <AdminDepartments /> },
      { path: "user-activity", element: <AdminUserActivity /> },
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
      { path: "tracking/history/:technicianId", element: <TrackingHistory /> },
    ],
  },

  // -------------------------
  // BRIGADE EXECUTIVE (protected) — Brigade Group only (scoped by the backend)
  // -------------------------
  {
    path: "/brigade",
    element: (
      <ProtectedRoute allowedRoles={["brigade_executive"]}>
        <BrigadeLayout />
      </ProtectedRoute>
    ),
    children: [
      // Jobs (same dashboard as admin, limited to Brigade Group by the backend) + Flats view.
      { index: true, element: <BrigadeDashboard /> },
      { path: "companies", element: <AdminCompanies /> },
      { path: "group-management", element: <AdminGroupManagement /> },
      { path: "contacts", element: <ContactsPage /> },
      { path: "contacts/:contactId", element: <ContactsPage /> },
      { path: "masters", element: <BrigadeMasters /> },
      { path: "pos", element: <BrigadePos /> },
      { path: "billing", element: <BrigadeBilling /> },
      { path: "jobs/:jobId", element: <JobPage /> },
      { path: "profile", element: <ProfilePage /> },
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
      { path: "profile", element: <ProfilePage /> },
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
      { path: "profile", element: <ProfilePage /> },
    ],
  },

  // -------------------------
  // STAFF ROUTES — the generic panel for people placed in the org hierarchy
  // under any role that has no dedicated panel of its own (roles are
  // admin-configurable via Roles & Permissions, so this can be any name —
  // "Marketing Executive", "Tech Lead", the seeded "staff" role, ...).
  // allowedRoles={["*"]} is ProtectedRoute's catch-all for exactly that.
  // -------------------------
  {
    path: "/staff",
    element: (
      <ProtectedRoute allowedRoles={["*"]}>
        <StaffLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <StaffHome /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
  // ACCOUNTANT (protected)
  // -------------------------
  {
    path: "/accountant",
    element: (
      <ProtectedRoute allowedRoles={ACCOUNTANT_PANEL_ROLES}>
        <AccountantLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AccountantDashboard /> },
      {
        path: "invoices",
        element: <Navigate to="/accountant/invoices/list" replace />,
      },
      { path: "invoices/upload", element: <UploadInvoice /> },
      { path: "invoices/review", element: <ReviewImport /> },
      { path: "invoices/list", element: <InvoiceList /> },
      { path: "invoices/:invoiceId", element: <InvoiceDetails /> },
      { path: "invoices/tracking", element: <PaymentTracking /> },
      { path: "invoices/outstanding", element: <Outstanding /> },
      {
        path: "payments",
        element: <Navigate to="/accountant/payments/list" replace />,
      },
      { path: "payments/record", element: <RecordPayment /> },
      { path: "payments/list", element: <PaymentList /> },
      {
        path: "payments/pending",
        element: <AccountantPlaceholder title="Payment Pending" />,
      },
      {
        path: "payments/customer-outstanding",
        element: <CustomerOutstanding />,
      },
      { path: "tasks", element: <TaskManagement /> },
      { path: "follow-ups/:taskId", element: <FollowUpDetails /> },
      { path: "contacts", element: <CustomerContactsPage /> },
      { path: "settings", element: <TdsSettings /> },
    ],
  },

  // LEADS — lead management: provider portal, telecaller, sales and sales manager
  // dashboards (protected; roles in pages/leads/access.js). The index page shows
  // the dashboard that matches the signed-in role.
  // -------------------------
  {
    path: LEADS_HOME,
    element: (
      <ProtectedRoute allowedRoles={LEADS_ROLES}>
        <LeadsLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <LeadsHome /> },
      { path: "submit", element: <SubmitLead /> },
      { path: "all", element: <LeadsList /> },
      { path: "team-visits", element: <TeamVisits /> },
      { path: "reminders", element: <LeadReminders /> },
      { path: "follow-ups", element: <FollowUps /> },
      { path: "follow-ups/lead/:id", element: <LeadFollowUps /> },
      { path: "meetings", element: <Meetings /> },
      { path: "providers", element: <Providers /> },
      { path: "performance", element: <LeadsPerformance /> },
      { path: "sources", element: <LeadSources /> },
      { path: "quote-master", element: <QuoteMaster /> },
      // Residential (home-service) leads: the sales executive's and sales manager's second area.
      {
        path: "residential",
        children: [
          { index: true, element: <ResidentialDashboard /> },
          { path: "all", element: <ResidentialLeads /> },
          { path: "new", element: <ResidentialNewLead /> },
          { path: ":id", element: <ResidentialLeadPage /> },
        ],
      },
      { path: ":id", element: <LeadDetail /> },
    ],
  },

  // TASKPRO — task management dashboard (protected; roles in pages/taskpro/access.js)
  // -------------------------
  {
    path: TASKPRO_HOME,
    element: (
      <ProtectedRoute allowedRoles={TASKPRO_ROLES}>
        <TaskProLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <TaskDashboard /> },
      { path: "my-tasks", element: <TaskList mode="my" /> },
      { path: "team-tasks", element: <TaskList mode="team" /> },
      { path: "all-tasks", element: <TaskList mode="all" /> },
      { path: "overdue", element: <TaskList mode="overdue" /> },
      { path: "upcoming", element: <TaskList mode="upcoming" /> },
      { path: "completed", element: <TaskList mode="completed" /> },
      { path: "tasks/:id", element: <TaskDetail /> },
      { path: "requests", element: <TaskProRequests /> },
      { path: "reports", element: <TaskProReports /> },
      { path: "profile", element: <TaskProProfile /> },
      { path: "notifications", element: <TaskProNotifications /> },
      // The Managing Director's private feedback on their team (the page and the server check the role).
      { path: "feedback", element: <TaskProFeedback /> },
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
