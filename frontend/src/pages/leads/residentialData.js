// Shared by the Residential area's pages (residential.jsx, ResidentialLeads.jsx): where it lives,
// badge colours, and who may open it / which leads it lists.

import { useCallback, useEffect, useState } from "react";
import { LEADS_HOME } from "./access";
import { request } from "./leadsApi";
import { useViewer } from "./viewer";

export const RESIDENTIAL_HOME = `${LEADS_HOME}/residential`;

export const STATUS_TONE = { new: "info", contacted: "warn", converted: "success", lost: "danger" };
export const PAYMENT_TONE = { paid: "success", pending: "warn", failed: "danger", na: "neutral" };
export const label = (text) => (text ? String(text).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-");
export const paymentLabel = (s) => (s === "na" ? "No payment" : label(s));

/** The residential area is for the sales executive and the sales manager (and an admin looking in). */
export function useResidentialAccess() {
  const { persona, canPick } = useViewer();
  return canPick || persona === "sales" || persona === "sales_manager";
}

/** The residential leads this person may see (GET /api/crm/leads?lead_type=consumer - the server scopes it). */
export function useResidentialLeads() {
  const [rows, setRows] = useState(null); // null while loading
  const [error, setError] = useState("");
  const load = useCallback(() => {
    request("/api/crm/leads?lead_type=consumer")
      .then((list) => {
        setRows(Array.isArray(list) ? list : []);
        setError("");
      })
      .catch((err) => {
        setRows((cur) => cur || []);
        setError(err.message || "Could not load residential leads.");
      });
  }, []);
  useEffect(load, [load]);
  return { rows, error, reload: load };
}
