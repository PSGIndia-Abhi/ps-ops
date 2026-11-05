import { useEffect, useState } from "react";
import { apiFetch } from "../../api";

/**
 * True when the signed-in user's role holds any FEEDBACK_* permission (admin gives them in
 * Roles & Permissions), so other panels can show a link to the Feedback Desk.
 */
// Permissions that only give tickets (no Feedback Desk): a department's team, and the supervisors /
// salespeople a ticket's next step is assigned to. Such users get "Tickets" in their own panel.
export const TICKETS_ONLY = ["FEEDBACK_DEPT", "FEEDBACK_ASSIGNED"];

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
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const load = () =>
      apiFetch("/api/feedback/badges")
        .then((res) => res?.ok && res.json())
        .then((b) => live && b && setCount(Number(b.open_tickets) || 0))
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, refreshKey]);
  return enabled ? count : 0;
}
