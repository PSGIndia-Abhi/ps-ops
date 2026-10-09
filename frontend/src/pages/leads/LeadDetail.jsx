import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiAward,
  FiCalendar,
  FiCheck,
  FiEdit2,
  FiFileText,
  FiHash,
  FiMail,
  FiMapPin,
  FiMessageCircle,
  FiPhone,
  FiPhoneCall,
  FiPlus,
  FiThumbsDown,
  FiUploadCloud,
  FiUserCheck,
  FiXCircle,
} from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { CallVerifyModal, CloseLeadModal, EditLeadModal, MeetingChangeModal, QuotationModal, ScheduleMeetingModal, VisitModal } from "./dialogs";
import { listQuotations, openQuotationPdf, providerName, useLeadData, userName } from "./leadsApi";
import { PIPELINE } from "./constants";
import { useToast } from "./hooks";
import { dateTime, money, stageOf } from "./format";
import { Badge, Button, Card, Empty, StageBadge, Tabs } from "./ui";
import { useViewer, visibleLeads } from "./viewer";

const EVENT = {
  CREATED: { icon: <FiPlus />, tone: "info" },
  CALL: { icon: <FiPhoneCall />, tone: "warn" },
  STATUS: { icon: <FiAlertTriangle />, tone: "violet" },
  QUALIFIED: { icon: <FiUserCheck />, tone: "success" },
  REJECTED: { icon: <FiXCircle />, tone: "danger" },
  MEETING: { icon: <FiCalendar />, tone: "info" },
  VISIT: { icon: <FiMapPin />, tone: "teal" },
  QUOTATION: { icon: <FiFileText />, tone: "violet" },
  WON: { icon: <FiAward />, tone: "success" },
  LOST: { icon: <FiThumbsDown />, tone: "danger" },
};

const STEP_LABEL = { NEW: "Submitted", QUALIFIED: "Qualified", MEETING_SCHEDULED: "Meeting", VISIT_COMPLETED: "Visit", QUOTATION_SENT: "Quotation", WON: "Converted" };

/** How far along the happy path this lead got (stages off the path count by what they had reached). */
function progressOf(lead, hasMeeting) {
  if (PIPELINE.includes(lead.stage)) return PIPELINE.indexOf(lead.stage);
  if (lead.stage === "LOST") return hasMeeting ? PIPELINE.indexOf("VISIT_COMPLETED") : PIPELINE.indexOf("QUALIFIED");
  return 0; // TO_CALL, NEED_MORE_INFO, NOT_GENUINE: still at the first step
}

/** A lead's quotations: what has been sent, each one's PDF, and the button to upload another. */
function QuotationsTab({ lead, canAdd, onAdd }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(null);

  // lead.updatedAt changes when a quotation is uploaded, which is what brings the new one in.
  useEffect(() => {
    let alive = true;
    listQuotations(lead.id)
      .then((list) => alive && (setRows(list), setError("")))
      .catch((err) => alive && setError(err.message || "Could not load quotations."));
    return () => {
      alive = false;
    };
  }, [lead.id, lead.updatedAt]);

  async function open(q) {
    setOpening(q.id);
    try {
      await openQuotationPdf(lead.id, q.id);
    } catch (err) {
      toast(err.message || "Could not open the quotation.", true);
    } finally {
      setOpening(null);
    }
  }

  const add = canAdd && (
    <Button icon={<FiUploadCloud />} onClick={onAdd}>
      Create Quotation
    </Button>
  );

  if (error) return <Empty title="Could not load quotations" text={error} icon={<FiFileText />} />;
  if (!rows) return <Empty title="Loading quotations..." icon={<FiFileText />} />;
  if (rows.length === 0) {
    return <Empty title="No quotations yet" text={canAdd ? "Upload the quotation PDF once it has been prepared for the customer." : "A quotation appears here once the sales team uploads one."} icon={<FiFileText />} action={add} />;
  }

  return (
    <>
      {add && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>{add}</div>}
      <div className="lm-table-wrap" style={{ margin: "0 -20px -20px" }}>
        <table className="lm-table">
          <thead>
            <tr>
              <th>Quotation No</th>
              <th>Amount</th>
              <th>Sent</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((q, i) => (
              <tr key={q.id} style={{ "--i": i, cursor: "default" }}>
                <td>
                  <strong>{q.number}</strong>
                </td>
                <td className="num">{money(q.total)}</td>
                <td className="muted">{dateTime(q.sentAt)}</td>
                <td>
                  <Badge tone="violet">{q.status === "SENT" ? "Sent" : q.status}</Badge>
                </td>
                <td style={{ textAlign: "right" }}>
                  {q.hasPdf ? (
                    <Button size="sm" variant="ghost" icon={<FiFileText />} busy={opening === q.id} onClick={() => open(q)}>
                      View PDF
                    </Button>
                  ) : (
                    <span className="muted">No PDF</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const MEETING_TONE = { SCHEDULED: "info", IN_PROGRESS: "warn", FOLLOW_UP: "violet", COMPLETED: "success" };
const MEETING_LABEL = { SCHEDULED: "Scheduled", IN_PROGRESS: "In Progress", FOLLOW_UP: "Follow-up", COMPLETED: "Completed" };

export default function LeadDetail() {
  const { id } = useParams();
  const viewer = useViewer();
  const { persona } = viewer;
  const { leads, activities, meetings, me } = useLeadData();
  const [tab, setTab] = useState("details");
  const [dialog, setDialog] = useState(null); // "call" | "meeting" | "edit" | "won" | "lost" | { visit | move | cancel: meeting }

  // A lead outside what this person may see is treated exactly like one that does not exist.
  const lead = useMemo(() => visibleLeads(leads, viewer).find((l) => l.id === id), [leads, viewer, id]);
  const timeline = useMemo(() => activities.filter((a) => a.leadId === id).sort((a, b) => new Date(a.at) - new Date(b.at)), [activities, id]);
  const leadMeetings = useMemo(() => meetings.filter((m) => m.leadId === id).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)), [meetings, id]);

  if (!lead) {
    return (
      <Card>
        <Empty
          title="Lead not found"
          text="It may have been removed, or it is not one of your leads."
          action={
            <Link className="lm-link" to={`${LEADS_HOME}/all`}>
              Back to leads
            </Link>
          }
        />
      </Card>
    );
  }

  const provider = persona === "lead_provider";
  const canVerify = persona === "telecaller" || persona === "sales_manager";
  const canSell = persona === "sales" || persona === "sales_manager";
  const stopped = lead.stage === "NOT_GENUINE" || lead.stage === "LOST";
  const progress = progressOf(lead, leadMeetings.length > 0);
  const openMeeting = leadMeetings.find((m) => m.status !== "COMPLETED");
  const closed = stopped || lead.stage === "WON";

  // The server's own rules, so a button is only offered when pressing it can work:
  // a lead is managed by an admin, whoever manages leads, or anyone on it (creator, telecaller, sales);
  // only the meeting's own sales person (or an admin) records its outcome; converting needs its own permission.
  const myId = String(me?.id || "");
  const canManage = !provider && (viewer.canPick || !!me?.canManage || [lead.createdBy, lead.telecallerId, lead.salesId].some((uid) => uid && String(uid) === myId));
  const myOpenMeeting = leadMeetings.find((m) => m.status !== "COMPLETED" && (viewer.canPick || String(m.salesId) === myId));
  const canConvert = viewer.canPick || !!me?.canConvert;

  // The provider sees the outline of what happened, never the internal notes.
  const events = provider ? timeline.filter((a) => a.type !== "CALL").map((a) => ({ ...a, note: "" })) : timeline;

  const tabs = [
    { key: "details", label: "Details" },
    { key: "activity", label: "Activities", count: events.length },
    ...(provider ? [] : [{ key: "meetings", label: "Meetings", count: leadMeetings.length }, { key: "quotations", label: "Quotations" }]),
  ];

  return (
    <>
      <Link className="lm-crumb" to={`${LEADS_HOME}/all`}>
        <FiArrowLeft /> Back to leads
      </Link>

      <section className="lm-hero">
        <div className="lm-hero-top">
          <div>
            <StageBadge stage={lead.stage} />
            <h1 style={{ marginTop: 10 }}>{lead.company}</h1>
            <div className="lm-hero-meta">
              <span>
                <FiHash /> {lead.number}
              </span>
              <span>
                <FiPhone /> {lead.contact} · {lead.phone}
              </span>
              <span>
                <FiMapPin /> {lead.area || lead.address}
              </span>
            </div>
          </div>
          {!provider && (
            <div className="lm-hero-quote">
              <small>Approximate quote</small>
              <strong>{money(lead.quote)}</strong>
            </div>
          )}
        </div>

        {!provider && (
          <div className="lm-hero-actions">
            <a href={`tel:${lead.phone}`}>
              <FiPhone /> Call
            </a>
            <a href={`https://wa.me/91${lead.phone}`} target="_blank" rel="noreferrer">
              <FiMessageCircle /> WhatsApp
            </a>
            {!!lead.email && (
              <a href={`mailto:${lead.email}`}>
                <FiMail /> Email
              </a>
            )}
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`} target="_blank" rel="noreferrer">
              <FiMapPin /> Directions
            </a>
          </div>
        )}

        <div className="lm-steps" aria-label={`Progress: ${stageOf(lead.stage).label}`}>
          {PIPELINE.map((key, i) => (
            <div key={key} className={`lm-step${i < progress ? " done" : i === progress ? " now" : ""}`} style={{ "--i": i }}>
              <span className="lm-step-dot">{i < progress ? <FiCheck /> : i + 1}</span>
              {STEP_LABEL[key]}
            </div>
          ))}
        </div>

        {stopped && (
          <div className="lm-stop">
            <FiXCircle />
            {lead.stage === "NOT_GENUINE" ? "Not genuine" : "Lost"}
            {lead.reason && !provider ? ` - ${lead.reason}` : ""}
          </div>
        )}
      </section>

      {!provider && !closed && (
        <div className="lm-head-actions" style={{ margin: "18px 0 0" }}>
          {canVerify && ["NEW", "TO_CALL", "NEED_MORE_INFO"].includes(lead.stage) && (
            <Button icon={<FiPhoneCall />} onClick={() => setDialog("call")}>
              Call &amp; Verify
            </Button>
          )}
          {((canVerify && lead.stage === "QUALIFIED") || (canManage && lead.stage === "MEETING_SCHEDULED" && !openMeeting)) && (
            // The second case: the only meeting was cancelled, so the lead needs a new one.
            <Button icon={<FiCalendar />} onClick={() => setDialog("meeting")}>
              Schedule Meeting
            </Button>
          )}
          {canSell && myOpenMeeting && (
            <Button icon={<FiMapPin />} onClick={() => setDialog({ visit: myOpenMeeting })}>
              Update After Visit
            </Button>
          )}
          {canSell && ["VISIT_COMPLETED", "QUOTATION_SENT"].includes(lead.stage) && (
            <>
              {canConvert && (
                <Button variant="success" icon={<FiAward />} onClick={() => setDialog("won")}>
                  Convert to Customer
                </Button>
              )}
              <Button variant="ghost" icon={<FiCalendar />} onClick={() => setDialog("meeting")}>
                Schedule Another Meeting
              </Button>
            </>
          )}
          {canSell && ["MEETING_SCHEDULED", "VISIT_COMPLETED", "QUOTATION_SENT"].includes(lead.stage) && (
            <Button variant="danger" icon={<FiThumbsDown />} onClick={() => setDialog("lost")}>
              Mark as Lost
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" icon={<FiEdit2 />} onClick={() => setDialog("edit")}>
              Edit Details
            </Button>
          )}
        </div>
      )}

      <Card flush index={1} className="lm-detail">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        {/* `key` replays the panel entrance when the tab changes. */}
        <div className="lm-card-body" key={tab} style={{ animation: "lm-rise .4s var(--lm-ease) both" }}>
          {tab === "details" && (
            <dl className="lm-dl">
              <div>
                <dt>Contact Person</dt>
                <dd>{lead.contact}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>
                  {lead.phone}
                  {lead.altPhone ? ` / ${lead.altPhone}` : ""}
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{lead.email || "-"}</dd>
              </div>
              <div>
                <dt>Source of Lead</dt>
                <dd>{lead.source}</dd>
              </div>
              <div className="wide">
                <dt>Address</dt>
                <dd>{lead.address}</dd>
              </div>
              <div className="wide">
                <dt>Requirement</dt>
                <dd>{lead.requirement}</dd>
              </div>
              {provider ? (
                <>
                  <div>
                    <dt>Approximate Quote</dt>
                    <dd>{money(lead.quote)}</dd>
                  </div>
                  <div>
                    <dt>Feedback</dt>
                    <dd>{lead.providerFeedback || "Under review"}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Lead Provider</dt>
                    <dd>{lead.providerId ? providerName(lead.providerId) : "-"}</dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd>
                      <Badge tone={lead.priority === "HIGH" ? "danger" : "neutral"} plain>
                        {lead.priority === "HIGH" ? "High" : "Normal"}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Telecaller</dt>
                    <dd>{userName(lead.telecallerId) || "Not picked up yet"}</dd>
                  </div>
                  <div>
                    <dt>Sales Person</dt>
                    <dd>{userName(lead.salesId) || "Not assigned yet"}</dd>
                  </div>
                  <div>
                    <dt>Next Follow-up</dt>
                    <dd>{lead.nextFollowUpAt ? dateTime(lead.nextFollowUpAt) : "-"}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Created</dt>
                <dd>{dateTime(lead.createdAt)}</dd>
              </div>
            </dl>
          )}

          {tab === "activity" &&
            (events.length === 0 ? (
              <Empty title="No activity yet" />
            ) : (
              <ol className="lm-timeline">
                {events.map((a, i) => {
                  const kind = EVENT[a.type] || EVENT.STATUS;
                  return (
                    <li key={a.id} className="lm-event" style={{ "--i": i }}>
                      <span className={`lm-event-dot tone-${kind.tone}`} style={{ "--i": i }}>
                        {kind.icon}
                      </span>
                      <div className="lm-event-body">
                        <strong>{a.text}</strong>
                        <small>
                          {dateTime(a.at)}
                          {!provider && a.by ? ` · ${a.by}` : ""}
                        </small>
                        {!!a.note && <div className="lm-event-note">{a.note}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ))}

          {tab === "meetings" &&
            (leadMeetings.length === 0 ? (
              <Empty title="No meetings yet" text="A meeting is scheduled once the lead is verified as genuine." icon={<FiCalendar />} />
            ) : (
              <div className="lm-agenda" style={{ margin: "-18px -20px -20px" }}>
                {leadMeetings.map((m, i) => (
                  <div key={m.id} className="lm-slot" style={{ "--i": i }}>
                    <div className="lm-slot-time">
                      {new Date(m.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      <small>{dateTime(m.scheduledAt).split(",")[0]}</small>
                    </div>
                    <div className="lm-slot-main">
                      <strong>
                        {m.type === "SITE_VISIT" ? "Site Visit" : "Meeting"} with {userName(m.salesId)}
                      </strong>
                      <small>
                        <FiMapPin /> {m.address}
                      </small>
                      {!!m.outcome && <small>Outcome: {m.outcome}</small>}
                      {canManage && !closed && m.status === "SCHEDULED" && (
                        <span style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <Button size="sm" variant="ghost" icon={<FiCalendar />} onClick={() => setDialog({ move: m })}>
                            Reschedule
                          </Button>
                          <Button size="sm" variant="ghost" icon={<FiXCircle />} onClick={() => setDialog({ cancel: m })}>
                            Cancel
                          </Button>
                        </span>
                      )}
                    </div>
                    <Badge tone={MEETING_TONE[m.status]}>{MEETING_LABEL[m.status]}</Badge>
                  </div>
                ))}
              </div>
            ))}

          {tab === "quotations" && <QuotationsTab lead={lead} canAdd={canSell && !closed} onAdd={() => setDialog("quotation")} />}
        </div>
      </Card>

      {dialog === "call" && <CallVerifyModal lead={lead} onClose={() => setDialog(null)} onScheduleMeeting={() => setDialog("meeting")} />}
      {dialog === "meeting" && <ScheduleMeetingModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "quotation" && <QuotationModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "won" && <CloseLeadModal lead={lead} won onClose={() => setDialog(null)} />}
      {dialog === "lost" && <CloseLeadModal lead={lead} won={false} onClose={() => setDialog(null)} />}
      {dialog?.visit && <VisitModal meeting={dialog.visit} lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <EditLeadModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog?.move && <MeetingChangeModal meeting={dialog.move} lead={lead} mode="move" onClose={() => setDialog(null)} />}
      {dialog?.cancel && <MeetingChangeModal meeting={dialog.cancel} lead={lead} mode="cancel" onClose={() => setDialog(null)} />}
    </>
  );
}
