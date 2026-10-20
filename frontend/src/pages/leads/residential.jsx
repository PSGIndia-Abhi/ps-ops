// The Residential area of Lead Management, for the sales executive and the sales manager - the web
// side of the app's Residential Leads: a dashboard, the list (ResidentialLeads.jsx), adding a lead and
// each lead's page with its follow-up calls. Residential (home-service, lead_type 'consumer') leads
// are not worked through the commercial pipeline: they are followed up by phone until converted.
// Payments are taken in the app; here a lead is saved as Cash / Pending.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  FiCalendar, FiCheckCircle, FiClock, FiCreditCard, FiFileText, FiHome, FiInfo, FiMail, FiPhone,
  FiPhoneCall, FiPlusCircle, FiSave, FiTool, FiTrendingUp, FiUser, FiXCircle,
} from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { request } from "./leadsApi";
import { dateTime, money } from "./format";
import { useToast } from "./hooks";
import { Avatar, Badge, Button, Card, Empty, Field, Kpi, Modal, Note, SkeletonRows } from "./ui";
import { useViewer } from "./viewer";
import { PAYMENT_TONE, RESIDENTIAL_HOME, STATUS_TONE, label, paymentLabel, useResidentialAccess, useResidentialLeads } from "./residentialData";

// Same lists as the app's residential form (mobile/src/crm/types.ts).
const SOURCES = [
  { value: "website", label: "Website" },
  { value: "apartment", label: "Apartment" },
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "other", label: "Other" },
];
const OUTCOMES = [
  { value: "INTERESTED", label: "Interested" },
  { value: "CALL_BACK", label: "Call back later" },
  { value: "NOT_REACHABLE", label: "Not reachable" },
  { value: "NOT_INTERESTED", label: "Not interested" },
];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => ymd(new Date());
const tomorrowKey = () => ymd(new Date(Date.now() + 86400000));
const clock = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  return `${h % 12 || 12}:${pad(m || 0)} ${h < 12 ? "AM" : "PM"}`;
};
const dayText = (d) => {
  if (!d) return "";
  const [y, mo, da] = d.split("-").map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
/** "Next call 2026-10-16 10:00" (as the server records it) -> "Next call 16 Oct 2026, 10:00 AM". */
const readable = (note) => String(note || "").replace(/(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::\d{2})?)?/, (_m, d, t) => `${dayText(d)}${t ? `, ${clock(t)}` : ""}`);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function ResidentialDashboard() {
  const allowed = useResidentialAccess();
  const { persona } = useViewer();
  const navigate = useNavigate();
  const { rows, error } = useResidentialLeads();
  const [calls, setCalls] = useState(null);

  // Today's follow-up calls (and overdue ones): my lead follow-ups, kept to residential leads.
  useEffect(() => {
    if (!rows) return;
    const ids = new Set(rows.map((l) => l.id));
    request("/api/work-tasks?task_type=LEAD_FOLLOW_UP")
      .then((list) => {
        const today = todayKey();
        const open = (Array.isArray(list) ? list : []).filter(
          (t) => ids.has(t.source_id) && ["OPEN", "IN_PROGRESS", "PAUSED"].includes(t.status) && String(t.due_date).slice(0, 10) <= today,
        );
        open.sort((a, b) => `${a.due_date} ${a.due_time || ""}`.localeCompare(`${b.due_date} ${b.due_time || ""}`));
        setCalls(open);
      })
      .catch(() => setCalls([]));
  }, [rows]);

  const month = useMemo(() => {
    const now = new Date();
    const inMonth = (rows || []).filter((l) => {
      const d = new Date(l.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const paid = inMonth.filter((l) => l.payment_status === "paid");
    return {
      leads: inMonth.length,
      paidCount: paid.length,
      collected: paid.reduce((s, l) => s + (Number(l.amount) || 0), 0),
      pending: inMonth.filter((l) => l.payment_status !== "paid").reduce((s, l) => s + (Number(l.amount) || 0), 0),
      converted: inMonth.filter((l) => l.lead_status === "converted").length,
    };
  }, [rows]);
  const byId = useMemo(() => new Map((rows || []).map((l) => [l.id, l])), [rows]);
  const recent = (rows || []).slice(0, 6);
  const monthName = new Date().toLocaleDateString("en-IN", { month: "long" });

  if (!allowed) return <Navigate to={LEADS_HOME} replace />;

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Residential Leads</h1>
          <p>{persona === "sales_manager" ? "Home-service leads across the team" : "Your home-service leads"} - {monthName} so far.</p>
        </div>
        <Link className="lm-btn primary" to={`${RESIDENTIAL_HOME}/new`}>
          <FiPlusCircle /> Add Residential Lead
        </Link>
      </div>
      {error && <Note tone="warn">{error}</Note>}

      <div className="lm-grid kpi">
        <Kpi index={0} label="Leads this month" value={month.leads} icon={<FiHome />} tone="info" foot="Added in this month" onClick={() => navigate(`${RESIDENTIAL_HOME}/all`)} />
        <Kpi index={1} label="Paid" value={month.collected} format={(n) => money(n)} icon={<FiCheckCircle />} tone="success" foot={`${month.paidCount} paid`} onClick={() => navigate(`${RESIDENTIAL_HOME}/all?payment=paid`)} />
        <Kpi index={2} label="Payment pending" value={month.pending} format={(n) => money(n)} icon={<FiClock />} tone="warn" foot="Still to collect" onClick={() => navigate(`${RESIDENTIAL_HOME}/all?payment=pending`)} />
        <Kpi index={3} label="Converted" value={month.converted} icon={<FiTrendingUp />} tone="success" foot="Became customers" onClick={() => navigate(`${RESIDENTIAL_HOME}/all?status=converted`)} />
      </div>

      <div className="lm-grid half">
        <Card title="Today's Calls" sub="Follow-up calls due today or earlier" index={4} flush>
          {calls === null ? (
            <SkeletonRows rows={3} />
          ) : calls.length === 0 ? (
            <Empty title="No calls due" text="Follow-up calls set on residential leads show up here on their day." icon={<FiPhoneCall />} />
          ) : (
            <ul className="lm-res-list">
              {calls.map((t) => {
                const lead = byId.get(t.source_id);
                const late = String(t.due_date).slice(0, 10) < todayKey();
                return (
                  <li key={t.id}>
                    <Link to={`${RESIDENTIAL_HOME}/${t.source_id}`} className="lm-res-row">
                      <Avatar name={lead?.customer_name || "?"} size={36} />
                      <span className="lm-who-text">
                        <strong>{lead?.customer_name || t.title}</strong>
                        <small>{lead?.phone}{lead?.service_name ? ` · ${lead.service_name}` : ""}</small>
                      </span>
                      <Badge tone={late ? "danger" : "warn"}>{late ? `Overdue · ${dayText(String(t.due_date).slice(0, 10))}` : t.due_time ? clock(t.due_time) : "Today"}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent Leads" sub="Newest first" index={5} flush action={<Link className="lm-link" to={`${RESIDENTIAL_HOME}/all`}>View all</Link>}>
          {rows === null ? (
            <SkeletonRows rows={4} />
          ) : recent.length === 0 ? (
            <Empty title="No residential leads yet" text="Add one with Add Residential Lead." icon={<FiHome />} />
          ) : (
            <ul className="lm-res-list">
              {recent.map((l) => (
                <li key={l.id}>
                  <Link to={`${RESIDENTIAL_HOME}/${l.id}`} className="lm-res-row">
                    <Avatar name={l.customer_name || "?"} size={36} />
                    <span className="lm-who-text">
                      <strong>{l.customer_name}</strong>
                      <small>{[l.service_name, l.house_type].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="lm-res-amt">{money(l.amount)}</span>
                    <Badge tone={STATUS_TONE[l.lead_status] || "neutral"}>{label(l.lead_status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Add a residential lead
// ---------------------------------------------------------------------------

const LAST_KEY = "bs.residential.lastChoices";
const readLast = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || "{}") || {};
  } catch {
    return {};
  }
};
const BLANK = { name: "", phone: "", email: "", location: "", houseType: "", service: "", plan: "", amount: "", source: "", referenceBy: "", notes: "", paymentStatus: "pending" };

export function ResidentialNewLead() {
  const allowed = useResidentialAccess();
  const navigate = useNavigate();
  const toast = useToast();
  const [services, setServices] = useState(null);
  const [values, setValues] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  // The price list, then the house type / service / plan / source picked last time (still on it).
  useEffect(() => {
    request("/api/crm/services")
      .then((list) => {
        const rows = Array.isArray(list) ? list : [];
        setServices(rows);
        const last = readLast();
        const svc = rows.find((s) => s.name === last.service);
        const houseOk = rows.some((s) => s.prices.some((p) => p.house_type === last.houseType));
        const planOk = svc?.prices.some((p) => p.plan_type === last.plan && (!houseOk || p.house_type === last.houseType));
        setValues((v) => {
          const next = {
            ...v,
            houseType: v.houseType || (houseOk ? last.houseType : ""),
            service: v.service || (svc ? svc.name : ""),
            plan: v.plan || (planOk ? last.plan : ""),
            source: v.source || (SOURCES.some((s) => s.value === last.source) ? last.source : ""),
          };
          return { ...next, amount: next.amount || priceOf(rows, next) };
        });
      })
      .catch(() => setServices([]));
  }, []);

  const houseTypes = useMemo(() => [...new Set((services || []).flatMap((s) => s.prices.map((p) => p.house_type)))], [services]);
  const service = (services || []).find((s) => s.name === values.service);
  const plans = useMemo(() => [...new Set((service?.prices || []).filter((p) => !values.houseType || p.house_type === values.houseType).map((p) => p.plan_type))], [service, values.houseType]);
  const listPrice = priceOf(services || [], values);

  const set = (key) => (e) => {
    let value = e.target.value;
    if (key === "phone") value = value.replace(/\D/g, "").slice(-10);
    if (key === "amount") value = value.replace(/\D/g, "").slice(0, 8);
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (key === "service" && !(services || []).find((s) => s.name === value)?.prices.some((p) => p.plan_type === next.plan)) next.plan = "";
      // A new house type / service / plan sets the amount to its list price (it can still be changed).
      if (["houseType", "service", "plan"].includes(key)) next.amount = priceOf(services || [], next);
      return next;
    });
    setErrors((er) => ({ ...er, [key]: "" }));
  };

  function validate() {
    const found = {};
    if (values.name.trim().length < 2) found.name = "Enter the customer's name.";
    if (values.phone.length !== 10) found.phone = "Enter a 10-digit mobile number.";
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = "That email looks incomplete.";
    if (!values.houseType) found.houseType = "Choose the house type.";
    if (!values.service) found.service = "Choose the service.";
    if (!values.plan) found.plan = "Choose the plan.";
    // The amount must be more than 0.
    if (!(Number(values.amount) > 0)) found.amount = "Enter the amount (more than 0).";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save(e) {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setSaveError("");
    try {
      const created = await request("/api/crm/leads", {
        method: "POST",
        body: {
          client_ref: `APP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          lead_type: "consumer",
          customer_name: values.name.trim(),
          phone: values.phone,
          email: values.email.trim(),
          location: values.location.trim(),
          house_type: values.houseType,
          service_name: values.service,
          plan_type: values.plan,
          amount: Number(values.amount),
          lead_source: values.source || null,
          reference_by: values.referenceBy.trim(),
          notes: values.notes.trim(),
          payment_method: "cash",
          payment_status: values.paymentStatus,
          lead_status: "new",
        },
      });
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ houseType: values.houseType, service: values.service, plan: values.plan, source: values.source }));
      } catch {
        // storage unavailable: the next form simply opens empty
      }
      toast(`Lead saved - ${values.name.trim()}`);
      navigate(`${RESIDENTIAL_HOME}/${created.id}`, { replace: true });
    } catch (err) {
      setSaveError(err.message || "Could not save the lead.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <Navigate to={LEADS_HOME} replace />;
  const cls = (key) => `lm-input${errors[key] ? " bad" : ""}`;
  const sel = (key) => `lm-select${errors[key] ? " bad" : ""}`;

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Add Residential Lead</h1>
          <p>A home-service customer. Online payment is taken in the app; here the payment is recorded as Cash.</p>
        </div>
      </div>
      <Card index={0}>
        <form onSubmit={save} noValidate style={{ display: "grid", gap: 16 }}>
          {saveError && <Note tone="warn">{saveError}</Note>}
          <h3 className="lm-form-title"><FiUser /> Customer</h3>
          <div className="lm-form">
            <Field label="Customer Name" required error={errors.name}>
              <input className={cls("name")} value={values.name} onChange={set("name")} placeholder="Customer's name" maxLength={120} />
            </Field>
            <Field label="Mobile Number" required error={errors.phone}>
              <input className={cls("phone")} value={values.phone} onChange={set("phone")} inputMode="numeric" placeholder="10-digit mobile number" />
            </Field>
            <Field label="Email" error={errors.email}>
              <input className={cls("email")} value={values.email} onChange={set("email")} type="email" placeholder="Optional" />
            </Field>
            <Field label="Area / Address">
              <input className="lm-input" value={values.location} onChange={set("location")} placeholder="e.g. Jayanagar 4th Block" maxLength={255} />
            </Field>
          </div>

          <h3 className="lm-form-title"><FiTool /> Property &amp; Service</h3>
          <div className="lm-form">
            <Field label="House Type" required error={errors.houseType}>
              <select className={sel("houseType")} value={values.houseType} onChange={set("houseType")} disabled={!services}>
                <option value="">{services ? "Select house type" : "Loading..."}</option>
                {houseTypes.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </Field>
            <Field label="Service" required error={errors.service}>
              <select className={sel("service")} value={values.service} onChange={set("service")} disabled={!services}>
                <option value="">{services ? "Select service" : "Loading..."}</option>
                {(services || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Plan" required error={errors.plan}>
              <select className={sel("plan")} value={values.plan} onChange={set("plan")} disabled={!values.service}>
                <option value="">{values.service ? "Select plan" : "Select a service first"}</option>
                {plans.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Amount (₹)" required error={errors.amount} hint={listPrice ? `List price ${money(Number(listPrice))}` : undefined}>
              <input className={cls("amount")} value={values.amount} onChange={set("amount")} inputMode="numeric" placeholder="0" />
            </Field>
          </div>

          <h3 className="lm-form-title"><FiInfo /> Lead details</h3>
          <div className="lm-form">
            <Field label="Lead Source">
              <select className="lm-select" value={values.source} onChange={set("source")}>
                <option value="">Select source</option>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Referred By">
              <input className="lm-input" value={values.referenceBy} onChange={set("referenceBy")} placeholder="Optional" maxLength={100} />
            </Field>
            <Field label="Payment">
              <select className="lm-select" value={values.paymentStatus} onChange={set("paymentStatus")}>
                <option value="pending">Pending</option>
                <option value="paid">Paid (cash)</option>
              </select>
            </Field>
            <Field label="Notes" wide>
              <textarea className="lm-textarea" value={values.notes} onChange={set("notes")} placeholder="Anything the team should know" maxLength={1000} />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" busy={busy} icon={<FiSave />}>Save Lead</Button>
          </div>
        </form>
      </Card>
    </>
  );
}

/** The list price for the chosen house type / service / plan, as a string ("" when not on the list). */
function priceOf(services, v) {
  const svc = services.find((s) => s.name === v.service);
  const row = svc?.prices.find((p) => p.house_type === v.houseType && p.plan_type === v.plan);
  return row ? String(Math.round(row.price)) : "";
}

// ---------------------------------------------------------------------------
// One residential lead, with its follow-up calls
// ---------------------------------------------------------------------------

export function ResidentialLeadPage() {
  const allowed = useResidentialAccess();
  const { id } = useParams();
  const [lead, setLead] = useState(undefined); // undefined loading, null not found
  const [calls, setCalls] = useState(null);
  const [logging, setLogging] = useState(false);
  const [converting, setConverting] = useState(false);

  const loadLead = useCallback(() => {
    request(`/api/crm/leads/${id}`)
      .then((l) => setLead(l && l.lead_type !== "commercial" ? l : null))
      .catch(() => setLead(null));
  }, [id]);
  const loadCalls = useCallback(() => {
    request(`/api/crm/leads/${id}/residential-calls`)
      .then(setCalls)
      .catch(() => setCalls({ lead_status: "", open: [], history: [] }));
  }, [id]);
  useEffect(() => {
    loadLead();
    loadCalls();
  }, [loadLead, loadCalls]);

  if (!allowed) return <Navigate to={LEADS_HOME} replace />;
  if (lead === undefined) return <Card><SkeletonRows rows={6} /></Card>;
  if (lead === null) return <Empty title="Lead not found" text="It may have been removed, or it is not one of your leads." icon={<FiHome />} />;

  const l = lead;
  const status = calls?.lead_status || l.lead_status;
  const closed = status === "converted" || status === "lost";
  const next = calls?.open?.[0];
  const late = !!next && String(next.due_date) < todayKey();
  const discount = l.standard_amount != null && Number(l.standard_amount) > Number(l.amount) ? Number(l.standard_amount) - Number(l.amount) : 0;
  const groups = [
    { key: "contact", title: "Contact", icon: <FiUser />, rows: [["Phone", l.phone && <a href={`tel:${l.phone}`}>{l.phone}</a>], ["Alternate phone", l.alternate_phone], ["Email", l.email && <a href={`mailto:${l.email}`}>{l.email}</a>], ["Address", l.location]] },
    { key: "service", title: "Service", icon: <FiTool />, rows: [["House type", l.house_type], ["Service", l.service_name], ["Plan", l.plan_type]] },
    { key: "payment", title: "Payment", icon: <FiCreditCard />, rows: [["Standard price", l.standard_amount != null ? money(l.standard_amount) : ""], ["Amount", discount ? `${money(l.amount)} (${money(discount)} off)` : money(l.amount)], ["Coupon", l.coupon_code], ["Method", l.payment_method ? label(l.payment_method) : ""], ["Status", paymentLabel(l.payment_status)], ["Paid on", l.paid_at ? dateTime(l.paid_at) : ""]] },
    { key: "info", title: "Lead info", icon: <FiInfo />, rows: [["Source", l.lead_source ? label(l.lead_source) : ""], ["Referred by", l.reference_by], ["Added by", l.created_by_name], ["Added on", dateTime(l.created_at)]] },
  ].map((g) => ({ ...g, rows: g.rows.filter(([, v]) => v !== null && v !== undefined && v !== false && String(typeof v === "string" ? v : "x").trim() !== "") }));

  return (
    <>
      <div className="lm-head">
        <div>
          <Link className="lm-link" to={`${RESIDENTIAL_HOME}/all`}>← Residential leads</Link>
          <h1>{l.customer_name || "Residential lead"}</h1>
          <p>{[l.service_name, l.house_type, l.location].filter(Boolean).join(" · ") || "Residential lead"}</p>
        </div>
      </div>

      <Card index={0}>
        <div className="lm-rl-head">
          <Avatar name={l.customer_name || "?"} size={52} />
          <div className="lm-rl-who">
            <strong>{l.customer_name || "Customer"}</strong>
            <small>{l.phone}</small>
            <div className="lm-rl-badges">
              <Badge tone={STATUS_TONE[status] || "neutral"}>{label(status)}</Badge>
              <Badge tone={PAYMENT_TONE[l.payment_status] || "neutral"}>{paymentLabel(l.payment_status)}</Badge>
            </div>
          </div>
          <div className="lm-rl-side">
            <span className="lm-rl-amount">{money(l.amount)}</span>
            <div className="lm-rl-actions">
              {!!l.phone && <a className="lm-btn success sm" href={`tel:${l.phone}`}><FiPhone /> Call</a>}
              {!!l.phone && <a className="lm-btn ghost sm" href={`https://wa.me/91${l.phone}`} target="_blank" rel="noreferrer">WhatsApp</a>}
              {!!l.email && <a className="lm-btn ghost sm" href={`mailto:${l.email}`}><FiMail /> Email</a>}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Call Follow-up" sub="Residential leads are followed up by phone until they are converted" index={1}>
        {calls === null ? (
          <SkeletonRows rows={2} />
        ) : closed ? (
          <Note tone="info">{status === "converted" ? "Converted to a customer - no more follow-up calls." : "Closed - the customer is not interested."}</Note>
        ) : (
          <div className="lm-res-next">
            <span className={`lm-res-next-icon${late ? " late" : ""}`}><FiCalendar /></span>
            <div>
              <small>{late ? "Next call (overdue)" : "Next call"}</small>
              <strong className={late ? "late" : ""}>{next ? `${dayText(String(next.due_date))}${next.due_time ? `, ${clock(next.due_time)}` : ""}` : "Not set yet"}</strong>
            </div>
            <Button icon={<FiPhoneCall />} onClick={() => setLogging(true)}>{next ? "Log call & set next" : "Log call"}</Button>
            <Button variant="success" icon={<FiCheckCircle />} onClick={() => setConverting(true)}>Convert to customer</Button>
          </div>
        )}
        {!!calls?.history?.length && (
          <ul className="lm-res-history">
            {calls.history.map((h) => (
              <li key={h.id}>
                <span className={`lm-res-dot ${h.action === "CALL_LOGGED" ? "call" : "next"}`}>{h.action === "CALL_LOGGED" ? <FiPhone /> : <FiClock />}</span>
                <div>
                  <strong>{readable(h.note) || (h.action === "CALL_LOGGED" ? "Call logged" : "Next call set")}</strong>
                  <small>{dateTime(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ""}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
        {calls && !calls.history?.length && !closed && <p className="lm-hint">No calls logged yet.</p>}
      </Card>

      <div className="lm-rl-grid">
        {groups.filter((g) => g.rows.length).map((g) => (
          <section key={g.key} className="lm-rl-card">
            <h3><span className="lm-rl-icon">{g.icon}</span> {g.title}</h3>
            <dl>
              {g.rows.map(([k, v]) => (
                <div key={k} className="lm-rl-row"><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
        ))}
        {!!l.notes && (
          <section className="lm-rl-card wide">
            <h3><span className="lm-rl-icon"><FiFileText /></span> Notes</h3>
            <p className="lm-rl-notes">{l.notes}</p>
          </section>
        )}
      </div>

      {converting && (
        <ConvertModal
          lead={l}
          onClose={() => setConverting(false)}
          onSaved={() => {
            setConverting(false);
            loadCalls();
            loadLead();
          }}
        />
      )}
      {logging && (
        <LogCallModal
          leadId={l.id}
          name={l.customer_name}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            loadCalls();
            loadLead();
          }}
        />
      )}
    </>
  );
}

/** The residential lead became a customer: the final amount (changeable) and a note; its calls stop. */
function ConvertModal({ lead, onClose, onSaved }) {
  const toast = useToast();
  const [amount, setAmount] = useState(lead.amount ? String(Math.round(Number(lead.amount))) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (amount && !(Number(amount) > 0)) return setError("Enter a valid amount, or leave it empty.");
    setBusy(true);
    setError("");
    try {
      await request(`/api/crm/leads/${lead.id}/residential-convert`, {
        method: "POST",
        body: { amount: amount ? Number(amount) : undefined, note: note.trim() || undefined },
      });
      toast(`${lead.customer_name} converted to a customer`);
      onSaved();
    } catch (err) {
      setError(err.message || "Could not convert the lead.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Convert to customer"
      sub={lead.customer_name}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="success" busy={busy} icon={<FiCheckCircle />} onClick={save}>Convert to customer</Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {error && <Note tone="warn">{error}</Note>}
        <p className="lm-hint" style={{ margin: 0 }}>The lead becomes a customer and its follow-up calls stop.</p>
        <Field label="Final amount (₹)" hint={lead.amount && Number(amount) !== Math.round(Number(lead.amount)) ? `Changed from ${money(lead.amount)}` : "The lead amount - change it if the final amount is different."}>
          <input className="lm-input" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" />
        </Field>
        <Field label="Note (optional)">
          <textarea className="lm-textarea" value={note} onChange={(e) => setNote(e.target.value.slice(0, 400))} placeholder="e.g. Service booked for Saturday" />
        </Field>
      </div>
    </Modal>
  );
}

/** Log a residential call: how it went, and the next call (or close the lead when not interested). */
function LogCallModal({ leadId, name, onClose, onSaved }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(tomorrowKey());
  const [time, setTime] = useState("10:00");
  // Optional reminder for the next call: nothing rings unless it is set.
  const [remind, setRemind] = useState(false);
  const [remindDate, setRemindDate] = useState(todayKey());
  const [remindTime, setRemindTime] = useState("09:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const closing = outcome === "NOT_INTERESTED";

  async function save() {
    if (!outcome) return setError("Choose how the call went.");
    if (closing && !note.trim()) return setError("Add a short note on why the customer is not interested.");
    if (!closing) {
      if (!date) return setError("Pick the date of the next call.");
      if (new Date(`${date}T${time || "23:59"}`) <= new Date()) return setError(`${dayText(date)}${time ? `, ${clock(time)}` : ""} has already passed. Pick a later time for the next call.`);
      if (remind && (!remindDate || !remindTime)) return setError("Pick the reminder date and time.");
      if (remind && new Date(`${remindDate}T${remindTime}`) <= new Date()) return setError("The reminder time has already passed. Pick a later time.");
    }
    setBusy(true);
    setError("");
    try {
      await request(`/api/crm/leads/${leadId}/residential-calls`, {
        method: "POST",
        body: {
          outcome,
          note: note.trim() || undefined,
          nextDate: closing ? undefined : date,
          nextTime: closing ? undefined : time || undefined,
          ...(!closing && remind ? { reminderDate: remindDate, reminderTime: remindTime } : {}),
        },
      });
      toast(closing ? "Lead closed - not interested" : "Call saved - next call set");
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save the call.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Log call"
      sub={name}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant={closing ? "danger" : "primary"} busy={busy} icon={closing ? <FiXCircle /> : <FiSave />} onClick={save}>
            {closing ? "Close lead" : "Save call & next call"}
          </Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {error && <Note tone="warn">{error}</Note>}
        <div className="lm-res-outcomes" role="radiogroup" aria-label="How did the call go?">
          {OUTCOMES.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={outcome === o.value} className={`lm-res-outcome${outcome === o.value ? " on" : ""}${o.value === "NOT_INTERESTED" ? " danger" : ""}`} onClick={() => setOutcome(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        <Field label={closing ? "Reason" : "Call notes"} required={closing}>
          <textarea className="lm-textarea" value={note} onChange={(e) => setNote(e.target.value.slice(0, 400))} placeholder={closing ? "Why is the customer not interested?" : "What did the customer say?"} />
        </Field>
        {closing ? (
          <p className="lm-hint">This closes the lead as not interested and stops its follow-up calls.</p>
        ) : (
          <div className="lm-form">
            <Field label="Next call - date" required>
              <input className="lm-input" type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <input className="lm-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Reminder" wide hint={remind ? "It rings only at this date and time." : "Off - nothing will ring for this call."}>
              <div className="lm-reminder-row">
                <label className="lm-check">
                  <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
                  Set a reminder
                </label>
                {remind && (
                  <>
                    <input className="lm-input" type="date" value={remindDate} min={todayKey()} onChange={(e) => setRemindDate(e.target.value)} aria-label="Reminder date" style={{ maxWidth: 170 }} />
                    <input className="lm-input" type="time" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} aria-label="Reminder time" style={{ maxWidth: 130 }} />
                  </>
                )}
              </div>
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
