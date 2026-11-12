import { useEffect, useState } from "react";
import { apiFetch } from "../../api";

/**
 * True when the signed-in user's role holds any FEEDBACK_* permission (admin gives them in
 * Roles & Permissions), so other panels can show a link to the Feedback Desk.
 */
// Permissions that only give tickets (no Feedback Desk): a department's team, and the supervisors /
// salespeople a ticket's next step is assigned to. Such users get "Tickets" in their own panel.
export const TICKETS_ONLY = ["FEEDBACK_DEPT", "FEEDBACK_ASSIGNED"];
// Feedback permissions that open the ticket list (GET /api/feedback/tickets): anyone holding one
// gets a "Tickets" tab in their own panel (Task Management, Lead Management).
export const TICKET_PERMISSIONS = ["FEEDBACK_COLLECT", "FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN", "FEEDBACK_DEPT", "FEEDBACK_ASSIGNED"];

/** The user's FEEDBACK_* permissions ([] = none), and whether they only work tickets. */
export function useFeedbackPermissions() {
  const [permissions, setPermissions] = useState([]);
  useEffect(() => {
    let live = true;
    apiFetch("/api/feedback/me")
      .then((res) => res?.ok && res.json())
      .then((me) => live && setPermissions(me?.permissions || []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return { permissions, ticketsOnly: permissions.length > 0 && permissions.every((p) => TICKETS_ONLY.includes(p)) };
}

export default function useHasFeedbackAccess() {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    apiFetch("/api/feedback/me")
      .then((res) => res?.ok && res.json())
      .then((me) => live && setHas(Boolean(me?.permissions?.length)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return has;
}

/**
 * How many open feedback tickets wait for this user (their department's part not done yet, or the
 * step assigned to them) - the number on their "Tickets" menu item. Reloads when refreshKey changes
 * (e.g. the page) and every minute. enabled = false: 0, nothing loaded.
 */
export function useFeedbackTicketCount(enabled, refreshKey) {
  return useFeedbackBadgeCount(enabled, refreshKey, "open_tickets");
}

/**
 * What waits for this user in the Feedback Desk (wrong-number requests + open tickets) - the number
 * on the "Customer Feedback" switch in other panels. Same reloading as above.
 */
export function useFeedbackSwitchCount(enabled, refreshKey) {
  return useFeedbackBadgeCount(enabled, refreshKey, "open_requests,open_tickets");
}

// keys: the /api/feedback/badges counts to add up, comma-separated ("open_requests,open_tickets").
// null until the first load, so a "seen" number isn't mistaken for a drop to 0.
function useFeedbackBadgeCount(enabled, refreshKey, keys) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const load = () =>
      apiFetch("/api/feedback/badges")
        .then((res) => res?.ok && res.json())
        .then((b) => live && b && setCount(keys.split(",").reduce((sum, k) => sum + (Number(b[k]) || 0), 0)))
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, refreshKey, keys]);
  return enabled ? count : null;
}
