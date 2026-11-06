import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiInbox, FiLayers, FiPhoneCall, FiPhoneMissed, FiSearch, FiSend } from "react-icons/fi";
import { FEEDBACK_HOME } from "./access";
import { CALL_STATUS, formatDate, formatDay, isPast, listCalls, monthLabel, periodText, shiftMonth, takeCall, thisMonth } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import SiteDetailsPanel from "./SiteDetailsPanel";
import { EndedSchedules } from "./ScheduleMaster";
import { Card, Empty, ErrorBox, Loading, PageHead, Segmented, Switch, Tiles } from "./ui";

// The Feedback Desk home (Dashboard): the calls the call schedules made (Masters › Call schedule), one
// row per call. By default the calls due today (and earlier ones not done yet - overdue); All, a
// month or a date range (due dates) show the others.
// Filtered by status; TICKET_OPEN = feedback taken but its ticket is not closed yet.
const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "TO_CALL", label: "To call" },
  { value: "NOT_ANSWERED", label: "Not answered" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
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

/** Period filter: Due today, All, By month (one month, with arrows) or Date range (from - to), by due date. */
function PeriodFilter({ mode, month, from, to, onChange }) {
  const today = todayIso();
  return (
    <div className="fb-period">
      <Segmented
        label="Period"
        options={[
          { value: "today", label: "Due today" },
          { value: "all", label: "All" },
          { value: "month", label: "By month" },
          { value: "range", label: "Date range" },
        ]}
        value={mode}
        onChange={(m) => {
          if (m === "today") onChange({ due: "", month: "", from: "", to: "" });
          if (m === "all") onChange({ due: "all", month: "", from: "", to: "" });
          if (m === "month") onChange({ due: "", month: month || thisMonth(), from: "", to: "" });
          if (m === "range") onChange({ due: "", month: "", from: from || `${thisMonth()}-01`, to: to || today });
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
  const mode = from || to ? "range" : month ? "month" : params.get("due") === "all" ? "all" : "today";
  const periodLabel = mode === "month" ? monthLabel(month) : mode === "range" ? (from && from === to ? formatDate(from) : `${from ? formatDate(from) : "the start"} – ${to ? formatDate(to) : "today"}`) : "";
  const status = params.get("status") || "ALL";
  const mine = params.get("mine") === "1";
  const page = Number(params.get("page")) || 1;
  const [search, setSearch] = useState(params.get("q") || "");

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busySite, setBusySite] = useState(null);
  const [details, setDetails] = useState(null); // { siteId, month, requestId } for the details pop-up

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
    const period = mode === "range" ? { from, to } : mode === "month" ? { month } : { due: mode };
    listCalls({ ...period, status: status === "ALL" ? "" : status, q, mine: mine ? "1" : "", page, page_size: PAGE_SIZE })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [mode, month, from, to, status, q, mine, page]);

  useEffect(load, [load]);

  async function start(requestId) {
    setBusySite(requestId);
    setError("");
    try {
      const call = await takeCall(requestId);
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
      {(can("FEEDBACK_ADMIN") || can("FEEDBACK_SCHEDULE")) && <EndedSchedules />}

      <PeriodFilter mode={mode} month={month} from={from} to={to} onChange={setParam} />

      <Tiles
        items={[
          { label: mode === "today" ? "Calls due today" : mode === "month" ? "Calls this month" : "All calls", value: totalSites, tone: "dark", icon: FiLayers, share: totalSites ? (totalSites - openCount) / totalSites : 0, sub: `${totalSites - openCount} completed · ${openCount} still open`, active: status === "ALL", onClick: () => setParam({ status: "ALL" }) },
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
            title={totalSites ? "No calls match these filters" : mode === "today" ? "No calls due today" : mode === "all" ? "No calls yet" : `No calls due in ${periodLabel}`}
            text={
              totalSites
                ? "Try another status or clear the search."
                : mode === "today"
                  ? "Calls come from Masters › Call schedule. Pick All to see every call."
                  : mode === "all"
                    ? "Calls appear on their due date, for the customers and sites set in Masters › Call schedule."
                    : "Pick another period, or All."
            }
          />
        ) : (
          <div className="fb-table-wrap">
            <table className="fb-table">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Customer · Site</th>
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
                  const open = () => navigate(`${FEEDBACK_HOME}/calls/${row.request_id}`);
                  const takenBySomeoneElse = row.collector && row.collector.id !== userId;
                  return (
                    <tr key={row.request_id} className="is-link" onClick={() => setDetails({ siteId: row.site.id, month: row.month, requestId: row.request_id })} title="Show the customer's details">
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div className="fb-strong">{formatDay(row.due_date)}</div>
                        {row.overdue ? (
                          <span className="fb-due-late">{lateText(row.due_date)}</span>
                        ) : (
                          <div className="fb-small fb-muted">{periodText(row.period_start, row.period_end)}</div>
                        )}
                      </td>
                      {/* One row per site: a customer with several sites has a row for each. */}
                      <td>
                        <div className="fb-strong">{row.customer.name}</div>
                        <div className="fb-small fb-muted">
                          {row.site.name}
                          {row.site.city ? ` · ${row.site.city}` : ""}
                        </div>
                      </td>
                      <td className="fb-num">{row.visit_count}</td>
                      {/* No service in the period: the last one before it, marked "earlier". */}
                      <td style={{ whiteSpace: "nowrap" }}>
                        {row.last_visit_date ? (
                          formatDay(row.last_visit_date)
                        ) : row.earlier_visit ? (
                          <>
                            {formatDay(row.earlier_visit.date)}
                            <div className="fb-earlier-tag">earlier</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="fb-small" style={{ maxWidth: 220 }}>
                        {row.services || (row.earlier_visit ? <span className="fb-muted">{row.earlier_visit.service} (earlier)</span> : <span className="fb-muted">No service yet</span>)}
                      </td>
                      <td>
                        <StatusCell status={row.status} result={row.result} />
                      </td>
                      <td>{row.collector?.name || <span className="fb-muted">—</span>}</td>
                      <td className="fb-right" onClick={(e) => e.stopPropagation()}>
                        {row.collector || !canCollect ? (
                          <button
                            type="button"
                            className={`fb-btn fb-btn-sm ${row.status === "FORM_RECEIVED" ? "fb-btn-dark" : row.next_call_at && isPast(row.next_call_at) && row.status !== "DONE" ? "fb-btn-primary" : ""}`}
                            onClick={open}
                          >
                            {row.status === "FORM_RECEIVED" ? "Review form" : row.status === "DONE" ? "View" : takenBySomeoneElse ? "View" : "Open"}
                          </button>
                        ) : (
                          <button type="button" className="fb-btn fb-btn-sm fb-btn-primary" disabled={busySite === row.request_id} onClick={() => start(row.request_id)}>
                            {busySite === row.request_id ? "Taking…" : "Take call"}
                          </button>
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
          requestId={details.requestId}
          canCollect={canCollect}
          userId={userId}
          busy={Boolean(busySite) && busySite === details.requestId}
          onTake={(requestId) => start(requestId)}
          onOpenCall={(callId) => navigate(`${FEEDBACK_HOME}/calls/${callId}`)}
          onOpenTicket={(ticketId) => navigate(`${FEEDBACK_HOME}/tickets/${ticketId}`)}
          onSiteChange={(siteId) => setDetails((d) => ({ ...d, siteId, requestId: null }))}
          onClose={() => setDetails(null)}
        />
      )}
    </>
  );
}

/** "Overdue · 4 days" for a call not done by its due date. */
function lateText(due) {
  const days = Math.floor((Date.now() - new Date(`${due}T00:00:00`).getTime()) / 86400000);
  return days >= 1 ? `Overdue · ${days} day${days === 1 ? "" : "s"}` : "Overdue";
}

const RESULT_TEXT = { GOOD: { text: "All good", tone: "ok" }, ISSUE: { text: "Issue reported", tone: "danger" }, NO_RESPONSE: { text: "Not responded", tone: "muted" } };

/** The call's status as one soft pill with a dot, and its result as a small line under it. */
function StatusCell({ status, result }) {
  const s = CALL_STATUS[status] || { label: status, tone: "muted" };
  const r = RESULT_TEXT[result];
  return (
    <div className="fb-status-cell">
      <span className={`fb-pill fb-pill-${s.tone}`}>{s.label}</span>
      {r && <span className={`fb-result-line fb-result-${r.tone}`}>{r.text}</span>}
    </div>
  );
}
