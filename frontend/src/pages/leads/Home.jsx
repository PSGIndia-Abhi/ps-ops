// The dashboard each persona lands on. LeadsHome picks the right one.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiAward,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiInbox,
  FiMapPin,
  FiPhoneCall,
  FiPlus,
  FiSend,
  FiTrendingUp,
  FiUserCheck,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { Bars, Donut, Funnel } from "./charts";
import { AddLeadModal, CallVerifyModal, ScheduleMeetingModal } from "./dialogs";
import { LeadTable } from "./LeadsList";
import { salesTeam, useLeadData, userName } from "./leadsApi";
import { compactMoney, dayLabel, isPast, isToday, timeLabel } from "./format";
import { useLoaded } from "./hooks";
import { Badge, Button, Card, Empty, Kpi, SkeletonRows, Who } from "./ui";
import { useViewer, visibleLeads, visibleMeetings } from "./viewer";

const QUEUE = ["NEW", "TO_CALL", "NEED_MORE_INFO"];
const AFTER_QUALIFY = ["QUALIFIED", "MEETING_SCHEDULED", "VISIT_COMPLETED", "QUOTATION_SENT", "WON"];
const AFTER_MEETING = ["MEETING_SCHEDULED", "VISIT_COMPLETED", "QUOTATION_SENT", "WON"];
const AFTER_QUOTE = ["QUOTATION_SENT", "WON"];

const thisMonth = (iso) => {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const newest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

export default function LeadsHome() {
  const { persona } = useViewer();
  if (persona === "lead_provider") return <ProviderHome />;
  if (persona === "telecaller") return <TelecallerHome />;
  if (persona === "sales") return <SalesHome />;
  return <ManagerHome />;
}

function Hello({ sub, children }) {
  const { me } = useViewer();
  return (
    <div className="lm-head">
      <div>
        <h1>
          {greeting()}, {me.name.split(" ")[0]}
        </h1>
        <p>{sub}</p>
      </div>
      <div className="lm-head-actions">
        <span className="lm-today">
          <FiCalendar /> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ provider */

function ProviderHome() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { leads } = useLeadData();
  const ready = useLoaded();
  const mine = useMemo(() => visibleLeads(leads, viewer).sort(newest), [leads, viewer]);
  const count = (stages) => mine.filter((l) => stages.includes(l.stage)).length;
  const go = (tab) => () => navigate(`${LEADS_HOME}/all?tab=${tab}`);

  return (
    <>
      <Hello sub="Submit commercial leads and see how each one is progressing.">
        <Button icon={<FiPlus />} onClick={() => navigate(`${LEADS_HOME}/submit`)}>
          Submit New Lead
        </Button>
      </Hello>

      <div className="lm-grid kpi">
        <Kpi index={0} label="Submitted" value={mine.length} icon={<FiSend />} tone="info" foot="All time" onClick={go("all")} />
        <Kpi index={1} label="Under Review" value={count(QUEUE)} icon={<FiClock />} tone="warn" foot="Being verified" onClick={go("review")} />
        <Kpi index={2} label="In Progress" value={count(["QUALIFIED", "MEETING_SCHEDULED", "VISIT_COMPLETED", "QUOTATION_SENT"])} icon={<FiTrendingUp />} tone="violet" foot="Qualified and moving" onClick={go("progress")} />
        <Kpi index={3} label="Converted" value={count(["WON"])} icon={<FiAward />} tone="success" foot="Became customers" onClick={go("converted")} />
        <Kpi index={4} label="Rejected" value={count(["NOT_GENUINE", "LOST"])} icon={<FiXCircle />} tone="danger" foot="Not genuine or lost" onClick={go("rejected")} />
      </div>

      <Card
        title="My Submitted Leads"
        sub="Most recent first"
        index={2}
        flush
        action={
          <Link className="lm-link" to={`${LEADS_HOME}/all`}>
            View all
          </Link>
        }
      >
        <div style={{ height: 14 }} />
        {!ready ? (
          <SkeletonRows />
        ) : mine.length === 0 ? (
          <Empty title="No leads submitted yet" text="Your leads and their status appear here." />
        ) : (
          <LeadTable leads={mine.slice(0, 6)} persona="lead_provider" />
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------ telecaller */

function TelecallerHome() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { leads } = useLeadData();
  const ready = useLoaded();
  const [adding, setAdding] = useState(false);
  const [calling, setCalling] = useState(null);
  const [scheduling, setScheduling] = useState(null);

  const all = useMemo(() => visibleLeads(leads, viewer), [leads, viewer]);
  const queue = useMemo(() => all.filter((l) => QUEUE.includes(l.stage)).sort((a, b) => (a.stage === "NEW" ? -1 : 1) - (b.stage === "NEW" ? -1 : 1) || newest(a, b)), [all]);
  const awaiting = useMemo(() => all.filter((l) => l.stage === "QUALIFIED").sort(newest), [all]);
  const due = useMemo(
    () => all.filter((l) => l.nextFollowUpAt && (isToday(l.nextFollowUpAt) || isPast(l.nextFollowUpAt))).sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt)),
    [all],
  );
  const fresh = (id) => leads.find((l) => l.id === id);

  return (
    <>
      <Hello sub="New leads to verify, calls due today and genuine leads waiting for a meeting.">
        <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
          Add Lead
        </Button>
      </Hello>

      <div className="lm-grid kpi">
        <Kpi index={0} label="New Leads" value={all.filter((l) => l.stage === "NEW").length} icon={<FiInbox />} tone="info" foot="Waiting for a first call" onClick={() => navigate(`${LEADS_HOME}/all?tab=new`)} />
        <Kpi index={1} label="To Call" value={all.filter((l) => l.stage === "TO_CALL" || l.stage === "NEED_MORE_INFO").length} icon={<FiPhoneCall />} tone="warn" foot={`${due.length} due now`} onClick={() => navigate(`${LEADS_HOME}/follow-ups`)} />
        <Kpi index={2} label="Qualified" value={all.filter((l) => AFTER_QUALIFY.includes(l.stage) && thisMonth(l.createdAt)).length} icon={<FiUserCheck />} tone="success" foot="This month" onClick={() => navigate(`${LEADS_HOME}/all?tab=qualified`)} />
        <Kpi index={3} label="Not Genuine" value={all.filter((l) => l.stage === "NOT_GENUINE" && thisMonth(l.createdAt)).length} icon={<FiXCircle />} tone="danger" foot="This month" onClick={() => navigate(`${LEADS_HOME}/all?tab=rejected`)} />
      </div>

      <div className="lm-grid two">
        <Card
          title="Calling Queue"
          sub={`${queue.length} lead${queue.length === 1 ? "" : "s"} to verify`}
          index={2}
          flush
          action={
            <Link className="lm-link" to={`${LEADS_HOME}/all`}>
              View all
            </Link>
          }
        >
          <div style={{ height: 14 }} />
          {!ready ? (
            <SkeletonRows />
          ) : queue.length === 0 ? (
            <Empty title="Queue is clear" text="Every lead has been called. New ones appear here." icon={<FiCheckCircle />} />
          ) : (
            <LeadTable leads={queue.slice(0, 6)} persona="telecaller" onCall={setCalling} compact />
          )}
        </Card>

        <div className="lm-stack">
          <Card title="Follow-ups Due" sub="Calls promised for today or earlier" index={3} flush>
            <div style={{ height: 8 }} />
            {due.length === 0 ? (
              <Empty title="Nothing due" text="No calls are waiting right now." icon={<FiCheckCircle />} />
            ) : (
              <div className="lm-agenda">
                {due.slice(0, 4).map((l, i) => (
                  <button key={l.id} type="button" className="lm-slot" style={{ "--i": i }} onClick={() => setCalling(l)}>
                    <div className="lm-slot-time">
                      {timeLabel(l.nextFollowUpAt)}
                      <small>{dayLabel(l.nextFollowUpAt)}</small>
                    </div>
                    <div className="lm-slot-main">
                      <strong>{l.company}</strong>
                      <small>
                        {l.contact} · {l.phone}
                      </small>
                    </div>
                    <Badge tone={isPast(l.nextFollowUpAt) ? "danger" : "warn"}>{isPast(l.nextFollowUpAt) ? "Overdue" : "Due"}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Qualified - Awaiting Meeting" sub="Genuine leads with no sales visit yet" index={4} flush>
            <div style={{ height: 8 }} />
            {awaiting.length === 0 ? (
              <Empty title="All scheduled" text="Every genuine lead has a meeting." icon={<FiCalendar />} />
            ) : (
              <div className="lm-agenda">
                {awaiting.slice(0, 4).map((l, i) => (
                  <div key={l.id} className="lm-slot" style={{ "--i": i, gridTemplateColumns: "1fr auto" }}>
                    <div className="lm-slot-main">
                      <strong>{l.company}</strong>
                      <small>
                        <FiMapPin /> {l.area} · {compactMoney(l.quote)}
                      </small>
                    </div>
                    <Button size="sm" icon={<FiCalendar />} onClick={() => setScheduling(l)}>
                      Schedule
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {adding && <AddLeadModal onClose={() => setAdding(false)} />}
      {calling && <CallVerifyModal lead={fresh(calling.id) || calling} onClose={() => setCalling(null)} onScheduleMeeting={setScheduling} />}
      {scheduling && <ScheduleMeetingModal lead={fresh(scheduling.id) || scheduling} onClose={() => setScheduling(null)} />}
    </>
  );
}

/* ------------------------------------------------------------ sales */

const SLOT_TONE = { SCHEDULED: "info", IN_PROGRESS: "warn", FOLLOW_UP: "violet", COMPLETED: "success" };
const SLOT_LABEL = { SCHEDULED: "Scheduled", IN_PROGRESS: "In Progress", FOLLOW_UP: "Follow-up", COMPLETED: "Completed" };

/** One row per meeting, linking to its lead. Shared with the Meetings page. */
export function Agenda({ meetings, leads, showOwner = false, showDay = false }) {
  const navigate = useNavigate();
  return (
    <div className="lm-agenda">
      {meetings.map((m, i) => {
        const lead = leads.find((l) => l.id === m.leadId);
        if (!lead) return null;
        return (
          <button key={m.id} type="button" className="lm-slot" style={{ "--i": i }} onClick={() => navigate(`${LEADS_HOME}/${lead.id}`)}>
            <div className="lm-slot-time">
              {timeLabel(m.scheduledAt)}
              <small>{showDay ? dayLabel(m.scheduledAt) : m.type === "SITE_VISIT" ? "Site Visit" : "Meeting"}</small>
            </div>
            <div className="lm-slot-main">
              <strong>{lead.company}</strong>
              <small>
                <FiMapPin /> {m.locationType === "OFFICE" ? "Our Office" : lead.area}
                {showOwner ? ` · ${userName(m.salesId)}` : ""}
              </small>
            </div>
            <Badge tone={SLOT_TONE[m.status]}>{SLOT_LABEL[m.status]}</Badge>
          </button>
        );
      })}
    </div>
  );
}

function SalesHome() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { leads, meetings } = useLeadData();
  const ready = useLoaded();
  const [range, setRange] = useState("today");
  const [adding, setAdding] = useState(false);

  const mine = useMemo(() => visibleLeads(leads, viewer), [leads, viewer]);
  const myMeetings = useMemo(() => visibleMeetings(meetings, viewer).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)), [meetings, viewer]);
  const today = myMeetings.filter((m) => isToday(m.scheduledAt));
  const upcoming = myMeetings.filter((m) => !isToday(m.scheduledAt) && !isPast(m.scheduledAt));
  const shown = range === "today" ? today : upcoming;

  const stages = [
    { label: "Awaiting verification", value: mine.filter((l) => QUEUE.includes(l.stage)).length },
    { label: "Meeting scheduled", value: mine.filter((l) => l.stage === "MEETING_SCHEDULED").length },
    { label: "Visit completed", value: mine.filter((l) => l.stage === "VISIT_COMPLETED").length },
    { label: "Quotation sent", value: mine.filter((l) => l.stage === "QUOTATION_SENT").length },
    { label: "Converted", value: mine.filter((l) => l.stage === "WON").length },
  ];

  return (
    <>
      <Hello sub="Your meetings for the day and where each of your leads stands.">
        <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
          Add Lead
        </Button>
      </Hello>

      <div className="lm-grid kpi">
        <Kpi index={0} label="My Leads" value={mine.filter((l) => thisMonth(l.createdAt)).length} icon={<FiUsers />} tone="info" foot="This month" onClick={() => navigate(`${LEADS_HOME}/all`)} />
        <Kpi index={1} label="Meetings Today" value={today.length} icon={<FiCalendar />} tone="warn" foot={`${upcoming.length} upcoming`} onClick={() => navigate(`${LEADS_HOME}/meetings`)} />
        <Kpi index={2} label="Quotations Sent" value={mine.filter((l) => AFTER_QUOTE.includes(l.stage)).length} icon={<FiFileText />} tone="violet" foot="All time" onClick={() => navigate(`${LEADS_HOME}/all?tab=progress`)} />
        <Kpi index={3} label="Converted" value={mine.filter((l) => l.stage === "WON").length} icon={<FiAward />} tone="success" foot={`${compactMoney(mine.filter((l) => l.stage === "WON").reduce((s, l) => s + l.quote, 0))} won`} onClick={() => navigate(`${LEADS_HOME}/all?tab=closed`)} />
      </div>

      <div className="lm-grid two">
        <Card
          title="My Meetings"
          index={2}
          flush
          action={
            <div className="lm-seg">
              <button type="button" className={range === "today" ? "on" : ""} onClick={() => setRange("today")}>
                Today ({today.length})
              </button>
              <button type="button" className={range === "upcoming" ? "on" : ""} onClick={() => setRange("upcoming")}>
                Upcoming ({upcoming.length})
              </button>
            </div>
          }
        >
          <div style={{ height: 12 }} />
          {!ready ? (
            <SkeletonRows rows={4} />
          ) : shown.length === 0 ? (
            <Empty title={range === "today" ? "No meetings today" : "Nothing upcoming"} text="Meetings scheduled by the telecaller appear here." icon={<FiCalendar />} />
          ) : (
            <div key={range}>
              <Agenda meetings={shown} leads={leads} showDay={range === "upcoming"} />
            </div>
          )}
        </Card>

        <Card title="My Pipeline" sub="Leads by stage" index={3}>
          <Bars data={stages} />
        </Card>
      </div>

      {adding && <AddLeadModal onClose={() => setAdding(false)} />}
    </>
  );
}

/* ------------------------------------------------------------ sales manager */

const PERIODS = [
  { key: "month", label: "This month", match: (iso) => thisMonth(iso) },
  { key: "30", label: "Last 30 days", match: (iso) => Date.now() - new Date(iso).getTime() <= 30 * 86400000 },
  { key: "all", label: "All time", match: () => true },
];

function ManagerHome() {
  const navigate = useNavigate();
  const { leads, meetings } = useLeadData();
  const ready = useLoaded();
  const [period, setPeriod] = useState("all");
  const [member, setMember] = useState("");
  const team = salesTeam();

  const scoped = useMemo(() => {
    const inPeriod = PERIODS.find((p) => p.key === period).match;
    return leads.filter((l) => inPeriod(l.createdAt) && (!member || l.salesId === member));
  }, [leads, period, member]);

  const total = scoped.length;
  const n = (stages) => scoped.filter((l) => stages.includes(l.stage)).length;
  const qualified = n(AFTER_QUALIFY);
  const met = n(AFTER_MEETING) + scoped.filter((l) => l.stage === "LOST").length;
  const quoted = n(AFTER_QUOTE);
  const won = n(["WON"]);

  const bySource = useMemo(() => {
    const map = new Map();
    scoped.forEach((l) => map.set(l.source, (map.get(l.source) || 0) + 1));
    return [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [scoped]);

  const byArea = useMemo(() => {
    const map = new Map();
    scoped.forEach((l) => map.set(l.area, (map.get(l.area) || 0) + 1));
    return [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 7);
  }, [scoped]);

  const perPerson = useMemo(
    () =>
      team
        .map((u) => {
          const own = scoped.filter((l) => l.salesId === u.id);
          return {
            user: u,
            leads: own.length,
            meetings: meetings.filter((m) => m.salesId === u.id && own.some((l) => l.id === m.leadId)).length,
            quotes: own.filter((l) => AFTER_QUOTE.includes(l.stage)).length,
            won: own.filter((l) => l.stage === "WON").length,
            value: own.filter((l) => l.stage === "WON").reduce((s, l) => s + l.quote, 0),
          };
        })
        .sort((a, b) => b.won - a.won || b.leads - a.leads),
    [team, scoped, meetings],
  );

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Sales Performance</h1>
          <p>Leads, meetings, quotations and conversions across the team.</p>
        </div>
        <div className="lm-head-actions">
          <div className="lm-seg">
            {PERIODS.map((p) => (
              <button key={p.key} type="button" className={p.key === period ? "on" : ""} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <select className="lm-select" value={member} onChange={(e) => setMember(e.target.value)} aria-label="Filter by sales person">
            <option value="">Whole team</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* `key` replays the numbers and charts when the filter changes. */}
      <div key={`${period}:${member}`}>
        <div className="lm-grid kpi">
          <Kpi index={0} label="Total Leads" value={total} icon={<FiInbox />} tone="info" foot="In this period" onClick={() => navigate(`${LEADS_HOME}/all`)} />
          <Kpi index={1} label="Qualified" value={qualified} icon={<FiUserCheck />} tone="success" foot={`${pct(qualified, total)}% of leads`} />
          <Kpi index={2} label="Meetings" value={met} icon={<FiCalendar />} tone="warn" foot={`${pct(met, total)}% of leads`} onClick={() => navigate(`${LEADS_HOME}/meetings`)} />
          <Kpi index={3} label="Quotations" value={quoted} icon={<FiFileText />} tone="violet" foot={`${pct(quoted, total)}% of leads`} />
          <Kpi index={4} label="Converted" value={won} icon={<FiAward />} tone="teal" foot={`${pct(won, total)}% of leads`} />
        </div>

        <div className="lm-grid two" style={{ marginBottom: 18 }}>
          <Card title="Team Performance" sub="Ranked by conversions" index={2} flush>
            <div style={{ height: 14 }} />
            {!ready ? (
              <SkeletonRows rows={4} />
            ) : (
              <div className="lm-table-wrap">
                <table className="lm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Sales Person</th>
                      <th>Leads</th>
                      <th>Meetings</th>
                      <th>Quotes</th>
                      <th>Converted</th>
                      <th>Won Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perPerson.map((row, i) => (
                      <tr key={row.user.id} style={{ "--i": i }} onClick={() => setMember(member === row.user.id ? "" : row.user.id)}>
                        <td>
                          <span className={`lm-rank${i === 0 && row.won > 0 ? " top" : ""}`}>{i + 1}</span>
                        </td>
                        <td>
                          <Who name={row.user.name} sub={row.user.title} size={34} />
                        </td>
                        <td className="num">{row.leads}</td>
                        <td className="num">{row.meetings}</td>
                        <td className="num">{row.quotes}</td>
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <b className="num">{row.won}</b>
                            <span className="lm-mini">
                              <i style={{ width: `${pct(row.won, row.leads)}%`, "--i": i }} />
                            </span>
                          </span>
                        </td>
                        <td className="num">{compactMoney(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Leads by Source" index={3}>
            {total === 0 ? <Empty title="No leads in this period" /> : <Donut data={bySource} />}
          </Card>
        </div>

        <div className="lm-grid half">
          <Card title="Pipeline" sub="How far leads get" index={4}>
            <Funnel
              steps={[
                { label: "Leads received", value: total, tone: "info" },
                { label: "Qualified", value: qualified, tone: "success" },
                { label: "Meetings", value: met, tone: "warn" },
                { label: "Quotations", value: quoted, tone: "violet" },
                { label: "Converted", value: won, tone: "teal" },
              ]}
            />
          </Card>
          <Card title="Leads by Location" sub="Top areas" index={5}>
            {byArea.length === 0 ? <Empty title="No leads in this period" /> : <Bars data={byArea} />}
          </Card>
        </div>
      </div>
    </>
  );
}
