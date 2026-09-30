import { isPastDue, todayStr } from "./format";
import { deptOf } from "./hierarchy";

export const isActive = (t) => t.status === "OPEN" || t.status === "IN_PROGRESS";
export const isOverdue = (t) => isActive(t) && isPastDue(t.due_date);

/**
 * The list screens: one component, six filters. `tasks` is already the full
 * set the signed-in viewer may see — the server did that filtering (see
 * GET /api/work-tasks) — so "team" and "all" naturally show only the
 * viewer's own slice of the real hierarchy, with no client-side hierarchy
 * logic needed here at all.
 */
export const LIST_MODES = {
  my: {
    title: "My Tasks",
    subtitle: "Everything assigned to you that still needs work",
    match: (t, me) => t.assigned_to === me && isActive(t),
  },
  team: {
    title: "Team Tasks",
    subtitle: "What the people you manage are working on",
    match: (t, me) => t.assigned_to !== me && isActive(t),
    showAssignee: true,
  },
  all: {
    title: "All Tasks",
    subtitle: "Every task you have access to",
    match: () => true,
    showAssignee: true,
  },
  overdue: {
    title: "Overdue",
    subtitle: "Past the due date and still not finished",
    match: (t) => isOverdue(t),
    showAssignee: true,
  },
  upcoming: {
    title: "Upcoming",
    subtitle: "Due from tomorrow onwards, not yet started",
    // Today's tasks live in My Tasks (Today); this is what comes after.
    match: (t) => t.status === "OPEN" && !!t.due_date && t.due_date > todayStr(),
    showAssignee: true,
  },
  completed: {
    title: "Completed",
    subtitle: "Finished tasks",
    match: (t) => t.status === "COMPLETED",
    showAssignee: true,
  },
};

/**
 * Whose tasks a view covers. "team" = everyone below the viewer in the org
 * hierarchy (not the viewer); "all" = everything the server returned.
 */
export const SCOPES = {
  my: { label: "My Tasks", match: (t, viewer) => t.assigned_to === viewer.id },
  team: { label: "Team Tasks", match: (t, viewer) => viewer.teamIds.has(t.assigned_to) },
  all: { label: "All Tasks", match: () => true },
};

/** Scopes worth offering this viewer: Team only if they manage someone,
 *  All only if there is anything beyond their own tasks to see. */
export function availableScopes(viewer) {
  const hasTeam = viewer.team.length > 0;
  return ["my", ...(hasTeam ? ["team"] : []), ...(hasTeam || viewer.isAdmin ? ["all"] : [])];
}

/** The URL search-param keys the people filters live in. */
export const FILTER_KEYS = ["scope", "dept", "assignee", "creator"];

/** Reads the people filters out of URLSearchParams. */
export const readFilters = (params) => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ""]));

/**
 * Sets one search param (or clears it when `value` is empty), keeping the
 * rest. Filters live in the URL so they survive Back and can be linked to.
 */
export function withParam(params, key, value) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}

/** Sentinel for "people with no department" in the department filter. */
export const NO_DEPT = "__none__";

/**
 * The people filters shared by the dashboard and the list screens. Every
 * key is optional; an empty value means "don't filter on this".
 *   scope    — "my" | "team" | "all"
 *   assignee — user id the task is assigned to
 *   creator  — user id who created (assigned) the task
 *   dept     — assignee's department name, or NO_DEPT
 */
export function applyPeopleFilters(tasks, { scope, assignee, creator, dept } = {}, viewer) {
  return tasks.filter((t) => {
    if (scope && SCOPES[scope] && !SCOPES[scope].match(t, viewer)) return false;
    if (assignee && t.assigned_to !== Number(assignee)) return false;
    if (creator && t.created_by !== Number(creator)) return false;
    if (dept) {
      const d = deptOf(viewer, t.assigned_to);
      if (dept === NO_DEPT ? d !== null : d !== dept) return false;
    }
    return true;
  });
}

/** Distinct { id, name } people for a filter dropdown, sorted by name. */
export function peopleIn(tasks, idKey, nameKey) {
  const byId = new Map();
  for (const t of tasks) if (t[idKey] != null && !byId.has(t[idKey])) byId.set(t[idKey], t[nameKey] || `User #${t[idKey]}`);
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct assignee departments present in `tasks`, sorted; NO_DEPT last if any. */
export function deptsIn(tasks, viewer) {
  const names = new Set();
  let none = false;
  for (const t of tasks) {
    const d = deptOf(viewer, t.assigned_to);
    if (d) names.add(d);
    else none = true;
  }
  return [...[...names].sort(), ...(none ? [NO_DEPT] : [])];
}

/**
 * Filters set by clicking a dashboard chart. `due` is "overdue" or a
 * 'YYYY-MM-DD' due date (active tasks only). Each chart is drawn from the
 * tasks filtered by every chart filter EXCEPT its own (`except`), so it keeps
 * showing all its bars and highlights the chosen one instead of collapsing.
 */
export function applyChartFilters(tasks, { status, priority, due } = {}, except = []) {
  const skip = new Set([].concat(except));
  return tasks.filter((t) => {
    if (status && !skip.has("status") && t.status !== status) return false;
    if (priority && !skip.has("priority") && t.priority !== priority) return false;
    if (due && !skip.has("due")) {
      if (due === "overdue" ? !isOverdue(t) : !(isActive(t) && t.due_date === due)) return false;
    }
    return true;
  });
}

export function countsFor(tasks, me) {
  return {
    my: tasks.filter((t) => LIST_MODES.my.match(t, me)).length,
    overdue: tasks.filter((t) => isOverdue(t)).length,
  };
}
