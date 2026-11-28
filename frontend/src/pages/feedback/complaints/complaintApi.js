// Complaint Desk (Feedback Desk > Complaints): client complaints from the Client Portal,
// worked by the feedback collector and the service coordinator. Backend: /api/complaint-desk.
import { apiFetch, safeJson } from "../../../api";

export async function complaintRequest(endpoint, options) {
  const res = await apiFetch(`/api/complaint-desk${endpoint}`, options);
  const data = await safeJson(res);
  if (!res?.ok) {
    const err = new Error(data?.error || "Request failed");
    err.status = res?.status;
    throw err;
  }
  return data;
}

export const COMPLAINT_STATUS = {
  OPEN: { label: "Open", tone: "danger" },
  IN_PROGRESS: { label: "In progress", tone: "warn" },
  VISIT_SCHEDULED: { label: "Visit scheduled", tone: "violet" },
  RESOLVED: { label: "Resolved", tone: "ok" },
  CLOSED: { label: "Closed", tone: "muted" },
};
export const COMPLAINT_PRIORITY = {
  URGENT: { label: "Urgent", tone: "danger" },
  HIGH: { label: "High", tone: "warn" },
  MEDIUM: { label: "Normal", tone: "info" },
  LOW: { label: "Low", tone: "muted" },
};
export const COMPLAINT_TYPE = { SERVICE: "Service", ACCOUNTS: "Accounts" };

// Ready answers for the reply box, shown as short chips grouped by type (clicked, then edited
// before sending). group SERVICE / ACCOUNTS matches the complaint type; GENERAL fits any.
export const QUICK_REPLY_GROUPS = [
  { key: "SERVICE", label: "Service" },
  { key: "ACCOUNTS", label: "Accounts" },
  { key: "GENERAL", label: "General" },
];
export const QUICK_REPLIES = [
  { group: "SERVICE", label: "Shared with team", text: "We have shared your complaint with our service team. They will contact you shortly." },
  { group: "SERVICE", label: "Technician visit", text: "Our technician will visit your outlet on [date] between [time]." },
  { group: "SERVICE", label: "Re-visit scheduled", text: "We have scheduled a re-visit to fix this. Thank you for your patience." },
  { group: "ACCOUNTS", label: "Checking invoice", text: "Our accounts team is checking your invoice and will update you today." },
  { group: "ACCOUNTS", label: "Invoice corrected", text: "The corrected invoice has been shared under Documents." },
  { group: "GENERAL", label: "Issue fixed", text: "The issue has been fixed. Please let us know if you still face any problem." },
  { group: "GENERAL", label: "Ask for photo", text: "Could you please share a photo of the area so we can check it?" },
];

// Short reference shown to people (complaints have no number of their own).
export const complaintRef = (id) => `#${String(id || "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;
