// Who may see and do what — the rules agreed for task management.
//
//  * Top (CEO / Managing Director / admin): sees every task, can assign to
//    anyone, and can edit anything.
//  * Head: sees the tasks of everyone beneath them, can create and assign tasks
//    to their own team, and can EDIT a task only when the creator switched on
//    "Allow manager to edit" — otherwise they can view and comment only.
//  * Employee: sees only their own tasks; works them (start / pause /
//    complete / progress notes / comments). They can also create tasks for
//    THEMSELVES (their head and the CEO see those), but cannot assign to
//    anyone else or change tasks other people created for them.
//  * Every person reports to exactly one head (managerId), so a task has one
//    chain upward: employee -> head -> CEO.
//
// These run on the sample org today. With the real backend the server enforces
// the same rules, and this file only decides what the screens show or hide.

import { USERS, userById } from "./data";

export const LEVEL_LABEL = { top: "CEO / Admin", head: "Head", employee: "Employee" };

export const reportsOf = (id) => USERS.filter((u) => u.managerId === id);

/** Everyone beneath `id`, at any depth. */
export function teamOf(id) {
  const out = [];
  const seen = new Set([id]);
  const walk = (parent) => {
    for (const u of reportsOf(parent)) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      out.push(u);
      walk(u.id);
    }
  };
  walk(id);
  return out;
}

export function levelOf(id) {
  const u = userById(id);
  if (!u || !u.managerId) return "top";
  return reportsOf(id).length > 0 ? "head" : "employee";
}

const inTeam = (viewerId, userId) => teamOf(viewerId).some((u) => u.id === userId);

export function canSeeTask(viewerId, task) {
  if (levelOf(viewerId) === "top") return true;
  return task.assignedTo === viewerId || task.createdBy === viewerId || inTeam(viewerId, task.assignedTo);
}

/** Change the task itself: title, description, priority, due date, assignee, cancel. */
export function canEditTask(viewerId, task) {
  if (levelOf(viewerId) === "top") return true;
  if (task.createdBy === viewerId) return true;
  return levelOf(viewerId) === "head" && inTeam(viewerId, task.assignedTo) && !!task.managerCanEdit;
}

/** Work on it: start, pause, complete, progress notes. Only the assignee. */
export const canWorkTask = (viewerId, task) => task.assignedTo === viewerId;

/** A head looking at a team member's task they are not allowed to edit. */
export const isViewOnlyManager = (viewerId, task) =>
  levelOf(viewerId) === "head" && inTeam(viewerId, task.assignedTo) && !canEditTask(viewerId, task) && task.assignedTo !== viewerId;

export const canCreateTasks = () => true;

/** People this viewer may assign a task to. */
export function assignableUsers(viewerId) {
  const level = levelOf(viewerId);
  if (level === "top") return USERS;
  if (level === "head") return [userById(viewerId), ...teamOf(viewerId)].filter(Boolean);
  return [userById(viewerId)].filter(Boolean); // employee: themselves only
}
