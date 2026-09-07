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
  MyPerformance: undefined;
};

export type AdminTabParamList = {
  Home: undefined;
  Jobs: undefined;
  Bookings: undefined;
  More: undefined;
};

export type SupervisorTabParamList = {
  Home: undefined;
  Jobs: undefined;
  Team: undefined;
  More: undefined;
};

export type TechnicianTabParamList = {
  Home: undefined;
  /** `initialTab` lets "More -> Completed Jobs" land directly on that sub-tab. */
  MyJobs: { initialTab?: 'active' | 'completed' } | undefined;
  More: undefined;
};
