import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyRow, Pager } from "../accountant/ui";
import { ApiError, billingGet, billingPut, qs, useBilling } from "./billingApi";
import { dmy, monthLabel, nextMonthStart, thisMonth } from "./format";
import { Field, Kpi, Msg } from "./ui";
import useDebounced from "./useDebounced";

// Service Plans (set by the Service Coordinator): for each customer, which services it gets and
// how many each month (counted across all its outlets), and how many print copies. One invoice
// per month for all outlets. A change starts from the 1st of a month; the month in progress keeps its plan.

const PAGE_SIZE = 25;

// The plan's lines, one per service. Lines saved earlier per outlet (the same service at several
// outlets) become one line with their visits added up; saving stores it for the whole customer.
function byService(lines) {
  const map = new Map();
  for (const l of lines) {
    const name = String(l.sub_service || "").trim();
    const k = name.toLowerCase();
    const visits = Number(l.visits_per_month) || 0;
    if (map.has(k)) map.get(k).visits_per_month = Math.min(31, map.get(k).visits_per_month + visits);
    else map.set(k, { key: map.size, sub_service: name, visits_per_month: visits || 1 });
  }
  return [...map.values()];
}

// 1st, 2nd, 3rd, 4th ... 21st, 22nd, 23rd, 31st.
function ordinal(value) {
  const n = Number(value) || 0;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
}

// − [ n ] + : type the number or step it, kept between min and max.
function Stepper({ id, label, value, min, max, onChange }) {
  const n = Number(value);
  return (
    <div className="bl-stp sp-stp">
      <button type="button" onClick={() => onChange(Math.max(min, (Number.isFinite(n) ? n : min) - 1))} aria-label={`Less: ${label}`}>−</button>
      <input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <button type="button" onClick={() => onChange(Math.min(max, (Number.isFinite(n) && value !== "" ? n : min - 1) + 1))} aria-label={`More: ${label}`}>+</button>
    </div>
  );
}

export default function ServicePlans() {
  const { me } = useOutletContext();
  const canEdit = me.can("MANAGE_SERVICE_PLANS");
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState("");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/service-plans${qs({ q, missing, page: page + 1, page_size: PAGE_SIZE })}`);
  const [selected, setSelected] = useState(null); // { company_id, customer } or { new: true }
  const s = data?.summary;
  const rows = data?.rows || [];

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Service Plans</h1>
          <p className="ac-sub">The services each customer gets every month, and how many invoice copies to print. Accounts bills from these.</p>
        </div>
        {canEdit && (
          <div className="ac-actions">
            <button type="button" className="ac-btn ac-btn-primary" onClick={() => setSelected({ new: true })}>+ New service plan</button>
          </div>
        )}
      </div>

      <div className="ac-kpis bl-kpis-4">
        <Kpi color="blue" label="Customers with a plan" value={s?.with_plan ?? "—"} note={s ? `of ${s.with_plan + s.without_plan} active` : ""} onClick={() => { setMissing("false"); setPage(0); }} active={missing === "false"} />
        <Kpi color="green" label={`Services planned · ${monthLabel(thisMonth()).split(" ")[0].slice(0, 3)}`} value={s ? s.planned_this_month.toLocaleString("en-IN") : "—"} note="visits this month" onClick={() => { setMissing(""); setPage(0); }} active={missing === ""} />
        <Kpi color="orange" label="Without a plan" value={s?.without_plan ?? "—"} note="billing blocked until set" onClick={() => { setMissing("true"); setPage(0); }} active={missing === "true"} />
        <Kpi color="purple" label="Changes waiting" value={s?.pending_changes ?? "—"} note="start on their effective date" />
      </div>

      <div className={selected ? "bl-split wide" : ""}>
        <div className="ac-card">
          <input className="ac-input" style={{ marginBottom: 12 }} placeholder="Search customer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <Msg error={error} />
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead>
                <tr>
                  <th>Customer</th><th className="ac-num">Outlets</th><th>Services per month</th><th className="ac-num">Total</th>
                  <th className="ac-num">Print copies</th><th className="ac-num">Invoices / month</th><th>Effective from</th><th>Updated by</th>
                </tr>
              </thead>
              <tbody>
                {loading || !rows.length ? (
                  <EmptyRow cols={8} loading={loading} text="No customers to plan yet. Customers with an active contract appear here." />
                ) : (
                  rows.map((r) => (
                    <tr key={r.company_id} className={`bl-click ${!r.plan_id ? "bl-due" : ""} ${selected?.company_id === r.company_id ? "bl-sel" : ""}`} onClick={() => setSelected({ company_id: r.company_id, customer: r.customer })}>
                      <td><b>{r.customer}</b>{r.pending_change && <div className="bl-sub">Change from {dmy(r.pending_change.effective_from)}</div>}</td>
                      <td className="bl-num">{r.outlets}</td>
                      <td>{r.services_summary || <span className="bl-svc due">No plan set</span>}</td>
                      <td className="bl-num"><b>{r.services_per_month ?? "—"}</b></td>
                      <td className="bl-num">{r.print_copies ?? "—"}</td>
                      <td className="bl-num">{r.invoices_per_month ?? "—"}</td>
                      <td>{r.effective_from ? dmy(r.effective_from) : "—"}</td>
                      <td className="ac-sub">{r.plan_id ? r.updated_by || "—" : canEdit ? <button type="button" className="ac-btn sm">Set plan</button> : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data && <Pager total={data.total} pageSize={PAGE_SIZE} page={page} onPage={setPage} />}
        </div>

        {selected && (
          <PlanPanel
            key={selected.company_id || "new"}
            target={selected}
            canEdit={canEdit}
            onClose={() => setSelected(null)}
            onSaved={(companyId, customer) => {
              setSelected({ company_id: companyId, customer });
              reload();
            }}
          />
        )}
      </div>
    </div>
  );
}

function PlanPanel({ target, canEdit, onClose, onSaved }) {
  const [companyId, setCompanyId] = useState(target.company_id || "");
  const { data: customers } = useBilling(target.new ? "/customers" : null);
  const { data: options } = useBilling(companyId ? `/service-options${qs({ company_id: companyId })}` : null);
  const [loaded, setLoaded] = useState({ key: null, plan: null, history: [], form: null });
  const [tab, setTab] = useState("plan");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [edits, setEdits] = useState(null);

  // Load the customer's plan and its history when the customer is chosen (and after a save).
  const loadKey = companyId ? `${companyId}|${reloadKey}` : null;
  useEffect(() => {
    if (!companyId) return undefined;
    let live = true;
    const key = `${companyId}|${reloadKey}`;
    Promise.all([
      billingGet(`/service-plans/${encodeURIComponent(companyId)}`).catch((err) => (err instanceof ApiError && err.status === 404 ? null : Promise.reject(err))),
      billingGet(`/service-plans/${encodeURIComponent(companyId)}/history`).catch(() => []),
    ])
      .then(([p, h]) => {
        if (!live) return;
        setEdits(null);
        setLoaded({
          key,
          plan: p,
          history: h,
          form: {
            effective_from: p && p.effective_from >= `${thisMonth()}-01` ? p.effective_from : p ? nextMonthStart() : `${thisMonth()}-01`,
            print_copies: p?.print_copies || 1,
            shortfall_highlight_day: p?.shortfall_highlight_day || 25,
            lines: byService(p?.lines || []),
          },
        });
      })
      .catch((err) => live && setMsg({ error: err.message }));
    return () => {
      live = false;
    };
  }, [companyId, reloadKey]);

  const ready = loaded.key === loadKey;
  const plan = ready ? loaded.plan : undefined;
  const history = ready ? loaded.history : [];
  const form = ready ? edits || loaded.form : null;

  // The service names jobs carry (General Pest Control (GPC), Mosquito Fogging, ...), which is what the
  // Service Tracker matches the plan on: this customer's own first, then every other one in use.
  const customerServices = useMemo(
    () => [...new Set((options?.services || []).map((s) => s.sub_service).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [options]
  );
  const otherServices = useMemo(
    () => (options?.all_services || []).filter((name) => name && !customerServices.includes(name)),
    [options, customerServices]
  );
  const serviceNames = useMemo(() => [...customerServices, ...otherServices], [customerServices, otherServices]);
  const total = form ? form.lines.reduce((t, l) => t + (Number(l.visits_per_month) || 0), 0) : 0;
  const customerName = target.customer || customers?.find((c) => c.company_id === companyId)?.name || "";
  const set = (patch) => setEdits({ ...form, ...patch });
  const setLine = (key, patch) => set({ lines: form.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  async function save() {
    const blank = form.lines.findIndex((l) => !String(l.sub_service || "").trim());
    if (blank >= 0) {
      setMsg({ error: `Row ${blank + 1}: choose the service.` });
      return;
    }
    const copies = Number(form.print_copies);
    if (!Number.isInteger(copies) || copies < 1 || copies > 4) {
      setMsg({ error: "Invoice print copies must be from 1 to 4." });
      return;
    }
    const markDay = Number(form.shortfall_highlight_day);
    if (!Number.isInteger(markDay) || markDay < 1 || markDay > 31) {
      setMsg({ error: "“Mark short from day” must be a day from 1 to 31." });
      return;
    }
    const badVisits = form.lines.findIndex((l) => !Number.isInteger(Number(l.visits_per_month)) || Number(l.visits_per_month) < 1 || Number(l.visits_per_month) > 31);
    if (badVisits >= 0) {
      setMsg({ error: `Row ${badVisits + 1}: services per month must be from 1 to 31.` });
      return;
    }
    setBusy(true);
    setMsg({});
    try {
      const r = await billingPut(`/service-plans/${encodeURIComponent(companyId)}`, {
        effective_from: form.effective_from,
        print_copies: copies,
        // One invoice for all outlets; each service is planned for the whole customer (no outlet, any job type).
        invoice_split: "ALL_OUTLETS",
        shortfall_highlight_day: markDay,
        lines: form.lines.map((l) => ({ site_id: null, service_type: null, sub_service: l.sub_service, visits_per_month: Number(l.visits_per_month) })),
      });
      setMsg({ ok: r.status === "ACTIVE" ? `Plan saved (version ${r.version}), in force now.` : `Plan version ${r.version} saved. It starts on ${dmy(r.effective_from)}; this month keeps the current plan.` });
      setReloadKey((k) => k + 1);
      onSaved(companyId, customerName);
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  const readOnly = !canEdit;
  const minMonth = thisMonth();

  return (
    <div className="ac-card">
      <div className="bl-panel-title">
        <h3 className="ac-card-title" style={{ margin: 0 }}>{target.new && !companyId ? "New service plan" : `${canEdit ? "Edit plan" : "Plan"} · ${customerName}`}</h3>
        <div className="ac-actions">
          {plan && <span className={`ac-badge ${plan.status === "ACTIVE" ? "b-green" : "b-amber"}`}>{plan.status === "ACTIVE" ? "Active" : "Scheduled"}</span>}
          <button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      {target.new && (
        <Field label="Customer" required>
          <select className="ac-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Choose a customer…</option>
            {(customers || []).map((c) => <option key={c.company_id} value={c.company_id}>{c.name}{c.has_service_plan ? " (has a plan)" : ""}</option>)}
          </select>
        </Field>
      )}

      {companyId && (
        <div className="ac-tabs bl-tabs" style={{ marginTop: 8 }}>
          <button type="button" className={`ac-tab ${tab === "plan" ? "active" : ""}`} onClick={() => setTab("plan")}>Plan</button>
          <button type="button" className={`ac-tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>History ({history.length})</button>
        </div>
      )}

      {companyId && plan === undefined && !msg.error && <div className="ac-sub">Loading…</div>}

      {companyId && form && tab === "plan" && (
        <>
          {/* 1. Services every month */}
          <div className="sp-section">
            <div className="sp-section-title">Services every month <span>Total {total} / month</span></div>
            {!form.lines.length && <div className="sp-help">{readOnly ? "No services planned." : "Add the services this customer gets every month."}</div>}
            {form.lines.map((l) => (
              <div className="sp-service" key={l.key}>
                {readOnly ? (
                  <><span className="sp-name">{l.sub_service}</span><b>{l.visits_per_month} / month</b></>
                ) : (
                  <>
                      <select className="ac-select" value={l.sub_service || ""} onChange={(e) => setLine(l.key, { sub_service: e.target.value })} aria-label="Service">
                        <option value="">Choose the service…</option>
                        {customerServices.length > 0 && (
                          <optgroup label="Used for this customer">
                            {customerServices.map((name) => <option key={name} value={name}>{name}</option>)}
                          </optgroup>
                        )}
                        {otherServices.length > 0 && (
                          <optgroup label={customerServices.length ? "Other services" : "Services"}>
                            {otherServices.map((name) => <option key={name} value={name}>{name}</option>)}
                          </optgroup>
                        )}
                        {/* a service saved earlier that no job has any more stays selectable */}
                        {l.sub_service && !serviceNames.includes(l.sub_service) && <option value={l.sub_service}>{l.sub_service}</option>}
                      </select>
                      <Stepper label="Visits per month" value={l.visits_per_month} min={1} max={31} onChange={(v) => setLine(l.key, { visits_per_month: v })} />
                      <button type="button" className="bl-x" onClick={() => set({ lines: form.lines.filter((x) => x.key !== l.key) })} aria-label="Remove service" title="Remove">✕</button>
                  </>
                )}
              </div>
            ))}
            {!readOnly && options && !serviceNames.length && (
              <div className="sp-help">No services are recorded on any job yet, so there is nothing to choose.</div>
            )}
            {!readOnly && (
              <button type="button" className="sp-add" onClick={() => set({ lines: [...form.lines, { key: Date.now(), sub_service: "", visits_per_month: 1 }] })}>+ Add service</button>
            )}
          </div>

          {/* 2. Settings */}
          <div className="sp-section">
            <div className="sp-section-title">Settings</div>
            <div className="sp-row">
              <label htmlFor="sp-copies">Invoice print copies</label>
              {readOnly ? <b>{form.print_copies}</b> : (
                <Stepper id="sp-copies" label="Invoice print copies" value={form.print_copies} min={1} max={4} onChange={(v) => set({ print_copies: v })} />
              )}
            </div>
            <div className="sp-row">
              <label htmlFor="sp-from">Plan starts from</label>
              <input id="sp-from" type="month" className="ac-input" min={minMonth} disabled={readOnly} value={form.effective_from.slice(0, 7)} onChange={(e) => e.target.value && set({ effective_from: `${e.target.value}-01` })} />
            </div>
            <div className="sp-row">
              <label htmlFor="sp-day">Mark short from day</label>
              {readOnly ? <b>{form.shortfall_highlight_day}</b> : (
                <Stepper id="sp-day" label="Mark short from day of the month" value={form.shortfall_highlight_day} min={1} max={31} onChange={(v) => set({ shortfall_highlight_day: v })} />
              )}
            </div>
            <p className="sp-help">
              From the {ordinal(form.shortfall_highlight_day)} of every month, this customer is shown in red on the Service Tracker if
              any planned service is still not done. A reminder only; it does not change the invoice.
            </p>
          </div>

          {!readOnly && (
            <div className="sp-note">
              ⓘ Starts on {dmy(form.effective_from)}. {form.effective_from > `${thisMonth()}-01` ? `${monthLabel(thisMonth())} keeps the current plan.` : "This replaces the plan for the current month."}
            </div>
          )}
          <div style={{ marginTop: 10 }}><Msg {...msg} /></div>
          {!readOnly && (
            <div className="sp-foot">
              <button type="button" className="ac-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !form.lines.length} onClick={save}>{busy ? "Saving…" : "Save plan"}</button>
            </div>
          )}
        </>
      )}

      {companyId && tab === "history" && (
        <table className="ac-table ac-stack">
          <thead><tr><th>Version</th><th>From</th><th>Status</th><th className="ac-num">Services</th><th className="ac-num">Copies</th><th>By</th></tr></thead>
          <tbody>
            {!history.length ? <EmptyRow cols={6} text="No plan yet" /> : history.map((h) => (
              <tr key={h.version}>
                <td>v{h.version}</td><td>{dmy(h.effective_from)}</td>
                <td><span className={`ac-badge ${h.status === "ACTIVE" ? "b-green" : h.status === "SCHEDULED" ? "b-amber" : "b-grey"}`}>{h.status.toLowerCase()}</span></td>
                <td className="bl-num">{h.services_per_month}</td><td className="bl-num">{h.print_copies}</td><td className="ac-sub">{h.updated_by || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!companyId && msg.error && <Msg {...msg} />}
    </div>
  );
}
