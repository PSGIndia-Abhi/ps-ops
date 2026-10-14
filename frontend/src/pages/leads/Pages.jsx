// The smaller Lead Management pages: the provider's submit form, follow-ups,
// meetings and the provider list.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiCalendar, FiCheckCircle, FiChevronRight, FiClock, FiExternalLink, FiPhoneCall, FiPlus, FiShield } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { CallVerifyModal, FollowUpCallModal, FollowUpModal, LeadForm, ScheduleMeetingModal } from "./dialogs";
import { Agenda } from "./Home";
import { request, useLeadData, userName } from "./leadsApi";
import { compactMoney, dateTime, dayLabel, isPast, isToday, timeLabel } from "./format";
import { useLoaded } from "./hooks";
import { Badge, Button, Card, Done, Empty, SkeletonRows, StageBadge, Tabs, Who } from "./ui";
import { useViewer, visibleLeads, visibleMeetings } from "./viewer";

/** Sends anyone who is not one of `personas` back to their own dashboard. */
function Only({ personas, children }) {
  const { persona } = useViewer();
  return personas.includes(persona) ? children : <Navigate to={LEADS_HOME} replace />;
}

/* ------------------------------------------------------------ submit (provider) */

export function SubmitLead() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(null);

  return (
    <Only personas={["lead_provider"]}>
      <div className="lm-head">
        <div>
          <h1>Submit New Lead</h1>
          <p>
            Commercial leads only. Our team calls every lead to verify it before a sales visit.
          </p>
        </div>
      </div>

      <div className="lm-grid two">
        <Card index={0}>
          {saved ? (
            <Done title="Lead submitted" text={`${saved.company} is now with our telecalling team. Its reference is ${saved.number}.`}>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <Button icon={<FiPlus />} onClick={() => setSaved(null)}>
                  Submit Another
                </Button>
                <Button variant="ghost" onClick={() => navigate(`${LEADS_HOME}/all`)}>
                  View My Leads
                </Button>
              </div>
            </Done>
          ) : (
            <LeadForm onSaved={setSaved} />
          )}
        </Card>

        <Card title="What happens next" index={1}>
          <ol className="lm-timeline">
            {[
              ["Submitted", "Your lead reaches our telecalling team straight away."],
              ["Verified", "A telecaller calls the customer to confirm the requirement."],
              ["Sales visit", "Genuine leads get a meeting with our sales team."],
            ].map(([title, text], i) => (
              <li key={title} className="lm-event" style={{ "--i": i }}>
                <span className="lm-event-dot tone-info" style={{ "--i": i }}>
                  {i + 1}
                </span>
                <div className="lm-event-body">
                  <strong>{title}</strong>
                  <small>{text}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="lm-note tone-info" style={{ marginTop: 18 }}>
            <FiShield />
            <div>You only ever see your own leads. Our internal call notes and quotations stay private.</div>
          </div>
        </Card>
      </div>
    </Only>
  );
}

/* ------------------------------------------------------------ follow-ups */

/** Stages where a call is still the verification call; any later follow-up call leaves the stage alone. */
const VERIFYING = ["NEW", "TO_CALL", "NEED_MORE_INFO"];

/** How many follow-ups have been set on a lead (a lead keeps one follow-up task; each new time is a step in its story). */
const followUpCount = (activities, leadId) => activities.filter((a) => a.leadId === leadId && a.action === "FOLLOW_UP_SCHEDULED").length;

/** The call dialog that fits the lead: verification while it is being verified, a follow-up call after. */
function CallDialog({ lead, onClose, onScheduleMeeting }) {
  return VERIFYING.includes(lead.stage) ? (
    <CallVerifyModal lead={lead} onClose={onClose} onScheduleMeeting={onScheduleMeeting} />
  ) : (
    <FollowUpCallModal lead={lead} onClose={onClose} />
  );
}

export function FollowUps() {
  const viewer = useViewer();
  const { leads, activities } = useLeadData();
  const ready = useLoaded();
  const [tab, setTab] = useState("due");
  const [calling, setCalling] = useState(null);
  const [scheduling, setScheduling] = useState(null);

  const withDate = useMemo(
    () => visibleLeads(leads, viewer).filter((l) => l.nextFollowUpAt).sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt)),
    [leads, viewer],
  );
  const groups = {
    due: withDate.filter((l) => isToday(l.nextFollowUpAt) || isPast(l.nextFollowUpAt)),
    upcoming: withDate.filter((l) => !isToday(l.nextFollowUpAt) && !isPast(l.nextFollowUpAt)),
  };
  const shown = groups[tab];
  const fresh = (id) => leads.find((l) => l.id === id);

  return (
    <Only personas={["telecaller", "sales", "sales_manager"]}>
      <div className="lm-head">
        <div>
          <h1>Follow-ups</h1>
          <p>Calls promised to customers, in the order they fall due.</p>
        </div>
      </div>

      <Card flush>
        <Tabs
          tabs={[
            { key: "due", label: "Due Now", count: groups.due.length },
            { key: "upcoming", label: "Upcoming", count: groups.upcoming.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        {!ready ? (
          <SkeletonRows />
        ) : shown.length === 0 ? (
          <Empty title={tab === "due" ? "Nothing due" : "No upcoming follow-ups"} text="A follow-up appears when a call ends with 'call back' or 'need more information'." icon={<FiCheckCircle />} />
        ) : (
          <div className="lm-agenda" key={tab}>
            {shown.map((l, i) => {
              const overdue = isPast(l.nextFollowUpAt);
              const count = followUpCount(activities, l.id);
              return (
                <div key={l.id} className="lm-slot" style={{ "--i": i }}>
                  <div className="lm-slot-time">
                    {timeLabel(l.nextFollowUpAt)}
                    <small>{dayLabel(l.nextFollowUpAt)}</small>
                  </div>
                  <div className="lm-slot-main">
                    <Link to={`${LEADS_HOME}/${l.id}`}>
                      <strong>{l.company}</strong>
                    </Link>
                    <small>
                      {l.contact} · {l.phone} · {compactMoney(l.quote)}
                    </small>
                    {count > 0 && (
                      <Link className="lm-fu-link" to={`${LEADS_HOME}/follow-ups/lead/${l.id}`}>
                        {count} follow-up{count === 1 ? "" : "s"} <FiChevronRight />
                      </Link>
                    )}
                  </div>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Badge tone={overdue ? "danger" : tab === "due" ? "warn" : "info"}>{overdue ? "Overdue" : tab === "due" ? "Due today" : "Scheduled"}</Badge>
                    <Button size="sm" icon={<FiPhoneCall />} onClick={() => setCalling(l)}>
                      {VERIFYING.includes(l.stage) ? "Call & Verify" : "Call"}
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {calling && <CallDialog lead={fresh(calling.id) || calling} onClose={() => setCalling(null)} onScheduleMeeting={setScheduling} />}
      {scheduling && <ScheduleMeetingModal lead={fresh(scheduling.id) || scheduling} onClose={() => setScheduling(null)} />}
    </Only>
  );
}

/* ------------------------------------------------------------ one lead's follow-ups */

// A follow-up history note reads "Due 14 Oct, 4:16 pm: what to cover" (the note part is optional).
const DUE_NOTE = /^Due (.+?)(?:: ([\s\S]*))?$/;

const STORY_STATUS = {
  current: { label: "Current", tone: "info" },
  moved: { label: "Moved", tone: "neutral" },
  done: { label: "Done", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

/**
 * Every follow-up set on a lead and every one marked done, newest first. Each time that was set is
 * marked as what became of it: moved to a later time, done, or still the current one.
 */
function followUpStory(activities, tasks, leadId) {
  const events = [
    ...activities
      .filter((a) => a.leadId === leadId && a.action === "FOLLOW_UP_SCHEDULED")
      .map((a) => {
        const m = DUE_NOTE.exec(a.note || "");
        return { id: a.id, kind: "set", at: a.at, due: m ? m[1] : "", note: m ? m[2] || "" : a.note || "", by: a.by };
      }),
    ...tasks
      .filter((t) => t.status === "COMPLETED" && t.completed_at)
      .map((t) => ({ id: `done-${t.id}`, kind: "done", at: t.completed_at, note: t.completion_note || "", by: userName(String(t.completed_by)) })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  let pending = null;
  for (const e of events) {
    if (e.kind === "set") {
      if (pending) pending.status = "moved";
      pending = e;
    } else {
      if (pending) pending.status = "done";
      pending = null;
    }
  }
  if (pending) pending.status = tasks.some((t) => ["OPEN", "IN_PROGRESS", "PAUSED"].includes(t.status)) ? "current" : "closed";
  return events.reverse();
}

export function LeadFollowUps() {
  const { id } = useParams();
  const navigate = useNavigate();
  const viewer = useViewer();
  const { leads, activities } = useLeadData();
  const ready = useLoaded();
  const [tasks, setTasks] = useState(null); // the lead's follow-up tasks, open and done
  const [dialog, setDialog] = useState(null);
  const lead = visibleLeads(leads, viewer).find((l) => l.id === id);

  // Read again whenever the workspace reloads, so a call saved here shows straight away.
  useEffect(() => {
    let alive = true;
    request(`/api/work-tasks?source_id=${encodeURIComponent(id)}&task_type=LEAD_FOLLOW_UP`)
      .then((rows) => alive && setTasks(rows))
      .catch(() => alive && setTasks([]));
    return () => {
      alive = false;
    };
  }, [id, activities]);

  const story = useMemo(() => (tasks ? followUpStory(activities, tasks, id) : []), [activities, tasks, id]);
  const back = (
    <Link className="lm-crumb" to={`${LEADS_HOME}/follow-ups`}>
      <FiArrowLeft /> Follow-ups
    </Link>
  );

  if (ready && !lead) {
    return (
      <Only personas={["telecaller", "sales", "sales_manager"]}>
        {back}
        <Card>
          <Empty title="Lead not found" text="It may have been closed, or it is not one of your leads." />
        </Card>
      </Only>
    );
  }

  const due = lead?.nextFollowUpAt;
  const telecaller = lead?.telecallerId ? userName(String(lead.telecallerId)) : "";
  const sales = lead?.salesId ? userName(String(lead.salesId)) : "";

  return (
    <Only personas={["telecaller", "sales", "sales_manager"]}>
      {back}
      {!ready || !lead ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : (
        <>
          <div className="lm-head">
            <div>
              <h1>{lead.company}</h1>
              <p>Follow-up history - every call promised to this customer.</p>
            </div>
            <div className="lm-head-actions">
              <Button variant="ghost" icon={<FiExternalLink />} onClick={() => navigate(`${LEADS_HOME}/${lead.id}`)}>
                Open Lead
              </Button>
            </div>
          </div>

          <div className="lm-grid two wide">
            <Card flush title="History" sub={`${story.length} ${story.length === 1 ? "entry" : "entries"}, newest first`} index={0}>
              {tasks === null ? (
                <SkeletonRows rows={3} />
              ) : story.length === 0 ? (
                <Empty title="No follow-ups yet" text="Follow-ups set on this lead appear here." icon={<FiClock />} />
              ) : (
                <ol className="lm-fu-story">
                  {story.map((e, i) => {
                    const status = e.kind === "set" ? STORY_STATUS[e.status] : null;
                    return (
                      <li key={e.id} className={`lm-fu-step ${e.kind}`} style={{ "--i": i }}>
                        <span className="lm-fu-dot">{e.kind === "done" ? <FiCheckCircle /> : <FiClock />}</span>
                        <div className="lm-fu-body">
                          <div className="lm-fu-top">
                            <strong>{e.kind === "done" ? "Follow-up done" : `Call due ${e.due || "-"}`}</strong>
                            {status && <Badge tone={status.tone}>{status.label}</Badge>}
                          </div>
                          {!!e.note && <p className="lm-fu-note">{e.note}</p>}
                          <small>
                            {e.kind === "done" ? "Marked done" : "Set"} {dateTime(e.at)}
                            {e.by ? ` by ${e.by}` : ""}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            <div className="lm-fu-side">
              <Card title="Next follow-up" index={1}>
                {due ? (
                  <div className="lm-fu-next">
                    <strong>{timeLabel(due)}</strong>
                    <span>{dayLabel(due)}</span>
                    <Badge tone={isPast(due) ? "danger" : isToday(due) ? "warn" : "info"}>{isPast(due) ? "Overdue" : isToday(due) ? "Due today" : "Scheduled"}</Badge>
                  </div>
                ) : (
                  <p className="lm-fu-none">No follow-up is open on this lead.</p>
                )}
                <div className="lm-fu-actions">
                  <Button icon={<FiPhoneCall />} onClick={() => setDialog("call")}>
                    {VERIFYING.includes(lead.stage) ? "Call & Verify" : "Call"}
                  </Button>
                  <Button variant="ghost" icon={<FiCalendar />} onClick={() => setDialog("followup")}>
                    {due ? "Change Time" : "Add Follow-up"}
                  </Button>
                </div>
              </Card>

              <Card title="Lead" index={2}>
                <dl className="lm-fu-facts">
                  <dt>Stage</dt>
                  <dd>
                    <StageBadge stage={lead.stage} />
                  </dd>
                  <dt>Contact</dt>
                  <dd>{lead.contact || "-"}</dd>
                  <dt>Phone</dt>
                  <dd>
                    <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                  </dd>
                  <dt>Quote</dt>
                  <dd>{lead.quote ? compactMoney(lead.quote) : "-"}</dd>
                  {!!telecaller && (
                    <>
                      <dt>Telecaller</dt>
                      <dd>{telecaller}</dd>
                    </>
                  )}
                  {!!sales && (
                    <>
                      <dt>Sales</dt>
                      <dd>{sales}</dd>
                    </>
                  )}
                </dl>
              </Card>
            </div>
          </div>

          {dialog === "call" && <CallDialog lead={lead} onClose={() => setDialog(null)} onScheduleMeeting={() => setDialog("meeting")} />}
          {dialog === "followup" && <FollowUpModal lead={lead} onClose={() => setDialog(null)} />}
          {dialog === "meeting" && <ScheduleMeetingModal lead={lead} onClose={() => setDialog(null)} />}
        </>
      )}
    </Only>
  );
}

/* ------------------------------------------------------------ meetings */

export function Meetings() {
  const viewer = useViewer();
  const { leads, meetings } = useLeadData();
  const ready = useLoaded();
  const [tab, setTab] = useState("today");

  const mine = useMemo(() => visibleMeetings(meetings, viewer).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)), [meetings, viewer]);
  const groups = {
    today: mine.filter((m) => isToday(m.scheduledAt)),
    upcoming: mine.filter((m) => !isToday(m.scheduledAt) && !isPast(m.scheduledAt)),
    done: mine.filter((m) => m.status === "COMPLETED").reverse(),
  };
  const everyone = viewer.persona !== "sales";

  return (
    <Only personas={["telecaller", "sales", "sales_manager"]}>
      <div className="lm-head">
        <div>
          <h1>Meetings</h1>
          <p>{everyone ? "Sales meetings and site visits across the team." : "Your sales meetings and site visits."}</p>
        </div>
      </div>

      <Card flush>
        <Tabs
          tabs={[
            { key: "today", label: "Today", count: groups.today.length },
            { key: "upcoming", label: "Upcoming", count: groups.upcoming.length },
            { key: "done", label: "Completed", count: groups.done.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        {!ready ? (
          <SkeletonRows />
        ) : groups[tab].length === 0 ? (
          <Empty title="No meetings here" text="Meetings appear once a telecaller schedules one for a genuine lead." icon={<FiCalendar />} />
        ) : (
          <div key={tab}>
            <Agenda meetings={groups[tab]} leads={visibleLeads(leads, viewer)} showOwner={everyone} showDay={tab !== "today"} />
          </div>
        )}
      </Card>
    </Only>
  );
}

/* ------------------------------------------------------------ providers */

export function Providers() {
  const { providers, leads } = useLeadData();
  const ready = useLoaded();

  return (
    <Only personas={["sales_manager"]}>
      <div className="lm-head">
        <div>
          <h1>Lead Providers</h1>
          <p>External partners who submit commercial leads through the restricted portal. Provider logins are created by an administrator.</p>
        </div>
      </div>

      <Card flush>
        {!ready ? (
          <SkeletonRows rows={3} />
        ) : providers.length === 0 ? (
          <Empty title="No providers yet" text="Providers appear here once an administrator has created their login." />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Contact</th>
                  <th>Login Email</th>
                  <th>Leads</th>
                  <th>Converted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p, i) => {
                  const own = leads.filter((l) => l.providerId === p.id);
                  return (
                    <tr key={p.id} style={{ "--i": i, cursor: "default" }}>
                      <td>
                        <Who name={p.name} sub={p.code} />
                      </td>
                      <td>
                        <span className="lm-who-text">
                          <strong>{p.contact}</strong>
                          <small>{p.phone}</small>
                        </span>
                      </td>
                      <td className="muted">{p.email}</td>
                      <td className="num">{own.length}</td>
                      <td className="num">{own.filter((l) => l.stage === "WON").length}</td>
                      <td>
                        <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Disabled"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </Only>
  );
}
