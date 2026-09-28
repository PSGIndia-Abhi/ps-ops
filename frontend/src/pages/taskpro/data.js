// TaskPro — shared constants. Real data (tasks, people, hierarchy) all comes
// from the backend now (see tasksApi.js and ViewerProvider.jsx); this file
// only holds the fixed vocabularies the API itself uses.

export const STATUS = {
  OPEN: { label: "Open", color: "#2563eb", soft: "#e8f0ff" },
  IN_PROGRESS: { label: "In Progress", color: "#7c3aed", soft: "#f0e9ff" },
  COMPLETED: { label: "Completed", color: "#16a34a", soft: "#e2f7e9" },
  CANCELLED: { label: "Cancelled", color: "#64748b", soft: "#eef1f5" },
};

// Server only accepts these three (LOW / NORMAL / HIGH) — see
// backend/src/routes/work-tasks.routes.js PRIORITIES.
export const PRIORITY = {
  LOW: { label: "Low", color: "#475569", soft: "#eef1f5", rank: 1 },
  NORMAL: { label: "Normal", color: "#b45309", soft: "#fff3dc", rank: 2 },
  HIGH: { label: "High", color: "#dc2626", soft: "#fdeaea", rank: 3 },
};

export const RECURRENCE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SERIES_STATUS = {
  ACTIVE: { label: "Active", color: "#16a34a", soft: "#e2f7e9" },
  PAUSED: { label: "Paused", color: "#d97706", soft: "#fff3dc" },
  CANCELLED: { label: "Stopped", color: "#64748b", soft: "#eef1f5" },
};
