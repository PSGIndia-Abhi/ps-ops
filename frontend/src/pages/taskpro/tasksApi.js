// TaskPro data access — the ONLY file the screens use to read or change tasks.
//
// Right now it keeps tasks in memory (seeded from data.js) so the whole UI
// can be built and tried. Every function is async and resolves after a short
// delay, exactly like a network call, so loading states are real.
//
// When the backend is ready: keep the exported names and their return shapes,
// replace the bodies with apiFetch() calls (see ../../api.js), and map the
// server's field names in one place here. Nothing else needs to change.

import { useEffect, useSyncExternalStore } from "react";
import { buildSeed, userById } from "./data";

const LATENCY = 320;
const wait = (ms = LATENCY) => new Promise((resolve) => setTimeout(resolve, ms));

let state = { tasks: buildSeed(), ready: false };

// Who is making the calls. With the real API this is the logged-in user's
// token; here the "Viewing as" switcher sets it (see ViewerProvider).
let actor = "u5";
export const setActor = (id) => {
  actor = id;
};
const listeners = new Set();
let loading = false;
let uid = 1000;

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

/** Load once (simulated network); later calls are no-ops. */
export async function loadTasks() {
  if (state.ready || loading) return;
  loading = true;
  await wait(650);
  loading = false;
  set({ ready: true });
}

export function useTaskStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    loadTasks();
  }, []);
  return snap;
}

export function useTask(id) {
  const { tasks, ready } = useTaskStore();
  return { task: tasks.find((t) => t.id === id) || null, ready };
}

// ---- helpers --------------------------------------------------------------

function patch(id, fn) {
  let updated = null;
  set({
    tasks: state.tasks.map((t) => {
      if (t.id !== id) return t;
      updated = fn(t);
      return updated;
    }),
  });
  return updated;
}

const event = (kind, title, detail) => ({ id: `a${++uid}`, kind, title, detail, at: Date.now(), by: actor });
const withEvent = (t, ev, extra = {}) => ({
  ...t,
  ...extra,
  updatedAt: Date.now(),
  activity: [ev, ...t.activity],
});

const workedNow = (t) => t.workedMs + (t.runningSince ? Date.now() - t.runningSince : 0);

// ---- mutations ------------------------------------------------------------

export async function startTask(id) {
  await wait();
  return patch(id, (t) =>
    withEvent(t, event("started", "Task started", "Work has started on this task"), {
      status: "IN_PROGRESS",
      startedAt: t.startedAt || Date.now(),
      runningSince: Date.now(),
    }),
  );
}

export async function pauseTask(id) {
  await wait();
  return patch(id, (t) =>
    withEvent(t, event("paused", "Task paused", "Timer paused"), {
      status: "PAUSED",
      workedMs: workedNow(t),
      runningSince: null,
    }),
  );
}

export async function completeTask(id, note = "") {
  await wait();
  return patch(id, (t) =>
    withEvent(t, event("completed", "Task completed", note || "Task marked as completed"), {
      status: "COMPLETED",
      workedMs: workedNow(t),
      runningSince: null,
      completedAt: Date.now(),
      startedAt: t.startedAt || Date.now(),
    }),
  );
}

export async function cancelTask(id) {
  await wait();
  return patch(id, (t) =>
    withEvent(t, event("cancelled", "Task cancelled", "Task was cancelled"), {
      status: "CANCELLED",
      workedMs: workedNow(t),
      runningSince: null,
    }),
  );
}

/** Work-update form: a progress note, optional status change and next action. */
export async function addProgress(id, { note, status, nextAction, files = [] }) {
  await wait();
  return patch(id, (t) => {
    let next = withEvent(t, event("comment", "Progress update", note), {
      attachments: [
        ...t.attachments,
        ...files.map((name) => ({ id: `f${++uid}`, name, size: "—" })),
      ],
    });
    if (status && status !== t.status) {
      const running = status === "IN_PROGRESS";
      next = withEvent(next, event("updated", "Status changed", `Status set to ${status.replace("_", " ").toLowerCase()}`), {
        status,
        startedAt: next.startedAt || (running ? Date.now() : null),
        runningSince: running ? Date.now() : null,
        workedMs: !running ? workedNow(next) : next.workedMs,
        completedAt: status === "COMPLETED" ? Date.now() : next.completedAt,
      });
    }
    if (nextAction) {
      next = withEvent(next, event("updated", "Next action set", nextAction));
    }
    return next;
  });
}

export async function addComment(id, text) {
  await wait(200);
  return patch(id, (t) =>
    withEvent(t, event("comment", "Comment added", `${userById(actor)?.name}: ${text}`), {
      comments: [...t.comments, { id: `c${++uid}`, by: actor, text, at: Date.now() }],
    }),
  );
}

export async function updateTask(id, fields) {
  await wait();
  return patch(id, (t) => {
    const changed = Object.keys(fields).filter((k) => fields[k] !== t[k]);
    return withEvent(t, event("updated", "Task updated", changed.length ? `Updated ${changed.join(", ")}` : "No changes"), fields);
  });
}

export async function reassignTask(id, userId) {
  await wait();
  return patch(id, (t) =>
    withEvent(t, event("assigned", "Task reassigned", `Task reassigned to ${userById(userId)?.name}`), {
      assignedTo: userId,
    }),
  );
}

export async function rescheduleTask(id, dueAt) {
  await wait();
  return patch(id, (t) =>
    withEvent(t, event("updated", "Task rescheduled", "Due date and time changed"), { dueAt }),
  );
}

export async function createTask(input) {
  await wait();
  const now = Date.now();
  const n = state.tasks.length + 1;
  const task = {
    id: `t${++uid}`,
    no: `TSK-2026-${String(120 + n).padStart(5, "0")}`,
    description: "",
    tags: [],
    schedule: "One Time",
    status: "OPEN",
    createdBy: actor,
    managerCanEdit: false,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    runningSince: null,
    workedMs: 0,
    completedAt: null,
    related: null,
    comments: [],
    attachments: [],
    notes: "",
    ...input,
    activity: [
      event("assigned", "Task assigned", `Task assigned to ${userById(input.assignedTo)?.name}`),
      event("created", "Task created", `Task was created by ${userById(actor)?.name}`),
    ],
  };
  task.activity[1].at = now - 1000;
  set({ tasks: [task, ...state.tasks] });
  return task;
}

export async function duplicateTask(id) {
  const source = state.tasks.find((t) => t.id === id);
  if (!source) return null;
  return createTask({
    title: `${source.title} (copy)`,
    description: source.description,
    type: source.type,
    tags: source.tags,
    priority: source.priority,
    managerCanEdit: false,
    assignedTo: source.assignedTo,
    dueAt: source.dueAt,
    related: source.related,
  });
}
