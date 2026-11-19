import { useEffect, useState } from "react";
import { FiAlertTriangle, FiChevronRight, FiEye, FiMinusCircle, FiX } from "react-icons/fi";
import { formatDate, formatDay, getCompletedSite } from "./feedbackApi";
import { Chip, ErrorBox, FeedbackRound, Loading, PriorityChip, TicketStatusChip } from "./ui";

// The Dashboard's Completed view: the completed calls grouped by customer site (one row each), and
// a pop-up with every feedback the site gave in the period and the tickets raised from each.
// Other status filters keep one row per call (CallList).

// Same colours as the Customer Report: 85%+ good, 70%+ ok, else bad.
const scoreTone = (v) => (v === null ? "none" : v >= 85 ? "good" : v >= 70 ? "ok" : "bad");
/** Share of answered feedbacks with no issue (Not responded calls don't count), or null. */
const satisfaction = (good, issues) => (good + issues ? Math.round((good / (good + issues)) * 100) : null);

const RESULT_DOT = { GOOD: "#22c55e", ISSUE: "#ef4444", NO_RESPONSE: "#cbd5e1" };

/** The grouped table (inside the Dashboard's card). */
export function CompletedTable({ data, onView }) {
  return (
    <>
      <div className="fb-groupnote">
        <b>
          {data.feedbacks} completed feedback{data.feedbacks === 1 ? "" : "s"}
        </b>{" "}
        from{" "}
        <b>
          {data.total} customer site{data.total === 1 ? "" : "s"}
        </b>{" "}
        · newest first
      </div>
      <div className="fb-table-wrap">
        <table className="fb-table">
          <thead>
            <tr>
              <th>Customer · Site</th>
              <th>Feedbacks</th>
              <th>Last feedback</th>
              <th>Satisfaction</th>
              <th>Status</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {data.sites.map((row) => {
              const score = satisfaction(row.good, row.issues);
              return (
                <tr key={row.site.id} className="is-link" onClick={() => onView(row)} title="Show every feedback of this site">
                  <td>
                    <div className="fb-strong">{row.customer.name}</div>
                    <div className="fb-small fb-muted">
                      {row.site.name}
                      {row.site.city ? ` · ${row.site.city}` : ""}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="fb-count">{row.feedbacks}</span>
                    {/* One dot per feedback, oldest first: green good, red issue, grey not responded. */}
                    <span className="fb-result-dots" aria-hidden="true">
                      {row.results.slice(-12).map((r, i) => (
                        <i key={i} style={{ background: RESULT_DOT[r] || "#cbd5e1" }} />
                      ))}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDay(row.last_done_at || row.last_due_date)}</td>
                  <td style={{ minWidth: 170 }}>
                    {score === null ? (
                      <span className="fb-muted">—</span>
                    ) : (
                      <div className={`fb-scorebar fb-score-${scoreTone(score)}`}>
                        <div className="fb-scorebar-track">
                          <span style={{ width: `${score}%` }} />
                        </div>
                        <b>{score}%</b>
                      </div>
                    )}
                    <div className="fb-small fb-muted">
                      {[row.issues ? `${row.issues} with issue` : "No issues", row.no_response ? `${row.no_response} not responded` : null].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>
                    <span className="fb-pill fb-pill-ok">Completed</span>
                  </td>
                  <td className="fb-right" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="fb-btn fb-btn-sm fb-btn-primary" onClick={() => onView(row)}>
                      <FiEye aria-hidden="true" /> View details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Every completed feedback of one site in the Dashboard's period and filters (filters = the same
 * query as the list), newest first. onOpenTicket(ticketId) opens the ticket page.
 */
export function CompletedFeedbackPanel({ siteId, filters, onOpenTicket, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    getCompletedSite(siteId, filters)
      .then((d) => live && setData(d))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
    // filters is rebuilt on every render of the Dashboard; its values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, JSON.stringify(filters)]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const calls = data?.calls || [];
  const good = calls.filter((c) => c.result === "GOOD").length;
  const issues = calls.filter((c) => c.result === "ISSUE").length;
  const score = satisfaction(good, issues);

  return (
    <div className="fb-drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="fb-drawer" role="dialog" aria-modal="true" aria-label="Completed feedback">
        <div className="fb-drawer-h">
          <div className="fb-cust-top" style={{ minWidth: 0 }}>
            <span className="fb-cust-avatar" aria-hidden="true">
              {(data?.customer?.name || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?"}
            </span>
            <div style={{ minWidth: 0 }}>
              <h2>{data?.customer?.name || "Completed feedback"}</h2>
              {data && (
                <div className="fb-small fb-muted">
                  {data.site.name}
                  {data.site.city ? ` · ${data.site.city}` : ""} · all completed feedback
                </div>
              )}
            </div>
          </div>
          <button type="button" className="fb-icon-btn" style={{ flex: "none" }} onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>

        <div className="fb-drawer-b">
          {error ? (
            <ErrorBox error={error} />
          ) : !data ? (
            <Loading />
          ) : (
            <>
              <div className="fb-done-sum">
                <div className={`fb-score fb-score-${scoreTone(score)}`}>
                  <div className="fb-score-n">{score === null ? "—" : `${score}%`}</div>
                  <div className="fb-score-l">Satisfaction</div>
                  <div className="fb-score-s">
                    across {calls.length} feedback{calls.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="fb-done-counts">
                  <div>
                    <b>{calls.length}</b>
                    <span>Feedbacks</span>
                  </div>
                  <div>
                    <b style={{ color: "#15803d" }}>{good}</b>
                    <span>Good</span>
                  </div>
                  <div>
                    <b style={{ color: "#b91c1c" }}>{issues}</b>
                    <span>With issue</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="fb-section-t">Feedback history · newest first</div>
                <div className="fb-rounds">
                  {calls.map((c) => {
                    const when = formatDate(c.done_at || c.due_date);
                    const tickets = c.tickets.length > 0 && (
                      <div className="fb-done-tickets">
                        <div className="fb-section-t">
                          Tickets raised on {when} ({c.tickets.length})
                        </div>
                        {c.tickets.map((t) => (
                          <button key={t.id} type="button" className="fb-done-ticket" onClick={() => onOpenTicket(t.id)} title="Open this ticket">
                            <span className="fb-done-ticket-no">{t.ticket_number || "Ticket"}</span>
                            {t.issue_summary && <span className="fb-done-ticket-t">{t.issue_summary}</span>}
                            <TicketStatusChip status={t.status} />
                            <PriorityChip priority={t.priority} />
                            <FiChevronRight aria-hidden="true" className="fb-done-ticket-go" />
                          </button>
                        ))}
                      </div>
                    );
                    if (!c.feedback) {
                      // Closed without answers (Not responded) - just the call.
                      return (
                        <div key={c.request_id} className="fb-round fb-round-warn">
                          <span className="fb-round-icon" aria-hidden="true">
                            <FiMinusCircle />
                          </span>
                          <div className="fb-round-body">
                            <div className="fb-round-title">
                              {when} <Chip tone="muted">{c.result === "NO_RESPONSE" ? "Not responded" : "No answers"}</Chip>
                            </div>
                            <div className="fb-small fb-muted">{c.collector?.name ? `Collector ${c.collector.name}` : "No feedback was recorded on this call."}</div>
                            {tickets}
                          </div>
                        </div>
                      );
                    }
                    const isIssue = c.result === "ISSUE" || c.feedback.has_issue;
                    return (
                      <FeedbackRound
                        key={c.request_id}
                        label={when}
                        status={isIssue ? { text: "Issue", tone: "danger" } : { text: "Good", tone: "ok" }}
                        submission={c.feedback}
                        extra={tickets}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="fb-drawer-f">
          {data && calls.some((c) => c.tickets.length) && (
            <span className="fb-small fb-muted" style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FiAlertTriangle aria-hidden="true" /> Click a ticket to open it
            </span>
          )}
          <button type="button" className="fb-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
