import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiAward,
  FiBriefcase,
  FiCalendar,
  FiCheck,
  FiClock,
  FiCopy,
  FiEdit2,
  FiFileText,
  FiHash,
  FiMail,
  FiMapPin,
  FiMessageCircle,
  FiPhone,
  FiPhoneCall,
  FiPlus,
  FiSend,
  FiSmartphone,
  FiThumbsDown,
  FiUploadCloud,
  FiUser,
  FiUserCheck,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import { LEADS_HOME } from "./access";
import {
  CallVerifyModal,
  CancelQuotationModal,
  CloseLeadModal,
  EditLeadModal,
  FollowUpModal,
  MeetingChangeModal,
  ProviderUpdateModal,
  QuotationModal,
  ScheduleMeetingModal,
  VisitModal,
} from "./dialogs";
import { getConversion, listQuotations, openQuotationPdf, providerName, useLeadData, userName } from "./leadsApi";
import { useToast } from "./hooks";
import { dateTime, money, stageOf } from "./format";
import { Alert, Badge, Button, Card, Empty, StageBadge, Tabs, Who } from "./ui";
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

/**
 * The lead's journey, the same for everyone who looks at it - the provider who sent it,
 * the telecaller who verifies it, sales and the manager:
 * Submitted -> Verification (genuine or not) -> Meeting -> Site visit -> Quotation -> Outcome.
 */
const JOURNEY = [
  { key: "submitted", label: "Submitted" },
  { key: "verified", label: "Verification" },
  { key: "meeting", label: "Meeting" },
  { key: "visit", label: "Site Visit" },
  { key: "quotation", label: "Quotation" },
  { key: "closed", label: "Converted" },
];

/** How many steps are complete, and the one now being worked on, for each stage. */
const STAGE_STEP = { NEW: 1, TO_CALL: 1, NEED_MORE_INFO: 1, QUALIFIED: 2, MEETING_SCHEDULED: 3, VISIT_COMPLETED: 4, QUOTATION_SENT: 5, WON: 6 };

/** When each step was reached: from the provider's milestones, or from the lead's own timeline for staff. */
function stepTimes(lead, timeline) {
  if (lead.milestones) return lead.milestones;
  const first = (test) => timeline.find(test);
  const at = (a) => (a ? { at: a.at, by: a.by } : undefined);
  return {
    submitted: at(first((a) => a.type === "CREATED")) || { at: lead.createdAt },
    verified: at(first((a) => a.type === "QUALIFIED" || a.type === "REJECTED")),
    meeting: at(first((a) => a.type === "MEETING")),
    visit: at(first((a) => a.type === "VISIT" && a.text.startsWith("Site visit completed"))),
    quotation: at(first((a) => a.type === "QUOTATION")),
    closed: at(first((a) => a.type === "WON" || a.type === "LOST")),
  };
}

function Journey({ lead, timeline, showWho }) {
  const times = stepTimes(lead, timeline);
  const when = (key) => {
    const t = times[key];
    if (!t) return null;
    return typeof t === "string" ? { at: t } : t;
  };

  // Each step is done, now (being worked on), failed (where the lead stopped) or still to come.
  let done = STAGE_STEP[lead.stage] ?? 1;
  let failedAt = -1;
  if (lead.stage === "NOT_GENUINE") failedAt = 1;
  if (lead.stage === "LOST") {
    // Lost after the furthest step it had reached; the steps it never got to stay grey.
    const reached = ["quotation", "visit", "meeting", "verified"].findIndex((k) => when(k));
    done = reached === -1 ? 2 : 5 - reached;
    failedAt = JOURNEY.length - 1;
  }
  const state = (i) => (i === failedAt ? "fail" : i < done && !(failedAt >= 0 && i >= failedAt) ? "done" : i === done && failedAt < 0 ? "now" : "");

  const NOW_TEXT = { NEW: "Waiting for a call", TO_CALL: "Being verified", NEED_MORE_INFO: "More information needed" };
  const NEXT_TEXT = { meeting: "To be scheduled", visit: "Visit pending", quotation: "Quotation pending", closed: "Awaiting decision" };
  const caption = (step, i) => {
    const st = state(i);
    if (st === "fail") return lead.stage === "NOT_GENUINE" ? "Not genuine" : "Lost";
    if (st === "now") return i === 1 ? NOW_TEXT[lead.stage] || "In progress" : NEXT_TEXT[step.key];
    const t = when(step.key);
    if (st === "done" && t?.at) return `${dateTime(t.at)}${showWho && t.by ? ` · ${t.by}` : ""}`;
    if (st === "done") return i === 1 ? "Genuine" : "Done";
    return "";
  };

  return (
    <div className="lm-steps" aria-label={`Progress: ${stageOf(lead.stage).label}`}>
      {JOURNEY.map((step, i) => {
        const st = state(i);
        const label = i === JOURNEY.length - 1 && lead.stage === "LOST" ? "Outcome" : step.label;
        return (
          <div key={step.key} className={`lm-step${st ? ` ${st}` : ""}`} style={{ "--i": i }}>
            <span className="lm-step-dot">{st === "done" ? <FiCheck /> : st === "fail" ? <FiXCircle /> : i + 1}</span>
            <span className="lm-step-label">{label}</span>
            {!!caption(step, i) && <small className="lm-step-sub">{caption(step, i)}</small>}
          </div>
        );
      })}
    </div>
  );
}

/** A lead's quotations: what has been sent, each one's PDF, and the button to upload another. */
function QuotationsTab({ lead, canAdd, onAdd, canCancel, onCancel, refreshKey }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(null);

  // The lead's history grows with every upload or cancellation, which is what brings the change in.
  useEffect(() => {
    let alive = true;
    listQuotations(lead.id)
      .then((list) => alive && (setRows(list), setError("")))
      .catch((err) => alive && setError(err.message || "Could not load quotations."));
    return () => {
      alive = false;
    };
  }, [lead.id, lead.updatedAt, refreshKey]);

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
              <tr key={q.id} style={{ "--i": i, cursor: "default", opacity: q.status === "CANCELLED" ? 0.6 : 1 }}>
                <td>
                  <strong style={q.status === "CANCELLED" ? { textDecoration: "line-through" } : undefined}>{q.number}</strong>
                </td>
                <td className="num">{money(q.total)}</td>
                <td className="muted">{dateTime(q.sentAt)}</td>
                <td>
                  {q.status === "CANCELLED" ? <Badge tone="neutral">Cancelled</Badge> : <Badge tone="violet">{q.status === "SENT" ? "Sent" : q.status}</Badge>}
                </td>
                <td style={{ textAlign: "right" }}>
                  <span style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end" }}>
                    {q.hasPdf ? (
                      <Button size="sm" variant="ghost" icon={<FiFileText />} busy={opening === q.id} onClick={() => open(q)}>
                        View PDF
                      </Button>
                    ) : (
                      <span className="muted">No PDF</span>
                    )}
                    {q.status !== "CANCELLED" && canCancel?.(q) && (
                      <Button size="sm" variant="danger" icon={<FiXCircle />} onClick={() => onCancel(q)}>
                        Cancel
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The customer record a converted lead became (GET /leads/{id}/conversion). */
function ConversionCard({ leadId, isAdmin }) {
  const [state, setState] = useState({ leadId: null, data: null, error: "" });

  useEffect(() => {
    let alive = true;
    getConversion(leadId)
      .then((data) => alive && setState({ leadId, data, error: "" }))
      .catch((err) => alive && setState({ leadId, data: null, error: err.message || "Could not load the customer." }));
    return () => {
      alive = false;
    };
  }, [leadId]);

  if (state.leadId !== leadId || (!state.data && !state.error)) return null;
  const c = state.data;

  return (
    <div className="lm-stop">
      <FiAward />
      {state.error ? (
        state.error
      ) : (
        <span>
          Customer created: <b>{c.companyName}</b> ({c.companyId})
          {c.convertedBy ? ` by ${c.convertedBy}` : ""}
          {c.convertedAt ? `, ${dateTime(c.convertedAt)}` : ""}
          {c.notes ? ` - ${c.notes}` : ""}
          {isAdmin && (
            <>
              {" "}
              <Link to="/admin/companies" style={{ color: "inherit", textDecoration: "underline" }}>
                Open Companies
              </Link>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/** Gmail's compose window, addressed to `email`. */
const gmailTo = (email) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;

/** Calls and WhatsApp messages go out from the Android app, so the web only says so. */
function PhonePopup({ lead, kind, onClose }) {
  const toast = useToast();
  const whatsapp = kind === "whatsapp";

  async function copy(close) {
    try {
      await navigator.clipboard.writeText(lead.phone);
      toast("Number copied");
      close();
    } catch {
      toast("Could not copy the number.", true);
    }
  }

  return (
    <Alert
      icon={whatsapp ? <FiMessageCircle /> : <FiSmartphone />}
      tone={whatsapp ? "success" : "info"}
      title={whatsapp ? "WhatsApp from the Android app" : "Call from the Android app"}
      onClose={onClose}
      actions={(close) => (
        <>
          <Button variant="ghost" icon={<FiCopy />} onClick={() => copy(close)}>
            Copy Number
          </Button>
          <Button onClick={close}>OK</Button>
        </>
      )}
    >
      <p>
        Please use the BestServe Android app to {whatsapp ? "message" : "call"} <b>{lead.contact || lead.company}</b>.
      </p>
      <p>
        <b>{lead.phone}</b>
      </p>
    </Alert>
  );
}

/** One labelled value in a details section; a dash when there is nothing to show. */
function Info({ label, children }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="lm-info-row">
      <span>{label}</span>
      <div className={empty ? "muted" : ""}>{empty ? "-" : children}</div>
    </div>
  );
}

function InfoSection({ icon, title, children, wide }) {
  return (
    <section className={`lm-info${wide ? " wide" : ""}`}>
      <h4>
        <span className="lm-info-icon">{icon}</span>
        {title}
      </h4>
      <div>{children}</div>
    </section>
  );
}

/** A person on the lead, with their avatar - or a quiet note when nobody has been given it yet. */
function Person({ id, empty }) {
  const name = userName(id);
  return name ? <Who name={name} size={28} /> : <span className="muted">{empty}</span>;
}

/** The Details tab: the lead's facts grouped the way people look for them. */
function DetailsPanel({ lead, provider, onCall }) {
  return (
    <div className="lm-info-grid">
      <InfoSection icon={<FiUser />} title="Contact">
        <Info label="Contact person">{lead.contact}</Info>
        <Info label="Phone">
          {lead.phone ? (
            provider ? (
              lead.phone
            ) : (
              <button type="button" className="lm-link" onClick={onCall}>
                {lead.phone}
              </button>
            )
          ) : null}
        </Info>
        <Info label="Alternate phone">{lead.altPhone}</Info>
        <Info label="Email">
          {lead.email ? (
            <a className="lm-link" href={gmailTo(lead.email)} target="_blank" rel="noreferrer">
              {lead.email}
            </a>
          ) : null}
        </Info>
      </InfoSection>

      <InfoSection icon={<FiBriefcase />} title="Requirement">
        <Info label="Source of lead">{lead.source}</Info>
        <Info label="Approximate quote">{money(lead.quote)}</Info>
        <Info label="Address">{lead.address}</Info>
        <Info label="Requirement">
          <span style={{ whiteSpace: "pre-line" }}>{lead.requirement}</span>
        </Info>
      </InfoSection>

      {provider ? (
        // The provider sees what they sent, never how the lead is progressing.
        <InfoSection icon={<FiClock />} title="Submission">
          <Info label="Lead number">{lead.number}</Info>
          <Info label="Submitted">{dateTime(lead.createdAt)}</Info>
        </InfoSection>
      ) : (
        <>
          <InfoSection icon={<FiUsers />} title="Team">
            <Info label="Lead provider">{lead.providerId ? providerName(lead.providerId) : "Internal lead"}</Info>
            <Info label="Telecaller">
              <Person id={lead.telecallerId} empty="Not picked up yet" />
            </Info>
            <Info label="Sales person">
              <Person id={lead.salesId} empty="Not assigned yet" />
            </Info>
            <Info label="Created by">
              <Person id={lead.createdBy} empty="-" />
            </Info>
          </InfoSection>

          <InfoSection icon={<FiClock />} title="Status & Dates">
            <Info label="Stage">
              <StageBadge stage={lead.stage} />
            </Info>
            <Info label="Priority">
              <Badge tone={lead.priority === "HIGH" ? "danger" : "neutral"} plain>
                {lead.priority === "HIGH" ? "High" : "Normal"}
              </Badge>
            </Info>
            <Info label="Next follow-up">{lead.nextFollowUpAt ? dateTime(lead.nextFollowUpAt) : null}</Info>
            <Info label="Created">{dateTime(lead.createdAt)}</Info>
            <Info label="Last updated">{dateTime(lead.updatedAt)}</Info>
          </InfoSection>
        </>
      )}
    </div>
  );
}

const MEETING_TONE = { SCHEDULED: "info", IN_PROGRESS: "warn", FOLLOW_UP: "violet", COMPLETED: "success" };
const MEETING_LABEL = { SCHEDULED: "Scheduled", IN_PROGRESS: "In Progress", FOLLOW_UP: "Follow-up", COMPLETED: "Completed" };

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const openMeeting = leadMeetings.find((m) => m.status !== "COMPLETED");
  const closed = stopped || lead.stage === "WON";

  // The server's own rules, so a button is only offered when pressing it can work:
  // a lead is managed by an admin, whoever manages leads, or anyone on it (creator, telecaller, sales);
  // only the meeting's own sales person (or an admin) records its outcome; converting needs its own permission.
  const myId = String(me?.id || "");
  const canManage = !provider && (viewer.canPick || !!me?.canManage || [lead.createdBy, lead.telecallerId, lead.salesId].some((uid) => uid && String(uid) === myId));
  const myOpenMeeting = leadMeetings.find((m) => m.status !== "COMPLETED" && (viewer.canPick || String(m.salesId) === myId));
  const canConvert = viewer.canPick || !!me?.canConvert;

  // The provider sees only the lead's details: its activity would tell them its status.
  const events = provider ? [] : timeline;

  const tabs = provider
    ? [{ key: "details", label: "Details" }]
    : [
        { key: "details", label: "Details" },
        { key: "activity", label: "Activities", count: events.length },
        { key: "meetings", label: "Meetings", count: leadMeetings.length },
        { key: "quotations", label: "Quotations" },
      ];

  // Back to wherever the lead was opened from; a page opened directly goes to the lead list.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(`${LEADS_HOME}/all`));

  return (
    <>
      <button type="button" className="lm-crumb" onClick={back}>
        <FiArrowLeft /> Back
      </button>

      <section className="lm-hero">
        <div className="lm-hero-top">
          <div>
            {!provider && <StageBadge stage={lead.stage} />}
            <h1 style={{ marginTop: provider ? 0 : 10 }}>{lead.company}</h1>
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
            <button type="button" onClick={() => setDialog({ phone: "call" })}>
              <FiPhone /> Call
            </button>
            <button type="button" onClick={() => setDialog({ phone: "whatsapp" })}>
              <FiMessageCircle /> WhatsApp
            </button>
            {!!lead.email && (
              <a href={gmailTo(lead.email)} target="_blank" rel="noreferrer">
                <FiMail /> Email
              </a>
            )}
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`} target="_blank" rel="noreferrer">
              <FiMapPin /> Directions
            </a>
          </div>
        )}

        {/* The provider never learns how their lead is progressing. */}
        {!provider && <Journey lead={lead} timeline={timeline} showWho />}

        {stopped && !provider && (
          <div className="lm-stop">
            <FiXCircle />
            {lead.stage === "NOT_GENUINE" ? "Not genuine" : "Lost"}
            {lead.reason ? ` - ${lead.reason}` : ""}
          </div>
        )}

        {lead.stage === "WON" && !provider && <ConversionCard leadId={lead.id} isAdmin={viewer.canPick} />}
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
            <Button variant="ghost" icon={<FiClock />} onClick={() => setDialog("followup")}>
              Add Follow-up
            </Button>
          )}
          {canManage && !!lead.providerId && (
            <Button variant="ghost" icon={<FiSend />} onClick={() => setDialog("providerUpdate")}>
              Update Provider
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
        {!provider && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
        {/* `key` replays the panel entrance when the tab changes. */}
        <div className="lm-card-body" key={tab} style={{ animation: "lm-rise .4s var(--lm-ease) both" }}>
          {tab === "details" && <DetailsPanel lead={lead} provider={provider} onCall={() => setDialog({ phone: "call" })} />}

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

          {tab === "quotations" && (
            <QuotationsTab
              lead={lead}
              canAdd={canSell && !closed}
              onAdd={() => setDialog("quotation")}
              // The server's rule: whoever sent it, a lead manager or admin, while the lead is open.
              canCancel={(q) => !closed && (q.createdBy === myId || viewer.canPick || !!me?.canManage)}
              onCancel={(q) => setDialog({ cancelQuote: q })}
              refreshKey={timeline.length}
            />
          )}
        </div>
      </Card>

      {dialog === "call" && <CallVerifyModal lead={lead} onClose={() => setDialog(null)} onScheduleMeeting={() => setDialog("meeting")} />}
      {dialog === "meeting" && <ScheduleMeetingModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "quotation" && <QuotationModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "won" && <CloseLeadModal lead={lead} won onClose={() => setDialog(null)} />}
      {dialog === "lost" && <CloseLeadModal lead={lead} won={false} onClose={() => setDialog(null)} />}
      {dialog?.visit && <VisitModal meeting={dialog.visit} lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <EditLeadModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "followup" && <FollowUpModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog === "providerUpdate" && <ProviderUpdateModal lead={lead} onClose={() => setDialog(null)} />}
      {dialog?.cancelQuote && <CancelQuotationModal lead={lead} quotation={dialog.cancelQuote} onClose={() => setDialog(null)} />}
      {dialog?.move && <MeetingChangeModal meeting={dialog.move} lead={lead} mode="move" onClose={() => setDialog(null)} />}
      {dialog?.phone && <PhonePopup lead={lead} kind={dialog.phone} onClose={() => setDialog(null)} />}
      {dialog?.cancel && <MeetingChangeModal meeting={dialog.cancel} lead={lead} mode="cancel" onClose={() => setDialog(null)} />}
    </>
  );
}
