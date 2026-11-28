import type { DocKind } from './api';

/** Every screen of the client app: Home first, the rest open on top of it (with a back button). */
export type ClientStackParamList = {
  ClientHome: undefined;
  Jobs: undefined;
  Complaints: undefined;
  ClientProfile: undefined;
  ClientJobDetail: { jobId: string };
  ClientNewComplaint: { siteId?: string; jobId?: string; jobLabel?: string };
  ClientComplaintDetail: { complaintId: string; notice?: string };
  ClientRequestService: { siteId?: string; tab?: 'new' | 'mine' } | undefined;
  ClientDocuments: { kind?: DocKind } | undefined;
  ClientPhotos: undefined;
  ClientSearch: undefined;
  ClientAudits: undefined;
  ClientOutlets: undefined;
  ClientOutletDetail: { siteId: string };
  ChangePassword: undefined;
  ClientNotifications: undefined;
};
