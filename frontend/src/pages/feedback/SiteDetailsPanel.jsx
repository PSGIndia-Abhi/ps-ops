import { useEffect, useState } from "react";
import { FiMapPin, FiPhone, FiX } from "react-icons/fi";
import { callStages, formatDateTime, formatDay, getSiteDetails, monthLabel, telLink, ticketStages } from "./feedbackApi";
import { CallStatusChip, ErrorBox, Loading, PriorityChip, ResultChip, Steps, TicketStatusChip, VisitStatusChip } from "./ui";

function weekday(value) {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { weekday: "short" });
}

/**
 * The call list's details panel for one site: the customer, the site and its contacts, every
 * service assigned there in the month (with its status), and the customer's other sites served that month.
 */
export default function SiteDetailsPanel({ siteId, month, canCollect, userId, busy, onTake, onOpenCall, onOpenTicket, onSiteChange, onClose }) {
  const wanted = `${siteId}|${month}`;
  const [loaded, setLoaded] = useState({ key: null, data: null, error: "" });

  useEffect(() => {
    let live = true;
    const [site, m] = wanted.split("|");
    getSiteDetails(site, m)
      .then((data) => live && setLoaded({ key: wanted, data, error: "" }))
      .catch((err) => live && setLoaded({ key: wanted, data: null, error: err.message }));
    return () => {
      live = false;
    };
  }, [wanted]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ready = loaded.key === wanted;
  const d = ready ? loaded.data : null;
  const call = d?.call;

  // "General Pest Control ... × 3" - how many times each service was done this month
  const serviceCounts = {};
  for (const v of d?.visits || []) serviceCounts[v.service || "Service"] = (serviceCounts[v.service || "Service"] || 0) + 1;

  return (
    <div className="fb-drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="fb-drawer" role="dialog" aria-modal="true" aria-label="Customer details">
        <div className="fb-drawer-h">
          <div style={{ minWidth: 0 }}>
            <div className="fb-small fb-muted">Customer</div>
            <h2>{d?.customer.name || "Loading…"}</h2>
            {d && (
              <div className="fb-row" style={{ gap: 8, marginTop: 6 }}>
                <span className="fb-muted">
                  {d.site.name}
                  {d.site.city ? ` · ${d.site.city}` : ""}
                </span>
                {call ? (
                  <>
                    <CallStatusChip status={call.status} />
                    <ResultChip result={call.result} />
                  </>
                ) : (
                  <CallStatusChip status="TO_CALL" />
                )}
              </div>
            )}
          </div>
          <button type="button" className="fb-icon-btn" style={{ flex: "none" }} onClick={onClose} aria-label="Close">
            <FiX size={20} />
          </button>
        </div>

        <div className="fb-drawer-b">
          {!ready ? (
            <Loading />
          ) : loaded.error ? (
            <ErrorBox error={loaded.error} />
          ) : (
            <>
              <section>
                <div className="fb-section-t">Feedback progress · {monthLabel(d.month)}</div>
                <div className="fb-progress-card" style={{ marginBottom: 0 }}>
                  <Steps steps={callStages(call, d.tickets)} label="Feedback call progress" />
                </div>
              </section>

              {d.tickets.length > 0 && (
                <section>
                  <div className="fb-section-t">Tickets · {d.tickets.length}</div>
                  <div className="fb-stack" style={{ gap: 10 }}>
                    {d.tickets.map((t) => (
                      <div key={t.id} className="fb-progress-card" style={{ marginBottom: 0 }}>
                        <div className="fb-row" style={{ justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
                          <span className="fb-row" style={{ gap: 8 }}>
                            <button type="button" className="fb-link" onClick={() => onOpenTicket(t.id)}>
                              {t.ticket_number}
                            </button>
                            <PriorityChip priority={t.priority} />
                            <TicketStatusChip status={t.status} />
                          </span>
                          {t.issue_summary && (
                            <span className="fb-small fb-muted" style={{ flex: "1 1 200px", textAlign: "right" }}>
                              {t.issue_summary.length > 90 ? `${t.issue_summary.slice(0, 90)}…` : t.issue_summary}
                            </span>
                          )}
                        </div>
                        <Steps steps={ticketStages(t)} small label={`${t.ticket_number} progress`} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="fb-section-t">Site</div>
                <div className="fb-row fb-row-top" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <FiMapPin aria-hidden="true" className="fb-muted" style={{ marginTop: 3, flex: "none" }} />
                  <span>
                    <span className="fb-strong">{d.site.name}</span>
                    {d.site.city ? `, ${d.site.city}` : ""}
                    {d.site.address && (
                      <>
                        <br />
                        <span className="fb-small fb-muted">{d.site.address}</span>
                      </>
                    )}
                  </span>
                </div>
                {call?.collector && (
                  <div className="fb-small fb-muted" style={{ marginTop: 8 }}>
                    Feedback call taken by {call.collector.id === userId ? "you" : call.collector.name}
                  </div>
                )}
              </section>

              <section>
                <div className="fb-section-t">Contacts</div>
                {d.contacts.length ? (
                  <div className="fb-stack" style={{ gap: 8 }}>
                    {d.contacts.map((c) => (
                      <div key={c.id} className="fb-row" style={{ justifyContent: "space-between" }}>
                        <span>
                          <span className="fb-strong">{c.name}</span>
                          <span className="fb-small fb-muted">{[c.role, c.is_primary ? "Primary" : null].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                        </span>
                        {c.phone?.trim() ? (
                          <a className="fb-btn fb-btn-sm" href={telLink(c.phone)}>
                            <FiPhone /> {c.phone.trim()}
                          </a>
                        ) : (
                          <span className="fb-small fb-muted">No phone</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="fb-small fb-muted">No contacts saved for this site.</div>
                )}
              </section>

              <section>
                <div className="fb-section-t">
                  Services in {monthLabel(d.month)} · {d.visits.length}
                  {d.visits.length > 0 && ` (${d.visits.filter((v) => v.status === "COMPLETED").length} completed)`}
                </div>
                {Object.keys(serviceCounts).length > 1 && (
                  <div className="fb-row" style={{ gap: 6, marginBottom: 8 }}>
                    {Object.entries(serviceCounts).map(([name, n]) => (
                      <span key={name} className="fb-chip fb-tone-info">
                        {name} × {n}
                      </span>
                    ))}
                  </div>
                )}
                {d.visits.length ? (
                  <div>
                    {d.visits.map((v) => (
                      <div key={v.id} className="fb-visit">
                        <div className="fb-visit-date">
                          {formatDay(v.date)}
                          <span>{weekday(v.date)}</span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="fb-row" style={{ gap: 8, justifyContent: "space-between", flexWrap: "nowrap" }}>
                            <span className="fb-strong">{v.service || "Service"}</span>
                            <VisitStatusChip status={v.status} />
                          </div>
                          <div className="fb-small fb-muted">
                            Job {v.job_code}
                            {v.technicians ? ` · ${v.technicians}` : " · No technician recorded"}
                          </div>
                          {v.completed_at && <div className="fb-small fb-muted">Completed {formatDateTime(v.completed_at)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="fb-small fb-muted">No services at this site in {monthLabel(d.month)}.</div>
                )}
              </section>

              {d.other_sites.length > 0 && (
                <section>
                  <div className="fb-section-t">
                    Other sites of {d.customer.name} served in {monthLabel(d.month)} · {d.other_sites.length}
                  </div>
                  <div className="fb-stack" style={{ gap: 8 }}>
                    {d.other_sites.map((s) => (
                      <button key={s.id} type="button" className="fb-other-site" onClick={() => onSiteChange(s.id)}>
                        <span className="fb-strong">
                          {s.name}
                          {s.city ? ` · ${s.city}` : ""}
                        </span>
                        <br />
                        <span className="fb-small fb-muted">
                          {s.visit_count} service{s.visit_count === 1 ? "" : "s"} · last {formatDay(s.last_visit_date)} · {s.services}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="fb-drawer-f">
          <button type="button" className="fb-btn" onClick={onClose}>
            Close
          </button>
          {d &&
            (call ? (
              <button type="button" className="fb-btn fb-btn-primary" onClick={() => onOpenCall(call.id)}>
                {call.status === "DONE" || (call.collector && call.collector.id !== userId) ? "View the call" : "Open the call"}
              </button>
            ) : canCollect ? (
              <button type="button" className="fb-btn fb-btn-primary" disabled={busy} onClick={() => onTake(d.site.id)}>
                {busy ? "Taking…" : "Take call"}
              </button>
            ) : null)}
        </div>
      </aside>
    </div>
  );
}
