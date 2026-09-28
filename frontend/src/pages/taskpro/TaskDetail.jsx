import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiArrowRight,
  FiCalendar,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiEdit2,
  FiEdit3,
  FiFile,
  FiFileText,
  FiInfo,
  FiLink,
  FiMail,
  FiMessageSquare,
  FiMoreHorizontal,
  FiPaperclip,
  FiPause,
  FiPhone,
  FiPlay,
  FiPlus,
  FiSlash,
  FiUploadCloud,
  FiUser,
  FiUsers,
  FiX,
  FiZap,
  FiCheckCircle,
  FiSearch,
} from "react-icons/fi";
import { TASKPRO_HOME } from "./access";
import { PRIORITY, STATUS, userById } from "./data";
import { assignableUsers, canCreateTasks, canEditTask, canSeeTask, canWorkTask, isViewOnlyManager } from "./hierarchy";
import { dueInfo, fmtDateTime, fmtDuration, fmtMoney, toInputValue } from "./format";
import {
  addComment,
  addProgress,
  cancelTask,
  completeTask,
  duplicateTask,
  pauseTask,
  reassignTask,
  rescheduleTask,
  startTask,
  updateTask,
  useTask,
} from "./tasksApi";
import { useToast } from "./toastContext";
import useNow from "./useNow";
import { useViewer } from "./viewerContext";
import { Avatar, CompletionBurst, EmptyState, Modal, PriorityBadge, Skeleton, StatusBadge } from "./ui";

/* ---------- small pieces ---------- */

function LiveDuration({ task }) {
  const now = useNow(1000);
  const ms = task.workedMs + (task.runningSince ? now - task.runningSince : 0);
  return <>{fmtDuration(ms, !!task.runningSince)}</>;
}

const STEPS = [
  { key: "OPEN", label: "Open", caption: "Task is assigned and pending" },
  { key: "IN_PROGRESS", label: "In Progress", caption: "Work has started" },
  { key: "COMPLETED", label: "Completed", caption: "Task finished" },
];

function Stepper({ status }) {
  const current = status === "COMPLETED" ? 2 : status === "IN_PROGRESS" || status === "PAUSED" ? 1 : 0;
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
            <strong>{s.key === "IN_PROGRESS" && status === "PAUSED" ? "Paused" : s.label}</strong>
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
  created: { icon: FiPlus, color: "#16a34a", soft: "#e2f7e9" },
  assigned: { icon: FiUser, color: "#2563eb", soft: "#e8f0ff" },
  comment: { icon: FiMessageSquare, color: "#7c3aed", soft: "#f0e9ff" },
  updated: { icon: FiEdit3, color: "#d97706", soft: "#fff3dc" },
  started: { icon: FiPlay, color: "#7c3aed", soft: "#f0e9ff" },
  paused: { icon: FiPause, color: "#d97706", soft: "#fff3dc" },
  completed: { icon: FiCheck, color: "#16a34a", soft: "#e2f7e9" },
  cancelled: { icon: FiSlash, color: "#64748b", soft: "#eef1f5" },
};

const ACTIVITY_FILTERS = {
  all: { label: "All Activity", match: () => true },
  comments: { label: "Comments", match: (a) => a.kind === "comment" },
  status: { label: "Status changes", match: (a) => ["started", "paused", "completed", "cancelled"].includes(a.kind) },
  assign: { label: "Assignments", match: (a) => a.kind === "assigned" },
};

function Timeline({ activity }) {
  const [filter, setFilter] = useState("all");
  const items = useMemo(() => activity.filter(ACTIVITY_FILTERS[filter].match), [activity, filter]);
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
      <ol className="tp-timeline">
        {items.length === 0 && <li className="tp-timeline-empty">Nothing here yet.</li>}
        {items.map((a, i) => {
          const k = KIND[a.kind] || KIND.updated;
          return (
            <li key={a.id} style={{ "--i": Math.min(i, 8) }}>
              <span className="tp-tl-icon" style={{ background: k.soft, color: k.color }}>
                <k.icon />
              </span>
              <div>
                <div className="tp-tl-top">
                  <strong>{a.title}</strong>
                  <time>{fmtDateTime(a.at)}</time>
                </div>
                <p>{a.detail}</p>
                {a.by && userById(a.by) && <small className="tp-tl-by">by {userById(a.by).name}</small>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------- dialogs ---------- */

function StartDialog({ onClose, onConfirm, resume }) {
  return (
    <Modal title={resume ? "Resume this task?" : "Start this task?"} onClose={onClose} size="sm" hideHeader>
      {(close) => (
        <div className="tp-confirm">
          <span className="tp-confirm-icon info">
            <FiInfo />
          </span>
          <h3>{resume ? "Resume this task?" : "Start this task?"}</h3>
          <p>
            This will change the status to <strong>In Progress</strong> and {resume ? "restart the timer" : "record the start time"}.
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
              <FiPlay /> {resume ? "Resume Task" : "Start Task"}
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

function EditDialog({ task, isTop, onClose, onSave }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description,
    priority: task.priority,
    managerCanEdit: !!task.managerCanEdit,
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
          {isTop && (
            <label className="tp-switch">
              <input type="checkbox" checked={form.managerCanEdit} onChange={(e) => setForm({ ...form, managerCanEdit: e.target.checked })} />
              <span className="tp-switch-track" />
              <span className="tp-switch-text">
                <strong>Allow manager to edit this task</strong>
                <small>Off: the head can view and comment only. On: the head can also edit it.</small>
              </span>
            </label>
          )}
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
  const [pick, setPick] = useState(task.assignedTo);
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
                  <small>{u.role}</small>
                </span>
                <FiCheck className="tp-person-check" />
              </button>
            ))}
          </div>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="tp-btn primary"
              disabled={pick === task.assignedTo}
              onClick={() => {
                onSave(pick);
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
  const [value, setValue] = useState(toInputValue(task.dueAt));
  return (
    <Modal title="Reschedule task" onClose={onClose} size="sm">
      {(close) => (
        <div className="tp-form">
          <label className="tp-field">
            <span>New due date &amp; time</span>
            <input className="tp-input" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </label>
          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="tp-btn primary"
              disabled={!value}
              onClick={() => {
                onSave(new Date(value).getTime());
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

/* ---------- "Task Started" side panel ---------- */

function StartedPanel({ task, busy, onClose, onPause, onComplete }) {
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 200);
  };

  return (
    <aside className={`tp-started ${closing ? "closing" : ""}`} aria-label="Task started">
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
            <FiClock /> {fmtDateTime(task.startedAt)}
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
        <p>Task is now in progress. Update your progress or complete the task when finished.</p>
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
        <button type="button" className="tp-btn primary block" disabled={busy} onClick={() => onPause(note, next)}>
          <FiPause /> Pause Task
        </button>
        <button type="button" className="tp-btn success block" disabled={busy} onClick={() => onComplete(note)}>
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
  const { task, ready } = useTask(id);
  const now = useNow(60000);

  const [tab, setTab] = useState("work");
  const [dialog, setDialog] = useState(null); // start | edit | reassign | reschedule | cancel | complete
  const [pendingComplete, setPendingComplete] = useState("");
  const [panelHidden, setPanelHidden] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);

  // work-update form
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [statusChoice, setStatusChoice] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);
  const [comment, setComment] = useState("");

  async function run(fn, success) {
    setBusy(true);
    try {
      const result = await fn();
      if (success) toast.push({ type: "success", ...success });
      return result;
    } catch {
      toast.push({ type: "error", title: "Something went wrong", text: "Please try again." });
      return null;
    } finally {
      setBusy(false);
    }
  }

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

  if (!task || !canSeeTask(viewer.id, task)) {
    return (
      <EmptyState icon={FiSearch} title="Task not found" text="It may have been removed, or you may not have access to it.">
        <Link to={`${TASKPRO_HOME}/my-tasks`} className="tp-btn primary">
          Back to my tasks
        </Link>
      </EmptyState>
    );
  }

  const assignee = userById(task.assignedTo);
  const creator = userById(task.createdBy);
  const finished = task.status === "COMPLETED" || task.status === "CANCELLED";
  const due = dueInfo(task.dueAt, now, finished);
  const canWork = canWorkTask(viewer.id, task) && !finished;
  const canEdit = canEditTask(viewer.id, task) && !finished;
  const viewOnly = isViewOnlyManager(viewer.id, task) && !finished;
  const canCreate = canCreateTasks(viewer.id);
  const assignablePeople = assignableUsers(viewer.id);
  const showPanel = task.status === "IN_PROGRESS" && !panelHidden && canWork;
  const relatedCount = task.related ? 2 : 0;

  const soon = () => toast.push({ type: "info", title: "Coming with the backend", text: "This action is wired up once the task API is connected." });

  async function doStart() {
    setPanelHidden(false);
    await run(() => startTask(task.id), { title: "Task started", text: "The timer is running." });
  }

  async function doPause(progress, next) {
    if (progress.trim() || next.trim()) {
      await run(() => addProgress(task.id, { note: progress.trim() || "Paused", nextAction: next.trim() }));
    }
    await run(() => pauseTask(task.id), { title: "Task paused" });
  }

  async function doComplete(progress) {
    const ok = await run(() => completeTask(task.id, progress.trim()));
    if (ok) {
      setBurst(true);
      setTimeout(() => setBurst(false), 1700);
      toast.push({ type: "success", title: "Task completed", text: task.title });
    }
  }

  async function saveUpdate(e) {
    e.preventDefault();
    if (!note.trim()) {
      setNoteError(true);
      return;
    }
    const ok = await run(
      () =>
        addProgress(task.id, {
          note: note.trim(),
          status: statusChoice && statusChoice !== task.status ? statusChoice : undefined,
          nextAction: nextAction.trim(),
          files,
        }),
      { title: "Update saved" },
    );
    if (ok) {
      setNote("");
      setNextAction("");
      setFiles([]);
      setStatusChoice("");
    }
  }

  async function postComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    const text = comment.trim();
    setComment("");
    await run(() => addComment(task.id, text));
  }

  const primary = (() => {
    if (!canWork) return null;
    if (task.status === "OPEN") return { label: "Start Task", icon: FiPlay, onClick: () => setDialog("start") };
    if (task.status === "PAUSED") return { label: "Resume Task", icon: FiPlay, onClick: () => setDialog("start") };
    if (task.status === "IN_PROGRESS") return { label: "Complete Task", icon: FiCheck, tone: "success", onClick: () => { setPendingComplete(""); setDialog("complete"); } };
    return null;
  })();

  return (
    <div className="tp-detail">
      <nav className="tp-crumbs" aria-label="Breadcrumb">
        <Link to={`${TASKPRO_HOME}/my-tasks`}>My Tasks</Link>
        <FiChevronRight />
        <span>{task.title}</span>
      </nav>

      {/* header */}
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
              {task.tags.map((t) => (
                <span key={t} className="tp-tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="tp-head-right">
          <div className="tp-head-due">
            <span className="tp-head-due-rel">
              <FiClock /> {due.text}
            </span>
            <strong className={`tp-tone-${due.tone === "muted" ? "ok" : due.tone}`}>
              <span className="tp-cal-dot" /> {fmtDateTime(task.dueAt)}
            </strong>
          </div>
          <div className="tp-actions">
            {primary && (
              <button type="button" className={`tp-btn ${primary.tone || "primary"}`} onClick={primary.onClick} disabled={busy}>
                <primary.icon /> {primary.label}
              </button>
            )}
            {canEdit && (
              <>
                <button type="button" className="tp-btn outline" onClick={() => setDialog("edit")}>
                  <FiEdit2 /> Edit
                </button>
                {assignablePeople.length > 1 && (
                  <button type="button" className="tp-btn outline" onClick={() => setDialog("reassign")}>
                    <FiUsers /> Reassign
                  </button>
                )}
                <button type="button" className="tp-btn outline" onClick={() => setDialog("reschedule")}>
                  <FiCalendar /> Reschedule
                </button>
              </>
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
                    {canCreate && (
                      <button
                        type="button"
                        className="tp-pop-row"
                        onClick={async () => {
                          setMoreOpen(false);
                          const copy = await run(() => duplicateTask(task.id), { title: "Task duplicated" });
                          if (copy) navigate(`${TASKPRO_HOME}/tasks/${copy.id}`);
                        }}
                      >
                        <FiCopy /> <span>Duplicate task</span>
                      </button>
                    )}
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
                    {canEdit && (
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

      {viewOnly && (
        <div className="tp-banner info">
          <FiInfo /> You can view and comment on this task. Editing is off - whoever created it has not allowed managers to change it.
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
          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Task Information</h3>
            </div>
            <div className="tp-info-grid">
              <div>
                <InfoRow label="Task No.">
                  <strong>{task.no}</strong>
                </InfoRow>
                <InfoRow label="Type">{task.type}</InfoRow>
                <InfoRow label="Related To">
                  {task.related ? (
                    <button type="button" className="tp-link" onClick={soon}>
                      {task.related.type} - {task.related.ref} <FiChevronRight />
                    </button>
                  ) : (
                    "—"
                  )}
                </InfoRow>
                <InfoRow label="Customer">
                  {task.related ? (
                    <button type="button" className="tp-link" onClick={soon}>
                      {task.related.customer} ({task.related.customerCode}) <FiChevronRight />
                    </button>
                  ) : (
                    "—"
                  )}
                </InfoRow>
                <InfoRow label="Priority">
                  <PriorityBadge priority={task.priority} />
                </InfoRow>
                <InfoRow label="Status">
                  <StatusBadge status={task.status} live />
                </InfoRow>
              </div>
              <div>
                <InfoRow label="Assigned To">
                  {assignee ? (
                    <span className="tp-person-inline">
                      <Avatar name={assignee.name} size={30} />
                      <span className="tp-inline-text">
                        <strong>{assignee.name}</strong>
                        <small>{assignee.role}</small>
                      </span>
                    </span>
                  ) : (
                    "Unassigned"
                  )}
                </InfoRow>
                <InfoRow label="Schedule">{task.schedule}</InfoRow>
                <InfoRow label="Due Date & Time">
                  <span className="tp-inline-icon">
                    <FiCalendar /> {fmtDateTime(task.dueAt)}
                  </span>
                </InfoRow>
                <InfoRow label="Created By">{creator?.name || "—"}</InfoRow>
                <InfoRow label="Created On">{fmtDateTime(task.createdAt)}</InfoRow>
                <InfoRow label="Last Updated">{fmtDateTime(task.updatedAt)}</InfoRow>
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
                ["comments", `Comments (${task.comments.length})`],
                ["files", `Attachments (${task.attachments.length})`],
                ["related", `Related (${relatedCount})`],
              ].map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tp-tab ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>

            <div key={tab} className="tp-tabpanel">
              {tab === "work" && (
                <form className="tp-form" onSubmit={saveUpdate} noValidate>
                  {finished ? (
                    <p className="tp-desc muted">This task is {STATUS[task.status].label.toLowerCase()}, so it can't take new progress updates.</p>
                  ) : !canWork ? (
                    <p className="tp-desc muted">
                      Only {assignee?.name || "the assignee"} can add progress updates. You can still leave a comment on the Comments tab.
                    </p>
                  ) : (
                    <>
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

                      <div
                        className="tp-drop"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          setFiles((f) => [...f, ...Array.from(e.dataTransfer.files).map((x) => x.name)]);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                      >
                        <FiUploadCloud />
                        <div>
                          <strong>Click to upload files</strong> or drag and drop
                          <small>Supports PDF, DOC, XLS, PNG (Max 10 MB)</small>
                        </div>
                        <input
                          ref={fileRef}
                          type="file"
                          multiple
                          hidden
                          onChange={(e) => {
                            setFiles((f) => [...f, ...Array.from(e.target.files).map((x) => x.name)]);
                            e.target.value = "";
                          }}
                        />
                      </div>
                      {files.length > 0 && (
                        <div className="tp-filechips">
                          {files.map((f, i) => (
                            <span key={`${f}-${i}`} className="tp-filechip">
                              <FiPaperclip /> {f}
                              <button type="button" onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${f}`}>
                                <FiX />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="tp-form-grid">
                        <label className="tp-field">
                          <span>Update Status</span>
                          <select className="tp-input" value={statusChoice || task.status} onChange={(e) => setStatusChoice(e.target.value)}>
                            {["OPEN", "IN_PROGRESS", "PAUSED", "COMPLETED"].map((s) => (
                              <option key={s} value={s}>
                                {STATUS[s].label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="tp-field">
                          <span>
                            Next Action <em>(Optional)</em>
                          </span>
                          <input className="tp-input" placeholder="e.g. Follow up next week" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
                        </label>
                      </div>

                      <div className="tp-modal-actions">
                        <button type="submit" className="tp-btn primary" disabled={busy}>
                          Save Update
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}

              {tab === "comments" && (
                <div>
                  {task.comments.length === 0 && <p className="tp-desc muted">No comments yet — start the conversation.</p>}
                  <ul className="tp-comments">
                    {task.comments.map((c) => {
                      const u = userById(c.by);
                      return (
                        <li key={c.id}>
                          <Avatar name={u?.name} size={32} />
                          <div>
                            <div className="tp-tl-top">
                              <strong>{u?.name || "Someone"}</strong>
                              <time>{fmtDateTime(c.at)}</time>
                            </div>
                            <p>{c.text}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <form className="tp-comment-form" onSubmit={postComment}>
                    <input className="tp-input" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                    <button type="submit" className="tp-btn primary" disabled={!comment.trim() || busy}>
                      Post
                    </button>
                  </form>
                </div>
              )}

              {tab === "files" &&
                (task.attachments.length === 0 ? (
                  <p className="tp-desc muted">No attachments yet. Add files from the Work Update tab.</p>
                ) : (
                  <ul className="tp-files">
                    {task.attachments.map((f) => (
                      <li key={f.id}>
                        <span className="tp-file-icon">
                          <FiFile />
                        </span>
                        <span>
                          <strong>{f.name}</strong>
                          <small>{f.size}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ))}

              {tab === "related" &&
                (task.related ? (
                  <ul className="tp-files">
                    <li>
                      <span className="tp-file-icon">
                        <FiFileText />
                      </span>
                      <span>
                        <strong>
                          {task.related.type} {task.related.ref}
                        </strong>
                        <small>{fmtMoney(task.related.amount)}</small>
                      </span>
                    </li>
                    <li>
                      <span className="tp-file-icon">
                        <FiUser />
                      </span>
                      <span>
                        <strong>{task.related.customer}</strong>
                        <small>{task.related.customerCode}</small>
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="tp-desc muted">This task isn't linked to an invoice or customer.</p>
                ))}
            </div>
          </section>
        </div>

        <div className="tp-col">
          {showPanel && (
            <StartedPanel
              key={task.startedAt}
              task={task}
              busy={busy}
              onClose={() => setPanelHidden(true)}
              onPause={doPause}
              onComplete={(n) => {
                setPendingComplete(n);
                setDialog("complete");
              }}
            />
          )}
          <Timeline activity={task.activity} />

          {task.related && (
            <section className="tp-card">
              <div className="tp-card-head">
                <h3>Related Information</h3>
                <button type="button" className="tp-link" onClick={soon}>
                  View {task.related.type} <FiArrowRight />
                </button>
              </div>
              <div className="tp-related">
                <span className="tp-file-icon blue">
                  <FiFileText />
                </span>
                <div>
                  <strong>
                    {task.related.type} {task.related.ref}
                  </strong>
                  <small>
                    {task.related.customer} ({task.related.customerCode})
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Amount:</dt>
                    <dd>{fmtMoney(task.related.amount)}</dd>
                  </div>
                  <div>
                    <dt>Pending:</dt>
                    <dd className="tp-tone-late">{fmtMoney(task.related.pending)}</dd>
                  </div>
                </dl>
              </div>
            </section>
          )}

          <section className="tp-card">
            <div className="tp-card-head">
              <h3>Quick Actions</h3>
            </div>
            <div className="tp-quick">
              {[
                [FiPhone, "Call Customer"],
                [FiMail, "Send Email"],
                [FiFileText, "View Invoice"],
                [FiUsers, "Customer Profile"],
              ].map(([icon, label]) => {
                const Icon = icon;
                return (
                  <button key={label} type="button" onClick={soon}>
                    <Icon />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="tp-card tp-notes">
            <div className="tp-card-head">
              <h3>Notes</h3>
            </div>
            <div className="tp-note-box">
              <FiZap />
              <p>{task.notes || "Record what happened in the comments, and update the status as the work moves along."}</p>
            </div>
          </section>
        </div>
      </div>

      {dialog === "start" && <StartDialog resume={task.status === "PAUSED"} onClose={() => setDialog(null)} onConfirm={doStart} />}
      {dialog === "edit" && (
        <EditDialog
          task={task}
          isTop={viewer.level === "top"}
          onClose={() => setDialog(null)}
          onSave={(fields) => run(() => updateTask(task.id, fields), { title: "Task updated" })}
        />
      )}
      {dialog === "reassign" && (
        <ReassignDialog
          task={task}
          people={assignablePeople}
          onClose={() => setDialog(null)}
          onSave={(uid) => run(() => reassignTask(task.id, uid), { title: "Task reassigned", text: userById(uid)?.name })}
        />
      )}
      {dialog === "reschedule" && (
        <RescheduleDialog
          task={task}
          onClose={() => setDialog(null)}
          onSave={(ts) => run(() => rescheduleTask(task.id, ts), { title: "Task rescheduled", text: fmtDateTime(ts) })}
        />
      )}
      {dialog === "complete" && (
        <ConfirmDialog
          tone="success"
          icon={FiCheckCircle}
          title="Complete this task?"
          text="The timer stops and the task moves to Completed. You can't add progress updates after this."
          confirmLabel="Complete Task"
          onClose={() => setDialog(null)}
          onConfirm={() => doComplete(pendingComplete)}
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

      {burst && <CompletionBurst />}
    </div>
  );
}
