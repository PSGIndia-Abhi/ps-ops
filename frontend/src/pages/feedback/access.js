// The Customer Feedback desk (pages/feedback) is opened by permission: any role that admin gives a
// FEEDBACK_* permission in Roles & Permissions (FeedbackGate + GET /api/feedback/me). Every API
// call is checked again by the backend.
import { roleBasePath } from "../../auth/roleBasePath";

export const FEEDBACK_HOME = "/feedback-desk";

export const FEEDBACK_COLLECTOR_ROLE = "feedback_collector";

const PANEL_NAMES = {
  "/admin": "Admin Panel",
  "/taskpro": "Task Management",
  "/leads": "Lead Management",
  "/accountant": "Accountant Panel",
  "/supervisor": "Supervisor Panel",
  "/brigade": "Brigade Panel",
  "/staff": "My Workspace",
};

// Where "Back" in the desk sidebar goes: the user's own panel (the collector has no other panel).
export function feedbackBackLink(role) {
  if (role === FEEDBACK_COLLECTOR_ROLE) return null;
  const path = roleBasePath(role);
  return { path, label: PANEL_NAMES[path] || "my panel" };
}
