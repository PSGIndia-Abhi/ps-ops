import type { NavigatorScreenParams } from '@react-navigation/native';

/** Bottom tabs of the client app: Home · Jobs · (+ Request) · Complaints · More. */
export type ClientTabParamList = {
  Dashboard: undefined;
  Jobs: undefined;
  RequestTab: undefined;
  Complaints: undefined;
  More: undefined;
};

/** Screens the client tabs push on top. */
export type ClientStackParamList = {
  ClientTabs: NavigatorScreenParams<ClientTabParamList> | undefined;
  ClientProfile: undefined;
  ClientJobDetail: { jobId: string };
  ClientRequestService: undefined;
  ClientDocuments: undefined;
  ClientAudits: undefined;
  ClientOutlets: undefined;
};
