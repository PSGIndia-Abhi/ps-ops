// The Residential area's lead list (residential.jsx has the dashboard, the form and each lead's page):
// the home-service leads the app, this site and the website take in (lead_type 'consumer'), with
// search and status / payment filters. A sales executive sees the leads they added; the sales
// manager sees everyone's. Read from GET /api/crm/leads?lead_type=consumer.

import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { FiHome, FiPlusCircle, FiSearch } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { dateTime, money } from "./format";
import { usePaged } from "./hooks";
import { PAYMENT_TONE, RESIDENTIAL_HOME, STATUS_TONE, label, useResidentialAccess, useResidentialLeads } from "./residentialData";
import { Badge, Card, Empty, Pager, SkeletonRows } from "./ui";

export default function ResidentialLeads() {
  const allowed = useResidentialAccess();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { rows, error } = useResidentialLeads();
  const [query, setQuery] = useState(params.get("q") || "");
  const [status, setStatus] = useState(params.get("status") || "");
  const [payment, setPayment] = useState(params.get("payment") || "");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || [])
      .filter((l) => !status || l.lead_status === status)
      .filter((l) => !payment || l.payment_status === payment)
      .filter((l) => !q || [l.customer_name, l.phone, l.location, l.service_name].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [rows, query, status, payment]);
  const paged = usePaged(shown, 10);

  if (!allowed) return <Navigate to={LEADS_HOME} replace />;

  const filterChange = (set) => (e) => {
    set(e.target.value);
    paged.onPage(1);
  };

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>All Residential Leads</h1>
          <p>Home-service leads from the app, this site and the website. Open one to log its follow-up calls.</p>
        </div>
        <Link className="lm-btn primary" to={`${RESIDENTIAL_HOME}/new`}>
          <FiPlusCircle /> Add Residential Lead
        </Link>
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
        ) : error && rows.length === 0 ? (
          <Empty title="Could not load residential leads" text={error} />
        ) : shown.length === 0 ? (
          <Empty title={rows.length ? "No matching leads" : "No residential leads yet"} text={rows.length ? "Try a different search or filter." : "Add one with Add Residential Lead."} icon={<FiHome />} />
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
                    <tr key={l.id} style={{ "--i": i }} onClick={() => navigate(`${RESIDENTIAL_HOME}/${l.id}`)}>
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

    </>
  );
}
