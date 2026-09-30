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

// Identical GETs already on their way share one request instead of sending
// another. Two screens (or React's development double-run of effects) asking
// for the same thing at the same moment then cost one network call. Only
// while in flight — nothing is cached here once it has answered.
const inFlight = new Map();

function call(method, path, body) {
  if (method !== "GET" || body !== undefined) return send(method, path, body);
  if (!inFlight.has(path)) {
    inFlight.set(
      path,
      send(method, path).finally(() => inFlight.delete(path)),
    );
  }
  return inFlight.get(path);
}

/** GET a JSON endpoint through the shared, de-duplicated path. */
export const getJson = (path) => call("GET", path);

async function send(method, path, body) {
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
    // Wait until we know who is signed in: loading with no id first and
    // again once it arrives would fetch the whole list twice.
    if (viewer.id) loadTasks(viewer.id);
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

/** In progress -> Paused. A reason is required (the server enforces it too). */
export async function pauseTask(id, reason) {
  const data = await call("POST", `/api/work-tasks/${id}/pause`, { reason });
  patchList(data);
  return data;
}

/** Paused -> In progress. */
export async function resumeTask(id) {
  const data = await call("POST", `/api/work-tasks/${id}/resume`);
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

export async function reopenTask(id, reason) {
  const data = await call("POST", `/api/work-tasks/${id}/reopen`, reason ? { reason } : {});
  patchList(data);
  return data;
}

// ---- delete with undo ------------------------------------------------------
// Deleting is permanent on the server, so the request is held back for
// UNDO_MS: the task leaves the list at once, and only if nobody presses Undo
// is DELETE actually sent. If the tab is closed inside that window the
// pending deletes are flushed with a keepalive request, so a delete the user
// saw happen never silently doesn't.
export const UNDO_MS = 5000;
const pendingDeletes = new Map(); // id -> { timer, task, index }

function sendDelete(id, keepalive = false) {
  const token = localStorage.getItem("token");
  return fetch(`${API_BASE}/api/work-tasks/${id}`, {
    method: "DELETE",
    keepalive,
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
}

/** Hides the task now and deletes it after UNDO_MS unless undone.
 *  `onError(message)` runs if the server refuses — the task is put back. */
export function scheduleDelete(task, { onError } = {}) {
  const index = state.tasks.findIndex((t) => t.id === task.id);
  set({ tasks: state.tasks.filter((t) => t.id !== task.id) });
  const timer = setTimeout(async () => {
    pendingDeletes.delete(task.id);
    try {
      const res = await sendDelete(task.id);
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }
    } catch (err) {
      restore(task, index);
      onError?.(err.message);
    }
  }, UNDO_MS);
  pendingDeletes.set(task.id, { timer, task, index });
}

function restore(task, index) {
  if (state.tasks.some((t) => t.id === task.id)) return;
  const tasks = [...state.tasks];
  tasks.splice(index < 0 ? 0 : Math.min(index, tasks.length), 0, task);
  set({ tasks });
}

/** Cancels a scheduled delete and puts the task back. */
export function undoDelete(id) {
  const pending = pendingDeletes.get(id);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingDeletes.delete(id);
  restore(pending.task, pending.index);
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const [id, { timer }] of pendingDeletes) {
      clearTimeout(timer);
      sendDelete(id, true).catch(() => {});
    }
    pendingDeletes.clear();
  });
}

// ---- reschedule requests -------------------------------------------------
// `incoming` = waiting for the signed-in user to approve; kept in a tiny
// shared store so the sidebar badge, bell and dashboard agree.
let reqState = { incoming: [], ready: false };
const reqListeners = new Set();
function setReq(next) {
  reqState = { ...reqState, ...next };
  reqListeners.forEach((l) => l());
}
const subscribeReq = (l) => {
  reqListeners.add(l);
  return () => reqListeners.delete(l);
};
let reqLoading = null;
export function refreshIncomingRequests() {
  if (reqLoading) return reqLoading;
  reqLoading = call("GET", "/api/work-tasks/reschedule-requests?box=incoming")
    .then((rows) => setReq({ incoming: Array.isArray(rows) ? rows : [], ready: true }))
    .catch(() => setReq({ ready: true }))
    .finally(() => {
      reqLoading = null;
    });
  return reqLoading;
}

/** Pending reschedule requests waiting for this viewer; refreshed on mount and every minute. */
export function useIncomingRequests() {
  const viewer = useViewer();
  const snap = useSyncExternalStore(subscribeReq, () => reqState);
  useEffect(() => {
    if (!viewer.id) return undefined;
    refreshIncomingRequests();
    const t = setInterval(refreshIncomingRequests, 60000);
    return () => clearInterval(t);
  }, [viewer.id]);
  return snap;
}

// ---- notifications (activity feed) ----------------------------------------
// What other people did that concerns the viewer (GET /api/work-tasks/
// notifications). Read state is per notification: opening one marks it
// read, "Mark all read" marks everything up to now. It is remembered per
// person in this browser — there's no read/unread table, so it isn't shared
// across devices.
let ntf = { items: [], ready: false, forId: null, allReadAt: null, readIds: new Set() };
const ntfListeners = new Set();
function setNtf(next) {
  ntf = { ...ntf, ...next };
  ntfListeners.forEach((l) => l());
}
const subscribeNtf = (l) => {
  ntfListeners.add(l);
  return () => ntfListeners.delete(l);
};
const readKey = (id) => `taskpro.notifications.read.${id}`;
function loadRead(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(readKey(id)) || "null");
    if (saved) return { allReadAt: saved.allReadAt || null, readIds: new Set(saved.ids || []) };
    // Earlier versions only kept "last opened the bell"; treat that as read.
    return { allReadAt: localStorage.getItem(`taskpro.notifications.seen.${id}`) || null, readIds: new Set() };
  } catch {
    return { allReadAt: null, readIds: new Set() };
  }
}
function saveRead() {
  if (!ntf.forId) return;
  try {
    localStorage.setItem(readKey(ntf.forId), JSON.stringify({ allReadAt: ntf.allReadAt, ids: [...ntf.readIds].slice(-500) }));
  } catch {
    // Storage unavailable: read state just resets next visit.
  }
}

let ntfLoading = null;
export function refreshNotifications(limit = 100) {
  if (ntfLoading) return ntfLoading;
  ntfLoading = call("GET", `/api/work-tasks/notifications?limit=${limit}`)
    .then((items) => setNtf({ items: Array.isArray(items) ? items : [], ready: true }))
    .catch(() => setNtf({ ready: true }))
    .finally(() => {
      ntfLoading = null;
    });
  return ntfLoading;
}

const readAlready = (e) => (ntf.allReadAt && new Date(e.at) <= new Date(ntf.allReadAt)) || ntf.readIds.has(e.id);

/** Marks one notification read (when it's opened). */
export function markNotificationRead(id) {
  const e = ntf.items.find((x) => x.id === id);
  if (!e || readAlready(e)) return;
  setNtf({ readIds: new Set([...ntf.readIds, id]) });
  saveRead();
}

/** Marks every notification up to now as read. */
export function markAllNotificationsRead() {
  setNtf({ allReadAt: new Date().toISOString(), readIds: new Set() });
  saveRead();
}

/** { items, ready, unread, isUnread(e) } — refreshed on mount and every minute. */
export function useNotifications() {
  const viewer = useViewer();
  const snap = useSyncExternalStore(subscribeNtf, () => ntf);
  useEffect(() => {
    if (!viewer.id) return undefined;
    if (ntf.forId !== viewer.id) setNtf({ items: [], ready: false, forId: viewer.id, ...loadRead(viewer.id) });
    refreshNotifications();
    const t = setInterval(refreshNotifications, 60000);
    return () => clearInterval(t);
  }, [viewer.id]);
  const isUnread = (e) => !((snap.allReadAt && new Date(e.at) <= new Date(snap.allReadAt)) || snap.readIds.has(e.id));
  return { ...snap, unread: snap.items.filter(isUnread).length, isUnread };
}

export const listMyRequests = () => call("GET", "/api/work-tasks/reschedule-requests?box=mine");
export const listIncomingRequests = (status = "PENDING") => call("GET", `/api/work-tasks/reschedule-requests?box=incoming&status=${encodeURIComponent(status)}`);

export async function requestReschedule(id, { due_date, due_time, reason }) {
  return call("POST", `/api/work-tasks/${id}/reschedule-requests`, { due_date, due_time: due_time || undefined, reason: reason || undefined });
}

async function decide(requestId, action, note) {
  const data = await call("POST", `/api/work-tasks/reschedule-requests/${requestId}/${action}`, note ? { note } : {});
  await refreshIncomingRequests();
  if (action === "approve") await refreshTasks();
  return data;
}
export const approveRequest = (requestId, note) => decide(requestId, "approve", note);
export const rejectRequest = (requestId, note) => decide(requestId, "reject", note);
export const withdrawRequest = (requestId) => call("POST", `/api/work-tasks/reschedule-requests/${requestId}/withdraw`);

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
/** The signed-in person's own hierarchy card — open to every signed-in user. */
export const getMyHierarchy = () => call("GET", "/api/users/me/hierarchy");

// ---- recurring series --------------------------------------------------
export const listSeries = (params) => call("GET", `/api/work-task-series${qs(params)}`);
export const getSeries = (id) => call("GET", `/api/work-task-series/${id}`);
export const pauseSeries = (id, pause_from, pause_until) =>
  call("POST", `/api/work-task-series/${id}/pause`, { pause_from, pause_until: pause_until || undefined });
export const resumeSeries = (id) => call("POST", `/api/work-task-series/${id}/resume`);
export const stopSeries = (id) => call("POST", `/api/work-task-series/${id}/stop`);

export { API_BASE };
