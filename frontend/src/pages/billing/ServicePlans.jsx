import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyRow, Pager } from "../accountant/ui";
import { ApiError, billingGet, billingPut, qs, useBilling } from "./billingApi";
import { dmy, monthLabel, nextMonthStart, thisMonth } from "./format";
import { Field, Kpi, Msg } from "./ui";
import useDebounced from "./useDebounced";

// Service Plans (set by the Service Coordinator): for each customer, how many services each
// outlet gets every month, how many invoices per month and how many print copies. A change
// starts from the 1st of a month; the month in progress keeps its plan.

const PAGE_SIZE = 25;
const COPY_LABELS = ["Original for Recipient", "Duplicate for Transporter", "Triplicate for Supplier", "Extra copy"];

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
          <p className="ac-sub">Fixed number of services every month, invoices per month and print copies for each customer. Accounts bills from these.</p>
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
            invoice_split: p?.invoice_split || "ALL_OUTLETS",
            shortfall_highlight_day: p?.shortfall_highlight_day || 25,
            lines: (p?.lines || []).map((l, i) => ({ ...l, key: i })),
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

  const sites = options?.sites || [];
  const services = useMemo(() => options?.services || [], [options]);
  const serviceTypes = useMemo(() => [...new Set(["Pest Control", ...services.map((s) => s.service_type)])], [services]);
  const total = form ? form.lines.reduce((t, l) => t + (Number(l.visits_per_month) || 0), 0) : 0;
  const customerName = target.customer || customers?.find((c) => c.company_id === companyId)?.name || "";
  const set = (patch) => setEdits({ ...form, ...patch });
  const setLine = (key, patch) => set({ lines: form.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  async function save() {
    setBusy(true);
    setMsg({});
    try {
      const r = await billingPut(`/service-plans/${encodeURIComponent(companyId)}`, {
        effective_from: form.effective_from,
        print_copies: form.print_copies,
        invoice_split: form.invoice_split,
        shortfall_highlight_day: form.shortfall_highlight_day,
        lines: form.lines.map((l) => ({ site_id: l.site_id, service_type: l.service_type, sub_service: l.sub_service, visits_per_month: Number(l.visits_per_month) })),
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
          <table className="ac-table ac-stack">
            <thead><tr><th>Outlet and service</th><th>Per month</th>{!readOnly && <th />}</tr></thead>
            <tbody>
              {!form.lines.length && <EmptyRow cols={readOnly ? 2 : 3} text={readOnly ? "No services planned" : "Add the services this customer gets every month"} />}
              {form.lines.map((l) => (
                <tr key={l.key}>
                  <td>
                    {readOnly ? (
                      <><b>{l.sub_service}</b><div className="bl-sub">{l.site} · {l.service_type}</div></>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <select className="bl-cell-input" style={{ gridColumn: "1 / -1" }} value={l.site_id || ""} onChange={(e) => setLine(l.key, { site_id: e.target.value })} aria-label="Outlet">
                          <option value="">Outlet…</option>
                          {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
                        </select>
                        <input className="bl-cell-input" list={`subs-${companyId}`} value={l.sub_service || ""} placeholder="Service, e.g. General pest control" onChange={(e) => {
                          const match = services.find((s) => s.sub_service === e.target.value);
                          setLine(l.key, { sub_service: e.target.value, ...(match ? { service_type: match.service_type } : {}) });
                        }} aria-label="Service" />
                        <select className="bl-cell-input" value={l.service_type || ""} onChange={(e) => setLine(l.key, { service_type: e.target.value })} aria-label="Service type">
                          <option value="">Service type…</option>
                          {serviceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    )}
                  </td>
                  <td style={{ width: 130 }}>
                    {readOnly ? l.visits_per_month : (
                      <div className="bl-stp">
                        <button type="button" onClick={() => setLine(l.key, { visits_per_month: Math.max(1, Number(l.visits_per_month) - 1) })} aria-label="Fewer">−</button>
                        <input type="number" min="1" max="31" value={l.visits_per_month} onChange={(e) => setLine(l.key, { visits_per_month: e.target.value })} aria-label="Visits per month" />
                        <button type="button" onClick={() => setLine(l.key, { visits_per_month: Math.min(31, Number(l.visits_per_month) + 1) })} aria-label="More">+</button>
                      </div>
                    )}
                  </td>
                  {!readOnly && <td style={{ width: 36 }}><button type="button" className="bl-x" style={{ fontSize: 15 }} onClick={() => set({ lines: form.lines.filter((x) => x.key !== l.key) })} aria-label="Remove">✕</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id={`subs-${companyId}`}>
            {services.map((s) => <option key={`${s.service_type}|${s.sub_service}`} value={s.sub_service}>{s.service_type}</option>)}
          </datalist>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 16px" }}>
            {!readOnly ? (
              <button type="button" className="bl-link" onClick={() => set({ lines: [...form.lines, { key: Date.now(), site_id: sites.length === 1 ? sites[0].site_id : "", service_type: "Pest Control", sub_service: "", visits_per_month: 1 }] })}>+ Add service</button>
            ) : <span />}
            <span style={{ fontSize: 13.5 }}>Total: <b>{total} services / month</b></span>
          </div>

          <div className="bl-grid g2">
            <Field label="Invoice print copies" required>
              <div className="bl-seg">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" disabled={readOnly} className={form.print_copies === n ? "on" : ""} onClick={() => set({ print_copies: n })}>{n}</button>
                ))}
              </div>
            </Field>
            <Field label="Invoices per month" required>
              <select className="ac-select" value={form.invoice_split} disabled={readOnly} onChange={(e) => set({ invoice_split: e.target.value })}>
                <option value="ALL_OUTLETS">1 – all outlets together</option>
                <option value="PER_OUTLET">One per outlet ({new Set(form.lines.map((l) => l.site_id).filter(Boolean)).size || sites.length})</option>
              </select>
            </Field>
            <div className="bl-copies bl-span2">
              {COPY_LABELS.slice(0, form.print_copies).map((label, i) => <div key={label} className="bl-copy"><i>{i + 1}</i>{label}</div>)}
            </div>
            <Field label="Effective from" required>
              <input type="month" className="ac-input" min={minMonth} disabled={readOnly} value={form.effective_from.slice(0, 7)} onChange={(e) => e.target.value && set({ effective_from: `${e.target.value}-01` })} />
            </Field>
            <Field label="Highlight shortfall from">
              <select className="ac-select" value={form.shortfall_highlight_day} disabled={readOnly} onChange={(e) => set({ shortfall_highlight_day: Number(e.target.value) })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : d === 21 ? "st" : d === 22 ? "nd" : d === 23 ? "rd" : d === 31 ? "st" : "th"} of the month</option>)}
              </select>
            </Field>
          </div>
          {!readOnly && (
            <div className="ac-info" style={{ marginTop: 14 }}>
              ⓘ Changes start on {dmy(form.effective_from)}. {form.effective_from > `${thisMonth()}-01` ? `${monthLabel(thisMonth())} keeps the current plan, so invoices already in progress don't change.` : "This replaces the plan for the current month."}
            </div>
          )}
          <div style={{ marginTop: 12 }}><Msg {...msg} /></div>
          {!readOnly && (
            <div className="ac-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
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
