import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiInbox, FiLayers, FiPhoneCall, FiPhoneMissed, FiSearch, FiSend } from "react-icons/fi";
import { FEEDBACK_HOME } from "./access";
import { formatDate, formatDay, isPast, listCalls, monthLabel, shiftMonth, takeCall, thisMonth } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import SiteDetailsPanel from "./SiteDetailsPanel";
import { CallStatusChip, Card, Empty, ErrorBox, Loading, PageHead, ResultChip, Segmented, Switch, Tiles } from "./ui";

// The Feedback Desk home (Dashboard): every site with a service (assigned visit up to today), one row per site and
// month, newest month first. Picking a month shows only that month.
// Filtered by status; TICKET_OPEN = feedback taken but its ticket is not closed yet.
const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "TO_CALL", label: "To call" },
  { value: "NOT_ANSWERED", label: "Not answered" },
  { value: "FORM_SENT", label: "Form sent" },
  { value: "FORM_RECEIVED", label: "Form received" },
  { value: "TICKET_OPEN", label: "Ticket open" },
  { value: "DONE", label: "Completed" },
];
const PAGE_SIZE = 50;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Period filter: All, By month (one month, with arrows) or Date range (from - to). */
function PeriodFilter({ mode, month, from, to, onChange }) {
  const today = todayIso();
  return (
    <div className="fb-period">
      <Segmented
        label="Period"
        options={[
          { value: "all", label: "All" },
          { value: "month", label: "By month" },
          { value: "range", label: "Date range" },
        ]}
        value={mode}
        onChange={(m) => {
          if (m === "all") onChange({ month: "", from: "", to: "" });
          if (m === "month") onChange({ month: month || thisMonth(), from: "", to: "" });
          if (m === "range") onChange({ month: "", from: from || `${thisMonth()}-01`, to: to || today });
        }}
      />
      {mode === "month" && (
        <div className="fb-row" style={{ gap: 6 }}>
          <button type="button" className="fb-btn fb-btn-sm" onClick={() => onChange({ month: shiftMonth(month, -1) })} aria-label="Previous month">
            <FiChevronLeft />
          </button>
          <label className="fb-row" style={{ gap: 6 }}>
            <FiCalendar aria-hidden="true" className="fb-muted" />
            <input type="month" className="fb-input" style={{ width: 170 }} value={month} max={thisMonth()} onChange={(e) => e.target.value && onChange({ month: e.target.value })} aria-label="Month" />
          </label>
          <button type="button" className="fb-btn fb-btn-sm" onClick={() => onChange({ month: shiftMonth(month, 1) })} disabled={month >= thisMonth()} aria-label="Next month">
            <FiChevronRight />
          </button>
        </div>
      )}
      {mode === "range" && (
        <div className="fb-row" style={{ gap: 8 }}>
          <label className="fb-row" style={{ gap: 6, fontSize: 13, fontWeight: 600 }}>
            From
            <input type="date" className="fb-input" style={{ width: 160 }} value={from} max={to || today} onChange={(e) => onChange({ from: e.target.value })} aria-label="From date" />
          </label>
          <label className="fb-row" style={{ gap: 6, fontSize: 13, fontWeight: 600 }}>
            To
            <input type="date" className="fb-input" style={{ width: 160 }} value={to} min={from || undefined} max={today} onChange={(e) => onChange({ to: e.target.value })} aria-label="To date" />
          </label>
        </div>
      )}
    </div>
  );
}

export default function CallList() {
  const navigate = useNavigate();
  const { can, userId } = useFeedbackAccess();
  const canCollect = can("FEEDBACK_COLLECT");
  const [params, setParams] = useSearchParams();
  const month = params.get("month") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const mode = from || to ? "range" : month ? "month" : "all";
  const periodText = mode === "month" ? monthLabel(month) : mode === "range" ? (from && from === to ? formatDate(from) : `${from ? formatDate(from) : "the start"} – ${to ? formatDate(to) : "today"}`) : "";
  const status = params.get("status") || "ALL";
  const mine = params.get("mine") === "1";
  const page = Number(params.get("page")) || 1;
  const [search, setSearch] = useState(params.get("q") || "");

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busySite, setBusySite] = useState(null);
  const [details, setDetails] = useState(null); // { siteId, month } for the details pop-up

  const setParam = useCallback(
    (changes) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === "" || v === undefined) next.delete(k);
          else next.set(k, v);
        }
        if (!("page" in changes)) next.delete("page");
        return next;
      });
    },
    [setParams],
  );

  // Search waits until typing stops.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") || "") !== search.trim()) setParam({ q: search.trim() });
    }, 350);
    return () => clearTimeout(t);
  }, [search, params, setParam]);

  const q = params.get("q") || "";
  const load = useCallback(() => {
    const period = mode === "range" ? { from, to } : { month: mode === "month" ? month : "all" };
    listCalls({ ...period, status: status === "ALL" ? "" : status, q, mine: mine ? "1" : "", page, page_size: PAGE_SIZE })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [mode, month, from, to, status, q, mine, page]);

  useEffect(load, [load]);

  async function start(siteId, callMonth) {
    setBusySite(`${siteId}|${callMonth}`);
    setError("");
    try {
      const call = await takeCall(siteId, callMonth);
      navigate(`${FEEDBACK_HOME}/calls/${call.id}`);
    } catch (err) {
      setError(err.message);
      setBusySite(null);
      setDetails(null);
      load();
    }
  }

  const counts = data?.status_counts || {};
  const totalSites = Object.values(counts).reduce((n, c) => n + c, 0);
  const openCount = totalSites - (counts.DONE || 0);
  const dueNow = (data?.sites || []).filter((s) => s.status !== "DONE" && s.next_call_at && isPast(s.next_call_at)).length;
  const tile = (key, label, tone, icon, sub) => ({
    label,
    value: counts[key] || 0,
    tone,
    icon,
    sub,
    share: totalSites ? (counts[key] || 0) / totalSites : 0,
    active: status === key,
    onClick: () => setParam({ status: key }),
  });

  return (
    <>
      <PageHead title="Dashboard" />

      <PeriodFilter mode={mode} month={month} from={from} to={to} onChange={setParam} />

      <Tiles
        items={[
          { label: mode === "month" ? "Sites this month" : "All calls", value: totalSites, tone: "dark", icon: FiLayers, share: totalSites ? (totalSites - openCount) / totalSites : 0, sub: `${totalSites - openCount} completed · ${openCount} still open`, active: status === "ALL", onClick: () => setParam({ status: "ALL" }) },
          tile("TO_CALL", "To call", "muted", FiPhoneCall),
          tile("NOT_ANSWERED", "Not answered", "warn", FiPhoneMissed, dueNow ? `${dueNow} call-back due now` : undefined),
          tile("FORM_SENT", "Form sent", "info", FiSend),
          tile("FORM_RECEIVED", "Form received", "violet", FiInbox, counts.FORM_RECEIVED ? "Needs your review" : undefined),
          tile("TICKET_OPEN", "Ticket open", "danger", FiAlertTriangle, counts.TICKET_OPEN ? "Waiting for the ticket" : undefined),
          tile("DONE", "Completed", "ok", FiCheckCircle),
        ]}
      />

      <ErrorBox error={error} />

      <Card bodyClass="is-flush">
        <div className="fb-filters">
          <Segmented
            label="Status"
            options={FILTERS}
            value={status}
            onChange={(v) => setParam({ status: v })}
          />
          <label className="fb-row" style={{ gap: 6, flex: "1 1 220px", maxWidth: 300 }}>
            <FiSearch aria-hidden="true" className="fb-muted" />
            <input className="fb-input" placeholder="Search customer or site" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customer or site" />
          </label>
          {canCollect && (
            <label className="fb-row" style={{ gap: 8, fontSize: 14 }}>
              <Switch checked={mine} onChange={(v) => setParam({ mine: v ? "1" : "" })} label="Only my calls" />
              Only my calls
            </label>
          )}
        </div>

        {!data ? (
          error ? null : <Loading />
        ) : !data?.sites?.length ? (
          <Empty
            title={totalSites ? "No calls match these filters" : mode === "all" ? "No services yet" : `No services in ${periodText}`}
            text={totalSites ? "Try another status or clear the search." : mode === "all" ? "Customers appear here once a service is assigned to them." : "Pick another period, or All."}
          />
        ) : (
          <div className="fb-table-wrap">
            <table className="fb-table">
              <thead>
                <tr>
                  {mode !== "month" && <th>Month</th>}
                  <th>Site · Customer</th>
                  <th>Visits</th>
                  <th>Last visit</th>
                  <th>Services</th>
                  <th>Status</th>
                  <th>Collector</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {data.sites.map((row) => {
                  const open = row.request_id ? () => navigate(`${FEEDBACK_HOME}/calls/${row.request_id}`) : null;
                  const takenBySomeoneElse = row.collector && row.collector.id !== userId;
                  return (
                    <tr key={`${row.site.id}|${row.month}`} className="is-link" onClick={() => setDetails({ siteId: row.site.id, month: row.month })} title="Show the customer's details">
                      {mode !== "month" && <td style={{ whiteSpace: "nowrap" }} className="fb-strong">{monthLabel(row.month)}</td>}
                      {/* One row per site: a customer with several sites has a row for each. */}
                      <td>
                        <div className="fb-strong">
                          {row.site.name}
                          {row.site.city ? <span className="fb-muted" style={{ fontWeight: 400 }}> · {row.site.city}</span> : null}
                        </div>
                        <div className="fb-small fb-muted">{row.customer.name}</div>
                      </td>
                      <td className="fb-num">{row.visit_count}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDay(row.last_visit_date)}</td>
                      <td className="fb-small" style={{ maxWidth: 220 }}>
                        {row.services || "—"}
                      </td>
                      <td>
                        <div className="fb-row" style={{ gap: 6 }}>
                          <CallStatusChip status={row.status} />
                          <ResultChip result={row.result} />
                        </div>
                      </td>
                      <td>{row.collector?.name || <span className="fb-muted">—</span>}</td>
                      <td className="fb-right" onClick={(e) => e.stopPropagation()}>
                        {row.request_id ? (
                          <button
                            type="button"
                            className={`fb-btn fb-btn-sm ${row.status === "FORM_RECEIVED" ? "fb-btn-dark" : row.next_call_at && isPast(row.next_call_at) && row.status !== "DONE" ? "fb-btn-primary" : ""}`}
                            onClick={open}
                          >
                            {row.status === "FORM_RECEIVED" ? "Review form" : row.status === "DONE" ? "View" : takenBySomeoneElse ? "View" : "Open"}
                          </button>
                        ) : canCollect ? (
                          <button type="button" className="fb-btn fb-btn-sm fb-btn-primary" disabled={busySite === `${row.site.id}|${row.month}`} onClick={() => start(row.site.id, row.month)}>
                            {busySite === `${row.site.id}|${row.month}` ? "Taking…" : "Take call"}
                          </button>
                        ) : (
                          <span className="fb-small fb-muted">Not taken yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > PAGE_SIZE && (
          <div className="fb-pager">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
            </span>
            <div className="fb-row" style={{ gap: 8 }}>
              <button type="button" className="fb-btn fb-btn-sm" disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}>
                Previous
              </button>
              <button type="button" className="fb-btn fb-btn-sm" disabled={page * PAGE_SIZE >= data.total} onClick={() => setParam({ page: page + 1 })}>
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {details && (
        <SiteDetailsPanel
          siteId={details.siteId}
          month={details.month}
          canCollect={canCollect}
          userId={userId}
          busy={busySite === `${details.siteId}|${details.month}`}
          onTake={(siteId) => start(siteId, details.month)}
          onOpenCall={(callId) => navigate(`${FEEDBACK_HOME}/calls/${callId}`)}
          onOpenTicket={(ticketId) => navigate(`${FEEDBACK_HOME}/tickets/${ticketId}`)}
          onSiteChange={(siteId) => setDetails((d) => ({ ...d, siteId }))}
          onClose={() => setDetails(null)}
        />
      )}
    </>
  );
}
