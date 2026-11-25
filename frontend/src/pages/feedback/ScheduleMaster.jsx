import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiAlertCircle, FiCalendar, FiCheck, FiChevronDown, FiEdit2, FiPlus, FiRefreshCw, FiRepeat, FiSearch, FiTool, FiTrash2, FiX, FiXCircle } from "react-icons/fi";
import { deleteSchedule, formatDay, getScheduleOptions, getSchedules, saveSchedule } from "./feedbackApi";
import { Card, Chip, Empty, ErrorBox, Loading, Modal, PageHead, Segmented, Switch, Toast } from "./ui";

// Feedback Desk › Masters › Call schedule (admin, service coordinators, operations managers): which
// customers and sites get feedback calls, and how often. Sites without a schedule get no calls.
//   Every few days      a call every 7 / 15 / 30... days
//   Dates of the month  a call on the 1st (and 15th...) of every month
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
  modes: ["EVERY_N_DAYS"], // one or more ways of calling - each becomes its own schedule
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
    modes: [s.mode],
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

const addDaysIso = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Scheduling an ended schedule again: the same rule for the same length of time, from the day after
// it ended (or today, if that is later).
function renewForm(s) {
  const f = formOf(s);
  const from = [addDaysIso(s.end_date, 1), todayIso()].sort().at(-1);
  return { ...f, start_date: from, end_date: addDaysIso(from, Math.max(1, daysBetween(s.start_date, s.end_date))), is_active: true };
}

// One rule per ticked way of calling.
function ruleOf(f, mode) {
  const after = mode === "AFTER_EACH_SERVICE";
  return {
    mode,
    every_days: mode === "EVERY_N_DAYS" ? Number(f.every_days) : null,
    month_days: mode === "MONTH_DAYS" ? f.month_days : null,
    first_services: after && f.limit_first ? Number(f.first_services) : null,
    then_every_days: after && f.limit_first && f.then === "every" ? Number(f.then_every_days) : null,
  };
}

function bodyOf(f) {
  return {
    targets: f.targets,
    ...ruleOf(f, f.modes[0]),
    rules: f.modes.map((m) => ruleOf(f, m)),
    service_types: [], // every service counts
    start_date: f.start_date,
    end_date: f.end_date || null,
    note: f.note.trim() || null,
    is_active: f.is_active,
  };
}

/** The rules in words, one line per ticked way of calling. */
function previewLines(f) {
  return f.modes.map((mode) => previewText(f, mode));
}

function previewText(f, mode) {
  const only = f.service_types.length ? `, only for ${f.service_types.join(", ")}` : "";
  if (mode === "EVERY_N_DAYS") return `A call every ${f.every_days || "?"} days, the first on the start date${f.start_date ? ` (${formatDay(f.start_date)})` : ""}${only}.`;
  if (mode === "MONTH_DAYS") return `A call on the ${listText([...f.month_days].sort((a, b) => a - b).map(ordinal))} of every month${only}.`;
  if (!f.limit_first) return `A call the day after each service${only}.`;
  const then = f.then === "every" ? `, then a call every ${f.then_every_days || "?"} days` : ", then no more calls";
  return `A call the day after each of the first ${f.first_services || "?"} services${then}${only}.`;
}

/**
 * Customers and their sites in one field: type to search, tick customers (all their sites) and / or
 * single sites. single = one pick only (editing a schedule).
 */
// taken: customers / sites that already have a schedule ([{ company_id, site_id }]); they show greyed
// out and cannot be picked again - their schedule is changed with Edit in the list below.
function TargetPicker({ customers, value, onChange, single, taken = [] }) {
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

  // Already scheduled: the whole customer, or single sites of it.
  const takenWhole = useMemo(() => new Set(taken.filter((t) => !t.site_id).map((t) => t.company_id)), [taken]);
  const takenSites = useMemo(() => new Set(taken.filter((t) => t.site_id).map((t) => t.site_id)), [taken]);
  // The "all sites" row is blocked when the customer, or any of its sites, already has a schedule
  // (a whole-customer schedule would call those sites twice).
  const customerTaken = (c) => takenWhole.has(c.id) || c.sites.some((st) => takenSites.has(st.id));

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return customers.map((c) => ({ c, sites: c.sites }));
    return customers
      .map((c) => {
        const nameHit = c.name.toLowerCase().includes(t);
        const sites = nameHit ? c.sites : c.sites.filter((st) => `${st.name} ${st.city || ""}`.toLowerCase().includes(t));
        return nameHit || sites.length ? { c, sites } : null;
      })
      .filter(Boolean);
  }, [q, customers]);

  // Already scheduled customers and sites are not listed at all (edit those on their schedule).
  // A customer with some sites scheduled shows only its free sites (no "All sites" row: that would
  // call the scheduled ones twice); a customer with nothing left to schedule is left out.
  const visible = useMemo(
    () =>
      matches
        .map(({ c, sites }) => {
          if (takenWhole.has(c.id)) return null;
          const showAll = !customerTaken(c);
          if (c.sites.length <= 1) return showAll ? { c, sites, showAll } : null;
          const free = sites.filter((st) => !takenSites.has(st.id));
          return showAll || free.length ? { c, sites: free, showAll } : null;
        })
        .filter(Boolean),
    // customerTaken reads takenWhole / takenSites
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, takenWhole, takenSites]
  );

  // After a pick the list closes, so the rest of the form is reachable at once;
  // clicking the field opens it again to add more.
  function closeList() {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  }

  function toggle(cid, sid, { fromList = true } = {}) {
    const on = has(cid, sid);
    if (single) {
      onChange(on ? [] : [{ company_id: cid, site_id: sid || null }]);
      closeList();
      return;
    }
    if (on) {
      onChange(value.filter((t) => !(t.company_id === cid && (t.site_id || null) === (sid || null))));
    } else {
      // A whole customer replaces its single sites.
      const rest = sid ? value : value.filter((t) => t.company_id !== cid);
      onChange([...rest, { company_id: cid, site_id: sid || null }]);
    }
    if (fromList) closeList();
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
              <button type="button" aria-label={`Remove ${l.main}`} onClick={(e) => { e.stopPropagation(); toggle(t.company_id, t.site_id, { fromList: false }); }}>
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
        <div className="fb-tp-menu" role="group" aria-label="Customers and sites">
          {!visible.length && (
            <div className="fb-tp-empty">{q.trim() ? `No customer or site to schedule matches “${q}”.` : "Every customer and site already has a call schedule."}</div>
          )}
          {visible.map(({ c, sites, showAll }) => {
            const whole = wholeCustomer(c.id);
            // A one-site customer is just its customer row.
            const siteRows = c.sites.length > 1 ? sites : [];
            return (
              <div key={c.id} className="fb-tp-group">
                {showAll && (
                  <label className={`fb-tp-opt ${whole ? "is-on" : ""}`}>
                    <input type={single ? "radio" : "checkbox"} checked={whole} onChange={() => toggle(c.id, null)} />
                    <span className="fb-tp-text">
                      <span className="fb-tp-name">{c.name}</span>
                      <span className="fb-tp-meta">
                        {c.sites.length > 1 ? `All ${c.sites.length} sites` : [c.sites[0]?.name, c.sites[0]?.city].filter(Boolean).join(" · ") || "All sites"}
                      </span>
                    </span>
                  </label>
                )}
                {siteRows.map((st) => {
                  const on = whole || has(c.id, st.id);
                  return (
                    <label key={st.id} className={`fb-tp-opt ${on ? "is-on" : ""} ${whole ? "is-disabled" : ""}`}>
                      <input type={single ? "radio" : "checkbox"} checked={on} disabled={whole} onChange={() => toggle(c.id, st.id)} />
                      <span className="fb-tp-text">
                        <span className="fb-tp-name">{c.name}</span>
                        <span className="fb-tp-meta">{[st.name, st.city].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// schedules: the existing schedules - their customers / sites cannot be picked again here
// (except the one being edited).
function ScheduleForm({ schedule, options, onSaved, onClose, renew = false, schedules = [], targets = null }) {
  // targets: a new schedule started from "Not scheduled" (the customer / sites already picked)
  const [f, setF] = useState(() => (renew ? renewForm(schedule) : { ...formOf(schedule), ...(targets && !schedule ? { targets } : {}) }));
  const taken = useMemo(
    () => schedules.filter((s) => s.id !== schedule?.id).map((s) => ({ company_id: s.customer.id, site_id: s.site?.id || null })),
    [schedules, schedule]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const toggleIn = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((n) => n !== v) : [...x[k], v] }));

  async function save() {
    if (!f.targets.length) return setError("Pick at least one customer or site");
    if (!f.modes.length) return setError("Pick when to call");
    if (f.modes.includes("MONTH_DAYS") && !f.month_days.length) return setError("Pick at least one date of the month");
    setSaving(true);
    setError("");
    try {
      await saveSchedule(schedule?.id, bodyOf(f));
      onSaved(renew ? `Scheduled again from ${formatDay(f.start_date)}${f.end_date ? ` to ${formatDay(f.end_date)}` : ""}.` : schedule ? "Schedule saved." : `${f.targets.length > 1 ? `${f.targets.length} schedules` : "Schedule"} added. Calls due today are on the Dashboard.`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title={renew ? "Schedule again" : schedule ? "Edit schedule" : "Add a schedule"}
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
          <TargetPicker customers={options.customers} value={f.targets} onChange={(targets) => setF((x) => ({ ...x, targets }))} single={Boolean(schedule)} taken={taken} />
        </section>

        <section className="fb-sched-sec">
          <div className="fb-sched-label">
            When to call <small>Pick one or more. Each one becomes its own schedule; a site never gets two calls at once.</small>
          </div>
          <div className="fb-sched-modes" role="group" aria-label="When to call">
            {MODES.map((m) => {
              const on = f.modes.includes(m.value);
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={on}
                  className={`fb-sched-mode ${on ? "is-on" : ""}`}
                  // At least one stays ticked; the order follows the list above.
                  onClick={() => setF((x) => ({ ...x, modes: on ? (x.modes.length > 1 ? x.modes.filter((v) => v !== m.value) : x.modes) : MODES.map((y) => y.value).filter((v) => v === m.value || x.modes.includes(v)) }))}
                >
                  <span className="fb-sched-mode-tick" aria-hidden="true">{on && <FiCheck />}</span>
                  <Icon aria-hidden="true" />
                  <span>
                    <b>{m.label}</b>
                    <small>{m.hint}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {f.modes.includes("EVERY_N_DAYS") && (
          <div className="fb-sched-panel">
            {f.modes.length > 1 && <div className="fb-sched-panel-h">Every few days</div>}
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
          </div>
          )}

          {f.modes.includes("MONTH_DAYS") && (
          <div className="fb-sched-panel">
            {f.modes.length > 1 && <div className="fb-sched-panel-h">Dates of the month</div>}
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
          </div>
          )}

          {f.modes.includes("AFTER_EACH_SERVICE") && (
          <div className="fb-sched-panel">
            {f.modes.length > 1 && <div className="fb-sched-panel-h">After each service</div>}
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
          </div>
          )}
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
          <span className="fb-stack" style={{ gap: 2 }}>
            {previewLines(f).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Schedules whose end date has passed (still switched on): a card asking to take action - schedule
 * the calls again (the same rule, for the same length of time) or close the schedule. On the
 * Dashboard and the Call schedule page. schedules = the list (else it loads it); onChanged after an action.
 */
export function EndedSchedules({ schedules: given, onChanged }) {
  const [loaded, setLoaded] = useState(null);
  const [options, setOptions] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const reload = useCallback(() => {
    if (given) return;
    getSchedules()
      .then((d) => setLoaded(d.schedules || []))
      .catch(() => setLoaded([]));
  }, [given]);
  useEffect(reload, [reload]);

  const ended = (given || loaded || []).filter((x) => x.ended);
  if (!ended.length && !notice && !renewing) return null;

  function done(text) {
    setNotice(text);
    reload();
    onChanged?.();
  }

  async function startRenew(x) {
    setError("");
    try {
      setOptions(options || (await getScheduleOptions()));
      setRenewing(x);
    } catch (err) {
      setError(err.message);
    }
  }

  async function close(x) {
    setBusy(x.id);
    setError("");
    try {
      await saveSchedule(x.id, { ...bodyOf(formOf(x)), is_active: false });
      done(`${x.customer.name}${x.site ? ` · ${x.site.name}` : ""}: schedule closed. No more calls.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      {ended.length > 0 && (
        <section className="fb-ended" aria-label="Schedules that have ended">
          <div className="fb-ended-head">
            <span className="fb-ended-icon">
              <FiAlertCircle aria-hidden="true" />
            </span>
            <div>
              <div className="fb-ended-title">
                {ended.length === 1 ? "A call schedule has ended" : `${ended.length} call schedules have ended`} · take action
              </div>
              <div className="fb-ended-sub">No more feedback calls are made for these. Schedule the calls again, or close the schedule.</div>
            </div>
          </div>
          <ErrorBox error={error} />
          <div className="fb-ended-list">
            {ended.map((x) => (
              <div key={x.id} className="fb-ended-item">
                <div className="fb-ended-who">
                  <b>{x.customer.name}</b>
                  <span>{x.site ? [x.site.name, x.site.city].filter(Boolean).join(" · ") : "All sites"}</span>
                </div>
                <div className="fb-ended-rule">
                  <span>{x.text}</span>
                  <span>
                    {formatDay(x.start_date)} – {formatDay(x.end_date)} · {x.calls_made} call{x.calls_made === 1 ? "" : "s"} made
                  </span>
                </div>
                <div className="fb-ended-actions">
                  <button type="button" className="fb-btn fb-btn-sm fb-btn-primary" onClick={() => startRenew(x)} disabled={busy === x.id}>
                    <FiRefreshCw aria-hidden="true" /> Schedule again
                  </button>
                  <button type="button" className="fb-btn fb-btn-sm" onClick={() => close(x)} disabled={busy === x.id}>
                    <FiXCircle aria-hidden="true" /> {busy === x.id ? "Closing…" : "Close"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {renewing && options && (
        <ScheduleForm
          renew
          schedule={renewing}
          schedules={given || loaded || []}
          options={options}
          onClose={() => setRenewing(null)}
          onSaved={(text) => {
            setRenewing(null);
            done(text);
          }}
        />
      )}
    </>
  );
}

/**
 * Customers and sites with no call schedule: a customer with nothing scheduled (all its sites), or
 * the sites of a customer that has only some scheduled. "Schedule" opens Add schedule for them.
 */
function notScheduled(customers, schedules) {
  const whole = new Set(schedules.filter((s) => !s.site).map((s) => s.customer.id));
  const sites = new Set(schedules.filter((s) => s.site).map((s) => s.site.id));
  return customers
    .filter((c) => !whole.has(c.id))
    .map((c) => {
      const free = c.sites.filter((st) => !sites.has(st.id));
      return free.length ? { c, free, all: free.length === c.sites.length } : null;
    })
    .filter(Boolean);
}

/** The not scheduled rows for the table: a customer with nothing scheduled (one row), else one row per free site. */
function notScheduledRows(customers, schedules) {
  return notScheduled(customers, schedules).flatMap(({ c, free, all }) =>
    all
      ? [{ key: c.id, customer: c, site: c.sites.length === 1 ? c.sites[0] : null, sites: c.sites.length, targets: [{ company_id: c.id, site_id: null }] }]
      : free.map((st) => ({ key: `${c.id}|${st.id}`, customer: c, site: st, sites: 1, targets: [{ company_id: c.id, site_id: st.id }] }))
  );
}

const PAGE_SIZE = 25; // rows a page on the Call schedule list

/**
 * 5 page numbers around the open page, plus the first and last pages with "…" for the gaps:
 * 1 2 3 4 5 … 20 / 1 … 6 7 8 9 10 … 20 / 1 … 16 17 18 19 20.
 */
function pageNumbers(at, pages) {
  const first = Math.max(1, Math.min(at - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);
  const out = [];
  if (nums[0] > 1) out.push(1);
  if (nums[0] > 2) out.push("…start");
  out.push(...nums);
  if (nums[nums.length - 1] < pages - 1) out.push("…end");
  if (nums[nums.length - 1] < pages) out.push(pages);
  return out;
}

export default function ScheduleMaster() {
  const [schedules, setSchedules] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const [editing, setEditing] = useState(null); // a schedule, or "new"
  const [newTargets, setNewTargets] = useState(null); // "new" started from Not scheduled
  // Scheduled (default) / Not scheduled / All
  const [view, setViewRaw] = useState("NOT"); // opens on Not scheduled
  // 25 rows a page (scheduled first, then not scheduled); a new view or search starts on page 1
  const [page, setPage] = useState(1);
  const setView = (v) => { setViewRaw(v); setPage(1); };
  // Not scheduled rows ticked for a new schedule (keys); "Add schedule" shows only with some ticked
  const [picked, setPicked] = useState(() => new Set());
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

  const t = q.trim().toLowerCase();
  const hit = (customer, site) => !t || customer.name.toLowerCase().includes(t) || `${site?.name || ""} ${site?.city || ""}`.toLowerCase().includes(t);
  // Customers / sites with no schedule (Not scheduled view)
  const unscheduled = notScheduledRows(options.customers || [], schedules);
  const shown = view === "NOT" ? [] : schedules.filter((s) => hit(s.customer, s.site));
  const shownNot = view === "SCHEDULED" ? [] : unscheduled.filter((r) => hit(r.customer, r.site));
  // this page's rows: scheduled ones first, then the not scheduled ones
  const total = shown.length + shownNot.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const at = Math.min(page, pages);
  const from = (at - 1) * PAGE_SIZE;
  const pageShown = shown.slice(from, from + PAGE_SIZE);
  const pageNot = shownNot.slice(Math.max(0, from - shown.length), Math.max(0, from + PAGE_SIZE - shown.length));
  // ticked rows that still have no schedule
  const pickedRows = unscheduled.filter((r) => picked.has(r.key));
  const allShownPicked = pageNot.length > 0 && pageNot.every((r) => picked.has(r.key));
  const pick = (key, on) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(key); else next.delete(key); return next; });
  const pickAllShown = (on) => setPicked((prev) => { const next = new Set(prev); pageNot.forEach((r) => (on ? next.add(r.key) : next.delete(r.key))); return next; });

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
          pickedRows.length > 0 && (
            <button type="button" className="fb-btn fb-btn-primary" onClick={() => { setNewTargets(pickedRows.flatMap((r) => r.targets)); setEditing("new"); }}>
              <FiPlus aria-hidden="true" /> Add schedule ({pickedRows.length})
            </button>
          )
        }
      />
      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      <ErrorBox error={error} />
      {/* Ended schedules are handled on the Alerts page. */}

      <Card bodyClass="is-flush">
        <div className="fb-filters">
          <label className="fb-row" style={{ gap: 6, flex: "1 1 220px", maxWidth: 320 }}>
            <FiSearch aria-hidden="true" className="fb-muted" />
            <input className="fb-input" placeholder="Search customer or site" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search customer or site" />
          </label>
          <span className="fb-small fb-muted">
            {view === "NOT" ? `${unscheduled.length} with no calls` : `${schedules.filter((s) => s.is_active).length} on · ${schedules.length} scheduled`}
          </span>
          {/* Scheduled / Not scheduled / All - in the right corner */}
          <div style={{ marginLeft: "auto" }}>
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "NOT", label: `Not scheduled (${unscheduled.length})` },
                { value: "SCHEDULED", label: `Scheduled (${schedules.length})` },
                { value: "ALL", label: "All" },
              ]}
            />
          </div>
        </div>
        {!shown.length && !shownNot.length ? (
          <Empty
            title={t ? "Nothing matches" : view === "NOT" ? "Everything is scheduled" : "No schedules yet"}
            text={t ? "Clear the search." : view === "NOT" ? "Every customer and site has a call schedule." : "Add one: pick a customer (or one of its sites) and how often to call. Sites without a schedule get no feedback calls."}
          />
        ) : (
          <div className="fb-table-wrap">
            <table className="fb-table">
              <thead>
                <tr>
                  {pageNot.length > 0 && (
                    <th className="fb-check-col">
                      <input type="checkbox" checked={allShownPicked} onChange={(e) => pickAllShown(e.target.checked)} aria-label="Tick every not scheduled row on this page" />
                    </th>
                  )}
                  <th>Customer · Site</th>
                  {view === "NOT" ? (
                    // Not scheduled only: no call columns (they would all be empty)
                    <>
                      <th>Sites</th>
                      <th>Status</th>
                    </>
                  ) : (
                    <>
                      <th>When to call</th>
                      <th>From</th>
                      <th>Calls made</th>
                      <th>On</th>
                      <th aria-label="Actions" />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageShown.map((s) => (
                  <tr key={s.id} className={s.is_active ? "" : "fb-row-off"}>
                    {pageNot.length > 0 && <td className="fb-check-col" />}
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
                      {s.ended && (
                        <div>
                          <span className="fb-ended-chip">Ended · take action</span>
                        </div>
                      )}
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
                {/* Not scheduled: no calls are made; Schedule opens Add schedule with it picked */}
                {pageNot.map((r) => (
                  <tr key={`not-${r.key}`} className={`fb-row-unscheduled ${picked.has(r.key) ? "is-picked" : ""}`} onClick={() => pick(r.key, !picked.has(r.key))}>
                    <td className="fb-check-col" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(r.key)} onChange={(e) => pick(r.key, e.target.checked)} aria-label={`Tick ${r.customer.name}${r.site ? ` ${r.site.name}` : ""}`} />
                    </td>
                    <td>
                      <div className="fb-strong">{r.customer.name}</div>
                      <div className="fb-small fb-muted">{r.site ? `${r.site.name}${r.site.city ? ` · ${r.site.city}` : ""}` : `All ${r.sites} sites`}</div>
                    </td>
                    {view === "NOT" && (
                      <td className="fb-small">{r.site ? "1 site" : `${r.sites} site${r.sites === 1 ? "" : "s"}`}</td>
                    )}
                    {/* one cell across the call columns: nothing to show until it is scheduled */}
                    <td className="fb-small" colSpan={view === "NOT" ? 1 : 5}>
                      <span className="fb-ns-chip">Not scheduled</span>
                      <span className="fb-muted" style={{ marginLeft: 8 }}>No feedback calls are made · tick it, then Add schedule</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="fb-pager">
            <span>
              {from + 1}–{Math.min(from + PAGE_SIZE, total)} of {total}
            </span>
            <div className="fb-row" style={{ gap: 8 }}>
              <button type="button" className="fb-btn fb-btn-sm" disabled={at <= 1} onClick={() => setPage(at - 1)}>
                Previous
              </button>
              {/* page numbers: 5 around the open page, the first / last, "…" between */}
              {pageNumbers(at, pages).map((n) => typeof n === "string" ? (
                <span key={n} className="fb-page-gap" aria-hidden="true">…</span>
              ) : (
                <button key={n} type="button" className={`fb-btn fb-btn-sm fb-page-no ${n === at ? "is-on" : ""}`} aria-current={n === at ? "page" : undefined} onClick={() => setPage(n)}>
                  {n}
                </button>
              ))}
              <button type="button" className="fb-btn fb-btn-sm" disabled={at >= pages} onClick={() => setPage(at + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <ScheduleForm
          schedule={editing === "new" ? null : editing}
          schedules={schedules}
          options={options}
          targets={editing === "new" ? newTargets : null}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setNotice(text);
            setPicked(new Set());
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
