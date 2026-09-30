import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiAlignLeft,
  FiArrowRight,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiEdit2,
  FiEdit3,
  FiFile,
  FiFlag,
  FiInfo,
  FiLink,
  FiMessageSquare,
  FiMoreHorizontal,
  FiPaperclip,
  FiPause,
  FiPlay,
  FiPlus,
  FiRepeat,
  FiRotateCcw,
  FiSearch,
  FiSend,
  FiSkipForward,
  FiSlash,
  FiTag,
  FiTrash2,
  FiUploadCloud,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { PRIORITY, SERIES_STATUS, STATUS } from "./data";
import { assignableUsers, personOf } from "./hierarchy";
import { dueInfo, fmtDate, fmtDateTime, fmtDuration, fmtTimestamp, timeAgo, todayStr, toTimeInput } from "./format";
import {
  UNDO_MS,
  addComment,
  approveRequest,
  completeTask,
  addProgress,
  deleteAttachment,
  fetchTaskTypes,
  fetchAllUsers,
  getSeries,
  getUserHierarchy,
  listAttachments,
  listComments,
  listHistory,
  openAttachment,
  pauseSeries,
  pauseTask,
  reassignTask,
  rejectRequest,
  reopenTask,
  requestReschedule,
  rescheduleTask,
  resumeSeries,
  resumeTask,
  scheduleDelete,
  skipTask,
  startTask,
  stopSeries,
  undoDelete,
  updateTask,
  uploadAttachment,
  useTask,
  withdrawRequest,
} from "./tasksApi";
import NewTaskModal from "./NewTaskModal";
import { useToast } from "./toastContext";
import useNow from "./useNow";
import { useViewer } from "./viewerContext";
import { Avatar, CompletionBurst, Drawer, EmptyState, Modal, PriorityBadge, Skeleton, StatusBadge } from "./ui";

/* ---------- small pieces ---------- */

/** Time actually worked: from start to now (or to when it was paused),
 *  minus the time spent in earlier pauses. */
function workedMs(task, now) {
  if (!task.started_at) return 0;
  const end = task.status === "PAUSED" && task.paused_at ? new Date(task.paused_at).getTime() : now;
  return Math.max(0, end - new Date(task.started_at).getTime() - (Number(task.paused_seconds) || 0) * 1000);
}

function LiveDuration({ task }) {
  const now = useNow(1000);
  return <>{fmtDuration(workedMs(task, now))}</>;
}

const STEPS = [
  { key: "OPEN", label: "Open", caption: "Task is assigned and pending" },
  { key: "IN_PROGRESS", label: "In Progress", caption: "Work has started" },
  { key: "COMPLETED", label: "Completed", caption: "Task finished" },
];

function Stepper({ status }) {
  const current = status === "COMPLETED" ? 2 : status === "IN_PROGRESS" || status === "PAUSED" ? 1 : 0;
  const paused = status === "PAUSED";
  const cancelled = status === "CANCELLED";
  const fill = cancelled ? 0 : current * 50;
  return (
    <div className={`tp-stepper ${cancelled ? "cancelled" : ""}`} style={{ "--fill": `${fill}%` }}>
      <div className="tp-step-track">
        <span className="tp-step-fill" />
      </div>
      {STEPS.map((s, i) => {
        const done = !cancelled && (i < current || (status === "COMPLETED" && i === 2));
        const active = !cancelled && i === current && status !== "COMPLETED";
        return (
          <div key={s.key} className={`tp-step ${done ? "done" : ""} ${active ? "active" : ""} ${active && paused ? "paused" : ""}`}>
            <span className="tp-step-dot">{done ? <FiCheck /> : active && paused ? <FiPause /> : i + 1}</span>
            <strong>{active && paused ? "Paused" : s.label}</strong>
            <small>{active && paused ? "On hold for now" : s.caption}</small>
          </div>
        );
      })}
    </div>
  );
}

/** A person in the info card: photo, name on one line, designation ·
 *  department under it. Click opens their reporting line. */
function PersonCell({ id, name, viewer, note, onOpen }) {
  const card = personOf(viewer, id);
  const sub = note || [card?.designation, card?.dept].filter(Boolean).join(" · ") || "See reporting line";
  return (
    <button type="button" className="tp-person-cell" onClick={() => onOpen(id)} title={`${name}: see who they report to`}>
      <Avatar name={name} size={32} />
      <span className="tp-person-cell-text">
        <strong>{name}</strong>
        <small>{sub}</small>
      </span>
    </button>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="tp-info-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

const KIND = {
  CREATE: { icon: FiPlus, color: "#16a34a", soft: "#e2f7e9", label: "Task created" },
  START: { icon: FiPlay, color: "#c2410c", soft: "#fdeee6", label: "Task started" },
  UPDATE: { icon: FiEdit3, color: "#d97706", soft: "#fff3dc", label: "Task updated" },
  COMPLETE: { icon: FiCheck, color: "#16a34a", soft: "#e2f7e9", label: "Task completed" },
  REASSIGN: { icon: FiUsers, color: "#2563eb", soft: "#e8f0ff", label: "Task reassigned" },
  RESCHEDULE: { icon: FiCalendar, color: "#2563eb", soft: "#e8f0ff", label: "Task rescheduled" },
  SKIP: { icon: FiSkipForward, color: "#64748b", soft: "#eef1f5", label: "Occurrence skipped" },
  CANCEL: { icon: FiSlash, color: "#64748b", soft: "#eef1f5", label: "Task cancelled" },
  ATTACH: { icon: FiPaperclip, color: "#2563eb", soft: "#e8f0ff", label: "File attached" },
  DETACH: { icon: FiX, color: "#64748b", soft: "#eef1f5", label: "File removed" },
  REOPEN: { icon: FiRotateCcw, color: "#c2410c", soft: "#fdeee6", label: "Task reopened" },
  PAUSE: { icon: FiPause, color: "#be185d", soft: "#fce7f3", label: "Task paused" },
  RESUME: { icon: FiPlay, color: "#c2410c", soft: "#fdeee6", label: "Task resumed" },
  RESCHEDULE_REQUEST: { icon: FiSend, color: "#2563eb", soft: "#e8f0ff", label: "Reschedule requested" },
  RESCHEDULE_REJECTED: { icon: FiSlash, color: "#64748b", soft: "#eef1f5", label: "Reschedule request rejected" },
};

const ACTIVITY_FILTERS = {
  all: { label: "All Activity", match: () => true },
  status: { label: "Status changes", match: (a) => ["START", "PAUSE", "RESUME", "COMPLETE", "REOPEN", "SKIP", "CANCEL"].includes(a.action) },
  changes: { label: "Edits", match: (a) => ["UPDATE", "REASSIGN", "RESCHEDULE", "RESCHEDULE_REQUEST", "RESCHEDULE_REJECTED"].includes(a.action) },
  files: { label: "Files", match: (a) => ["ATTACH", "DETACH"].includes(a.action) },
};

function Timeline({ history, ready }) {
  const [filter, setFilter] = useState("all");
  const items = useMemo(() => history.filter(ACTIVITY_FILTERS[filter].match), [history, filter]);
  return (
    <section className="tp-card">
      <div className="tp-card-head">
        <h3>Activity / History</h3>
        <select className="tp-mini-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter activity">
          {Object.entries(ACTIVITY_FILTERS).map(([k, f]) => (
            <option key={k} value={k}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {!ready && [0, 1, 2].map((i) => <Skeleton key={i} height={40} style={{ marginBottom: 10 }} />)}
      {ready && (
        <ol className="tp-timeline">
          {items.length === 0 && <li className="tp-timeline-empty">Nothing here yet.</li>}
          {items.map((a, i) => {
            const k = KIND[a.action] || KIND.UPDATE;
            return (
              <li key={a.id} style={{ "--i": Math.min(i, 8) }}>
                <span className="tp-tl-icon" style={{ background: k.soft, color: k.color }}>
                  <k.icon />
                </span>
                <div>
                  <div className="tp-tl-top">
                    <strong>{k.label}</strong>
                    <time>{fmtTimestamp(a.changed_at)}</time>
                  </div>
                  <p>{a.note || (a.from_status && a.to_status ? `${STATUS[a.from_status]?.label || a.from_status} → ${STATUS[a.to_status]?.label || a.to_status}` : "")}</p>
                  {a.changed_by_name && <small className="tp-tl-by">by {a.changed_by_name}</small>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ---------- dialogs ---------- */

function StartDialog({ onClose, onConfirm }) {
  return (
    <Modal title="Start this task?" onClose={onClose} size="sm" hideHeader>
      {(close) => (
        <div className="tp-confirm">
          <span className="tp-confirm-icon info">
            <FiInfo />
          </span>
          <h3>Start this task?</h3>
          <p>
            This will change the status to <strong>In Progress</strong> and record the start time.
          </p>
          <div className="tp-modal-actions center">
            <button type="button" className="tp-btn ghost" onClick={close} autoFocus>
              Cancel
            </button>
            <button
              type="button"
              className="tp-btn primary"
              onClick={() => {
                onConfirm();
                close();
              }}
            >
              <FiPlay /> Start Task
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ConfirmDialog({ tone = "danger", icon, title, text, confirmLabel, onClose, onConfirm }) {
  const Icon = icon;
  return (
    <Modal title={title} onClose={onClose} size="sm" hideHeader>
      {(close) => (
        <div className="tp-confirm">
          <span className={`tp-confirm-icon ${tone}`}>
            <Icon />
          </span>
          <h3>{title}</h3>
          <p>{text}</p>
          <div className="tp-modal-actions center">
            <button type="button" className="tp-btn ghost" onClick={close} autoFocus>
              Go back
            </button>
            <button
              type="button"
              className={`tp-btn ${tone === "danger" ? "danger" : "success"}`}
              onClick={() => {
                onConfirm();
                close();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Edit the task's own terms, in the same right-side panel as New task. Due
 *  date and assignee have their own actions (Reschedule / Reassign). */
function EditDialog({ task, onClose, onSave }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    task_type: task.task_type || "",
    priority: task.priority,
  });
  const [error, setError] = useState("");
  const [types, setTypes] = useState([]);
  useEffect(() => {
    fetchTaskTypes().then(setTypes).catch(() => {});
  }, []);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const formId = "tp-edit-task-form";
  const titleRef = useRef(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  function submit(e, close) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("The title can't be empty.");
      return;
    }
    onSave({ ...form, title: form.title.trim() });
    close();
  }

  return (
    <Drawer
      title="Edit task"
      subtitle="Change the title, details, priority or type. Use Reschedule or Reassign for the due date and assignee."
      onClose={onClose}
      footer={(close) => (
        <>
          <span className="tp-nt-kbd">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          </span>
          <button type="button" className="tp-btn ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" form={formId} className="tp-btn primary">
            <FiCheck /> Save changes
          </button>
        </>
      )}
    >
      {(close) => (
        <form
          id={formId}
          className="tp-nt"
          noValidate
          onSubmit={(e) => submit(e, close)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e, close);
          }}
        >
          <div className="tp-nt-head">
            <input
              ref={titleRef}
              className={`tp-nt-title ${error ? "invalid" : ""}`}
              value={form.title}
              onChange={(e) => {
                setError("");
                set("title", e.target.value);
              }}
              placeholder="Task title"
              aria-label="Title"
              maxLength={200}
            />
            <label className="tp-nt-desc">
              <FiAlignLeft />
              <textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Add a description, context or links…" aria-label="Description" />
            </label>
          </div>

          <div className="tp-nt-props">
            <div className="tp-nt-prop">
              <span className="tp-nt-prop-label">
                <FiFlag /> Priority
              </span>
              <div className="tp-nt-prop-body">
                <div className="tp-nt-prio" role="radiogroup" aria-label="Priority">
                  {Object.entries(PRIORITY).map(([k, p]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={form.priority === k}
                      className={form.priority === k ? "on" : ""}
                      style={{ "--pc": p.color, "--ps": p.soft }}
                      onClick={() => set("priority", k)}
                    >
                      <FiFlag /> {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="tp-nt-prop top">
              <span className="tp-nt-prop-label">
                <FiTag /> Type
              </span>
              <div className="tp-nt-prop-body">
                <input className="tp-input" list="tp-edit-task-types" value={form.task_type} onChange={(e) => set("task_type", e.target.value)} placeholder="e.g. Follow-up, Site visit" />
                <datalist id="tp-edit-task-types">
                  {types.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                {types.length > 0 && (
                  <div className="tp-nt-pills small">
                    {types.slice(0, 6).map((t) => (
                      <button key={t} type="button" className={form.task_type === t ? "on" : ""} onClick={() => set("task_type", form.task_type === t ? "" : t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && <em className="tp-error">{error}</em>}
        </form>
      )}
    </Drawer>
  );
}

/** Pick who takes the task over: searchable by name, designation and department. */
function ReassignDialog({ task, people, viewer, onClose, onSave }) {
  const [pick, setPick] = useState(task.assigned_to);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people
      .map((u) => {
        const card = personOf(viewer, u.id);
        return { ...u, designation: card?.designation || u.designation || u.role || "", dept: card?.dept || u.unit_name || "" };
      })
      .filter((u) => !needle || [u.name, u.designation, u.dept].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [people, query, viewer]);
  const picked = people.find((u) => u.id === pick);

  return (
    <Modal title="Reassign task" onClose={onClose} size="md">
      {(close) => (
        <div className="tp-form">
          <label className="tp-reassign-search">
            <FiSearch />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, designation or department…" aria-label="Search people" autoFocus />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <FiX />
              </button>
            )}
          </label>
          <div className="tp-people">
            {rows.length === 0 && <p className="tp-desc muted">Nobody matches “{query}”.</p>}
            {rows.map((u) => (
              <button key={u.id} type="button" className={`tp-person ${pick === u.id ? "on" : ""}`} onClick={() => setPick(u.id)}>
                <Avatar name={u.name} size={36} />
                <span className="tp-person-text">
                  <strong>
                    {u.name}
                    {u.id === viewer.id ? " (you)" : ""}
                  </strong>
                  <small>{[u.designation, u.dept].filter(Boolean).join(" · ") || "—"}</small>
                </span>
                {u.id === task.assigned_to && <em className="tp-reassign-current">Current</em>}
                <FiCheck className="tp-person-check" />
              </button>
            ))}
          </div>
          <label className="tp-field">
            <span>
              Reason <em>(Optional)</em>
            </span>
            <input className="tp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rahul is on leave" />
          </label>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="tp-btn primary"
              disabled={pick === task.assigned_to}
              onClick={() => {
                onSave(pick, note.trim() || undefined);
                close();
              }}
            >
              {pick === task.assigned_to ? "Reassign" : `Reassign to ${picked?.name || "…"}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Pick a new due date. Used both to reschedule directly and, for an
 *  assignee who may not, to ask the creator / manager to (`request`). */
function RescheduleDialog({ task, onClose, onSave, request = false }) {
  const today = todayStr();
  const [date, setDate] = useState(task.due_date && task.due_date >= today ? task.due_date : today);
  const [time, setTime] = useState(toTimeInput(task.due_time));
  const [reason, setReason] = useState("");
  // For an occurrence of a recurring task: the schedule's next date, so we
  // can warn before this one is moved onto (or past) it.
  const [nextDate, setNextDate] = useState(null);
  useEffect(() => {
    if (!task.series_id) return undefined;
    let live = true;
    getSeries(task.series_id)
      .then((s) => live && setNextDate(s.next_occurrence_date || null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [task.series_id]);
  const past = !!date && date < today;
  const clash = !past && !!nextDate && !!date && date >= nextDate;
  return (
    <Modal title={request ? "Request a reschedule" : "Reschedule task"} onClose={onClose} size="sm">
      {(close) => (
        <div className="tp-form">
          {request && (
            <p className="tp-desc muted">
              This task was given to you by {task.created_by_name || "someone else"}, so they (or your manager) decide on a new date. They'll see your request and can approve or reject it.
            </p>
          )}
          <label className="tp-field">
            <span>{request ? "Ask to move it to" : "New due date & time"}</span>
            <div className="tp-duo">
              <input className="tp-input" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} autoFocus />
              <input className="tp-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            {past && <em className="tp-error">Pick today or a later date.</em>}
          </label>
          {clash && (
            <p className="tp-warn-note">
              <FiInfo /> This schedule already creates its next task on <strong>{fmtDate(nextDate)}</strong>. Moving this one to {fmtDate(date)} means two tasks from
              the same schedule {date === nextDate ? "on that day" : "around then"}.{" "}
              {request ? "Mention it in your reason if that's intended." : "If this one isn't needed any more, use More → Skip this occurrence instead."}
            </p>
          )}
          <label className="tp-field">
            <span>
              Reason {request ? "" : <em>(Optional)</em>}
            </span>
            <input className="tp-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={request ? "e.g. Waiting for the customer's approval" : "e.g. Customer asked to push"} />
          </label>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="tp-btn primary"
              disabled={!date || past || (request && !reason.trim())}
              onClick={() => {
                onSave({ due_date: date, due_time: time ? `${time}:00` : null, reason: reason.trim() || undefined });
                close();
              }}
            >
              {request ? (
                <>
                  <FiSend /> Send request
                </>
              ) : (
                "Reschedule"
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const PAUSE_REASONS = ["Waiting for customer", "Waiting for material / parts", "Waiting for approval", "Working on something urgent"];

/** Pause a task in progress. A reason is required so the creator and the
 *  manager can see why it's on hold. */
function PauseDialog({ onClose, onPause }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  return (
    <Modal title="Pause this task" onClose={onClose} size="sm">
      {(close) => (
        <div className="tp-form">
          <p className="tp-desc muted">The timer stops until you resume. The due date doesn't change; ask for a reschedule if you'll need longer.</p>
          <div className="tp-field">
            <span>Why are you pausing it? *</span>
            <div className="tp-nt-pills small">
              {PAUSE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={reason === r ? "on" : ""}
                  onClick={() => {
                    setReason(r);
                    setError(false);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              className={`tp-input ${error ? "invalid" : ""}`}
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(false);
              }}
              placeholder="Or write your own reason…"
              autoFocus
            />
            {error && <em className="tp-error">Give a reason so others know why it's on hold.</em>}
          </div>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="tp-btn primary"
              onClick={() => {
                if (!reason.trim()) return setError(true);
                onPause(reason.trim());
                close();
              }}
            >
              <FiPause /> Pause task
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Reject a reschedule request, with an optional note back to the requester. */
function RejectDialog({ request, onClose, onReject }) {
  const [note, setNote] = useState("");
  return (
    <Modal title="Reject reschedule request" onClose={onClose} size="sm">
      {(close) => (
        <div className="tp-form">
          <p className="tp-desc muted">
            {request.requested_by_name} asked to move this to <strong>{fmtDateTime(request.to_due_date, request.to_due_time)}</strong>. The due date stays as it is.
          </p>
          <label className="tp-field">
            <span>
              Note to {request.requested_by_name} <em>(Optional)</em>
            </span>
            <input className="tp-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The customer needs it by Friday" autoFocus />
          </label>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Go back
            </button>
            <button
              type="button"
              className="tp-btn danger"
              onClick={() => {
                onReject(note.trim() || undefined);
                close();
              }}
            >
              Reject request
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const REC_SUMMARY = (r) => {
  if (!r) return "";
  const every = r.interval_value > 1 ? `every ${r.interval_value} ` : "every ";
  if (r.frequency === "DAILY") return `${every}day${r.interval_value > 1 ? "s" : ""}`;
  if (r.frequency === "WEEKLY") {
    const names = (r.days_of_week || []).map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ");
    return `${every}week${r.interval_value > 1 ? "s" : ""} on ${names}`;
  }
  if (r.frequency === "MONTHLY") return `${every}month${r.interval_value > 1 ? "s" : ""} on ${r.use_last_day_of_month ? "the last day" : `day ${r.day_of_month}`}`;
  return `${every}year${r.interval_value > 1 ? "s" : ""}`;
};

function SeriesDialog({ seriesId, allowManage, onClose, onChanged }) {
  const toast = useToast();
  const [series, setSeries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pauseUntil, setPauseUntil] = useState("");

  const load = useCallback(async () => {
    try {
      setSeries(await getSeries(seriesId));
    } catch {
      setSeries(null);
    }
  }, [seriesId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn, label) {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged?.();
      toast.push({ type: "success", title: label });
    } catch (err) {
      toast.push({ type: "error", title: "Couldn't update the schedule", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Recurring schedule" onClose={onClose} size="md">
      {() =>
        !series ? (
          <Skeleton height={120} radius={12} />
        ) : (
          <div className="tp-form">
            <div className="tp-related">
              <span className="tp-file-icon blue">
                <FiRepeat />
              </span>
              <div>
                <strong>{series.title}</strong>
                <small>{REC_SUMMARY(series.recurrence)}</small>
              </div>
              <span className="tp-badge" style={{ color: SERIES_STATUS[series.status].color, background: SERIES_STATUS[series.status].soft }}>
                {SERIES_STATUS[series.status].label}
              </span>
            </div>

            {series.status === "PAUSED" && series.pause_from && (
              <p className="tp-desc muted">
                Paused from {series.pause_from}
                {series.pause_until ? ` to ${series.pause_until}` : " (until resumed)"}.
              </p>
            )}
            {series.next_occurrence_date && <p className="tp-desc">Next occurrence: {series.next_occurrence_date}</p>}

            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Recent occurrences</span>
              <ul className="tp-files" style={{ marginTop: 8 }}>
                {(series.occurrences || []).slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <span className="tp-file-icon">
                      <FiCalendar />
                    </span>
                    <span>
                      <strong>{o.due_date}</strong>
                      <small>{STATUS[o.status]?.label}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {!allowManage && (
              <p className="tp-desc muted">You can view this schedule. Only its creator or your manager can pause, resume or stop it.</p>
            )}

            {allowManage && series.status !== "CANCELLED" && (
              <div className="tp-form-grid">
                {series.status === "ACTIVE" && (
                  <label className="tp-field">
                    <span>
                      Pause until <em>(optional)</em>
                    </span>
                    <input className="tp-input" type="date" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} />
                  </label>
                )}
              </div>
            )}

            {allowManage && (
              <div className="tp-modal-actions">
                {series.status === "ACTIVE" && (
                  <button
                    type="button"
                    className="tp-btn outline"
                    disabled={busy}
                    onClick={() => act(() => pauseSeries(series.id, series.next_occurrence_date || series.recurrence?.start_date, pauseUntil || undefined), "Schedule paused")}
                  >
                    <FiPause /> Pause
                  </button>
                )}
                {series.status === "PAUSED" && (
                  <button type="button" className="tp-btn outline" disabled={busy} onClick={() => act(() => resumeSeries(series.id), "Schedule resumed")}>
                    <FiPlay /> Resume
                  </button>
                )}
                {series.status !== "CANCELLED" && (
                  <button type="button" className="tp-btn danger" disabled={busy} onClick={() => act(() => stopSeries(series.id), "Schedule stopped")}>
                    <FiSlash /> Stop schedule
                  </button>
                )}
              </div>
            )}
          </div>
        )
      }
    </Modal>
  );
}

/** "Who do they report to?" — the assignee's (or creator's) real place in the
 * org hierarchy: their designation, unit, and the manager chain up to the
 * top. Fetched fresh per person clicked (GET /api/users/:id/hierarchy). */
function WhoDialog({ userId, onClose }) {
  const [data, setData] = useState(undefined); // undefined = loading, null = failed
  useEffect(() => {
    let live = true;
    getUserHierarchy(userId)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [userId]);

  return (
    <Modal title="Reporting line" onClose={onClose} size="sm">
      {() => {
        if (data === undefined) return <Skeleton height={140} radius={12} />;
        if (!data) {
          return <p className="tp-desc muted">Couldn't load this person's place in the hierarchy.</p>;
        }
        const chain = [...(data.managers?.length ? [data.managers.find((m) => m.is_primary) || data.managers[0]] : []), ...(data.chain || []).slice(1)];
        return (
          <div className="tp-form">
            <div className="tp-person-inline" style={{ gap: 12 }}>
              <Avatar name={data.user.name} size={44} />
              <span className="tp-inline-text">
                <strong style={{ fontSize: 16 }}>{data.user.name}</strong>
                <small>
                  {data.user.role}
                  {data.designation ? ` · ${data.designation.name}` : ""}
                </small>
              </span>
            </div>
            {data.unit && <p className="tp-desc muted">{data.unit.path.map((u) => u.name).join(" → ")}</p>}
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Reports to</span>
              {chain.length === 0 ? (
                <p className="tp-desc muted" style={{ marginTop: 6 }}>
                  Nobody — top of the hierarchy.
                </p>
              ) : (
                <ul className="tp-files" style={{ marginTop: 8 }}>
                  {chain.map((m, i) => (
                    <li key={m.line_id || m.id}>
                      <Avatar name={m.name} size={30} />
                      <span>
                        <strong>{m.name}</strong>
                        <small>{i === 0 ? "Direct manager" : `${i + 1} levels up`}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {data.team_count > 0 && <p className="tp-desc muted">Manages {data.team_count} {data.team_count === 1 ? "person" : "people"} in total.</p>}
          </div>
        );
      }}
    </Modal>
  );
}

/* ---------- "Task Started" side panel ---------- */

function StartedPanel({ task, busy, onClose, onSaveProgress, onComplete }) {
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 200);
  };

  return (
    <aside className={`tp-started ${closing ? "closing" : ""}`} aria-label="Task in progress">
      <div className="tp-started-head">
        <span className="tp-started-i">
          <FiInfo />
        </span>
        <h4>Task Started</h4>
        <button type="button" className="tp-icon-btn" onClick={close} aria-label="Close panel">
          <FiX />
        </button>
      </div>

      <dl className="tp-started-meta">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={task.status} live />
          </dd>
        </div>
        <div>
          <dt>Started at</dt>
          <dd>
            <FiClock /> {fmtTimestamp(task.started_at)}
          </dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd className="tp-timer">
            <LiveDuration task={task} />
          </dd>
        </div>
      </dl>

      <div className="tp-started-note">
        <FiCheckCircle />
        <p>Task is in progress. Save a progress note as you go, and complete it when finished.</p>
      </div>

      <label className="tp-field">
        <span>Add Progress Update</span>
        <textarea className="tp-input" rows={3} placeholder="What are you working on?" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <label className="tp-field">
        <span>
          Next Action <em>(Optional)</em>
        </span>
        <input className="tp-input" placeholder="e.g. Follow up with customer" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>

      <div className="tp-started-actions">
        <button
          type="button"
          className="tp-btn outline block"
          disabled={busy || !note.trim()}
          onClick={() => {
            onSaveProgress(note.trim(), next.trim());
            setNote("");
            setNext("");
          }}
        >
          Save Progress
        </button>
        <button type="button" className="tp-btn success block" disabled={busy} onClick={onComplete}>
          <FiCheck /> Complete Task
        </button>
      </div>
    </aside>
  );
}

/* ---------- page ---------- */

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const viewer = useViewer();
  const { task, ready, refresh } = useTask(id);

  const [tab, setTab] = useState("work");
  const [dialog, setDialog] = useState(null); // start | pause | edit | reassign | reschedule | request | reject | reopen | delete | duplicate | skip | complete | series
  const [whoId, setWhoId] = useState(null); // user id to show the "who do they report to" dialog for
  const [panelHidden, setPanelHidden] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  const [comments, setComments] = useState([]);
  const [commentsReady, setCommentsReady] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsReady, setAttachmentsReady] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyReady, setHistoryReady] = useState(false);

  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (viewer.isAdmin) fetchAllUsers().then(setAllUsers);
  }, [viewer.isAdmin]);

  const reloadComments = useCallback(async () => {
    setCommentsReady(false);
    try {
      setComments(await listComments(id));
    } catch {
      setComments([]);
    } finally {
      setCommentsReady(true);
    }
  }, [id]);
  const reloadAttachments = useCallback(async () => {
    setAttachmentsReady(false);
    try {
      setAttachments(await listAttachments(id));
    } catch {
      setAttachments([]);
    } finally {
      setAttachmentsReady(true);
    }
  }, [id]);
  const reloadHistory = useCallback(async () => {
    setHistoryReady(false);
    try {
      setHistory(await listHistory(id));
    } catch {
      setHistory([]);
    } finally {
      setHistoryReady(true);
    }
  }, [id]);

  useEffect(() => {
    reloadComments();
    reloadAttachments();
    reloadHistory();
  }, [reloadComments, reloadAttachments, reloadHistory]);

  async function run(fn, success) {
    setBusy(true);
    try {
      const result = await fn();
      await Promise.all([refresh(), reloadHistory()]);
      if (success) toast.push({ type: "success", ...success });
      return result;
    } catch (err) {
      toast.push({ type: "error", title: "That didn't go through", text: err.message || "Please try again." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const reassignPeople = useMemo(() => {
    if (!task) return [];
    const list = assignableUsers(viewer, allUsers);
    if (list.some((p) => p.id === task.assigned_to)) return list;
    return [{ id: task.assigned_to, name: task.assigned_to_name, role: "" }, ...list];
  }, [viewer, allUsers, task]);

  if (!ready) {
    return (
      <div className="tp-detail-skel">
        <Skeleton width={220} height={14} />
        <Skeleton height={120} radius={16} style={{ margin: "18px 0" }} />
        <Skeleton height={90} radius={16} />
        <div className="tp-detail-skel-grid">
          <Skeleton height={300} radius={16} />
          <Skeleton height={300} radius={16} />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <EmptyState icon={FiSearch} title="Task not found" text="It may have been removed, or you may not have access to it.">
        <Link to={`${TASKPRO_HOME}/my-tasks`} className="tp-btn primary">
          Back to my tasks
        </Link>
      </EmptyState>
    );
  }

  const finished = task.status === "COMPLETED" || task.status === "CANCELLED";
  const due = dueInfo(task.due_date, task.due_time, task.status);
  const canWork = task.assigned_to === viewer.id && !finished;
  // A plain assignee (not the creator, not admin) works the task — start,
  // progress, complete, comment, attach — but doesn't get to redefine it.
  // Matches the server's canEditTerms(): being assigned is never enough on
  // its own for Edit/Reassign/Reschedule/Skip; only the creator, an admin,
  // or someone who manages that person's team may do those. A manager
  // looking at someone ELSE's task still sees the buttons — this only ever
  // hides them for the one case we're certain of; the server has the final
  // say either way (a refusal comes back as a toast, not a crash).
  const isPlainAssignee = task.assigned_to === viewer.id && task.created_by !== viewer.id && !viewer.isAdmin;
  const canEditTerms = !isPlainAssignee && !finished;
  // Reassign is deliberately NOT tied to canEditTerms: a manager handed a
  // task directly by their OWN boss can still delegate it down to their team
  // (matches the server's canReassignTask) — they just can't otherwise edit
  // or reschedule that same task. reassignPeople is already scoped to who
  // this viewer may actually hand a task to (assignableUsers), so "is there
  // anyone else there" is by itself a correct stand-in for "can I reassign".
  const canReassign = !finished && reassignPeople.some((p) => p.id !== task.assigned_to);
  const showPanel = task.status === "IN_PROGRESS" && !panelHidden && canWork;

  // The assignee's primary manager, from the org directory (display only).
  const managerId = personOf(viewer, task.assigned_to)?.manager_id;
  const manager = managerId ? personOf(viewer, managerId) : null;

  // The rules below mirror the server (work-tasks.routes.js); it has the
  // final word, a refusal comes back as a toast.
  const isAssignee = task.assigned_to === viewer.id;
  const isCreator = task.created_by === viewer.id;
  // Creator, admin, or a manager of the assignee: may reschedule directly
  // and decide on reschedule requests (server: canEditTerms).
  const managesTask = isCreator || viewer.isAdmin || viewer.teamIds.has(task.assigned_to);
  // Only the creator may delete — never a task someone else gave you.
  const canDelete = isCreator;
  // Completed by mistake: the assignee (or creator / their manager) reopens it.
  const canReopen = task.status === "COMPLETED" && (isAssignee || managesTask);
  // An assignee who can't move the date asks instead.
  const pendingReq = task.pending_reschedule_request;
  const canRequestReschedule = canWork && !canEditTerms;
  const canDecideRequest = !!pendingReq && pendingReq.requested_by !== viewer.id && managesTask;
  // Comments and files: closed once finished; the assignee must Start first.
  const postBlock =
    task.status === "COMPLETED"
      ? "This task is completed, so comments and files are closed. Reopen it to add more."
      : task.status === "CANCELLED"
        ? "This task is cancelled, so comments and files are closed."
        : task.status === "OPEN" && isAssignee && !viewer.isAdmin
          ? "Start the task to add comments and files."
          : null;

  function doDelete() {
    const snapshot = task;
    scheduleDelete(snapshot, {
      onError: (message) => toast.push({ type: "error", title: "Couldn't delete the task", text: message }),
    });
    toast.push({
      type: "info",
      title: "Task deleted",
      text: snapshot.title,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (undoDelete(snapshot.id)) {
            toast.push({ type: "success", title: "Delete undone" });
            navigate(`${TASKPRO_HOME}/tasks/${snapshot.id}`);
          }
        },
      },
    });
    navigate(window.history.length > 1 ? -1 : `${TASKPRO_HOME}/my-tasks`);
  }

  async function doPause(reason) {
    await run(() => pauseTask(task.id, reason), { title: "Task paused", text: reason });
  }

  async function doResume() {
    setPanelHidden(false);
    await run(() => resumeTask(task.id), { title: "Task resumed", text: "The timer is running again." });
  }

  // The reason given for the current pause, from the history.
  const pauseReason = task.status === "PAUSED" ? [...history].reverse().find((h) => h.action === "PAUSE") : null;

  async function doReopen() {
    await run(() => reopenTask(task.id), { title: "Task reopened", text: "It's back in progress." });
    setPanelHidden(false);
  }

  async function doRequest(fields) {
    await run(() => requestReschedule(task.id, fields), { title: "Reschedule requested", text: `Sent to ${task.created_by_name || "the task owner"}` });
  }

  async function doApprove() {
    await run(() => approveRequest(pendingReq.id), { title: "Request approved", text: `Due date moved to ${fmtDateTime(pendingReq.to_due_date, pendingReq.to_due_time)}` });
  }

  async function doReject(note) {
    await run(() => rejectRequest(pendingReq.id, note), { title: "Request rejected" });
  }

  async function doWithdraw() {
    await run(() => withdrawRequest(pendingReq.id), { title: "Request withdrawn" });
  }

  async function doStart() {
    setPanelHidden(false);
    await run(() => startTask(task.id), { title: "Task started", text: "The timer is running." });
  }

  async function doSaveProgress(noteText, next) {
    await run(() => addProgress(task.id, { note: noteText, next_action: next || undefined }), { title: "Progress saved" });
    reloadComments();
  }

  async function doComplete() {
    const ok = await run(() => completeTask(task.id));
    if (ok) {
      setBurst(true);
      setTimeout(() => setBurst(false), 1700);
      toast.push({ type: "success", title: "Task completed", text: task.title });
    }
  }

  async function saveWorkUpdate(e) {
    e.preventDefault();
    if (!note.trim()) {
      setNoteError(true);
      return;
    }
    const ok = await run(() => addProgress(task.id, { note: note.trim(), next_action: nextAction.trim() || undefined }), { title: "Update saved" });
    if (ok) {
      setNote("");
      setNextAction("");
      reloadComments();
    }
  }

  async function postComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    const text = comment.trim();
    setComment("");
    try {
      await addComment(task.id, text);
      reloadComments();
    } catch (err) {
      toast.push({ type: "error", title: "Couldn't post that", text: err.message });
    }
  }

  async function onFilesChosen(fileList) {
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
         
        await uploadAttachment(task.id, file);
      }
      await Promise.all([reloadAttachments(), reloadHistory()]);
      toast.push({ type: "success", title: "Uploaded" });
    } catch (err) {
      toast.push({ type: "error", title: "Upload failed", text: err.message });
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(att) {
    try {
      await deleteAttachment(task.id, att.id);
      await Promise.all([reloadAttachments(), reloadHistory()]);
    } catch (err) {
      toast.push({ type: "error", title: "Couldn't remove that file", text: err.message });
    }
  }

  const primary = (() => {
    if (canReopen) return { label: "Reopen Task", icon: FiRotateCcw, tone: "outline", onClick: () => setDialog("reopen") };
    if (!canWork) return null;
    if (task.status === "OPEN") return { label: "Start Task", icon: FiPlay, onClick: () => setDialog("start") };
    if (task.status === "IN_PROGRESS") return { label: "Complete Task", icon: FiCheck, tone: "success", onClick: () => setDialog("complete") };
    if (task.status === "PAUSED") return { label: "Resume Task", icon: FiPlay, onClick: doResume };
    return null;
  })();

  return (
    <div className="tp-detail">
      <nav className="tp-crumbs" aria-label="Breadcrumb">
        <Link to={`${TASKPRO_HOME}/my-tasks`}>My Tasks</Link>
        <FiChevronRight />
        <span>{task.title}</span>
      </nav>

      <section className="tp-card tp-headcard">
        <div className="tp-head-left">
          <span className="tp-head-tile" style={{ background: task.status === "COMPLETED" ? "#16a34a" : "#ef4444" }}>
            {task.status === "COMPLETED" ? <FiCheck /> : <FiCalendar />}
          </span>
          <div>
            <div className="tp-head-titlerow">
              <h1>{task.title}</h1>
              <PriorityBadge priority={task.priority} long />
            </div>
            {task.description && <p className="tp-head-desc">{task.description.split("\n")[0]}</p>}
            <div className="tp-tags">
              {task.task_type && <span className="tp-tag">{task.task_type}</span>}
              {task.series_id && (
                <span className="tp-tag">
                  <FiRepeat style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Recurring
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="tp-head-right">
          <div className="tp-head-due">
            <span className="tp-head-due-rel">
              <FiClock /> {due.text}
            </span>
            <strong className={`tp-tone-${due.tone === "muted" ? "ok" : due.tone}`}>
              <span className="tp-cal-dot" /> {fmtDateTime(task.due_date, task.due_time)}
            </strong>
          </div>
          <div className="tp-actions">
            {primary && (
              <button type="button" className={`tp-btn ${primary.tone || "primary"}`} onClick={primary.onClick} disabled={busy}>
                <primary.icon /> {primary.label}
              </button>
            )}
            {canWork && task.status === "IN_PROGRESS" && (
              <button type="button" className="tp-btn outline" onClick={() => setDialog("pause")} disabled={busy}>
                <FiPause /> Pause
              </button>
            )}
            {canEditTerms && (
              <button type="button" className="tp-btn outline" onClick={() => setDialog("edit")}>
                <FiEdit2 /> Edit
              </button>
            )}
            {canReassign && (
              <button type="button" className="tp-btn outline" onClick={() => setDialog("reassign")}>
                <FiUsers /> Reassign
              </button>
            )}
            {canEditTerms && (
              <button type="button" className="tp-btn outline" onClick={() => setDialog("reschedule")}>
                <FiCalendar /> Reschedule
              </button>
            )}
            {canRequestReschedule && (
              <button
                type="button"
                className="tp-btn outline"
                onClick={() => setDialog("request")}
                disabled={!!pendingReq}
                title={pendingReq ? "Waiting for a decision on your request" : "Ask for a new due date"}
              >
                <FiCalendar /> {pendingReq ? "Reschedule requested" : "Request reschedule"}
              </button>
            )}
            {task.status === "IN_PROGRESS" && panelHidden && canWork && (
              <button type="button" className="tp-btn outline" onClick={() => setPanelHidden(false)}>
                <FiClock /> Timer
              </button>
            )}
            <div className="tp-pop-root">
              <button type="button" className="tp-btn outline" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
                <FiMoreHorizontal /> More
              </button>
              {moreOpen && (
                <>
                  <div className="tp-backdrop" onClick={() => setMoreOpen(false)} />
                  <div className="tp-popover tp-more-pop">
                    {task.series_id && (
                      <button
                        type="button"
                        className="tp-pop-row"
                        onClick={() => {
                          setMoreOpen(false);
                          setDialog("series");
                        }}
                      >
                        <FiRepeat /> <span>Manage schedule</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="tp-pop-row"
                      onClick={() => {
                        setMoreOpen(false);
                        setDialog("duplicate");
                      }}
                    >
                      <FiCopy /> <span>Duplicate task</span>
                    </button>
                    <button
                      type="button"
                      className="tp-pop-row"
                      onClick={() => {
                        setMoreOpen(false);
                        navigator.clipboard?.writeText(window.location.href);
                        toast.push({ type: "success", title: "Link copied" });
                      }}
                    >
                      <FiLink /> <span>Copy task link</span>
                    </button>
                    {task.series_id && canEditTerms && (
                      <button
                        type="button"
                        className="tp-pop-row"
                        onClick={() => {
                          setMoreOpen(false);
                          setDialog("skip");
                        }}
                      >
                        <FiSkipForward /> <span>Skip this occurrence</span>
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="tp-pop-row danger"
                        onClick={() => {
                          setMoreOpen(false);
                          setDialog("delete");
                        }}
                      >
                        <FiTrash2 /> <span>Delete task</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {task.status === "PAUSED" && (
        <div className="tp-pause-banner">
          <span className="tp-pause-icon">
            <FiPause />
          </span>
          <div className="tp-req-text">
            <strong>
              {isAssignee ? "You paused this task" : `${task.assigned_to_name} paused this task`}
              {task.paused_at ? ` ${timeAgo(task.paused_at)}` : ""}.
            </strong>
            {pauseReason?.note && <small>Reason: {pauseReason.note}</small>}
          </div>
          {canWork && (
            <button type="button" className="tp-btn primary" onClick={doResume} disabled={busy}>
              <FiPlay /> Resume
            </button>
          )}
        </div>
      )}

      {pendingReq && !finished && (
        <div className="tp-req-banner">
          <span className="tp-req-icon">
            <FiCalendar />
          </span>
          <div className="tp-req-text">
            {pendingReq.requested_by === viewer.id ? (
              <strong>You asked to move this to {fmtDateTime(pendingReq.to_due_date, pendingReq.to_due_time)}. Waiting for {task.created_by_name || "the task owner"} or your manager.</strong>
            ) : (
              <strong>
                {pendingReq.requested_by_name} asks to move the due date from {fmtDateTime(pendingReq.from_due_date, pendingReq.from_due_time)} to{" "}
                {fmtDateTime(pendingReq.to_due_date, pendingReq.to_due_time)}.
              </strong>
            )}
            {pendingReq.reason && <small>Reason: {pendingReq.reason}</small>}
          </div>
          <div className="tp-req-actions">
            {pendingReq.requested_by === viewer.id && (
              <button type="button" className="tp-btn ghost" onClick={doWithdraw} disabled={busy}>
                Withdraw
              </button>
            )}
            {canDecideRequest && (
              <>
                <button type="button" className="tp-btn ghost" onClick={() => setDialog("reject")} disabled={busy}>
                  Reject
                </button>
                <button
                  type="button"
                  className="tp-btn success"
                  onClick={doApprove}
                  disabled={busy || pendingReq.to_due_date < todayStr()}
                  title={pendingReq.to_due_date < todayStr() ? "The requested date has passed — reject it or reschedule directly" : undefined}
                >
                  <FiCheck /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {task.status === "CANCELLED" && (
        <div className="tp-banner">
          <FiSlash /> This task was cancelled and can no longer be worked on.
        </div>
      )}

      <section className="tp-card tp-stepcard">
        <Stepper status={task.status} />
      </section>

      <div className="tp-detail-grid">
        <div className="tp-col">
          <section className="tp-card tp-info-card">
            <div className="tp-card-head">
              <h3>Task Information</h3>
            </div>
            <div className="tp-info-grid">
              <div>
                <InfoRow label="Assigned To">
                  <PersonCell id={task.assigned_to} name={task.assigned_to_name} viewer={viewer} onOpen={setWhoId} />
                </InfoRow>
                {manager && (
                  <InfoRow label="Reports To">
                    <PersonCell id={manager.id} name={manager.name} viewer={viewer} onOpen={setWhoId} />
                  </InfoRow>
                )}
                <InfoRow label="Created By">
                  {task.created_by_name ? (
                    <PersonCell
                      id={task.created_by}
                      name={task.created_by_name}
                      viewer={viewer}
                      note={task.created_by === task.assigned_to ? "Self-assigned" : undefined}
                      onOpen={setWhoId}
                    />
                  ) : (
                    "—"
                  )}
                </InfoRow>
                <InfoRow label="Created On">{fmtTimestamp(task.created_at)}</InfoRow>
                <InfoRow label="Last Updated">{fmtTimestamp(task.updated_at)}</InfoRow>
              </div>
              <div>
                <InfoRow label="Task ID">
                  <strong>{task.id.slice(0, 8).toUpperCase()}</strong>
                </InfoRow>
                <InfoRow label="Status">
                  <StatusBadge status={task.status} live />
                </InfoRow>
                <InfoRow label="Priority">
                  <PriorityBadge priority={task.priority} />
                </InfoRow>
                <InfoRow label="Type">{task.task_type || "—"}</InfoRow>
                <InfoRow label="Due">
                  <span className="tp-inline-icon">
                    <FiCalendar /> {fmtDateTime(task.due_date, task.due_time)}
                  </span>
                </InfoRow>
                <InfoRow label="Schedule">{task.series_id ? "Recurring" : "One time"}</InfoRow>
                {task.source_module && <InfoRow label="Related To">{`${task.source_module} · ${task.source_id}`}</InfoRow>}
              </div>
            </div>
          </section>

          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Description</h3>
            </div>
            {task.description ? (
              task.description.split("\n").map((line, i) => (
                <p key={i} className="tp-desc">
                  {line}
                </p>
              ))
            ) : (
              <p className="tp-desc muted">No description added.</p>
            )}
          </section>

          <section className="tp-card tp-tabscard">
            <div className="tp-tabs" role="tablist">
              {[
                ["work", "Work Update"],
                ["comments", `Comments (${comments.length})`],
                ["files", `Attachments (${attachments.length})`],
              ].map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tp-tab ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>

            <div key={tab} className="tp-tabpanel">
              {tab === "work" &&
                (finished ? (
                  <p className="tp-desc muted">This task is {STATUS[task.status].label.toLowerCase()}, so it can't take new progress updates.</p>
                ) : !canWork ? (
                  <p className="tp-desc muted">Only {task.assigned_to_name} can add progress updates. You can still leave a comment on the Comments tab.</p>
                ) : task.status === "PAUSED" ? (
                  <p className="tp-desc muted">This task is paused. Resume it to add a progress update.</p>
                ) : task.status !== "IN_PROGRESS" ? (
                  <p className="tp-desc muted">Start the task before adding a progress update.</p>
                ) : (
                  <form className="tp-form" onSubmit={saveWorkUpdate} noValidate>
                    <label className="tp-field">
                      <span>Add Progress Note *</span>
                      <textarea
                        className={`tp-input ${noteError ? "invalid" : ""}`}
                        rows={3}
                        placeholder="Enter update about the work done, customer response, next action, etc."
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          setNoteError(false);
                        }}
                      />
                      {noteError && <em className="tp-error">Write a short note before saving.</em>}
                    </label>
                    <label className="tp-field">
                      <span>
                        Next Action <em>(Optional)</em>
                      </span>
                      <input className="tp-input" placeholder="e.g. Follow up next week" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
                    </label>
                    <div className="tp-modal-actions">
                      <button type="submit" className="tp-btn primary" disabled={busy}>
                        Save Update
                      </button>
                    </div>
                  </form>
                ))}

              {tab === "comments" && (
                <div>
                  {!commentsReady && <Skeleton height={60} />}
                  {commentsReady && comments.length === 0 && <p className="tp-desc muted">No comments yet — start the conversation.</p>}
                  {commentsReady && (
                    <ul className="tp-comments">
                      {comments.map((c) => (
                        <li key={c.id}>
                          <Avatar name={c.user_name} size={32} />
                          <div>
                            <div className="tp-tl-top">
                              <strong>{c.user_name}</strong>
                              <time>{fmtTimestamp(c.created_at)}</time>
                            </div>
                            <p>{c.comment}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {postBlock ? (
                    <p className="tp-closed-note">
                      <FiInfo /> {postBlock}
                    </p>
                  ) : (
                    <form className="tp-comment-form" onSubmit={postComment}>
                      <input className="tp-input" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                      <button type="submit" className="tp-btn primary" disabled={!comment.trim()}>
                        Post
                      </button>
                    </form>
                  )}
                </div>
              )}

              {tab === "files" && (
                <div>
                  {postBlock ? (
                    <p className="tp-closed-note">
                      <FiInfo /> {postBlock}
                    </p>
                  ) : (
                  <div
                    className="tp-drop"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files.length) onFilesChosen(e.dataTransfer.files);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                  >
                    <FiUploadCloud />
                    <div>
                      <strong>{uploading ? "Uploading…" : "Click to upload"}</strong> or drag and drop
                      <small>Max 10 MB per file</small>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files.length) onFilesChosen(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  )}
                  {!attachmentsReady && <Skeleton height={60} style={{ marginTop: 12 }} />}
                  {attachmentsReady && attachments.length === 0 && <p className="tp-desc muted" style={{ marginTop: 12 }}>No attachments yet.</p>}
                  {attachmentsReady && attachments.length > 0 && (
                    <ul className="tp-files" style={{ marginTop: 12 }}>
                      {attachments.map((f) => (
                        <li key={f.id}>
                          <button type="button" className="tp-file-icon" style={{ cursor: "pointer" }} onClick={() => openAttachment(task.id, f.id, f.file_name)} title="Open">
                            <FiFile />
                          </button>
                          <button type="button" className="tp-link" style={{ flex: 1, minWidth: 0, textAlign: "left" }} onClick={() => openAttachment(task.id, f.id, f.file_name)}>
                            <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{f.file_name}</strong>
                            <small>{(f.file_size / 1024).toFixed(0)} KB · {f.uploaded_by_name}</small>
                          </button>
                          {!postBlock && (
                            <button type="button" className="tp-icon-btn" onClick={() => removeAttachment(f)} aria-label={`Remove ${f.file_name}`}>
                              <FiTrash2 />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="tp-col">
          {showPanel && (
            <StartedPanel key={task.started_at} task={task} busy={busy} onClose={() => setPanelHidden(true)} onSaveProgress={doSaveProgress} onComplete={() => setDialog("complete")} />
          )}
          <Timeline history={history} ready={historyReady} />

          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Shortcuts</h3>
            </div>
            <div className="tp-quick">
              <button type="button" onClick={() => setTab("comments")} disabled={!!postBlock} title={postBlock || undefined}>
                <FiMessageSquare />
                <span>Add Comment</span>
              </button>
              <button
                type="button"
                disabled={!!postBlock}
                title={postBlock || undefined}
                onClick={() => {
                  setTab("files");
                  setTimeout(() => fileRef.current?.click(), 50);
                }}
              >
                <FiUploadCloud />
                <span>Upload File</span>
              </button>
              {task.series_id && (
                <button type="button" onClick={() => setDialog("series")}>
                  <FiRepeat />
                  <span>Manage Schedule</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  toast.push({ type: "success", title: "Link copied" });
                }}
              >
                <FiLink />
                <span>Copy Link</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {dialog === "start" && <StartDialog onClose={() => setDialog(null)} onConfirm={doStart} />}
      {dialog === "edit" && <EditDialog task={task} onClose={() => setDialog(null)} onSave={(fields) => run(() => updateTask(task.id, fields), { title: "Task updated" })} />}
      {dialog === "reassign" && (
        <ReassignDialog
          task={task}
          people={reassignPeople}
          viewer={viewer}
          onClose={() => setDialog(null)}
          onSave={(uid, noteText) =>
            run(() => reassignTask(task.id, uid, noteText), { title: "Task reassigned", text: reassignPeople.find((p) => p.id === uid)?.name })
          }
        />
      )}
      {dialog === "reschedule" && (
        <RescheduleDialog task={task} onClose={() => setDialog(null)} onSave={(fields) => run(() => rescheduleTask(task.id, fields), { title: "Task rescheduled" })} />
      )}
      {dialog === "complete" && (
        <ConfirmDialog
          tone="success"
          icon={FiCheckCircle}
          title="Complete this task?"
          text="The task moves to Completed. You can't add progress updates after this."
          confirmLabel="Complete Task"
          onClose={() => setDialog(null)}
          onConfirm={doComplete}
        />
      )}
      {dialog === "skip" && (
        <ConfirmDialog
          tone="danger"
          icon={FiSkipForward}
          title="Skip this occurrence?"
          text="This one occurrence is cancelled. The schedule and every other occurrence are untouched."
          confirmLabel="Skip Occurrence"
          onClose={() => setDialog(null)}
          onConfirm={() => run(() => skipTask(task.id), { title: "Occurrence skipped" })}
        />
      )}
      {dialog === "pause" && <PauseDialog onClose={() => setDialog(null)} onPause={doPause} />}
      {dialog === "request" && <RescheduleDialog request task={task} onClose={() => setDialog(null)} onSave={doRequest} />}
      {dialog === "reject" && pendingReq && <RejectDialog request={pendingReq} onClose={() => setDialog(null)} onReject={doReject} />}
      {dialog === "reopen" && (
        <ConfirmDialog
          tone="success"
          icon={FiRotateCcw}
          title="Reopen this task?"
          text="It goes back to In Progress, and editing, comments and files open up again."
          confirmLabel="Reopen Task"
          onClose={() => setDialog(null)}
          onConfirm={doReopen}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          tone="danger"
          icon={FiTrash2}
          title="Delete this task?"
          text={`It will be deleted permanently, with its comments, files and history. You'll have ${UNDO_MS / 1000} seconds to undo.`}
          confirmLabel="Delete Task"
          onClose={() => setDialog(null)}
          onConfirm={doDelete}
        />
      )}
      {dialog === "duplicate" && (
        <NewTaskModal copyFrom={task} onClose={() => setDialog(null)} onCreated={(copy) => navigate(`${TASKPRO_HOME}/tasks/${copy.id}`)} />
      )}
      {dialog === "series" && task.series_id && <SeriesDialog seriesId={task.series_id} allowManage={canEditTerms} onClose={() => setDialog(null)} onChanged={refresh} />}
      {whoId && <WhoDialog userId={whoId} onClose={() => setWhoId(null)} />}

      {burst && <CompletionBurst />}
    </div>
  );
}
