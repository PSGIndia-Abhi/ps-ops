// TaskPro data access — the ONLY file that talks to the backend. Every screen
// reads and writes tasks through the functions here, all calling the real
// module your teammate built: /api/work-tasks and /api/work-task-series.
//
// See backend/src/routes/work-tasks.routes.js and work-task-series.routes.js
// for the source of truth on every rule enforced below — this file never
// re-implements a business rule, it only calls the endpoint and surfaces
// whatever the server decides (a refusal comes back as a normal error, which
// callers turn into a toast).

import { useEffect, useState, useSyncExternalStore } from "react";
import { API_BASE, apiFetch, safeJson } from "../../api";
import { useViewer } from "./viewerContext";

async function call(method, path, body) {
  const isForm = body instanceof FormData;
  const res = await apiFetch(path, {
    method,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res || !res.ok) {
    const err = new Error(data?.error || `Request failed (${res?.status ?? "network error"})`);
    err.status = res?.status;
    throw err;
  }
  return data;
}

const qs = (params) => {
  const parts = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
};

// ---- task list store ---------------------------------------------------
// One shared, cached list (everything the signed-in user may see — the
// server does all the scoping); every screen reads from it via useTaskStore
// so navigating between Dashboard / My Tasks / a task's detail page doesn't
// re-fetch. Mutations patch this cache directly from what the server hands
// back, so the list is always showing the latest write it made itself.
//
// The cache is tagged with the id it was loaded for (`forId`). Login and
// logout in this app both navigate client-side (no page reload — see
// Login.jsx and the logout handler in TaskProLayout.jsx), so this module's
// state would otherwise survive an account switch in the same tab and show
// the previous person's tasks to whoever logs in next. loadTasks() compares
// `forId` on every call and throws the cache away the moment it doesn't
// match the id it's now being asked for — the server was always scoping
// correctly; this only fixes the client showing a stale, wrongly-scoped copy.

let state = { tasks: [], ready: false, error: null, forId: undefined };
const listeners = new Set();
let loadingPromise = null;

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

export async function loadTasks(forId, { force = false } = {}) {
  if (state.forId !== forId) {
    set({ tasks: [], ready: false, error: null, forId });
  } else if (state.ready && !force) {
    return;
  }
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const tasks = await call("GET", "/api/work-tasks");
      if (state.forId === forId) set({ tasks, ready: true, error: null });
    } catch (err) {
      if (state.forId === forId) set({ ready: true, error: err.message });
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}
export const refreshTasks = () => loadTasks(state.forId, { force: true });

export function useTaskStore() {
  const viewer = useViewer();
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    loadTasks(viewer.id);
  }, [viewer.id]);
  return snap;
}

function patchList(task) {
  set({
    tasks: state.tasks.some((t) => t.id === task.id)
      ? state.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t))
      : [task, ...state.tasks],
  });
}
function patchListFields(id, fields) {
  set({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...fields } : t)) });
}

/** A single task's full detail (description, counts) — its own fetch, kept
 *  in sync with the shared list cache after every action. */
export function useTask(id) {
  const [task, setTask] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  async function refresh() {
    setReady(false);
    try {
      const data = await call("GET", `/api/work-tasks/${id}`);
      setTask(data);
      setError(null);
      patchList(data);
    } catch (err) {
      setTask(null);
      setError(err);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { task, ready, error, refresh };
}

// ---- task actions -------------------------------------------------------
// Every action returns the full task the server sent back (except cancel,
// which the API only acknowledges) and patches the shared list cache with it.

export async function createTask(input) {
  const data = await call("POST", "/api/work-tasks", input);
  await refreshTasks();
  return data;
}

export async function updateTask(id, fields) {
  const data = await call("PUT", `/api/work-tasks/${id}`, fields);
  patchList(data);
  return data;
}

export async function startTask(id) {
  const data = await call("POST", `/api/work-tasks/${id}/start`);
  patchList(data);
  return data;
}

export async function addProgress(id, { note, next_action, next_action_date }) {
  const data = await call("POST", `/api/work-tasks/${id}/progress`, { note, next_action, next_action_date });
  patchList(data);
  return data;
}

export async function completeTask(id, completion_note) {
  const data = await call("POST", `/api/work-tasks/${id}/complete`, completion_note ? { completion_note } : {});
  patchList(data);
  return data;
}

export async function reassignTask(id, assigned_to, note) {
  const data = await call("POST", `/api/work-tasks/${id}/reassign`, { assigned_to, note });
  patchList(data);
  return data;
}

export async function rescheduleTask(id, { due_date, due_time, reason }) {
  const data = await call("POST", `/api/work-tasks/${id}/reschedule`, { due_date, due_time, reason });
  patchList(data);
  return data;
}

/** Cancel a single recurring occurrence — the series and other occurrences are untouched. */
export async function skipTask(id, reason) {
  const data = await call("POST", `/api/work-tasks/${id}/skip`, reason ? { reason } : {});
  patchList(data);
  return data;
}

/** Soft-cancel (the API never hard-deletes from here). */
export async function cancelTask(id) {
  const data = await call("DELETE", `/api/work-tasks/${id}`);
  patchListFields(id, { status: "CANCELLED" });
  return data;
}

export async function duplicateTask(task) {
  return createTask({
    title: `${task.title} (copy)`,
    description: task.description,
    task_type: task.task_type,
    priority: task.priority,
    assigned_to: task.assigned_to,
    due_date: task.due_date,
    due_time: task.due_time,
    source_module: task.source_module,
    source_id: task.source_id,
  });
}

export const fetchTaskTypes = () => call("GET", "/api/work-tasks/types");

/** Everyone (VIEW_USER-gated server-side — succeeds for admin, 403 otherwise;
 *  callers treat a failure here as "not available", not an error). */
export async function fetchAllUsers() {
  try {
    const data = await call("GET", "/api/users");
    return Array.isArray(data) ? data : data?.users || [];
  } catch {
    return [];
  }
}

// ---- comments ------------------------------------------------------------
export const listComments = (id) => call("GET", `/api/work-tasks/${id}/comments`);
export const addComment = (id, comment) => call("POST", `/api/work-tasks/${id}/comments`, { comment });

// ---- attachments -----------------------------------------------------------
export const listAttachments = (id) => call("GET", `/api/work-tasks/${id}/attachments`);
export function uploadAttachment(id, file) {
  const form = new FormData();
  form.append("file", file);
  return call("POST", `/api/work-tasks/${id}/attachments`, form);
}
export const deleteAttachment = (id, attachmentId) => call("DELETE", `/api/work-tasks/${id}/attachments/${attachmentId}`);

/** Fetches the file with the auth header attached and hands back a blob URL
 *  + suggested filename — a plain <a href> can't carry the Bearer token. */
export async function openAttachment(id, attachmentId, fileName) {
  const res = await apiFetch(`/api/work-tasks/${id}/attachments/${attachmentId}/view`);
  if (!res || !res.ok) throw new Error("Failed to open attachment");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.download = fileName || "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---- history ---------------------------------------------------------------
export const listHistory = (id) => call("GET", `/api/work-tasks/${id}/history`);

// ---- "who is this" — a person's place in the real org hierarchy -----------
// Needs VIEW_HIERARCHY (granted to every task-management role — see
// 20260928b_grant_view_hierarchy_to_task_roles.sql); admin always has it.
export const getUserHierarchy = (userId) => call("GET", `/api/users/${userId}/hierarchy`);

// ---- recurring series --------------------------------------------------
export const listSeries = (params) => call("GET", `/api/work-task-series${qs(params)}`);
export const getSeries = (id) => call("GET", `/api/work-task-series/${id}`);
export const pauseSeries = (id, pause_from, pause_until) =>
  call("POST", `/api/work-task-series/${id}/pause`, { pause_from, pause_until: pause_until || undefined });
export const resumeSeries = (id) => call("POST", `/api/work-task-series/${id}/resume`);
export const stopSeries = (id) => call("POST", `/api/work-task-series/${id}/stop`);

export { API_BASE };
