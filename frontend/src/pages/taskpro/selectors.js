export const isActive = (t) => t.status === "OPEN" || t.status === "IN_PROGRESS" || t.status === "PAUSED";
export const isOverdue = (t, now) => isActive(t) && !!t.dueAt && t.dueAt < now;

/**
 * The list screens: one component, six filters. Tasks passed in are already
 * limited to what the viewer may see (useVisibleTasks), so "team" and "all"
 * only ever show the viewer's own slice of the hierarchy.
 */
export const LIST_MODES = {
  my: {
    title: "My Tasks",
    subtitle: "Everything assigned to you that still needs work",
    match: (t, now, me) => t.assignedTo === me && isActive(t),
  },
  team: {
    title: "Team Tasks",
    subtitle: "What the people you manage are working on",
    match: (t, now, me) => t.assignedTo !== me && isActive(t),
    showAssignee: true,
  },
  all: {
    title: "All Tasks",
    subtitle: "Every task across the team",
    match: () => true,
    showAssignee: true,
  },
  overdue: {
    title: "Overdue",
    subtitle: "Past the due date and still not finished",
    match: (t, now) => isOverdue(t, now),
    showAssignee: true,
  },
  upcoming: {
    title: "Upcoming",
    subtitle: "Scheduled for later, not yet started",
    match: (t, now) => t.status === "OPEN" && !!t.dueAt && t.dueAt >= now,
    showAssignee: true,
  },
  completed: {
    title: "Completed",
    subtitle: "Finished tasks",
    match: (t) => t.status === "COMPLETED",
    showAssignee: true,
  },
};

export function countsFor(tasks, now, me) {
  return {
    my: tasks.filter((t) => LIST_MODES.my.match(t, now, me)).length,
    overdue: tasks.filter((t) => isOverdue(t, now)).length,
  };
}
