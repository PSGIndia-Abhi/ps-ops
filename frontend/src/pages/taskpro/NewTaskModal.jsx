import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiRepeat } from "react-icons/fi";
import { PRIORITY, RECURRENCE_FREQUENCIES, WEEKDAY_LABELS } from "./data";
import { assignableUsers } from "./hierarchy";
import { toDateInput } from "./format";
import { createTask, fetchAllUsers, fetchTaskTypes } from "./tasksApi";
import { useToast } from "./toastContext";
import { Modal } from "./ui";
import { useViewer } from "./viewerContext";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FREQ_UNIT = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };

function inOneDay() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return toDateInput(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

export default function NewTaskModal({ onClose, onCreated }) {
  const toast = useToast();
  const viewer = useViewer();
  const [allUsers, setAllUsers] = useState([]);
  const [types, setTypes] = useState([]);

  useEffect(() => {
    if (viewer.isAdmin) fetchAllUsers().then(setAllUsers);
    fetchTaskTypes().then(setTypes).catch(() => {});
  }, [viewer.isAdmin]);

  const people = useMemo(() => assignableUsers(viewer, allUsers), [viewer, allUsers]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    task_type: "",
    priority: "NORMAL",
    assigned_to: viewer.id,
    due_date: inOneDay(),
    due_time: "",
  });
  const [repeat, setRepeat] = useState(false);
  const [rec, setRec] = useState({
    frequency: "WEEKLY",
    interval_value: 1,
    days_of_week: [],
    day_of_month: new Date().getDate(),
    use_last_day_of_month: false,
    month_of_year: new Date().getMonth() + 1,
    time_of_day: "09:00",
    start_date: toDateInput(),
    end_type: "NEVER",
    end_date: "",
    end_count: 10,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // people[0] may not be loaded yet on first render; keep the selection valid.
    if (!people.some((p) => p.id === form.assigned_to) && people[0]) {
      setForm((f) => ({ ...f, assigned_to: people[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  const change = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const changeRec = (key) => (e) => setRec((r) => ({ ...r, [key]: e.target.value }));

  const toggleWeekday = (n) =>
    setRec((r) => ({
      ...r,
      days_of_week: r.days_of_week.includes(n) ? r.days_of_week.filter((d) => d !== n) : [...r.days_of_week, n].sort(),
    }));

  async function submit(e, close) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Give the task a title.");
      return;
    }
    if (repeat && rec.frequency === "WEEKLY" && rec.days_of_week.length === 0) {
      setError("Pick at least one day of the week for this schedule.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      task_type: form.task_type.trim() || undefined,
      priority: form.priority,
      assigned_to: Number(form.assigned_to),
    };

    if (repeat) {
      payload.recurrence = {
        frequency: rec.frequency,
        interval_value: Number(rec.interval_value) || 1,
        start_date: rec.start_date,
        time_of_day: `${rec.time_of_day || "09:00"}:00`,
        end_type: rec.end_type,
        ...(rec.frequency === "WEEKLY" ? { days_of_week: rec.days_of_week } : {}),
        ...(rec.frequency === "MONTHLY"
          ? rec.use_last_day_of_month
            ? { use_last_day_of_month: true }
            : { day_of_month: Number(rec.day_of_month) }
          : {}),
        ...(rec.frequency === "YEARLY" ? { month_of_year: Number(rec.month_of_year), day_of_month: Number(rec.day_of_month) } : {}),
        ...(rec.end_type === "ON_DATE" ? { end_date: rec.end_date } : {}),
        ...(rec.end_type === "AFTER_COUNT" ? { end_count: Number(rec.end_count) } : {}),
      };
    } else {
      if (!form.due_date) {
        setError("Pick a due date.");
        return;
      }
      payload.due_date = form.due_date;
      payload.due_time = form.due_time ? `${form.due_time}:00` : undefined;
    }

    setSaving(true);
    try {
      const created = await createTask(payload);
      toast.push({
        type: "success",
        title: repeat ? "Schedule created" : "Task created",
        text: repeat ? `${created.occurrences_created} occurrence${created.occurrences_created === 1 ? "" : "s"} created` : created.no,
      });
      close();
      onCreated?.(repeat ? created.tasks?.[0] : created);
    } catch (err) {
      setError(err.message || "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New task" onClose={onClose} size="lg">
      {(close) => (
        <form className="tp-form" onSubmit={(e) => submit(e, close)} noValidate>
          <label className="tp-field">
            <span>Title *</span>
            <input
              className={`tp-input ${error && !form.title.trim() ? "invalid" : ""}`}
              value={form.title}
              onChange={(e) => {
                setError("");
                change("title")(e);
              }}
              placeholder="e.g. Call ABC Hotels about the pending payment"
              autoFocus
            />
          </label>

          <label className="tp-field">
            <span>Description</span>
            <textarea className="tp-input" rows={3} value={form.description} onChange={change("description")} placeholder="What needs to be done?" />
          </label>

          <div className="tp-form-grid">
            <label className="tp-field">
              <span>Type</span>
              <input className="tp-input" list="tp-task-types" value={form.task_type} onChange={change("task_type")} placeholder="e.g. Follow-up" />
              <datalist id="tp-task-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="tp-field">
              <span>Priority</span>
              <select className="tp-input" value={form.priority} onChange={change("priority")}>
                {Object.entries(PRIORITY).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`tp-field ${repeat ? "tp-field-full" : ""}`}>
              <span>Assign to</span>
              <select className="tp-input" value={form.assigned_to || ""} onChange={change("assigned_to")}>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.role ? ` — ${u.role}` : ""}
                    {u.id === viewer.id ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {!repeat && (
              <label className="tp-field">
                <span>Due date &amp; time</span>
                <div className="tp-duo">
                  <input className="tp-input" type="date" value={form.due_date} onChange={change("due_date")} />
                  <input className="tp-input" type="time" value={form.due_time} onChange={change("due_time")} />
                </div>
              </label>
            )}
          </div>

          <label className="tp-switch">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <span className="tp-switch-track" />
            <span className="tp-switch-text">
              <strong>
                <FiRepeat /> Repeat this task
              </strong>
              <small>Creates a recurring schedule instead of a single task — the first occurrence(s) are created right away.</small>
            </span>
          </label>

          {repeat && (
            <div className="tp-recurrence">
              <div className="tp-form-grid">
                <label className="tp-field">
                  <span>Frequency</span>
                  <select className="tp-input" value={rec.frequency} onChange={changeRec("frequency")}>
                    {RECURRENCE_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f.charAt(0) + f.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tp-field">
                  <span>Every</span>
                  <div className="tp-duo">
                    <input className="tp-input" type="number" min={1} max={999} value={rec.interval_value} onChange={changeRec("interval_value")} />
                    <span className="tp-unit">{FREQ_UNIT[rec.frequency]}{Number(rec.interval_value) === 1 ? "" : "s"}</span>
                  </div>
                </label>
                <label className="tp-field">
                  <span>Starts</span>
                  <input className="tp-input" type="date" value={rec.start_date} onChange={changeRec("start_date")} />
                </label>
                <label className="tp-field">
                  <span>At</span>
                  <input className="tp-input" type="time" value={rec.time_of_day} onChange={changeRec("time_of_day")} />
                </label>
              </div>

              {rec.frequency === "WEEKLY" && (
                <div className="tp-field">
                  <span>On these days</span>
                  <div className="tp-weekdays">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button key={label} type="button" className={rec.days_of_week.includes(i) ? "on" : ""} onClick={() => toggleWeekday(i)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rec.frequency === "MONTHLY" && (
                <div className="tp-field">
                  <span>On</span>
                  <div className="tp-seg">
                    <button type="button" className={!rec.use_last_day_of_month ? "on" : ""} onClick={() => setRec((r) => ({ ...r, use_last_day_of_month: false }))}>
                      Day of month
                    </button>
                    <button type="button" className={rec.use_last_day_of_month ? "on" : ""} onClick={() => setRec((r) => ({ ...r, use_last_day_of_month: true }))}>
                      Last day
                    </button>
                  </div>
                  {!rec.use_last_day_of_month && (
                    <input className="tp-input" style={{ marginTop: 8, maxWidth: 100 }} type="number" min={1} max={31} value={rec.day_of_month} onChange={changeRec("day_of_month")} />
                  )}
                </div>
              )}

              {rec.frequency === "YEARLY" && (
                <div className="tp-form-grid">
                  <label className="tp-field">
                    <span>Month</span>
                    <select className="tp-input" value={rec.month_of_year} onChange={changeRec("month_of_year")}>
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="tp-field">
                    <span>Day</span>
                    <input className="tp-input" type="number" min={1} max={31} value={rec.day_of_month} onChange={changeRec("day_of_month")} />
                  </label>
                </div>
              )}

              <div className="tp-field">
                <span>Ends</span>
                <div className="tp-seg">
                  {[["NEVER", "Never"], ["ON_DATE", "On date"], ["AFTER_COUNT", "After N times"]].map(([k, label]) => (
                    <button key={k} type="button" className={rec.end_type === k ? "on" : ""} onClick={() => setRec((r) => ({ ...r, end_type: k }))}>
                      {label}
                    </button>
                  ))}
                </div>
                {rec.end_type === "ON_DATE" && (
                  <input className="tp-input" style={{ marginTop: 8 }} type="date" value={rec.end_date} onChange={changeRec("end_date")} />
                )}
                {rec.end_type === "AFTER_COUNT" && (
                  <input className="tp-input" style={{ marginTop: 8, maxWidth: 100 }} type="number" min={1} max={1000} value={rec.end_count} onChange={changeRec("end_count")} />
                )}
              </div>
            </div>
          )}

          {error && <em className="tp-error">{error}</em>}

          <div className="tp-modal-actions">
            <button type="button" className="tp-btn ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="tp-btn primary" disabled={saving}>
              <FiPlus /> {saving ? "Creating…" : repeat ? "Create schedule" : "Create task"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
