import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiAlertTriangle, FiCheckCircle, FiDownload, FiMapPin, FiMessageSquare, FiTag } from "react-icons/fi";
import { FEEDBACK_HOME } from "./access";
import { ACTIONS, exportCustomerReport, formatDate, formatDateTime, formatDay, getCustomerReport, getCustomers, shiftMonth, thisMonth } from "./feedbackApi";
import CustomerPicker from "./CustomerPicker";
import { Card, Chip, Empty, ErrorBox, Loading, PageHead, PriorityChip, Segmented, TicketStatusChip, Tiles } from "./ui";

const pct = (part, whole) => (whole ? Math.round((part * 100) / whole) : null);
// Complaint rate: lower is better.
const rateTone = (v) => (v === null ? "none" : v === 0 ? "good" : v <= 15 ? "ok" : "bad");
const scoreTone = (v) => (v === null || v === undefined ? "none" : v >= 85 ? "good" : v >= 70 ? "ok" : "bad");

/** A satisfaction % as a coloured bar with the number. */
function ScoreBar({ value }) {
  if (value === null || value === undefined) return <span className="fb-muted fb-small">No answers</span>;
  return (
    <div className={`fb-scorebar fb-score-${scoreTone(value)}`}>
      <div className="fb-scorebar-track">
        <span style={{ width: `${value}%` }} />
      </div>
      <b>{value}%</b>
    </div>
  );
}

// One customer, all its sites, up to 12 months: the feedback consolidated - overall satisfaction,
// answers per question, each site, month by month, and every complaint with its status.
// "Complaints only" keeps just the complaints side, the same as the PDF / Excel.
export default function CustomerReport() {
  const [params, setParams] = useSearchParams();
  const company = params.get("customer") || "";
  const to = params.get("to") || thisMonth();
  const from = params.get("from") || shiftMonth(to, -2);
  const site = params.get("site") || "";
  const only = params.get("only") || "all";
  const complaintsOnly = only === "complaints";

  const [customers, setCustomers] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState(null);
  const [exporting, setExporting] = useState("");
  const [showAll, setShowAll] = useState(false);

  const setParam = useCallback(
    (changes) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === "" || v === undefined) next.delete(k);
          else next.set(k, v);
        }
        return next;
      }),
    [setParams],
  );

  useEffect(() => {
    getCustomers()
      .then((d) => setCustomers(d.customers))
      .catch((err) => setError(err.message));
  }, []);

  const query = useMemo(() => ({ from, to, site_id: site, only: only === "complaints" ? "complaints" : "" }), [from, to, site, only]);

  // The report shown is for `loadedFor`; while it differs from the current choice, a new one is loading.
  const wanted = company ? JSON.stringify([company, query]) : null;
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    const [companyId, q] = JSON.parse(wanted);
    getCustomerReport(companyId, q)
      .then((r) => {
        if (!live) return;
        setReport(r);
        setError("");
        setLoadedFor(wanted);
      })
      .catch((err) => {
        if (!live) return;
        setError(err.message);
        setReport(null);
        setLoadedFor(wanted);
      });
    return () => {
      live = false;
    };
  }, [wanted]);
  const loading = Boolean(wanted) && loadedFor !== wanted;

  async function download(format) {
    setExporting(format);
    setError("");
    try {
      await exportCustomerReport(company, query, format);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting("");
    }
  }

  const customer = customers?.find((c) => c.id === company);
  const t = report?.totals;
  const complaintRate = t ? pct(t.complaints, t.feedback_received) : null;
  const complaintSites = report ? report.sites.filter((s) => s.complaints || s.tickets_total) : [];

  const complaintsCard = report && (
    <Card title={`Complaints · ${report.complaints.length}`} aside="Newest first" bodyClass="is-flush">
      {report.complaints.length ? (
        <div className="fb-table-wrap">
          <table className="fb-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Site</th>
                <th>Date</th>
                <th>Problem</th>
                <th>Priority</th>
                <th>Next step</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.complaints.map((c) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {c.ticket_number ? (
                      <Link className="fb-link" to={`${FEEDBACK_HOME}/tickets/${c.id}`}>
                        {c.ticket_number}
                      </Link>
                    ) : (
                      <span className="fb-muted">No ticket</span>
                    )}
                  </td>
                  <td>{c.site}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDay(c.date)}</td>
                  <td style={{ maxWidth: 320 }}>{c.problem || "—"}</td>
                  <td>{c.priority ? <PriorityChip priority={c.priority} /> : <span className="fb-muted">—</span>}</td>
                  <td className="fb-small">
                    {c.action ? ACTIONS[c.action]?.label || c.action : "—"}
                    {c.owner ? ` · ${c.owner}` : ""}
                  </td>
                  <td>{c.status === "NO_TICKET" ? <Chip tone="muted">No ticket needed</Chip> : <TicketStatusChip status={c.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No complaints" text="Nobody reported a problem in these months." />
      )}
    </Card>
  );

  return (
    <>
      <PageHead
        title={customer?.name || report?.customer?.name || "Customer report"}
        actions={
          company && (
            <>
              <button type="button" className="fb-btn" onClick={() => download("xlsx")} disabled={!!exporting || !report}>
                <FiDownload /> {exporting === "xlsx" ? "Preparing…" : "Excel"}
              </button>
              <button type="button" className="fb-btn fb-btn-primary" onClick={() => download("pdf")} disabled={!!exporting || !report}>
                <FiDownload /> {exporting === "pdf" ? "Preparing…" : "Download PDF"}
              </button>
            </>
          )
        }
      />

      <Card className="fb-report-filters" bodyClass="">
        <div className="fb-row fb-row-top" style={{ alignItems: "flex-end" }}>
          <div className="fb-field" style={{ flex: "2 1 280px" }}>
            Customer
            <CustomerPicker
              customers={customers}
              value={company}
              onChange={(id) => {
                setReport(null);
                setParam({ customer: id, site: "" });
              }}
            />
          </div>
          <label className="fb-field" style={{ flex: "1 1 150px" }}>
            From
            <input type="month" className="fb-input" value={from} max={to} onChange={(e) => e.target.value && setParam({ from: e.target.value })} />
          </label>
          <label className="fb-field" style={{ flex: "1 1 150px" }}>
            To
            <input type="month" className="fb-input" value={to} min={from} onChange={(e) => e.target.value && setParam({ to: e.target.value })} />
          </label>
          <label className="fb-field" style={{ flex: "1 1 180px" }}>
            Site
            <select className="fb-select" value={site} onChange={(e) => setParam({ site: e.target.value })} disabled={!customer}>
              <option value="">All sites</option>
              {(customer?.sites || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` · ${s.city}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="fb-field">
            Show
            <Segmented
              label="Show"
              options={[
                { value: "all", label: "All feedback" },
                { value: "complaints", label: "Complaints only" },
              ]}
              value={only}
              onChange={(v) => setParam({ only: v === "all" ? "" : v })}
            />
          </div>
        </div>
      </Card>

      <div style={{ height: 16 }} />
      <ErrorBox error={error} />

      {!company ? (
        <Card>
          <Empty title="No customer chosen" text="Choose a customer above. The report covers all their sites for the months you pick (up to 12)." />
        </Card>
      ) : loading && !report ? (
        <Loading text="Building the report…" />
      ) : report ? (
        <div className="fb-stack">
          {complaintsOnly ? (
            <>
              <div className="fb-report-summary">
                <div className={`fb-score fb-score-${rateTone(complaintRate)}`}>
                  <span className="fb-score-n">{complaintRate === null ? "—" : `${complaintRate}%`}</span>
                  <span className="fb-score-l">Complaint rate</span>
                  <span className="fb-score-s">{t.feedback_received ? `${t.complaints} complaint${t.complaints === 1 ? "" : "s"} out of ${t.feedback_received} feedback` : "No feedback yet in these months"}</span>
                </div>
                <Tiles
                  items={[
                    { label: "Complaints", value: t.complaints, tone: "danger", icon: FiAlertTriangle, share: t.feedback_received ? t.complaints / t.feedback_received : 0, sub: `out of ${t.feedback_received} feedback` },
                    { label: "Tickets", value: t.tickets, tone: "warn", icon: FiTag, sub: `Very high ${t.tickets_by_priority.VERY_HIGH || 0} · High ${t.tickets_by_priority.HIGH} · Medium ${t.tickets_by_priority.MEDIUM} · Low ${t.tickets_by_priority.LOW}` },
                    { label: "Tickets closed", value: t.tickets_closed, tone: "ok", icon: FiCheckCircle, share: t.tickets ? t.tickets_closed / t.tickets : 0, sub: `${t.tickets_open} still open` },
                    { label: "Sites with complaints", value: complaintSites.length, tone: "dark", icon: FiMapPin, sub: `of ${report.sites.length} site${report.sites.length === 1 ? "" : "s"} served` },
                  ]}
                />
              </div>
              {complaintsCard}
            </>
          ) : (
          <>
          <div className="fb-report-summary">
            <div className={`fb-score fb-score-${scoreTone(t.satisfaction)}`}>
              <span className="fb-score-n">{t.satisfaction === null ? "—" : `${t.satisfaction}%`}</span>
              <span className="fb-score-l">Overall satisfaction</span>
              <span className="fb-score-s">{t.answers_total ? `${t.answers_total} answers from ${t.feedback_received} feedback` : "No feedback yet in these months"}</span>
            </div>
            <Tiles
              items={[
                { label: "Sites served", value: t.sites_served, tone: "dark", icon: FiMapPin, sub: `${t.services} services` },
                { label: "Feedback received", value: t.feedback_received, tone: "ok", icon: FiMessageSquare, share: t.calls_to_make ? t.feedback_received / t.calls_to_make : 0, sub: `${t.by_call} by call · ${t.by_form} by form · ${t.calls_done} of ${t.calls_to_make} calls done` },
                { label: "Complaints", value: t.complaints, tone: "danger", icon: FiAlertTriangle, share: t.feedback_received ? t.complaints / t.feedback_received : 0, sub: t.not_reached ? `${t.not_reached} customer${t.not_reached === 1 ? "" : "s"} not reached` : undefined },
                { label: "Tickets", value: t.tickets, tone: "warn", icon: FiTag, share: t.tickets ? t.tickets_closed / t.tickets : 0, sub: `${t.tickets_open} open · ${t.tickets_closed} closed` },
              ]}
            />
          </div>

          <Card title="Answers by question" aside="Good % = answers that are not marked bad in Masters › Questions" bodyClass="is-flush">
            {report.answers.length ? (
              <div className="fb-table-wrap">
                <table className="fb-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Answers</th>
                      <th className="fb-right">Responses</th>
                      <th style={{ width: 210 }}>Good %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.answers.map((q) => (
                      <tr key={q.question_id}>
                        <td className="fb-strong">{q.question}</td>
                        <td>
                          <div className="fb-row" style={{ gap: 6 }}>
                            {q.options.map((o) => (
                              <Chip key={o.answer} tone={o.is_bad ? "danger" : "ok"}>
                                {o.answer} {o.count}
                              </Chip>
                            ))}
                          </div>
                        </td>
                        <td className="fb-right fb-num">{q.total}</td>
                        <td>
                          <ScoreBar value={q.good_pct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No answers yet" text="Feedback collected in these months will be summed up here." />
            )}
          </Card>
          </>
          )}

          {complaintsOnly ? (
            <Card title={`Sites with complaints · ${complaintSites.length}`} bodyClass="is-flush">
              {complaintSites.length ? (
                <div className="fb-table-wrap">
                  <table className="fb-table">
                    <thead>
                      <tr>
                        <th>Site</th>
                        <th className="fb-right">Feedback</th>
                        <th className="fb-right">Complaints</th>
                        <th className="fb-right">Tickets</th>
                        <th className="fb-right">Open tickets</th>
                        <th className="fb-right">Complaint rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complaintSites.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="fb-strong">{s.name}</div>
                            <div className="fb-small fb-muted">{s.city}</div>
                          </td>
                          <td className="fb-right fb-num">{s.feedback}</td>
                          <td className={`fb-right fb-num ${s.complaints ? "fb-danger-text" : ""}`}>{s.complaints}</td>
                          <td className="fb-right fb-num">{s.tickets_total}</td>
                          <td className={`fb-right fb-num ${s.tickets_open ? "fb-danger-text" : ""}`}>{s.tickets_open}</td>
                          <td className="fb-right fb-num">{s.feedback ? `${pct(s.complaints, s.feedback)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No site has a complaint" text="No complaints or tickets in these months." />
              )}
            </Card>
          ) : (
          <Card title="Sites" bodyClass="is-flush">
            {report.sites.length ? (
              <div className="fb-table-wrap">
                <table className="fb-table">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th className="fb-right">Calls done</th>
                      <th className="fb-right">Feedback</th>
                      <th style={{ width: 190 }}>Satisfaction</th>
                      <th className="fb-right">Complaints</th>
                      <th className="fb-right">Open tickets</th>
                      <th>Last feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sites.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="fb-strong">{s.name}</div>
                          <div className="fb-small fb-muted">{s.city}</div>
                        </td>
                        <td className="fb-right fb-num">{s.calls_done}</td>
                        <td className="fb-right fb-num">{s.feedback}</td>
                        <td>
                          <ScoreBar value={s.satisfaction} />
                        </td>
                        <td className={`fb-right fb-num ${s.complaints ? "fb-danger-text" : ""}`}>{s.complaints}</td>
                        <td className={`fb-right fb-num ${s.tickets_open ? "fb-danger-text" : ""}`}>{s.tickets_open}</td>
                        <td className="fb-small">{s.last_feedback ? `${formatDate(s.last_feedback.date)}${s.last_feedback.given_by ? ` · ${s.last_feedback.given_by}` : ""}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No services in these months" text="Pick other months." />
            )}
          </Card>
          )}

          {complaintsOnly ? (
            <Card title="Complaints by month" bodyClass="is-flush">
              <div className="fb-table-wrap">
                <table className="fb-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="fb-right">Feedback</th>
                      <th className="fb-right">Complaints</th>
                      <th className="fb-right">Tickets</th>
                      <th className="fb-right">Complaint rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.months.map((m) => (
                      <tr key={m.month}>
                        <td className="fb-strong">{m.label}</td>
                        <td className="fb-right fb-num">{m.feedback}</td>
                        <td className={`fb-right fb-num ${m.complaints ? "fb-danger-text" : ""}`}>{m.complaints}</td>
                        <td className="fb-right fb-num">{m.tickets}</td>
                        <td className="fb-right fb-num">{m.feedback ? `${pct(m.complaints, m.feedback)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
          <Card title="Month by month" bodyClass="is-flush">
            <div className="fb-table-wrap">
              <table className="fb-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="fb-right">Sites served</th>
                    <th className="fb-right">Calls done</th>
                    <th className="fb-right">Feedback</th>
                    <th style={{ width: 190 }}>Satisfaction</th>
                    <th className="fb-right">Complaints</th>
                    <th className="fb-right">Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {report.months.map((m) => (
                    <tr key={m.month}>
                      <td className="fb-strong">{m.label}</td>
                      <td className="fb-right fb-num">{m.sites_served}</td>
                      <td className="fb-right fb-num">{m.calls_done}</td>
                      <td className="fb-right fb-num">{m.feedback}</td>
                      <td>
                        <ScoreBar value={m.satisfaction} />
                      </td>
                      <td className={`fb-right fb-num ${m.complaints ? "fb-danger-text" : ""}`}>{m.complaints}</td>
                      <td className="fb-right fb-num">{m.tickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          )}

          {!complaintsOnly && complaintsCard}

          {report.feedback_by_site.length > 0 && (
            <Card
              title={complaintsOnly ? "Complaint feedback" : "All feedback"}
              aside={
                <button type="button" className="fb-btn fb-btn-sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                  {showAll ? "Hide" : complaintsOnly ? "Show the feedback" : "Show every feedback"}
                </button>
              }
              bodyClass={showAll ? "" : "is-flush"}
            >
              {showAll &&
                report.feedback_by_site.map((g) => (
                  <div key={g.site.id} className="fb-stack" style={{ gap: 10, marginBottom: 14 }}>
                    <div className="fb-strong">
                      {g.site.name}
                      {g.site.city ? ` · ${g.site.city}` : ""}
                    </div>
                    {g.feedback.map((f) => (
                      <div key={f.id} style={{ borderBottom: "1px solid #f1f2f4", paddingBottom: 10 }}>
                        <div className="fb-row" style={{ justifyContent: "space-between" }}>
                          <span>
                            {formatDateTime(f.date)} · {f.given_by || "Customer"} · {f.via === "FORM" ? "WhatsApp form" : "Call"}
                          </span>
                          {f.all_good ? <Chip tone="ok">All good</Chip> : f.has_issue ? <Chip tone="danger">Complaint</Chip> : null}
                        </div>
                        {f.bad_answers.length > 0 && (
                          <div className="fb-row" style={{ gap: 6, marginTop: 6 }}>
                            {f.bad_answers.map((b) => (
                              <Chip key={b.question} tone="danger">
                                {b.question} · {b.answer}
                              </Chip>
                            ))}
                          </div>
                        )}
                        {f.other_feedback && <div className="fb-muted" style={{ marginTop: 6 }}>“{f.other_feedback}”</div>}
                      </div>
                    ))}
                  </div>
                ))}
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}
