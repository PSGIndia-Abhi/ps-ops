import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  FiAlertCircle, FiArrowLeft, FiArrowRight, FiCalendar, FiCheckCircle, FiClipboard, FiEdit2, FiExternalLink,
  FiFileText, FiGrid, FiHash, FiLayers, FiMapPin, FiPlus, FiSend, FiTag, FiTrendingUp, FiUsers,
} from "react-icons/fi";
import { LuReceiptIndianRupee } from "react-icons/lu";
import { billingPut, useBilling } from "./billingApi";
import { CATEGORY_LABEL, amount, dmy, initials, rupees, rupeesShort } from "./format";
import BillingProfileCard from "./BillingProfileCard";
import { Field, Kpi, Msg, TypeBadge } from "./ui";
import { BILLING_HOME } from "./access";

// Customer Billing Profile: everything billing needs for one customer, in one place.
//   Overview              setup checklist and what a month comes to
//   Billing details       Bill To, GSTIN, GST state, payment terms
//   Outlets & delivery    prints and email per outlet (and for a whole-customer invoice), bill-by day
//   Services & contracts  each contract with its services per outlet, rate and services per month
//   Purchase orders       the customer's POs
// Data: GET /customer-profiles/:companyId.

const TABS = [
  ["overview", "Overview", <FiGrid key="i" />],
  ["details", "Billing details", <FiFileText key="i" />],
  ["delivery", "Outlets & delivery", <FiSend key="i" />],
  ["services", "Services & contracts", <FiLayers key="i" />],
  ["pos", "Purchase orders", <LuReceiptIndianRupee key="i" />],
];
const COPIES = [1, 2, 3, 4];
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const STRUCTURE_LABEL = { FIXED: "Fixed amount", SERVICE_BASED: "Service based", PER_SQFT: "Per sq. ft", PER_SQM: "Per sq. m" };
const STRUCTURE_HINT = {
  FIXED: "Billed for the agreed services every month, even if fewer were done.",
  SERVICE_BASED: "Billed for the services completed in the month (from the Service Coordinator’s SOS).",
  PER_SQFT: "Termite: the treated area from the Service Coordinator’s SOS × the rate per sq. ft.",
  PER_SQM: "Termite: the treated area from the Service Coordinator’s SOS × the rate per sq. m.",
};

export default function CustomerProfile() {
  const { companyId } = useParams();
  const { me } = useOutletContext();
  const canEdit = me.can("MANAGE_BILLING_MASTERS");
  const navigate = useNavigate();
  const { data, error, loading, reload } = useBilling(`/customer-profiles/${encodeURIComponent(companyId)}`);
  const [tab, setTab] = useState("overview");

  // BillingProfileCard reloads when its customer object changes: keep it stable.
  const customer = useMemo(
    () => (data ? { company_id: data.customer.company_id, name: data.customer.name, display_name: data.customer.display_name, category: data.customer.category, gst_number: data.customer.gst_number } : null),
    [data]
  );

  if (error) return <div className="ac-page"><Msg error={error} /></div>;
  if (loading || !data) return <div className="ac-page"><div className="ac-card">Loading…</div></div>;

  const c = data.customer;
  const active = data.contracts.filter((x) => x.status === "ACTIVE");
  const monthly = active.reduce((t, x) => t + x.monthly_value, 0);
  const activePos = data.pos.filter((p) => p.status === "ACTIVE");
  const serviceCount = active.reduce((t, x) => t + x.lines.length, 0);
  const deliverySet = data.settings.invoice_emails.length > 0 || data.outlets.some((o) => o.emails.length || o.print_copies);

  const checklist = [
    { icon: FiTag, ok: Boolean(c.category), title: "Customer type", text: c.category ? CATEGORY_LABEL[c.category] : "Set Corporate / Individual / RWA on the customer in Companies", action: null },
    { icon: FiFileText, ok: Boolean(data.profile), title: "Billing details", text: data.profile ? `${data.profile.billing_name} · ${data.profile.state_code}-${data.profile.state_name}` : "Bill To name, address, GSTIN and state", action: () => setTab("details") },
    { icon: FiLayers, ok: active.length > 0 && serviceCount > 0, title: "Contract with services", text: active.length ? `${active.length} active contract(s), ${serviceCount} service line(s)` : "Services, rate and services per month", action: () => (active.length ? setTab("services") : navigate(`${BILLING_HOME}/contracts/new?company=${encodeURIComponent(c.company_id)}`)) },
    { icon: FiSend, ok: deliverySet, title: "Invoice delivery", text: deliverySet ? "Prints and email set" : "How many prints and which email gets each invoice", action: () => setTab("delivery") },
    { icon: FiCalendar, ok: Boolean(data.settings.bill_by_day), title: "Bill-by day", text: data.settings.bill_by_day ? `Invoice by day ${data.settings.bill_by_day} of the month - late alert after that` : "Day of the month by which the invoice must go out", action: () => setTab("delivery") },
  ];
  const done = checklist.filter((x) => x.ok).length;

  return (
    <div className="ac-page">
      <button type="button" className="bl-link" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => navigate(`${BILLING_HOME}/customers`)}>
        <FiArrowLeft /> All customers
      </button>

      <div className="bl-hero">
        <div className="bl-avatar">{initials(c.name)}</div>
        <div style={{ minWidth: 0 }}>
          <h1>{c.name}</h1>
          <div className="bl-meta">
            {c.group && <span><FiUsers /> {c.group}</span>}
            <span><FiTag /> {CATEGORY_LABEL[c.category] || "Type not set"}</span>
            <span className={c.gst_number ? "" : "warn"}><FiHash /> {c.gst_number ? c.gst_number : "No GSTIN"}</span>
            <span><FiMapPin /> {data.outlets.length} outlet{data.outlets.length === 1 ? "" : "s"}</span>
            {done === checklist.length
              ? <span className="ok"><FiCheckCircle /> Ready to bill</span>
              : <span className="warn"><FiAlertCircle /> Setup {done} of {checklist.length}</span>}
          </div>
        </div>
        {canEdit && (
          <div className="bl-hero-side">
            <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(`${BILLING_HOME}/contracts/new?company=${encodeURIComponent(c.company_id)}`)}>
              <FiPlus /> New contract
            </button>
          </div>
        )}
      </div>

      <div className="bl-utabs bl-segtabs" role="tablist">
        {TABS.map(([k, l, icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`bl-utab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            <span className="bl-utab-ic" aria-hidden="true">{icon}</span>
            {l}
            {k === "services" && <span className="bl-count">{active.length}</span>}
            {k === "pos" && <span className="bl-count">{activePos.length}</span>}
            {k === "delivery" && <span className="bl-count">{data.outlets.length}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="bl-stack">
          <div className="ac-kpis bl-kpis-5">
            <Kpi color="blue" icon={FiTrendingUp} label="Monthly value" value={rupeesShort(monthly)} note="excl. GST" />
            <Kpi color="teal" icon={FiMapPin} label="Outlets" value={data.outlets.length} note={c.group ? `Group ${c.group}` : "No group"} />
            <Kpi color="purple" icon={FiClipboard} label="Active contracts" value={active.length} note={`${serviceCount} service line${serviceCount === 1 ? "" : "s"}`} />
            <Kpi color="green" icon={LuReceiptIndianRupee} label="Active POs" value={activePos.length} note={`${data.pos.length - activePos.length} expired / closed`} />
            <Kpi color="orange" icon={FiCalendar} label="Bill by" value={data.settings.bill_by_day ? `Day ${data.settings.bill_by_day}` : "—"} note="of each month" />
          </div>
          <div className="ac-card">
            <div className="bl-setup-head">
              <div>
                <h3 className="ac-card-title" style={{ margin: 0 }}>Billing setup</h3>
                <span className="ac-sub">{done === checklist.length ? "Everything is in place - this customer can be billed." : `${checklist.length - done} step${checklist.length - done === 1 ? "" : "s"} left before billing`}</span>
              </div>
              <div className="bl-setup-prog">
                <b>{Math.round((done / checklist.length) * 100)}%</b>
                <span className="bl-setup-bar"><span style={{ width: `${(done / checklist.length) * 100}%` }} /></span>
              </div>
            </div>
            <div className="bl-steps">
              {checklist.map((x) => {
                const Icon = x.icon;
                const go = Boolean(x.action && canEdit);
                return (
                  <div key={x.title} className={`bl-step ${x.ok ? "ok" : "todo"}${go ? " go" : ""}`} onClick={go ? x.action : undefined} role={go ? "button" : undefined} tabIndex={go ? 0 : undefined}
                    onKeyDown={go ? (e) => (e.key === "Enter" || e.key === " ") && x.action() : undefined}>
                    <span className="bl-step-ic"><Icon /></span>
                    <div className="grow">
                      <b>{x.title}</b>
                      <span>{x.text}</span>
                    </div>
                    <span className="bl-step-state">{x.ok ? <><FiCheckCircle /> Done</> : <><FiAlertCircle /> To do</>}</span>
                    {go && <FiArrowRight className="bl-step-go" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "details" && customer && <BillingProfileCard customer={customer} canEdit={canEdit} onSaved={reload} />}

      {tab === "delivery" && <DeliverySettings data={data} canEdit={canEdit} onSaved={reload} />}

      {tab === "services" && (
        <div>
          {!data.contracts.length && (
            <div className="ac-card">
              <p className="ac-sub" style={{ marginTop: 0 }}>No contract yet. A contract holds the services, rate per service and services per month for each outlet.</p>
              {canEdit && <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(`${BILLING_HOME}/contracts/new?company=${encodeURIComponent(c.company_id)}`)}><FiPlus /> New contract</button>}
            </div>
          )}
          {data.contracts.map((k) => (
            <div key={k.id} className="bl-ccard">
              <div className="bl-ccard-head">
                <h3>{k.contract_code}</h3>
                <TypeBadge type={k.billing_type} frequency={k.frequency_months} unit={k.frequency_unit} />
                <span className="bl-status blue" title={STRUCTURE_HINT[k.structure]}><span className="bl-status-dot" />{STRUCTURE_LABEL[k.structure]}</span>
                <span className={`bl-status ${k.status === "ACTIVE" ? "green" : k.status === "PAUSED" ? "amber" : "grey"}`}><span className="bl-status-dot" />{k.status === "ACTIVE" ? "Active" : k.status === "PAUSED" ? "Paused" : "Ended"}</span>
                <span className="bl-ccard-meta">
                  {k.gst_applicable ? `GST ${k.gst_rate}%` : "No GST"} · {k.invoice_grouping === "PER_SITE" ? "Invoice per outlet" : "One invoice"} · {k.status === "ACTIVE" ? `Next bill from ${dmy(k.next_period_start)}` : `Ended`}{k.last_invoice ? ` · Last ${k.last_invoice}` : ""}
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  <b>{rupees(k.monthly_value)}</b><span className="ac-sub">/ month</span>
                  <button type="button" className="ac-btn sm" onClick={() => navigate(`${BILLING_HOME}/contracts/${k.id}`)}><FiEdit2 /> {canEdit ? "Edit" : "Open"}</button>
                </span>
              </div>
              <div className="bl-ccard-body">
                <table className="ac-table ac-stack">
                  <thead><tr><th>Outlet</th><th>Service / item</th><th className="ac-num">Per month</th><th className="ac-num">Rate (₹)</th><th className="ac-num">Month (₹)</th></tr></thead>
                  <tbody>
                    {k.lines.length ? k.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.site || <span className="ac-sub">All outlets</span>}</td>
                        <td>{l.item_name}{l.item_kind === "CHEMICAL" && <span className="bl-sub">Chemical</span>}{l.invoice_group && <div className="bl-sub">Prints as “{l.invoice_group}”</div>}</td>
                        <td className="bl-num">{l.per_month ?? "—"}</td>
                        <td className="bl-num">{amount(l.rate)}<div className="bl-sub">per {String(l.unit || "nos").toLowerCase()}</div></td>
                        <td className="bl-num">{l.monthly_value === null ? "—" : amount(l.monthly_value)}</td>
                      </tr>
                    )) : <tr><td colSpan={5} className="ac-sub">No services priced on this contract.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "pos" && (
        <div className="ac-card">
          <div className="bl-panel-title">
            <h3 className="ac-card-title" style={{ margin: 0 }}>Purchase orders</h3>
            <button type="button" className="ac-btn sm" onClick={() => navigate(`${BILLING_HOME}/pos`)}><FiExternalLink /> Manage POs</button>
          </div>
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead><tr><th>PO number</th><th>PO date</th><th>Valid till</th><th className="ac-num">Amount (₹)</th><th>Type</th><th>Contract</th><th>Status</th></tr></thead>
              <tbody>
                {data.pos.length ? data.pos.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.po_number}</b></td>
                    <td>{dmy(p.po_date)}</td>
                    <td>{p.expiry_date ? dmy(p.expiry_date) : "Open PO"}</td>
                    <td className="bl-num">{p.po_amount === null ? "No limit" : amount(p.po_amount)}</td>
                    <td>{p.kind === "ADVANCE" ? "Advance" : "Standard"}</td>
                    <td>{data.contracts.find((k) => k.id === p.contract_id)?.contract_code || <span className="ac-sub">Any</span>}</td>
                    <td><span className={`bl-status ${p.status === "ACTIVE" ? "green" : p.status === "EXPIRED" ? "red" : "grey"}`}><span className="bl-status-dot" />{p.status === "ACTIVE" ? "Active" : p.status === "EXPIRED" ? "Expired" : "Closed"}</span></td>
                  </tr>
                )) : <tr><td colSpan={7} className="ac-sub">No POs for this customer.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Prints and email per outlet (and for a whole-customer invoice), and the bill-by day. */
function DeliverySettings({ data, canEdit, onSaved }) {
  const blank = () => ({
    print_copies: data.settings.print_copies || 1,
    invoice_emails: data.settings.invoice_emails.join(", "),
    auto_email: Boolean(data.settings.auto_email),
    bill_by_day: data.settings.bill_by_day || "",
    outlets: data.outlets.map((o) => ({ site_id: o.site_id, print_copies: o.print_copies || data.settings.print_copies || 1, emails: o.emails.join(", ") })),
  });
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(blank()), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const setOutlet = (siteId, patch) => setForm((f) => ({ ...f, outlets: f.outlets.map((o) => (o.site_id === siteId ? { ...o, ...patch } : o)) }));
  const readOnly = !canEdit || !data.profile;

  async function save() {
    setBusy(true);
    setMsg({});
    try {
      await billingPut(`/customer-profiles/${encodeURIComponent(data.customer.company_id)}/settings`, {
        print_copies: Number(form.print_copies),
        invoice_emails: form.invoice_emails,
        auto_email: form.auto_email,
        bill_by_day: form.bill_by_day ? Number(form.bill_by_day) : null,
        outlets: form.outlets.map((o) => ({ site_id: o.site_id, print_copies: Number(o.print_copies), emails: o.emails })),
      });
      setMsg({ ok: "Invoice settings saved." });
      onSaved?.();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      {!data.profile && <div className="ac-info error"><span>Save the billing details first (Billing details tab), then set prints and email.</span></div>}
      <div className="ac-card">
        <h3 className="ac-card-title">Whole-customer invoice and deadline</h3>
        <p className="ac-sub" style={{ marginTop: -4 }}>Used when one invoice is made for the whole customer, and for any outlet without its own setting.</p>
        <div className="bl-grid g4">
          <Field label="Print copies">
            <select className="ac-select" value={form.print_copies} disabled={readOnly} onChange={(e) => setForm({ ...form, print_copies: e.target.value })}>
              {COPIES.map((n) => <option key={n} value={n}>{n} cop{n === 1 ? "y" : "ies"}</option>)}
            </select>
          </Field>
          <Field label="Email invoice to" className="bl-span2" hint="Separate several addresses with commas - they all get one email">
            <input className="ac-input" value={form.invoice_emails} disabled={readOnly} placeholder="accounts@customer.com, manager@customer.com" onChange={(e) => setForm({ ...form, invoice_emails: e.target.value })} />
          </Field>
          <Field label="Bill by (day of month)" hint="Late alert to Accounts after this day">
            <select className="ac-select" value={form.bill_by_day} disabled={readOnly} onChange={(e) => setForm({ ...form, bill_by_day: e.target.value })}>
              <option value="">Not set</option>
              {DAYS.map((d) => <option key={d} value={d}>Day {d}</option>)}
            </select>
          </Field>
        </div>
        <label className={`bl-autoemail ${form.auto_email ? "on" : ""}`}>
          <input type="checkbox" className="bl-cb" checked={form.auto_email} disabled={readOnly} onChange={(e) => setForm({ ...form, auto_email: e.target.checked })} />
          <span>
            <b>Send invoices by email automatically</b>
            <small>{form.auto_email ? "Each invoice is emailed as soon as it is issued - to the outlet’s emails for per-outlet invoices, else to the addresses above." : "Off - no email is sent. The addresses are kept as customer details, and invoices can still be shared by hand."}</small>
          </span>
        </label>
      </div>

      <div className="ac-card">
        <h3 className="ac-card-title">Outlets</h3>
        {!data.outlets.length ? <p className="ac-sub">This customer has no outlets (sites). Invoices use the whole-customer settings above.</p> : (
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead><tr><th>Outlet</th><th className="ac-num">Services</th><th style={{ width: 140 }}>Print copies</th><th>Email invoice to</th></tr></thead>
              <tbody>
                {data.outlets.map((o) => {
                  const f = form.outlets.find((x) => x.site_id === o.site_id) || {};
                  return (
                    <tr key={o.site_id}>
                      <td><b>{o.name}</b>{o.address && <div className="bl-sub">{o.address}</div>}</td>
                      <td className="bl-num">{o.services.length}</td>
                      <td>
                        <select className="bl-cell-input" value={f.print_copies || 1} disabled={readOnly} onChange={(e) => setOutlet(o.site_id, { print_copies: e.target.value })} aria-label={`Print copies for ${o.name}`}>
                          {COPIES.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td><input className="bl-cell-input" value={f.emails || ""} disabled={readOnly} placeholder="outlet@customer.com" onChange={(e) => setOutlet(o.site_id, { emails: e.target.value })} aria-label={`Email for ${o.name}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Msg {...msg} />
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="ac-btn" disabled={busy} onClick={() => { setForm(blank()); setMsg({}); }}>Reset</button>
          <button type="button" className="ac-btn ac-btn-primary" disabled={busy || readOnly} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      )}
      <p className="ac-sub" style={{ fontSize: 12 }}>
        When an invoice is issued it is printed with these copies{form.auto_email ? " and emailed to these addresses" : ""} - the outlet’s own settings when invoices are made per outlet.
      </p>
    </div>
  );
}
