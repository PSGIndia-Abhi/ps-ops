import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiInbox, FiLayers, FiPhoneCall, FiPhoneMissed, FiSearch, FiSend } from "react-icons/fi";
import { FEEDBACK_HOME } from "./access";
import { CALL_STATUS, formatDate, formatDay, isPast, listCalls, listCompletedSites, listNumberRequests, monthLabel, periodText, shiftMonth, takeCall, takeUpcomingCall, thisMonth } from "./feedbackApi";
import { CompletedFeedbackPanel, CompletedTable } from "./CompletedFeedback";
import { useFeedbackAccess } from "./feedbackContext";
import SiteDetailsPanel from "./SiteDetailsPanel";
import { Card, Empty, ErrorBox, Loading, PageHead, Segmented, Switch, Tiles } from "./ui";

// The Feedback Desk home (Dashboard): the calls the call schedules made (Masters › Call schedule), one
// row per call. By default the calls due today (and earlier ones not done yet - overdue); All, a
// month or a date range (due dates) show the others.
// Filtered by status; TICKET_OPEN = feedback taken but its ticket is not closed yet.
const FILTERS = [
  { value: "TO_CALL", label: "To call" },
  { value: "NOT_ANSWERED", label: "Not answered" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
  { value: "FORM_SENT", label: "Form sent" },
  { value: "FORM_RECEIVED", label: "Form received" },
  { value: "TICKET_OPEN", label: "Ticket open" },
  { value: "DONE", label: "Completed" },
  { value: "ALL", label: "All" },
];
const PAGE_SIZE = 50;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The day `n` days from today, e.g. "Wed, 25 Nov". */
function aheadLabel(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** Period filter: Due today, Upcoming (one day 1-7 days ahead), All, By month (one month, with arrows) or Date range (from - to), by due date. */
function PeriodFilter({ mode, ahead, month, from, to, onChange }) {
  const today = todayIso();
  return (
    <div className="fb-period">
      <Segmented
        label="Period"
        options={[
          { value: "today", label: "Due today" },
          { value: "month", label: "By month" },
          { value: "range", label: "Date range" },
          { value: "all", label: "All" },
        ]}
        value={mode}
        onChange={(m) => {
          if (m === "today") onChange({ ahead: "", due: "", month: "", from: "", to: "" });
          if (m === "all") onChange({ ahead: "", due: "all", month: "", from: "", to: "" });
          if (m === "month") onChange({ ahead: "", due: "", month: month || thisMonth(), from: "", to: "" });
          if (m === "range") onChange({ ahead: "", due: "", month: "", from: from || `${thisMonth()}-01`, to: to || today });
        }}
      />
      {/* Upcoming: its own button, apart from the group (a forecast, not a period of made calls). */}
      <button
        type="button"
        className={`fb-btn ${mode === "upcoming" ? "fb-btn-primary" : ""}`}
        aria-pressed={mode === "upcoming"}
        onClick={() => mode !== "upcoming" && onChange({ ahead: String(ahead || 1), due: "", month: "", from: "", to: "", status: "" })}
      >
        <FiCalendar aria-hidden="true" /> Upcoming
      </button>
      {mode === "upcoming" && (
        <label className="fb-row" style={{ gap: 6 }}>
          <FiCalendar aria-hidden="true" className="fb-muted" />
          <select className="fb-input" style={{ width: 210 }} value={ahead} onChange={(e) => onChange({ ahead: e.target.value })} aria-label="Days ahead">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Tomorrow" : `In ${n} days`} · {aheadLabel(n)}
              </option>
            ))}
          </select>
        </label>
      )}
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
  const aheadParam = Number(params.get("ahead"));
  const ahead = Number.isInteger(aheadParam) && aheadParam >= 1 && aheadParam <= 7 ? aheadParam : 0;
  const mode = ahead ? "upcoming" : from || to ? "range" : month ? "month" : params.get("due") === "all" ? "all" : "today";
  const periodLabel = mode === "month" ? monthLabel(month) : mode === "range" ? (from && from === to ? formatDate(from) : `${from ? formatDate(from) : "the start"} – ${to ? formatDate(to) : "today"}`) : "";
  const status = params.get("status") || "ALL";
  const mine = params.get("mine") === "1";
  const page = Number(params.get("page")) || 1;
  const [search, setSearch] = useState(params.get("q") || "");

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busySite, setBusySite] = useState(null);
  const [details, setDetails] = useState(null); // { siteId, month, requestId } for the details pop-up
  const [doneSite, setDoneSite] = useState(null); // site id for the Completed view's feedback pop-up

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
  const periodQuery = mode === "range" ? { from, to } : mode === "month" ? { month } : { due: mode };
  // Completed: one row per site (CompletedFeedback); every other status: one row per call.
  const completedView = status === "DONE";
  const load = useCallback(() => {
    // Upcoming (ahead): the calls taken early for that day plus the ones the schedules will make.
    const period = mode === "upcoming" ? { ahead } : mode === "range" ? { from, to } : mode === "month" ? { month } : { due: mode };
    const common = { ...period, q, mine: mine ? "1" : "", page, page_size: PAGE_SIZE };
    const request = status === "DONE" ? listCompletedSites(common) : listCalls({ ...common, status: status === "ALL" ? "" : status });
    request
      .then((d) => {
        // view: which table the rows are for, so a status switch never draws the wrong table.
        setData({ ...d, view: status === "DONE" ? "done" : "calls" });
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [mode, ahead, month, from, to, status, q, mine, page]);

  useEffect(load, [load]);

  // "Number added": the service coordinator added the right number (Requests) and nobody has called
  // it yet - the call is back on To call and nothing happened on it since. call id -> when it was added.
  const [addedNumbers, setAddedNumbers] = useState({});
  useEffect(() => {
    listNumberRequests("DONE")
      .then((d) => {
        const at = {};
        for (const q of d.requests || []) if (q.resolved_at && (!at[q.call_id] || q.resolved_at > at[q.call_id])) at[q.call_id] = q.resolved_at;
        setAddedNumbers(at);
      })
      .catch(() => setAddedNumbers({}));
  }, [data]);
  const numberAdded = (row) =>
    row.status === "TO_CALL" &&
    Boolean(addedNumbers[row.request_id]) &&
    (!row.last_activity_at || new Date(row.last_activity_at).getTime() <= new Date(addedNumbers[row.request_id]).getTime() + 5000);

  // A row's key: its call, or for an upcoming call not made yet its site.
  const rowKey = (row) => row.request_id || `upcoming-${row.site.id}`;

  /** Take a call; an upcoming one (forecast) is made now first. */
  async function start(row) {
    setBusySite(rowKey(row));
    setError("");
    try {
      const call = row.forecast ? await takeUpcomingCall(row.site.id, row.ahead) : await takeCall(row.request_id);
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
  const dueNow = data?.view === "calls" ? data.sites.filter((s) => s.status !== "DONE" && s.next_call_at && isPast(s.next_call_at)).length : 0;
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

      <PeriodFilter mode={mode} ahead={ahead} month={month} from={from} to={to} onChange={setParam} />

      {/* The status tiles, with the period's total last. */}
      <Tiles
        items={[
          tile("TO_CALL", "To call", "muted", FiPhoneCall),
          tile("NOT_ANSWERED", "Not answered", "warn", FiPhoneMissed, dueNow ? `${dueNow} call-back due now` : undefined),
          tile("FORM_SENT", "Form sent", "info", FiSend),
          tile("FORM_RECEIVED", "Form received", "violet", FiInbox, counts.FORM_RECEIVED ? "Needs your review" : undefined),
          tile("TICKET_OPEN", "Ticket open", "danger", FiAlertTriangle, counts.TICKET_OPEN ? "Waiting for the ticket" : undefined),
          tile("DONE", "Completed", "ok", FiCheckCircle),
          { label: mode === "today" ? "Calls assigned today" : mode === "upcoming" ? `Calls due ${ahead === 1 ? "tomorrow" : `on ${aheadLabel(ahead)}`}` : mode === "month" ? "Calls this month" : "All calls", value: totalSites, tone: "dark", icon: FiLayers, share: totalSites ? (totalSites - openCount) / totalSites : 0, sub: `${totalSites - openCount} completed · ${openCount} still open`, active: status === "ALL", onClick: () => setParam({ status: "ALL" }) },
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
            <input className="fb-input" placeholder="Search customer, site or number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customer, site or number" />
          </label>
          {canCollect && (
            <label className="fb-row" style={{ gap: 8, fontSize: 14 }}>
              <Switch checked={mine} onChange={(v) => setParam({ mine: v ? "1" : "" })} label="Only my calls" />
              Only my calls
            </label>
          )}
        </div>

        {!data || data.view !== (completedView ? "done" : "calls") ? (
          error ? null : <Loading />
        ) : !data?.sites?.length ? (
          <Empty
            title={totalSites ? "No calls match these filters" : mode === "today" ? "No calls due today" : mode === "upcoming" ? `No calls due ${ahead === 1 ? "tomorrow" : `on ${aheadLabel(ahead)}`}` : mode === "all" ? "No calls yet" : `No calls due in ${periodLabel}`}
            text={
              totalSites
                ? "Try another status or clear the search."
                : mode === "upcoming"
                  ? "No call schedule falls on that day. Pick another day."
                : mode === "today"
                  ? "Calls come from Masters › Call schedule. Pick All to see every call."
                  : mode === "all"
                    ? "Calls appear on their due date, for the customers and sites set in Masters › Call schedule."
                    : "Pick another period, or All."
            }
          />
        ) : completedView ? (
          <CompletedTable data={data} onView={(row) => setDoneSite(row.site.id)} />
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
                {/* Calls to make first (To call, Not answered), then the rest; in each, calls nobody has taken first. */}
                {[...data.sites].sort((a, b) => callRank(a) - callRank(b)).map((row) => {
                  const open = () => navigate(`${FEEDBACK_HOME}/calls/${row.request_id}`);
                  const takenBySomeoneElse = row.collector && row.collector.id !== userId;
                  const key = rowKey(row);
                  // Due on a later day: an upcoming call (made on its day) or one taken early.
                  const early = row.due_date > todayIso();
                  return (
                    <tr key={key} className="is-link" onClick={() => setDetails({ siteId: row.site.id, month: row.month, requestId: row.request_id, row })} title="Show the customer's details">
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div className="fb-strong">{formatDay(row.due_date)}</div>
                        {row.overdue ? (
                          <span className="fb-due-late">{lateText(row.due_date)}</span>
                        ) : early && !row.forecast && mode !== "upcoming" ? (
                          <div className="fb-small fb-muted">Taken early · {periodText(row.period_start, row.period_end)}</div>
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
                        {row.waiting ? (
                          // Its earlier call is still open: no new call until that one is done.
                          <div className="fb-status-cell">
                            <span className="fb-pill fb-pill-warn">Earlier call open</span>
                            <span className="fb-result-line fb-result-muted">
                              {CALL_STATUS[row.waiting.status]?.label || row.waiting.status} · due {formatDay(row.waiting.due_date)}
                            </span>
                          </div>
                        ) : (
                          <StatusCell status={row.status} result={row.result} numberAdded={numberAdded(row)} />
                        )}
                      </td>
                      <td>{row.collector?.name || <span className="fb-muted">—</span>}</td>
                      <td className="fb-right" onClick={(e) => e.stopPropagation()}>
                        {row.forecast && (row.waiting || !canCollect) ? (
                          <span className="fb-muted">—</span>
                        ) : row.collector || !canCollect ? (
                          <button
                            type="button"
                            className={`fb-btn fb-btn-sm ${row.status === "FORM_RECEIVED" ? "fb-btn-dark" : row.next_call_at && isPast(row.next_call_at) && row.status !== "DONE" ? "fb-btn-primary" : ""}`}
                            onClick={open}
                          >
                            {row.status === "FORM_RECEIVED" ? "Review form" : row.status === "DONE" ? "View" : takenBySomeoneElse ? "View" : "Open"}
                          </button>
                        ) : (
                          <button type="button" className="fb-btn fb-btn-sm fb-btn-primary" disabled={busySite === key} onClick={() => start(row)}>
                            {busySite === key ? "Taking…" : "Take call"}
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

      {doneSite && (
        <CompletedFeedbackPanel
          siteId={doneSite}
          filters={{ ...periodQuery, q, mine: mine ? "1" : "" }}
          onOpenTicket={(ticketId) => navigate(`${FEEDBACK_HOME}/tickets/${ticketId}`)}
          onClose={() => setDoneSite(null)}
        />
      )}
      {details && (
        <SiteDetailsPanel
          siteId={details.siteId}
          month={details.month}
          requestId={details.requestId}
          canCollect={canCollect}
          userId={userId}
          busy={Boolean(busySite) && Boolean(details.requestId) && busySite === details.requestId}
          onTake={(requestId) => start(requestId === details.requestId && details.row ? details.row : { request_id: requestId, site: { id: details.siteId } })}
          onOpenCall={(callId) => navigate(`${FEEDBACK_HOME}/calls/${callId}`)}
          onOpenTicket={(ticketId) => navigate(`${FEEDBACK_HOME}/tickets/${ticketId}`)}
          onSiteChange={(siteId) => setDetails((d) => ({ ...d, siteId, requestId: null }))}
          onClose={() => setDetails(null)}
        />
      )}
    </>
  );
}

// Dashboard order: the calls to make (To call, Not answered) on top, then the others in the
// order of the status filter; untaken calls before taken ones in each.
const CALL_FIRST = ["TO_CALL", "NOT_ANSWERED", "WRONG_NUMBER", "FORM_SENT", "FORM_RECEIVED", "TICKET_OPEN", "DONE"];
function callRank(row) {
  const at = CALL_FIRST.indexOf(row.status);
  return (at < 0 ? CALL_FIRST.length : at) * 2 + (row.collector ? 1 : 0);
}

/** "Overdue · 4 days" for a call not done by its due date. */
function lateText(due) {
  const days = Math.floor((Date.now() - new Date(`${due}T00:00:00`).getTime()) / 86400000);
  return days >= 1 ? `Overdue · ${days} day${days === 1 ? "" : "s"}` : "Overdue";
}

const RESULT_TEXT = { GOOD: { text: "All good", tone: "ok" }, ISSUE: { text: "Issue reported", tone: "danger" }, NO_RESPONSE: { text: "Not responded", tone: "muted" } };

/** The call's status as one soft pill with a dot, and its result as a small line under it. */
function StatusCell({ status, result, numberAdded }) {
  const s = CALL_STATUS[status] || { label: status, tone: "muted" };
  const r = RESULT_TEXT[result];
  return (
    <div className="fb-status-cell">
      <span className={`fb-pill fb-pill-${s.tone}`}>{s.label}</span>
      {numberAdded && (
        <span className="fb-number-added" title="The service coordinator added the right number - call it">
          Number added
        </span>
      )}
      {r && <span className={`fb-result-line fb-result-${r.tone}`}>{r.text}</span>}
    </div>
  );
}
