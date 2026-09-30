import { useEffect, useMemo, useRef, useState } from "react";
import { FiAlignLeft, FiCalendar, FiCheck, FiChevronDown, FiClock, FiFlag, FiPlus, FiRepeat, FiSearch, FiTag, FiUser, FiZap } from "react-icons/fi";
import { PRIORITY, WEEKDAY_LABELS } from "./data";
import { assignableUsers, personOf } from "./hierarchy";
import { daysFromToday, fmtDate, fmtTime, todayStr } from "./format";
import { createTask, fetchAllUsers, fetchTaskTypes } from "./tasksApi";
import { useToast } from "./toastContext";
import { Avatar, Drawer } from "./ui";
import { useViewer } from "./viewerContext";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FREQ_UNIT = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };
const REPEATS = [
  ["ONCE", "Once"],
  ["DAILY", "Daily"],
  ["WEEKLY", "Weekly"],
  ["MONTHLY", "Monthly"],
  ["YEARLY", "Yearly"],
];
const FORM_ID = "tp-new-task-form";

const DUE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
];

/** "today" / "tomorrow" / "Fri, 3 Oct" for a 'YYYY-MM-DD'. */
function friendlyDay(key) {
  if (!key) return "";
  if (key === todayStr()) return "today";
  if (key === daysFromToday(1)) return "tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_LABELS[date.getDay()]}, ${fmtDate(key)}`;
}

/** Plain-English schedule, e.g. "every 2 weeks on Mon, Fri". */
function repeatText(freq, rec) {
  const n = Number(rec.interval_value) || 1;
  const every = n > 1 ? `every ${n} ${FREQ_UNIT[freq]}s` : `every ${FREQ_UNIT[freq]}`;
  if (freq === "WEEKLY") return `${every} on ${rec.days_of_week.length ? rec.days_of_week.map((d) => WEEKDAY_LABELS[d]).join(", ") : "…"}`;
  if (freq === "MONTHLY") return `${every} on ${rec.use_last_day_of_month ? "the last day" : `day ${rec.day_of_month}`}`;
  if (freq === "YEARLY") return `${every} on ${rec.day_of_month} ${MONTHS[Number(rec.month_of_year) - 1]}`;
  return every;
}

/* ---------------------------------------------------------------- picker */

/**
 * Searchable "assign to" picker. With no search text people are grouped by
 * department (you first); typing searches name, designation and department.
 */
function PersonPicker({ people, value, onChange, viewerId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const selected = people.find((p) => p.id === value);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (p) => !needle || [p.name, p.designation, p.dept].filter(Boolean).join(" ").toLowerCase().includes(needle);
    const list = people.filter(match);
    if (needle) return [{ label: `${list.length} match${list.length === 1 ? "" : "es"}`, people: list }];
    const me = list.filter((p) => p.id === viewerId);
    const byDept = new Map();
    for (const p of list) {
      if (p.id === viewerId) continue;
      const key = p.dept || "Other";
      if (!byDept.has(key)) byDept.set(key, []);
      byDept.get(key).push(p);
    }
    return [
      ...(me.length ? [{ label: "You", people: me }] : []),
      ...[...byDept].sort(([a], [b]) => (a === "Other") - (b === "Other") || a.localeCompare(b)).map(([label, ps]) => ({ label, people: ps })),
    ];
  }, [people, query, viewerId]);

  const pick = (id) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="tp-picker" ref={rootRef}>
      <button type="button" className={`tp-picker-trigger ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {selected ? (
          <>
            <Avatar name={selected.name} size={28} />
            <span className="tp-picker-text">
              <strong>
                {selected.name}
                {selected.id === viewerId ? " (you)" : ""}
              </strong>
              <small>{[selected.designation, selected.dept].filter(Boolean).join(" · ") || "—"}</small>
            </span>
          </>
        ) : (
          <span className="tp-picker-text">
            <strong>Choose a person</strong>
          </span>
        )}
        <FiChevronDown className="tp-picker-caret" />
      </button>

      {open && (
        <div className="tp-picker-panel">
          <label className="tp-picker-search">
            <FiSearch />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, department, designation…"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  const first = groups[0]?.people[0];
                  if (first) pick(first.id);
                }
              }}
            />
          </label>
          <div className="tp-picker-list">
            {groups.every((g) => g.people.length === 0) && <p className="tp-picker-empty">Nobody matches “{query}”.</p>}
            {groups.map(
              (g) =>
                g.people.length > 0 && (
                  <div key={g.label}>
                    <div className="tp-picker-group">{g.label}</div>
                    {g.people.map((p) => (
                      <button key={p.id} type="button" className={`tp-picker-row ${p.id === value ? "on" : ""}`} onClick={() => pick(p.id)}>
                        <Avatar name={p.name} size={28} />
                        <span className="tp-picker-text">
                          <strong>{p.name}</strong>
                          <small>{[p.designation, query && p.dept].filter(Boolean).join(" · ") || "—"}</small>
                        </span>
                        {p.id === value && <FiCheck className="tp-picker-check" />}
                      </button>
                    ))}
                  </div>
                ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One labelled row of the properties panel. */
function Prop({ icon, label, children, top = false }) {
  const Icon = icon;
  return (
    <div className={`tp-nt-prop ${top ? "top" : ""}`}>
      <span className="tp-nt-prop-label">
        <Icon /> {label}
      </span>
      <div className="tp-nt-prop-body">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ form */

const blankRec = () => ({
  interval_value: 1,
  days_of_week: [new Date().getDay()],
  day_of_month: new Date().getDate(),
  use_last_day_of_month: false,
  month_of_year: new Date().getMonth() + 1,
  time_of_day: "09:00",
  start_date: todayStr(),
  end_type: "NEVER",
  end_date: "",
  end_count: 10,
});

/**
 * The New Task panel. With `copyFrom` (an existing task) it opens pre-filled
 * as "Duplicate task": same title, details, assignee, priority and time. A
 * due date that has already passed moves to tomorrow. Nothing is created
 * until the user presses Create.
 */
export default function NewTaskModal({ onClose, onCreated, copyFrom = null }) {
  const toast = useToast();
  const viewer = useViewer();
  const titleRef = useRef(null);
  const [allUsers, setAllUsers] = useState([]);
  const [types, setTypes] = useState([]);

  // Focus the title without letting the browser scroll anything into view
  // (which is what the autoFocus attribute does, mid-slide).
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (viewer.isAdmin) fetchAllUsers().then(setAllUsers);
    fetchTaskTypes().then(setTypes).catch(() => {});
  }, [viewer.isAdmin]);

  // Everyone this viewer may assign to, with designation + department from
  // the org directory so the picker can group and search on them.
  const people = useMemo(
    () =>
      assignableUsers(viewer, allUsers).map((p) => {
        const card = personOf(viewer, p.id);
        return { ...p, designation: card?.designation || p.designation || p.role || "", dept: card?.dept || p.unit_name || "" };
      }),
    [viewer, allUsers],
  );

  const copyDuePassed = !!copyFrom?.due_date && copyFrom.due_date < todayStr();
  const [form, setForm] = useState(() =>
    copyFrom
      ? {
          title: copyFrom.title || "",
          description: copyFrom.description || "",
          task_type: copyFrom.task_type || "",
          priority: copyFrom.priority || "NORMAL",
          assigned_to: copyFrom.assigned_to ?? viewer.id,
          due_date: copyFrom.due_date && !copyDuePassed ? copyFrom.due_date : daysFromToday(1),
          due_time: copyFrom.due_time ? String(copyFrom.due_time).slice(0, 5) : "",
        }
      : {
          title: "",
          description: "",
          task_type: "",
          priority: "NORMAL",
          assigned_to: viewer.id,
          due_date: daysFromToday(1),
          due_time: "",
        },
  );
  const [repeat, setRepeat] = useState("ONCE");
  const [rec, setRec] = useState(blankRec);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isRepeat = repeat !== "ONCE";

  useEffect(() => {
    // people[0] may not be loaded yet on first render; keep the selection valid.
    if (!people.some((p) => p.id === form.assigned_to) && people[0]) {
      setForm((f) => ({ ...f, assigned_to: people[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const change = (key) => (e) => set(key, e.target.value);
  const setR = (key, value) => setRec((r) => ({ ...r, [key]: value }));
  const changeRec = (key) => (e) => setR(key, e.target.value);

  const toggleWeekday = (n) =>
    setRec((r) => ({
      ...r,
      days_of_week: r.days_of_week.includes(n) ? r.days_of_week.filter((d) => d !== n) : [...r.days_of_week, n].sort(),
    }));

  const quickTypes = types.slice(0, 6);
  const assignee = people.find((p) => p.id === Number(form.assigned_to));

  // The live one-line summary under the form.
  const summary = (() => {
    const who = !assignee ? "Someone" : assignee.id === viewer.id ? "You" : assignee.name;
    const pr = PRIORITY[form.priority].label.toLowerCase();
    if (isRepeat) {
      const ends =
        rec.end_type === "ON_DATE" && rec.end_date ? `, until ${fmtDate(rec.end_date)}` : rec.end_type === "AFTER_COUNT" ? `, ${rec.end_count} times` : "";
      return { who, text: `${pr}-priority task ${repeatText(repeat, rec)} at ${fmtTime(`${rec.time_of_day || "09:00"}:00`)}, starting ${friendlyDay(rec.start_date)}${ends}.` };
    }
    const at = form.due_time ? ` at ${fmtTime(`${form.due_time}:00`)}` : "";
    return { who, text: `${pr}-priority task, due ${friendlyDay(form.due_date) || "…"}${at}.` };
  })();

  async function submit(e, close) {
    e?.preventDefault();
    if (saving) return;
    if (!form.title.trim()) {
      setError("Give the task a title.");
      titleRef.current?.focus();
      return;
    }
    if (repeat === "WEEKLY" && rec.days_of_week.length === 0) {
      setError("Pick at least one day of the week.");
      return;
    }
    if (isRepeat && rec.end_type === "ON_DATE" && !rec.end_date) {
      setError("Pick the date the schedule ends.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      task_type: form.task_type.trim() || undefined,
      priority: form.priority,
      assigned_to: Number(form.assigned_to),
      // A duplicate keeps what the original was linked to (customer, invoice…).
      ...(copyFrom?.source_module ? { source_module: copyFrom.source_module, source_id: copyFrom.source_id } : {}),
    };

    if (isRepeat) {
      payload.recurrence = {
        frequency: repeat,
        interval_value: Number(rec.interval_value) || 1,
        start_date: rec.start_date,
        time_of_day: `${rec.time_of_day || "09:00"}:00`,
        end_type: rec.end_type,
        ...(repeat === "WEEKLY" ? { days_of_week: rec.days_of_week } : {}),
        ...(repeat === "MONTHLY" ? (rec.use_last_day_of_month ? { use_last_day_of_month: true } : { day_of_month: Number(rec.day_of_month) }) : {}),
        ...(repeat === "YEARLY" ? { month_of_year: Number(rec.month_of_year), day_of_month: Number(rec.day_of_month) } : {}),
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
      // A schedule whose first date is still ahead (a future start, or a
      // weekly rule that doesn't include today) creates no task yet — there
      // is nothing to open, so just say when the first one will appear.
      const opened = isRepeat ? created.tasks?.[0] : created;
      toast.push({
        type: "success",
        title: isRepeat ? "Schedule created" : "Task created",
        text: isRepeat
          ? created.occurrences_created > 0
            ? `${created.occurrences_created} task${created.occurrences_created === 1 ? "" : "s"} created`
            : created.next_occurrence_date
              ? `First task on ${fmtDate(created.next_occurrence_date)}`
              : undefined
          : payload.title,
      });
      close();
      if (opened) onCreated?.(opened);
    } catch (err) {
      setError(err.message || "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={copyFrom ? "Duplicate task" : "New task"}
      subtitle={copyFrom ? `Copied from “${copyFrom.title}”. Change anything you need, then create.` : "Assign work to yourself or someone on your team"}
      onClose={onClose}
      footer={(close) => (
        <>
          <span className="tp-nt-kbd">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          </span>
          <button type="button" className="tp-btn ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} className="tp-btn primary" disabled={saving}>
            <FiPlus /> {saving ? "Creating…" : isRepeat ? "Create schedule" : "Create task"}
          </button>
        </>
      )}
    >
      {(close) => (
        <form
          id={FORM_ID}
          className="tp-nt"
          onSubmit={(e) => submit(e, close)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e, close);
          }}
          noValidate
        >
          <div className="tp-nt-head">
            <input
              ref={titleRef}
              className={`tp-nt-title ${error && !form.title.trim() ? "invalid" : ""}`}
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
              <textarea
                rows={1}
                value={form.description}
                onChange={change("description")}
                placeholder="Add a description, context or links…"
                aria-label="Description"
              />
            </label>
          </div>

          <div className="tp-nt-props">
            <Prop icon={FiUser} label="Assignee">
              <PersonPicker people={people} value={Number(form.assigned_to)} onChange={(id) => set("assigned_to", id)} viewerId={viewer.id} />
            </Prop>

            <Prop icon={FiFlag} label="Priority">
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
            </Prop>

            <Prop icon={FiTag} label="Type" top>
              <input className="tp-input" list="tp-task-types" value={form.task_type} onChange={change("task_type")} placeholder="e.g. Follow-up, Site visit" />
              <datalist id="tp-task-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {quickTypes.length > 0 && (
                <div className="tp-nt-pills small">
                  {quickTypes.map((t) => (
                    <button key={t} type="button" className={form.task_type === t ? "on" : ""} onClick={() => set("task_type", form.task_type === t ? "" : t)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </Prop>

            <Prop icon={FiRepeat} label="Repeat">
              <div className="tp-nt-pills">
                {REPEATS.map(([k, label]) => (
                  <button key={k} type="button" className={repeat === k ? "on" : ""} onClick={() => setRepeat(k)} aria-pressed={repeat === k}>
                    {label}
                  </button>
                ))}
              </div>
            </Prop>

            {!isRepeat && (
              <Prop icon={FiCalendar} label="Due" top>
                <div className="tp-nt-pills">
                  {DUE_PRESETS.map((d) => {
                    const value = daysFromToday(d.days);
                    return (
                      <button key={d.label} type="button" className={form.due_date === value ? "on" : ""} onClick={() => set("due_date", value)} aria-pressed={form.due_date === value}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                {copyDuePassed && (
                  <small className="tp-nt-hint">The original was due {fmtDate(copyFrom.due_date)}, which has passed, so this starts from tomorrow.</small>
                )}
                <div className="tp-nt-inline">
                  <input className="tp-input" type="date" value={form.due_date} onChange={change("due_date")} aria-label="Due date" />
                  <span className="tp-nt-time">
                    <FiClock />
                    <input className="tp-input" type="time" value={form.due_time} onChange={change("due_time")} aria-label="Due time (optional)" />
                  </span>
                </div>
              </Prop>
            )}

            {isRepeat && (
              <div className="tp-nt-rec">
                <div className="tp-nt-rec-row">
                  <span>Every</span>
                  <input className="tp-input tp-nt-num" type="number" min={1} max={999} value={rec.interval_value} onChange={changeRec("interval_value")} />
                  <span>
                    {FREQ_UNIT[repeat]}
                    {Number(rec.interval_value) === 1 ? "" : "s"}
                  </span>
                  <span className="tp-nt-sep">at</span>
                  <input className="tp-input tp-nt-auto" type="time" value={rec.time_of_day} onChange={changeRec("time_of_day")} aria-label="Time of day" />
                  <span className="tp-nt-sep">from</span>
                  <input className="tp-input tp-nt-auto" type="date" value={rec.start_date} onChange={changeRec("start_date")} aria-label="Start date" />
                </div>

                {repeat === "WEEKLY" && (
                  <div className="tp-weekdays">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button key={label} type="button" className={rec.days_of_week.includes(i) ? "on" : ""} onClick={() => toggleWeekday(i)} aria-pressed={rec.days_of_week.includes(i)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {repeat === "MONTHLY" && (
                  <div className="tp-nt-rec-row">
                    <div className="tp-nt-pills">
                      <button type="button" className={!rec.use_last_day_of_month ? "on" : ""} onClick={() => setR("use_last_day_of_month", false)}>
                        On day
                      </button>
                      <button type="button" className={rec.use_last_day_of_month ? "on" : ""} onClick={() => setR("use_last_day_of_month", true)}>
                        Last day of month
                      </button>
                    </div>
                    {!rec.use_last_day_of_month && (
                      <input className="tp-input tp-nt-num" type="number" min={1} max={31} value={rec.day_of_month} onChange={changeRec("day_of_month")} aria-label="Day of month" />
                    )}
                  </div>
                )}

                {repeat === "YEARLY" && (
                  <div className="tp-nt-rec-row">
                    <span>On</span>
                    <input className="tp-input tp-nt-num" type="number" min={1} max={31} value={rec.day_of_month} onChange={changeRec("day_of_month")} aria-label="Day" />
                    <select className="tp-input tp-nt-auto" value={rec.month_of_year} onChange={changeRec("month_of_year")} aria-label="Month">
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="tp-nt-rec-row">
                  <span>Ends</span>
                  <div className="tp-nt-pills">
                    {[
                      ["NEVER", "Never"],
                      ["ON_DATE", "On a date"],
                      ["AFTER_COUNT", "After…"],
                    ].map(([k, label]) => (
                      <button key={k} type="button" className={rec.end_type === k ? "on" : ""} onClick={() => setR("end_type", k)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {rec.end_type === "ON_DATE" && <input className="tp-input tp-nt-auto" type="date" value={rec.end_date} min={rec.start_date} onChange={changeRec("end_date")} aria-label="End date" />}
                  {rec.end_type === "AFTER_COUNT" && (
                    <>
                      <input className="tp-input tp-nt-num" type="number" min={1} max={1000} value={rec.end_count} onChange={changeRec("end_count")} aria-label="Number of times" />
                      <span>times</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="tp-nt-summary" aria-live="polite">
            <span className="tp-nt-summary-icon">
              <FiZap />
            </span>
            <p>
              <strong>{summary.who}</strong> {summary.who === "You" ? "get" : "gets"} a {summary.text}
            </p>
          </div>

          {error && <em className="tp-error">{error}</em>}
        </form>
      )}
    </Drawer>
  );
}
