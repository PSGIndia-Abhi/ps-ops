import { Navigate, useOutletContext } from "react-router-dom";
import { BILLING_HOME } from "./access";

// /billing opens the Bill Run for the Accounts team and Service Plans for the Service Coordinator.
export default function BillingHome() {
  const { me } = useOutletContext();
  return <Navigate to={`${BILLING_HOME}/${me.can("VIEW_BILLING") ? "run" : "plans"}`} replace />;
}
