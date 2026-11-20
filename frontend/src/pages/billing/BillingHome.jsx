import { Navigate, useOutletContext } from "react-router-dom";
import { BILLING_HOME } from "./access";

// /billing opens the billing dashboard for the Accounts team and the Service Coordinator's dashboard for them.
export default function BillingHome() {
  const { me } = useOutletContext();
  return <Navigate to={`${BILLING_HOME}/${me.can("VIEW_BILLING") ? "dashboard" : "coordinator"}`} replace />;
}
