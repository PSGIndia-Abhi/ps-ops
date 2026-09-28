import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
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
  FiInfo,
  FiLink,
  FiMessageSquare,
  FiMoreHorizontal,
  FiPaperclip,
  FiPause,
  FiPlay,
  FiPlus,
  FiRepeat,
  FiSearch,
  FiSkipForward,
  FiSlash,
  FiTrash2,
  FiUploadCloud,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { PRIORITY, SERIES_STATUS, STATUS } from "./data";
import { assignableUsers } from "./hierarchy";
import { dueInfo, fmtDateTime, fmtDuration, fmtTimestamp, toDateInput, toTimeInput } from "./format";
import {
  addComment,
  cancelTask,
  completeTask,
  addProgress,
  deleteAttachment,
  duplicateTask,
  fetchAllUsers,
  getSeries,
  getUserHierarchy,
  listAttachments,
  listComments,
  listHistory,
  openAttachment,
  pauseSeries,
  reassignTask,
  rescheduleTask,
  resumeSeries,
  skipTask,
  startTask,
  stopSeries,
  updateTask,
  uploadAttachment,
  useTask,
} from "./tasksApi";
import { useToast } from "./toastContext";
import useNow from "./useNow";
import { useViewer } from "./viewerContext";
import { Avatar, CompletionBurst, EmptyState, Modal, PriorityBadge, Skeleton, StatusBadge } from "./ui";

/* ---------- small pieces ---------- */

function LiveDuration({ startedAt }) {
  const now = useNow(1000);
  return <>{fmtDuration(now - new Date(startedAt).getTime())}</>;
}

const STEPS = [
  { key: "OPEN", label: "Open", caption: "Task is assigned and pending" },
  { key: "IN_PROGRESS", label: "In Progress", caption: "Work has started" },
  { key: "COMPLETED", label: "Completed", caption: "Task finished" },
];

function Stepper({ status }) {
  const current = status === "COMPLETED" ? 2 : status === "IN_PROGRESS" ? 1 : 0;
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
          <div key={s.key} className={`tp-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
            <span className="tp-step-dot">{done ? <FiCheck /> : i + 1}</span>
            <strong>{s.label}</strong>
            <small>{s.caption}</small>
          </div>
        );
      })}
    </div>
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
  START: { icon: FiPlay, color: "#7c3aed", soft: "#f0e9ff", label: "Task started" },
  UPDATE: { icon: FiEdit3, color: "#d97706", soft: "#fff3dc", label: "Task updated" },
  COMPLETE: { icon: FiCheck, color: "#16a34a", soft: "#e2f7e9", label: "Task completed" },
  REASSIGN: { icon: FiUsers, color: "#2563eb", soft: "#e8f0ff", label: "Task reassigned" },
  RESCHEDULE: { icon: FiCalendar, color: "#2563eb", soft: "#e8f0ff", label: "Task rescheduled" },
  SKIP: { icon: FiSkipForward, color: "#64748b", soft: "#eef1f5", label: "Occurrence skipped" },
  CANCEL: { icon: FiSlash, color: "#64748b", soft: "#eef1f5", label: "Task cancelled" },
  ATTACH: { icon: FiPaperclip, color: "#2563eb", soft: "#e8f0ff", label: "File attached" },
  DETACH: { icon: FiX, color: "#64748b", soft: "#eef1f5", label: "File removed" },
};

const ACTIVITY_FILTERS = {
  all: { label: "All Activity", match: () => true },
  status: { label: "Status changes", match: (a) => ["START", "COMPLETE", "SKIP", "CANCEL"].includes(a.action) },
  changes: { label: "Edits", match: (a) => ["UPDATE", "REASSIGN", "RESCHEDULE"].includes(a.action) },
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

function EditDialog({ task, onClose, onSave }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    task_type: task.task_type || "",
    priority: task.priority,
  });
  const [error, setError] = useState("");
  return (
    <Modal title="Edit task" onClose={onClose} size="lg">
      {(close) => (
        <form
          className="tp-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title.trim()) return setError("The title can't be empty.");
            onSave({ ...form, title: form.title.trim() });
            close();
          }}
        >
          <label className="tp-field">
            <span>Title *</span>
            <input
              className={`tp-input ${error ? "invalid" : ""}`}
              value={form.title}
              onChange={(e) => {
                setError("");
                setForm({ ...form, title: e.target.value });
              }}
              autoFocus
            />
            {error && <em className="tp-error">{error}</em>}
          </label>
          <label className="tp-field">
            <span>Description</span>
            <textarea className="tp-input" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="tp-field">
            <span>Type</span>
            <input className="tp-input" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })} />
          </label>
          <div className="tp-field">
            <span>Priority</span>
            <div className="tp-seg">
              {Object.entries(PRIORITY).map(([k, p]) => (
                <button key={k} type="button" className={form.priority === k ? "on" : ""} onClick={() => setForm({ ...form, priority: k })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="tp-btn primary">
              Save changes
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ReassignDialog({ task, people, onClose, onSave }) {
  const [pick, setPick] = useState(task.assigned_to);
  const [note, setNote] = useState("");
  return (
    <Modal title="Reassign task" onClose={onClose} size="md">
      {(close) => (
        <div className="tp-form">
          <div className="tp-people">
            {people.map((u) => (
              <button key={u.id} type="button" className={`tp-person ${pick === u.id ? "on" : ""}`} onClick={() => setPick(u.id)}>
                <Avatar name={u.name} size={36} />
                <span className="tp-person-text">
                  <strong>{u.name}</strong>
                  {u.role && <small>{u.role}</small>}
                </span>
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
              Reassign
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RescheduleDialog({ task, onClose, onSave }) {
  const [date, setDate] = useState(toDateInput(task.due_date));
  const [time, setTime] = useState(toTimeInput(task.due_time));
  const [reason, setReason] = useState("");
  return (
    <Modal title="Reschedule task" onClose={onClose} size="sm">
      {(close) => (
        <div className="tp-form">
          <label className="tp-field">
            <span>New due date &amp; time</span>
            <div className="tp-duo">
              <input className="tp-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
              <input className="tp-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </label>
          <label className="tp-field">
            <span>
              Reason <em>(Optional)</em>
            </span>
            <input className="tp-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer asked to push" />
          </label>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="tp-btn primary"
              disabled={!date}
              onClick={() => {
                onSave({ due_date: date, due_time: time ? `${time}:00` : null, reason: reason.trim() || undefined });
                close();
              }}
            >
              Reschedule
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
            <LiveDuration startedAt={task.started_at} />
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
  const [dialog, setDialog] = useState(null); // start | edit | reassign | reschedule | cancel | skip | complete | series
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
    if (!canWork) return null;
    if (task.status === "OPEN") return { label: "Start Task", icon: FiPlay, onClick: () => setDialog("start") };
    if (task.status === "IN_PROGRESS") return { label: "Complete Task", icon: FiCheck, tone: "success", onClick: () => setDialog("complete") };
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
                      onClick={async () => {
                        setMoreOpen(false);
                        try {
                          const copy = await duplicateTask(task);
                          toast.push({ type: "success", title: "Task duplicated" });
                          navigate(`${TASKPRO_HOME}/tasks/${copy.id}`);
                        } catch (err) {
                          toast.push({ type: "error", title: "Couldn't duplicate", text: err.message });
                        }
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
                    {!finished && (
                      <button
                        type="button"
                        className="tp-pop-row danger"
                        onClick={() => {
                          setMoreOpen(false);
                          setDialog("cancel");
                        }}
                      >
                        <FiSlash /> <span>Cancel task</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

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
          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Task Information</h3>
            </div>
            <div className="tp-info-grid">
              <div>
                <InfoRow label="Task ID">
                  <strong>{task.id.slice(0, 8).toUpperCase()}</strong>
                </InfoRow>
                <InfoRow label="Type">{task.task_type || "—"}</InfoRow>
                <InfoRow label="Related To">{task.source_module ? `${task.source_module} · ${task.source_id}` : "—"}</InfoRow>
                <InfoRow label="Priority">
                  <PriorityBadge priority={task.priority} />
                </InfoRow>
                <InfoRow label="Status">
                  <StatusBadge status={task.status} live />
                </InfoRow>
              </div>
              <div>
                <InfoRow label="Assigned To">
                  <button type="button" className="tp-person-inline tp-person-btn" onClick={() => setWhoId(task.assigned_to)}>
                    <Avatar name={task.assigned_to_name} size={30} />
                    <span className="tp-inline-text">
                      <strong>{task.assigned_to_name}</strong>
                      <small>Who do they report to? →</small>
                    </span>
                  </button>
                </InfoRow>
                <InfoRow label="Schedule">{task.series_id ? "Recurring" : "One time"}</InfoRow>
                <InfoRow label="Due Date & Time">
                  <span className="tp-inline-icon">
                    <FiCalendar /> {fmtDateTime(task.due_date, task.due_time)}
                  </span>
                </InfoRow>
                <InfoRow label="Created By">
                  {task.created_by_name ? (
                    <button type="button" className="tp-link" onClick={() => setWhoId(task.created_by)}>
                      {task.created_by_name}
                    </button>
                  ) : (
                    "—"
                  )}
                </InfoRow>
                <InfoRow label="Created On">{fmtTimestamp(task.created_at)}</InfoRow>
                <InfoRow label="Last Updated">{fmtTimestamp(task.updated_at)}</InfoRow>
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
                  <form className="tp-comment-form" onSubmit={postComment}>
                    <input className="tp-input" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                    <button type="submit" className="tp-btn primary" disabled={!comment.trim()}>
                      Post
                    </button>
                  </form>
                </div>
              )}

              {tab === "files" && (
                <div>
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
                          {!finished && (
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
              <button type="button" onClick={() => setTab("comments")}>
                <FiMessageSquare />
                <span>Add Comment</span>
              </button>
              <button
                type="button"
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
      {dialog === "cancel" && (
        <ConfirmDialog
          tone="danger"
          icon={FiSlash}
          title="Cancel this task?"
          text="It will be closed and no further work can be recorded. This can't be undone."
          confirmLabel="Cancel Task"
          onClose={() => setDialog(null)}
          onConfirm={() => run(() => cancelTask(task.id), { title: "Task cancelled" })}
        />
      )}
      {dialog === "series" && task.series_id && <SeriesDialog seriesId={task.series_id} allowManage={canEditTerms} onClose={() => setDialog(null)} onChanged={refresh} />}
      {whoId && <WhoDialog userId={whoId} onClose={() => setWhoId(null)} />}

      {burst && <CompletionBurst />}
    </div>
  );
}
