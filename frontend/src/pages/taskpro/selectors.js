import { isPastDue } from "./format";

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
    subtitle: "Scheduled for later, not yet started",
    match: (t) => t.status === "OPEN" && !!t.due_date && !isOverdue(t),
    showAssignee: true,
  },
  completed: {
    title: "Completed",
    subtitle: "Finished tasks",
    match: (t) => t.status === "COMPLETED",
    showAssignee: true,
  },
};

export function countsFor(tasks, me) {
  return {
    my: tasks.filter((t) => LIST_MODES.my.match(t, me)).length,
    overdue: tasks.filter((t) => isOverdue(t)).length,
  };
}
