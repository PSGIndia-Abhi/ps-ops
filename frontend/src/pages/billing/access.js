import { useEffect, useState } from "react";
import { billingGet } from "./billingApi";

// Who may open the Billing area (/billing). Client-side only: the API checks the real permissions.
// Accounts Head / Accounts Executive bill customers; the Service Coordinator sets service plans.
export const BILLING_HOME = "/billing";
export const BILLING_ROLES = ["admin", "Accounts Head", "Accounts Executive", "Service Coordinator"];

export const canOpenBilling = (role) => BILLING_ROLES.includes(role);

/** The signed-in user's billing permissions: { ready, permissions: [...], can(p) }. */
export function useBillingMe() {
  const [state, setState] = useState({ ready: false, permissions: [] });
  useEffect(() => {
    let live = true;
    billingGet("/me")
      .then((me) => live && setState({ ready: true, permissions: me?.permissions || [] }))
      .catch(() => live && setState({ ready: true, permissions: [] }));
    return () => {
      live = false;
    };
  }, []);
  return { ...state, can: (p) => state.permissions.includes(p) };
}
