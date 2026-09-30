// TaskPro — shared constants. Real data (tasks, people, hierarchy) all comes
// from the backend now (see tasksApi.js and ViewerProvider.jsx); this file
// only holds the fixed vocabularies the API itself uses.

// Open / In Progress / Completed double as the dashboard's chart colours, so
// they were picked (and checked) to stay distinguishable under colour-blind
// vision — blue/violet were not. Cancelled is a deliberate neutral grey.
// `color` is for marks (chart fills, dots); `ink` is the darker step used
// for text on the `soft` background, which the lighter mark colours are too
// faint for.
export const STATUS = {
  OPEN: { label: "Open", color: "#2563eb", ink: "#1d4ed8", soft: "#e8f0ff" },
  IN_PROGRESS: { label: "In Progress", color: "#eb6834", ink: "#c2410c", soft: "#fdeee6" },
  COMPLETED: { label: "Completed", color: "#16a34a", ink: "#15803d", soft: "#e2f7e9" },
  CANCELLED: { label: "Cancelled", color: "#94a3b8", ink: "#475569", soft: "#eef1f5" },
};

/** Priority colours for chart marks only (pie slices, bars). The badge
 *  colours above are too close to each other for colour-blind readers once
 *  they sit side by side as slices; these three were checked for that. */
export const PRIORITY_CHART_COLOR = { HIGH: "#dc2626", NORMAL: "#eda100", LOW: "#2a78d6" };

/** Status red for "overdue" — a state, not a series colour; always shown with a label. */
export const OVERDUE_COLOR = "#dc2626";

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
