// Residential leads for the sales manager: the home-service leads the old CRM app and the website
// take in (lead_type 'consumer'). Shown for reference only - they are not worked through the
// commercial pipeline here, so there are no follow-ups or actions, just the list and each lead's
// details as the app captured them. Read from GET /api/crm/leads?lead_type=consumer.

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiCreditCard, FiFileText, FiHome, FiInfo, FiMail, FiPhone, FiSearch, FiTool, FiUser } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { request } from "./leadsApi";
import { dateTime, money } from "./format";
import { usePaged } from "./hooks";
import { Avatar, Badge, Button, Card, Empty, Modal, Pager, SkeletonRows } from "./ui";
import { useViewer } from "./viewer";

const STATUS_TONE = { new: "info", contacted: "warn", converted: "success", lost: "danger" };
const PAYMENT_TONE = { paid: "success", pending: "warn", failed: "danger", na: "neutral" };
const label = (text) => (text ? String(text).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-");

export default function ResidentialLeads() {
  const { persona } = useViewer();
  const [rows, setRows] = useState(null); // null while loading
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    request("/api/crm/leads?lead_type=consumer")
      .then((list) => alive && setRows(Array.isArray(list) ? list : []))
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        setError(err.message || "Could not load residential leads.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || [])
      .filter((l) => !status || l.lead_status === status)
      .filter((l) => !payment || l.payment_status === payment)
      .filter((l) => !q || [l.customer_name, l.phone, l.location, l.service_name].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [rows, query, status, payment]);
  const paged = usePaged(shown, 10);

  if (persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

  const filterChange = (set) => (e) => {
    set(e.target.value);
    paged.onPage(1);
  };

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Residential Leads</h1>
          <p>Home-service leads from the sales app and the website. For reference - they are not worked through the commercial pipeline.</p>
        </div>
      </div>

      <Card flush>
        <div className="lm-tools">
          <label className="lm-search">
            <FiSearch />
            <input value={query} onChange={filterChange(setQuery)} placeholder="Search by name, phone, area or service..." aria-label="Search residential leads" />
          </label>
          <select className="lm-select" value={status} onChange={filterChange(setStatus)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {["new", "contacted", "converted", "lost"].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <select className="lm-select" value={payment} onChange={filterChange(setPayment)} aria-label="Filter by payment">
            <option value="">All payments</option>
            {["paid", "pending", "failed", "na"].map((s) => (
              <option key={s} value={s}>
                {s === "na" ? "No payment" : label(s)}
              </option>
            ))}
          </select>
        </div>

        {rows === null ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <Empty title="Could not load residential leads" text={error} />
        ) : shown.length === 0 ? (
          <Empty title={rows.length ? "No matching leads" : "No residential leads yet"} text={rows.length ? "Try a different search or filter." : "They appear here as the sales app and the website take them in."} icon={<FiHome />} />
        ) : (
          <>
            <div className="lm-table-wrap" key={paged.page}>
              <table className="lm-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Service</th>
                    <th>Area</th>
                    <th className="num">Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((l, i) => (
                    <tr key={l.id} style={{ "--i": i }} onClick={() => setOpen(l)}>
                      <td>
                        <span className="lm-who-text">
                          <strong>{l.customer_name || "-"}</strong>
                          <small>{l.phone}</small>
                        </span>
                      </td>
                      <td>
                        <span className="lm-who-text">
                          <strong>{l.service_name || "-"}</strong>
                          <small>{[l.house_type, l.plan_type].filter(Boolean).join(" · ")}</small>
                        </span>
                      </td>
                      <td className="muted">{l.location || "-"}</td>
                      <td className="num">{money(l.amount)}</td>
                      <td>
                        <Badge tone={PAYMENT_TONE[l.payment_status] || "neutral"}>{l.payment_status === "na" ? "No payment" : label(l.payment_status)}</Badge>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[l.lead_status] || "neutral"}>{label(l.lead_status)}</Badge>
                      </td>
                      <td className="muted">{dateTime(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...paged} />
          </>
        )}
      </Card>

      {open && <ResidentialLeadModal lead={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** One residential lead's details, read-only: a header with the essentials, then grouped cards. */
function ResidentialLeadModal({ lead: l, onClose }) {
  const discount = l.standard_amount != null && Number(l.standard_amount) > Number(l.amount) ? Number(l.standard_amount) - Number(l.amount) : 0;
  const groups = [
    {
      key: "contact",
      title: "Contact",
      icon: <FiUser />,
      rows: [
        ["Phone", l.phone && <a href={`tel:${l.phone}`}>{l.phone}</a>],
        ["Alternate phone", l.alternate_phone && <a href={`tel:${l.alternate_phone}`}>{l.alternate_phone}</a>],
        ["Email", l.email && <a href={`mailto:${l.email}`}>{l.email}</a>],
        ["Address", l.location],
      ],
    },
    {
      key: "service",
      title: "Service",
      icon: <FiTool />,
      rows: [
        ["House type", l.house_type],
        ["Service", l.service_name],
        ["Plan", l.plan_type],
      ],
    },
    {
      key: "payment",
      title: "Payment",
      icon: <FiCreditCard />,
      rows: [
        ["Standard price", l.standard_amount != null ? money(l.standard_amount) : ""],
        ["Amount", discount ? `${money(l.amount)} (${money(discount)} off)` : money(l.amount)],
        ["Coupon", l.coupon_code],
        ["Method", l.payment_method ? label(l.payment_method) : ""],
        ["Status", l.payment_status === "na" ? "No payment" : label(l.payment_status)],
        ["Paid on", l.paid_at ? dateTime(l.paid_at) : ""],
      ],
    },
    {
      key: "info",
      title: "Lead info",
      icon: <FiInfo />,
      rows: [
        ["Source", l.lead_source ? label(l.lead_source) : ""],
        ["Referred by", l.reference_by],
        ["Added by", l.created_by_name],
        ["Added on", dateTime(l.created_at)],
      ],
    },
  ].map((g) => ({ ...g, rows: g.rows.filter(([, v]) => v !== null && v !== undefined && v !== false && String(typeof v === "string" ? v : "x").trim() !== "") }));

  return (
    <Modal
      wide
      title={l.customer_name || "Residential lead"}
      sub={[l.service_name, l.location].filter(Boolean).join(" · ") || "Residential lead"}
      onClose={onClose}
      footer={(close) => (
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      )}
    >
      <div className="lm-rl-head">
        <Avatar name={l.customer_name || "?"} size={52} />
        <div className="lm-rl-who">
          <strong>{l.customer_name || "Customer"}</strong>
          <small>{[l.service_name, l.house_type, l.location].filter(Boolean).join(" · ") || "Residential lead"}</small>
          <div className="lm-rl-badges">
            <Badge tone={STATUS_TONE[l.lead_status] || "neutral"}>{label(l.lead_status)}</Badge>
            <Badge tone={PAYMENT_TONE[l.payment_status] || "neutral"}>{l.payment_status === "na" ? "No payment" : label(l.payment_status)}</Badge>
          </div>
        </div>
        <div className="lm-rl-side">
          <span className="lm-rl-amount">{money(l.amount)}</span>
          <div className="lm-rl-actions">
            {!!l.phone && (
              <a className="lm-btn success sm" href={`tel:${l.phone}`}>
                <FiPhone /> Call
              </a>
            )}
            {!!l.email && (
              <a className="lm-btn ghost sm" href={`mailto:${l.email}`}>
                <FiMail /> Email
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="lm-rl-grid">
        {groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <section key={g.key} className="lm-rl-card">
              <h3>
                <span className="lm-rl-icon">{g.icon}</span> {g.title}
              </h3>
              <dl>
                {g.rows.map(([k, v]) => (
                  <div key={k} className="lm-rl-row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        {!!l.notes && (
          <section className="lm-rl-card wide">
            <h3>
              <span className="lm-rl-icon">
                <FiFileText />
              </span>{" "}
              Notes
            </h3>
            <p className="lm-rl-notes">{l.notes}</p>
          </section>
        )}
      </div>
    </Modal>
  );
}
