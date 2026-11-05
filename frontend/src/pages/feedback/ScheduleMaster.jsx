import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCalendar, FiCheck, FiChevronDown, FiEdit2, FiPlus, FiRepeat, FiSearch, FiTool, FiTrash2, FiX } from "react-icons/fi";
import { deleteSchedule, formatDay, getScheduleOptions, getSchedules, saveSchedule } from "./feedbackApi";
import { Card, Chip, Empty, ErrorBox, Loading, Modal, PageHead, Switch, Toast } from "./ui";

// Feedback Desk › Masters › Call schedule (admin, service coordinators, operations managers): which
// customers and sites get feedback calls, and how often. Sites without a schedule get no calls.
//   Every few days      a call every 7 / 15 / 30... days (when the site had a service since the last call)
//   Dates of the month  a call on the 1st (and 15th...) of every month (when the site had a service since)
//   After each service  a call the day after each service - optionally only the first N services (a
//                       new customer's first 3), then every N days or no more calls.
// A site's own schedule wins over its customer's (all sites) schedule. Several customers and sites
// can be picked at once: each gets its own schedule.

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] || "?");

const MODES = [
  { value: "EVERY_N_DAYS", label: "Every few days", hint: "Every 7, 15 or 30 days", icon: FiRepeat },
  { value: "MONTH_DAYS", label: "Dates of the month", hint: "e.g. the 1st of every month", icon: FiCalendar },
  { value: "AFTER_EACH_SERVICE", label: "After each service", hint: "The day after a service", icon: FiTool },
];

const EMPTY = {
  targets: [], // [{ company_id, site_id }] - site_id null = all the customer's sites
  mode: "EVERY_N_DAYS",
  every_days: "7",
  month_days: [1],
  limit_first: false,
  first_services: "3",
  then: "every", // after the first N services: "every" N days, or "stop"
  then_every_days: "15",
  service_types: [],
  start_date: todayIso(),
  end_date: "",
  note: "",
  is_active: true,
};

function formOf(s) {
  if (!s) return { ...EMPTY, start_date: todayIso() };
  return {
    targets: [{ company_id: s.customer.id, site_id: s.site?.id || null }],
    mode: s.mode,
    every_days: String(s.every_days || 7),
    month_days: s.month_days?.length ? s.month_days : [1],
    limit_first: Boolean(s.first_services),
    first_services: String(s.first_services || 3),
    then: s.then_every_days ? "every" : s.first_services ? "stop" : "every",
    then_every_days: String(s.then_every_days || 15),
    service_types: s.service_types || [],
    start_date: s.start_date,
    end_date: s.end_date || "",
    note: s.note || "",
    is_active: s.is_active,
  };
}

function bodyOf(f) {
  const after = f.mode === "AFTER_EACH_SERVICE";
  return {
    targets: f.targets,
    mode: f.mode,
    every_days: f.mode === "EVERY_N_DAYS" ? Number(f.every_days) : null,
    month_days: f.mode === "MONTH_DAYS" ? f.month_days : null,
    first_services: after && f.limit_first ? Number(f.first_services) : null,
    then_every_days: after && f.limit_first && f.then === "every" ? Number(f.then_every_days) : null,
    service_types: f.service_types,
    start_date: f.start_date,
    end_date: f.end_date || null,
    note: f.note.trim() || null,
    is_active: f.is_active,
  };
}

/** The rule in words. */
function previewText(f) {
  const only = f.service_types.length ? `, only for ${f.service_types.join(", ")}` : "";
  if (f.mode === "EVERY_N_DAYS") return `A call every ${f.every_days || "?"} days, when the site had a service since the last call${only}.`;
  if (f.mode === "MONTH_DAYS") return `A call on the ${listText([...f.month_days].sort((a, b) => a - b).map(ordinal))} of every month, when the site had a service since the last call${only}.`;
  if (!f.limit_first) return `A call the day after each service${only}.`;
  const then = f.then === "every" ? `, then a call every ${f.then_every_days || "?"} days` : ", then no more calls";
  return `A call the day after each of the first ${f.first_services || "?"} services${then}${only}.`;
}

/**
 * Customers and their sites in one field: type to search, tick customers (all their sites) and / or
 * single sites. single = one pick only (editing a schedule).
 */
function TargetPicker({ customers, value, onChange, single }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const has = (cid, sid) => value.some((t) => t.company_id === cid && (t.site_id || null) === (sid || null));
  const wholeCustomer = (cid) => has(cid, null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return customers.slice(0, 40).map((c) => ({ c, sites: c.sites }));
    return customers
      .map((c) => {
        const nameHit = c.name.toLowerCase().includes(t);
        const sites = nameHit ? c.sites : c.sites.filter((st) => `${st.name} ${st.city || ""}`.toLowerCase().includes(t));
        return nameHit || sites.length ? { c, sites } : null;
      })
      .filter(Boolean)
      .slice(0, 60);
  }, [q, customers]);

  function toggle(cid, sid) {
    const on = has(cid, sid);
    if (single) {
      onChange(on ? [] : [{ company_id: cid, site_id: sid || null }]);
      setOpen(false);
      return;
    }
    if (on) return onChange(value.filter((t) => !(t.company_id === cid && (t.site_id || null) === (sid || null))));
    // A whole customer replaces its single sites.
    const rest = sid ? value : value.filter((t) => t.company_id !== cid);
    onChange([...rest, { company_id: cid, site_id: sid || null }]);
  }

  const label = (t) => {
    const c = byId.get(t.company_id);
    if (!t.site_id) return { main: c?.name || t.company_id, sub: `All ${c?.sites.length || ""} sites`.replace("  ", " ") };
    const st = c?.sites.find((x) => x.id === t.site_id);
    return { main: st?.name || t.site_id, sub: c?.name || "" };
  };

  return (
    <div className={`fb-tp ${open ? "is-open" : ""}`} ref={box}>
      <div className="fb-tp-field" onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
        <FiSearch aria-hidden="true" className="fb-muted" />
        {value.map((t) => {
          const l = label(t);
          return (
            <span key={`${t.company_id}|${t.site_id || ""}`} className="fb-tp-tag">
              <b>{l.main}</b>
              <small>{l.sub}</small>
              <button type="button" aria-label={`Remove ${l.main}`} onClick={(e) => { e.stopPropagation(); toggle(t.company_id, t.site_id); }}>
                <FiX />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setOpen(false))}
          placeholder={value.length ? (single ? "" : "Add more…") : "Search a customer or site"}
          aria-label="Search customers and sites"
        />
        <FiChevronDown aria-hidden="true" className="fb-muted fb-tp-caret" />
      </div>
      {open && (
        <div className="fb-tp-menu" role="listbox" aria-multiselectable={!single}>
          {!matches.length && <div className="fb-tp-empty">No customer or site matches “{q}”.</div>}
          {matches.map(({ c, sites }) => {
            const whole = wholeCustomer(c.id);
            return (
              <div key={c.id} className="fb-tp-group">
                <button type="button" className={`fb-tp-opt is-customer ${whole ? "is-on" : ""}`} onClick={() => toggle(c.id, null)} role="option" aria-selected={whole}>
                  <span className="fb-tp-box">{whole && <FiCheck />}</span>
                  <span className="fb-tp-name">{c.name}</span>
                  <span className="fb-tp-meta">All {c.sites.length} site{c.sites.length === 1 ? "" : "s"}</span>
                </button>
                {sites.map((st) => {
                  const on = whole || has(c.id, st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className={`fb-tp-opt is-site ${on ? "is-on" : ""}`}
                      disabled={whole}
                      onClick={() => toggle(c.id, st.id)}
                      role="option"
                      aria-selected={on}
                    >
                      <span className="fb-tp-box">{on && <FiCheck />}</span>
                      <span className="fb-tp-name">{st.name}</span>
                      {st.city && <span className="fb-tp-meta">{st.city}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!q.trim() && customers.length > 40 && <div className="fb-tp-empty">Type to find the other {customers.length - 40} customers.</div>}
        </div>
      )}
    </div>
  );
}

function ScheduleForm({ schedule, options, onSaved, onClose }) {
  const [f, setF] = useState(() => formOf(schedule));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const toggleIn = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((n) => n !== v) : [...x[k], v] }));

  async function save() {
    if (!f.targets.length) return setError("Pick at least one customer or site");
    if (f.mode === "MONTH_DAYS" && !f.month_days.length) return setError("Pick at least one date of the month");
    setSaving(true);
    setError("");
    try {
      await saveSchedule(schedule?.id, bodyOf(f));
      onSaved(schedule ? "Schedule saved." : `${f.targets.length > 1 ? `${f.targets.length} schedules` : "Schedule"} added. Calls due today are on the Dashboard.`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title={schedule ? "Edit schedule" : "Add a schedule"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="fb-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="fb-btn fb-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : f.targets.length > 1 ? `Save ${f.targets.length} schedules` : "Save schedule"}
          </button>
        </>
      }
    >
      <div className="fb-sched-form">
        <ErrorBox error={error} />

        <section className="fb-sched-sec">
          <div className="fb-sched-label">
            Customers & sites <span className="fb-req">*</span>
            <small>{schedule ? "One customer (all sites) or one site" : "Pick a customer for all its sites, or single sites. Each gets its own schedule."}</small>
          </div>
          <TargetPicker customers={options.customers} value={f.targets} onChange={(targets) => setF((x) => ({ ...x, targets }))} single={Boolean(schedule)} />
        </section>

        <section className="fb-sched-sec">
          <div className="fb-sched-label">When to call</div>
          <div className="fb-sched-modes" role="radiogroup" aria-label="When to call">
            {MODES.map((m) => {
              const on = f.mode === m.value;
              const Icon = m.icon;
              return (
                <button key={m.value} type="button" role="radio" aria-checked={on} className={`fb-sched-mode ${on ? "is-on" : ""}`} onClick={() => setF((x) => ({ ...x, mode: m.value }))}>
                  <Icon aria-hidden="true" />
                  <span>
                    <b>{m.label}</b>
                    <small>{m.hint}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="fb-sched-panel">
            {f.mode === "EVERY_N_DAYS" && (
              <div className="fb-sched-line">
                Call every
                <input type="number" min={1} max={365} className="fb-input fb-input-num" value={f.every_days} onChange={set("every_days")} aria-label="Days" />
                days
                <span className="fb-sched-presets">
                  {[7, 15, 30].map((n) => (
                    <button key={n} type="button" className={`fb-mini-chip ${Number(f.every_days) === n ? "is-on" : ""}`} onClick={() => setF((x) => ({ ...x, every_days: String(n) }))}>
                      {n} days
                    </button>
                  ))}
                </span>
              </div>
            )}

            {f.mode === "MONTH_DAYS" && (
              <div className="fb-month-pick">
                {/* A month calendar: tick the dates the call is made on, every month. */}
                <div className="fb-month-cal" role="group" aria-label="Dates of the month">
                  <div className="fb-month-cal-h">
                    <FiCalendar aria-hidden="true" /> Every month
                  </div>
                  <div className="fb-month-cal-grid">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <button key={d} type="button" className={`fb-month-day ${f.month_days.includes(d) ? "is-on" : ""}`} aria-pressed={f.month_days.includes(d)} onClick={() => toggleIn("month_days", d)}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="fb-month-side">
                  <div className="fb-small fb-muted">Calls on</div>
                  <div className="fb-month-picked">
                    {f.month_days.length ? `The ${listText([...f.month_days].sort((a, b) => a - b).map(ordinal))}` : "No date picked"}
                  </div>
                  <div className="fb-small fb-muted" style={{ marginTop: 6 }}>
                    Quick pick
                  </div>
                  <div className="fb-mini-chips">
                    {[
                      ["1st", [1]],
                      ["1st & 15th", [1, 15]],
                      ["Last day", [31]],
                    ].map(([lbl, days]) => (
                      <button key={lbl} type="button" className={`fb-mini-chip ${JSON.stringify([...f.month_days].sort((a, b) => a - b)) === JSON.stringify(days) ? "is-on" : ""}`} onClick={() => setF((x) => ({ ...x, month_days: days }))}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <span className="fb-small fb-muted" style={{ marginTop: "auto" }}>
                    29, 30 or 31 falls on the last day in shorter months.
                  </span>
                </div>
              </div>
            )}

            {f.mode === "AFTER_EACH_SERVICE" && (
              <div className="fb-stack" style={{ gap: 10 }}>
                <label className="fb-sched-line">
                  <input type="checkbox" checked={f.limit_first} onChange={set("limit_first")} />
                  Only the first
                  <input type="number" min={1} max={100} className="fb-input fb-input-num" value={f.first_services} onChange={set("first_services")} disabled={!f.limit_first} aria-label="Number of services" />
                  services from the start date
                  <span className="fb-small fb-muted">(e.g. a new customer)</span>
                </label>
                {f.limit_first && (
                  <div className="fb-sched-line">
                    After that
                    <select className="fb-select" style={{ width: 150 }} value={f.then} onChange={set("then")} aria-label="After that">
                      <option value="every">call every</option>
                      <option value="stop">no more calls</option>
                    </select>
                    {f.then === "every" && (
                      <>
                        <input type="number" min={1} max={365} className="fb-input fb-input-num" value={f.then_every_days} onChange={set("then_every_days")} aria-label="Days after that" />
                        days
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="fb-sched-sec">
          <div className="fb-sched-label">
            Services that count
            <small>Calls are only about these services.</small>
          </div>
          <div className="fb-mini-chips">
            <button type="button" className={`fb-mini-chip ${!f.service_types.length ? "is-on" : ""}`} onClick={() => setF((x) => ({ ...x, service_types: [] }))}>
              All services
            </button>
            {options.services.map((name) => (
              <button key={name} type="button" className={`fb-mini-chip ${f.service_types.includes(name) ? "is-on" : ""}`} aria-pressed={f.service_types.includes(name)} onClick={() => toggleIn("service_types", name)}>
                {name}
              </button>
            ))}
          </div>
        </section>

        <section className="fb-sched-sec fb-sched-grid is-3">
          <label className="fb-field" htmlFor="fb-sc-start">
            <span>
              Start date <span className="fb-req">*</span>
            </span>
            <input id="fb-sc-start" type="date" className="fb-input" value={f.start_date} onChange={set("start_date")} />
          </label>
          <label className="fb-field" htmlFor="fb-sc-end">
            End date (optional)
            <input id="fb-sc-end" type="date" className="fb-input" value={f.end_date} min={f.start_date || undefined} onChange={set("end_date")} />
          </label>
          <label className="fb-field" htmlFor="fb-sc-note">
            Note (optional)
            <input id="fb-sc-note" className="fb-input" maxLength={300} placeholder="e.g. New customer" value={f.note} onChange={set("note")} />
          </label>
        </section>

        <div className="fb-sched-preview">
          <FiCalendar aria-hidden="true" />
          <span>{previewText(f)}</span>
        </div>
      </div>
    </Modal>
  );
}

export default function ScheduleMaster() {
  const [schedules, setSchedules] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const [editing, setEditing] = useState(null); // a schedule, or "new"
  const [removing, setRemoving] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    Promise.all([getSchedules(), getScheduleOptions()])
      .then(([s, o]) => {
        setSchedules(s.schedules || []);
        setOptions(o);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  if (!schedules || !options) return error ? <ErrorBox error={error} onRetry={load} /> : <Loading />;

  const shown = schedules.filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || s.customer.name.toLowerCase().includes(t) || (s.site?.name || "").toLowerCase().includes(t);
  });

  async function toggle(s, on) {
    setError("");
    try {
      const body = { ...bodyOf(formOf(s)), is_active: on };
      setSchedules((await saveSchedule(s.id, body)).schedules);
      setNotice(on ? "Schedule switched on." : "Schedule switched off. No new calls for it.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    setError("");
    try {
      setSchedules((await deleteSchedule(removing.id)).schedules);
      setNotice("Schedule deleted. Its calls stay on the Dashboard.");
    } catch (err) {
      setError(err.message);
    }
    setRemoving(null);
  }

  return (
    <>
      <PageHead
        title="Call schedule"
        sub="Only the customers and sites set here get feedback calls. Each call shows on the Dashboard on its due date."
        actions={
          <button type="button" className="fb-btn fb-btn-primary" onClick={() => setEditing("new")}>
            <FiPlus aria-hidden="true" /> Add schedule
          </button>
        }
      />
      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      <ErrorBox error={error} />

      <Card bodyClass="is-flush">
        <div className="fb-filters">
          <label className="fb-row" style={{ gap: 6, flex: "1 1 220px", maxWidth: 320 }}>
            <FiSearch aria-hidden="true" className="fb-muted" />
            <input className="fb-input" placeholder="Search customer or site" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customer or site" />
          </label>
          <span className="fb-small fb-muted">
            {schedules.filter((s) => s.is_active).length} on · {schedules.length} in all
          </span>
        </div>
        {!shown.length ? (
          <Empty
            title={schedules.length ? "No schedule matches" : "No schedules yet"}
            text={schedules.length ? "Clear the search." : "Add one: pick a customer (or one of its sites) and how often to call. Sites without a schedule get no feedback calls."}
          />
        ) : (
          <div className="fb-table-wrap">
            <table className="fb-table">
              <thead>
                <tr>
                  <th>Customer · Site</th>
                  <th>When to call</th>
                  <th>From</th>
                  <th>Calls made</th>
                  <th>On</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className={s.is_active ? "" : "fb-row-off"}>
                    <td>
                      <div className="fb-strong">{s.customer.name}</div>
                      <div className="fb-small fb-muted">{s.site ? `${s.site.name}${s.site.city ? ` · ${s.site.city}` : ""}` : "All sites"}</div>
                    </td>
                    <td className="fb-small" style={{ maxWidth: 320 }}>
                      {s.text}
                      {s.note && <div className="fb-muted">{s.note}</div>}
                    </td>
                    <td className="fb-small" style={{ whiteSpace: "nowrap" }}>
                      {formatDay(s.start_date)}
                      {s.end_date ? ` – ${formatDay(s.end_date)}` : ""}
                    </td>
                    <td className="fb-small">
                      {s.calls_made ? (
                        <>
                          {s.calls_made} · last due {formatDay(s.last_due_date)}
                        </>
                      ) : (
                        <Chip>None yet</Chip>
                      )}
                    </td>
                    <td>
                      <Switch checked={s.is_active} onChange={(v) => toggle(s, v)} label={`${s.customer.name} schedule on`} />
                    </td>
                    <td className="fb-right" style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="fb-btn fb-btn-sm" onClick={() => setEditing(s)} aria-label="Edit">
                        <FiEdit2 aria-hidden="true" /> Edit
                      </button>{" "}
                      <button type="button" className="fb-btn fb-btn-sm fb-btn-danger-outline" onClick={() => setRemoving(s)} aria-label="Delete">
                        <FiTrash2 aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <ScheduleForm
          schedule={editing === "new" ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setNotice(text);
            load();
          }}
        />
      )}
      {removing && (
        <Modal
          title="Delete this schedule?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="fb-btn fb-btn-danger" onClick={remove}>
                Delete
              </button>
            </>
          }
        >
          <p>
            {removing.customer.name}
            {removing.site ? ` · ${removing.site.name}` : " · all sites"}: {removing.text}. No new calls will be made for it; the calls already made stay.
          </p>
        </Modal>
      )}
    </>
  );
}
