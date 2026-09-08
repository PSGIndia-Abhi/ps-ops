export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

/**
 * The outer stack mounted once a user is signed in. `Tabs` renders whichever
 * role's bottom-tab navigator applies (see RoleTabs) - `JobDetail` and
 * `TeamOverview` sit above it so any tab can push into them without each
 * role needing its own parallel stack.
 */
export type AuthenticatedStackParamList = {
  Tabs: undefined;
  JobDetail: { jobId: string };
  TeamOverview: undefined;
  Companies: undefined;
  CompanyDetail: { companyId: string; companyName: string };
  Groups: undefined;
  BookingDetail: { bookingId: string };
  CreateBooking: undefined;
  Notifications: undefined;
  /** Reached from AppHeader's avatar - identity/contact info, own screen (no longer the "More" tab). */
  Profile: undefined;
  ChangePassword: undefined;
};

/**
 * Client-side-only status buckets for the Jobs list drill-down (Supervisor
 * Home's stat cards) - each mirrors the exact definition
 * GET /api/dashboard/summary's SQL already uses (backend/src/routes/
 * dashboard.routes.js), so a card's count and its filtered list always agree:
 *  - 'inProgress' -> status = 'IN_PROGRESS'
 *  - 'completed'  -> status = 'COMPLETED'
 *  - 'created'    -> status = 'CREATED' ("pending work")
 *  - 'overdue'    -> due_date < today AND status NOT IN (COMPLETED, CANCELED)
 */
export type JobsListFilter = 'all' | 'inProgress' | 'completed' | 'created' | 'overdue';

export type AdminTabParamList = {
  Home: undefined;
  Jobs: { filter?: JobsListFilter } | undefined;
  Bookings: undefined;
  More: undefined;
};

export type SupervisorTabParamList = {
  Home: undefined;
  Jobs: { filter?: JobsListFilter } | undefined;
  Team: undefined;
  More: undefined;
};

/**
 * The technician work-queue's filter, covering both the visible
 * Today/Pending/Tomorrow/More tabs (section 2/3 of the work-queue phase) and
 * the Home stat-card drill-downs (section 4) - 'pendingToday'/'inProgress'
 * aren't shown as their own top-level tab (they're what "Pending today" and
 * "In progress" on Home mean specifically: today's work by status), while
 * 'pending' mirrors the web app's own "Pending" tab definition (overdue
 * backlog, not "not started yet" - see utils/date.ts's isBeforeToday doc
 * comment). 'all'/'completed' live under the "More" pill.
 */
export type TechnicianWorkQueueFilter =
  | 'today'
  | 'pending'
  | 'tomorrow'
  | 'inProgress'
  | 'pendingToday'
  | 'completed'
  | 'all';

export type TechnicianTabParamList = {
  Home: undefined;
  /** Defaults to 'today' when absent (see MyJobsScreen) - reused for both the bottom tab and every Home stat-card drill-down rather than creating separate screens. */
  MyJobs: { filter?: TechnicianWorkQueueFilter } | undefined;
  /** Same MyJobsScreen component as "MyJobs", mounted as its own tab with a different `initialParams` default ('tomorrow') - a distinct destination for the bottom bar, not a separate screen to build/maintain. */
  Schedule: { filter?: TechnicianWorkQueueFilter } | undefined;
  /** Was reached only via the More menu and Home's Quick Access tile; now a first-class tab (see TechnicianTabNavigator) - Home's tile still links here directly, More's now-redundant row was removed. */
  Performance: undefined;
  More: undefined;
};
