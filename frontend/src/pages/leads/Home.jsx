// The dashboard each persona lands on. LeadsHome picks the right one.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
  FiSun,
  FiTrendingUp,
  FiUserCheck,
  FiUsers,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { Bars, Donut, Funnel } from "./charts";
import { AddLeadModal, CallVerifyModal, ScheduleMeetingModal } from "./dialogs";
import { LeadTable } from "./LeadsList";
import { getTodayTasks, salesTeam, useLeadData, userName } from "./leadsApi";
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
/** A date as the "yyyy-mm-dd" a date input uses, in local time. */
const dayKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const onDay = (iso, key) => !!iso && dayKey(iso) === key;
const longDay = (key) => new Date(`${key}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The dashboard's day. Empty means the dashboard's usual view (today / this month); the cross clears it. */
function DatePick({ date, onDate }) {
  return (
    <label className="lm-date-pick" title="Show a particular day">
      <FiCalendar />
      <input type="date" value={date} onChange={(e) => onDate(e.target.value)} aria-label="Pick a date" />
      {!!date && (
        <button type="button" onClick={() => onDate("")} aria-label="Clear the date">
          <FiX />
        </button>
      )}
    </label>
  );
}

/**
 * The signed-in person's own lead tasks due today (GET /my-tasks/today): follow-up calls
 * and visits from Task Management. Read again whenever the leads change, since saving a
 * call or a visit can add or finish one.
 */
function TodayTasks({ index }) {
  const navigate = useNavigate();
  const { leads } = useLeadData();
  const [result, setResult] = useState({ leads: null, tasks: null, error: "" });

  useEffect(() => {
    let alive = true;
    getTodayTasks()
      .then((tasks) => alive && setResult({ leads, tasks, error: "" }))
      .catch((err) => alive && setResult({ leads, tasks: [], error: err.message || "Could not load today's tasks." }));
    return () => {
      alive = false;
    };
  }, [leads]);

  const tasks = result.tasks;
  return (
    <Card title="Today's Tasks" sub="Your follow-up calls and visits due today" index={index} flush>
      <div style={{ height: 8 }} />
      {!tasks ? (
        <SkeletonRows rows={3} />
      ) : result.error ? (
        <Empty title="Could not load tasks" text={result.error} icon={<FiClock />} />
      ) : tasks.length === 0 ? (
        <Empty title="Nothing due today" text="Follow-ups and visits given to you show up here on their day." icon={<FiCheckCircle />} />
      ) : (
        <div className="lm-agenda">
          {tasks.map((t, i) => (
            <button key={t.id} type="button" className="lm-slot" style={{ "--i": i }} onClick={() => t.leadId && navigate(`${LEADS_HOME}/${t.leadId}`)}>
              <div className="lm-slot-time">
                {t.dueAt ? timeLabel(t.dueAt) : "Today"}
                <small>{t.type === "MEETING" ? "Visit" : "Follow-up"}</small>
              </div>
              <div className="lm-slot-main">
                <strong>{t.company || t.title}</strong>
                <small>{t.number || t.title}</small>
              </div>
              <Badge tone={t.dueAt && isPast(t.dueAt) ? "danger" : t.status === "IN_PROGRESS" ? "warn" : "info"}>
                {t.dueAt && isPast(t.dueAt) ? "Overdue" : t.status === "IN_PROGRESS" ? "In Progress" : "Open"}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function LeadsHome() {
  const { persona } = useViewer();
  // The provider has no dashboard; their home is their list of leads.
  if (persona === "lead_provider") return <Navigate to={`${LEADS_HOME}/all`} replace />;
  if (persona === "telecaller") return <TelecallerHome />;
  if (persona === "sales") return <SalesHome />;
  return <ManagerHome />;
}

/** The welcome banner at the top of each dashboard, in Task Management's style (.tp-hero). */
function Hello({ sub, date, onDate, title, children }) {
  const { me } = useViewer();
  return (
    <div className="lm-welcome">
      <div>
        <span className="lm-welcome-kicker">
          <FiSun /> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <h1>{title || `${greeting()}, ${me.name.split(" ")[0]}`}</h1>
        <p>{sub}</p>
      </div>
      <div className="lm-welcome-side">
        <DatePick date={date} onDate={onDate} />
        {children}
      </div>
    </div>
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
  const [date, setDate] = useState(""); // a picked day: leads added and follow-ups due that day

  const visible = useMemo(() => visibleLeads(leads, viewer), [leads, viewer]);
  const all = useMemo(() => (date ? visible.filter((l) => onDay(l.createdAt, date)) : visible), [visible, date]);
  const queue = useMemo(() => all.filter((l) => QUEUE.includes(l.stage)).sort((a, b) => (a.stage === "NEW" ? -1 : 1) - (b.stage === "NEW" ? -1 : 1) || newest(a, b)), [all]);
  const awaiting = useMemo(() => all.filter((l) => l.stage === "QUALIFIED").sort(newest), [all]);
  const due = useMemo(
    () =>
      visible
        .filter((l) => (date ? onDay(l.nextFollowUpAt, date) : l.nextFollowUpAt && (isToday(l.nextFollowUpAt) || isPast(l.nextFollowUpAt))))
        .sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt)),
    [visible, date],
  );
  const inPeriod = (iso) => (date ? true : thisMonth(iso));
  const period = date ? `Added ${longDay(date)}` : "This month";
  const fresh = (id) => leads.find((l) => l.id === id);

  return (
    <>
      <Hello
        sub={
          <>
            You have <strong>{queue.length} lead{queue.length === 1 ? "" : "s"} to verify</strong>, <strong>{due.length} follow-up{due.length === 1 ? "" : "s"} due</strong> and{" "}
            <strong>{awaiting.length} awaiting a meeting</strong>.
          </>
        }
        date={date}
        onDate={setDate}
      >
        <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
          Add Lead
        </Button>
      </Hello>

      {/* `key` replays the numbers when the date changes. */}
      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="New Leads" value={all.filter((l) => l.stage === "NEW").length} icon={<FiInbox />} tone="info" foot={date ? period : "Waiting for a first call"} onClick={() => navigate(`${LEADS_HOME}/all?tab=new`)} />
        <Kpi index={1} label="To Call" value={all.filter((l) => l.stage === "TO_CALL" || l.stage === "NEED_MORE_INFO").length} icon={<FiPhoneCall />} tone="warn" foot={date ? `${due.length} due ${longDay(date)}` : `${due.length} due now`} onClick={() => navigate(`${LEADS_HOME}/follow-ups`)} />
        <Kpi index={2} label="Qualified" value={all.filter((l) => AFTER_QUALIFY.includes(l.stage) && inPeriod(l.createdAt)).length} icon={<FiUserCheck />} tone="success" foot={period} onClick={() => navigate(`${LEADS_HOME}/all?tab=qualified`)} />
        <Kpi index={3} label="Not Genuine" value={all.filter((l) => l.stage === "NOT_GENUINE" && inPeriod(l.createdAt)).length} icon={<FiXCircle />} tone="danger" foot={period} onClick={() => navigate(`${LEADS_HOME}/all?tab=rejected`)} />
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
            <Empty title="Queue is clear" text={date ? `No lead added ${longDay(date)} is waiting for a call.` : "Every lead has been called. New ones appear here."} icon={<FiCheckCircle />} />
          ) : (
            <LeadTable leads={queue.slice(0, 6)} persona="telecaller" onCall={setCalling} compact />
          )}
        </Card>

        <div className="lm-stack">
          <Card title="Follow-ups Due" sub={date ? `Calls promised for ${longDay(date)}` : "Calls promised for today or earlier"} index={3} flush>
            <div style={{ height: 8 }} />
            {due.length === 0 ? (
              <Empty title="Nothing due" text={date ? "No calls are due on this day." : "No calls are waiting right now."} icon={<FiCheckCircle />} />
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

          <TodayTasks index={5} />
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
  const [date, setDate] = useState(""); // a picked day: that day's meetings and the leads added that day

  const visible = useMemo(() => visibleLeads(leads, viewer), [leads, viewer]);
  const mine = useMemo(() => (date ? visible.filter((l) => onDay(l.createdAt, date)) : visible), [visible, date]);
  const myMeetings = useMemo(() => visibleMeetings(meetings, viewer).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)), [meetings, viewer]);
  const today = myMeetings.filter((m) => (date ? onDay(m.scheduledAt, date) : isToday(m.scheduledAt)));
  const upcoming = myMeetings.filter((m) => !isToday(m.scheduledAt) && !isPast(m.scheduledAt));
  const shown = date || range === "today" ? today : upcoming;
  const added = date ? `Added ${longDay(date)}` : null;

  const stages = [
    { label: "Awaiting verification", value: mine.filter((l) => QUEUE.includes(l.stage)).length },
    { label: "Meeting scheduled", value: mine.filter((l) => l.stage === "MEETING_SCHEDULED").length },
    { label: "Visit completed", value: mine.filter((l) => l.stage === "VISIT_COMPLETED").length },
    { label: "Quotation sent", value: mine.filter((l) => l.stage === "QUOTATION_SENT").length },
    { label: "Converted", value: mine.filter((l) => l.stage === "WON").length },
  ];

  return (
    <>
      <Hello
        sub={
          <>
            You have <strong>{today.length} meeting{today.length === 1 ? "" : "s"} {date ? `on ${longDay(date)}` : "today"}</strong>
            {!date && (
              <>
                , <strong>{upcoming.length} upcoming</strong>
              </>
            )}
            .
          </>
        }
        date={date}
        onDate={setDate}
      >
        <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
          Add Lead
        </Button>
      </Hello>

      {/* `key` replays the numbers when the date changes. */}
      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="My Leads" value={mine.filter((l) => date || thisMonth(l.createdAt)).length} icon={<FiUsers />} tone="info" foot={added || "This month"} onClick={() => navigate(`${LEADS_HOME}/all`)} />
        <Kpi index={1} label={date ? "Meetings" : "Meetings Today"} value={today.length} icon={<FiCalendar />} tone="warn" foot={date ? `On ${longDay(date)}` : `${upcoming.length} upcoming`} onClick={() => navigate(`${LEADS_HOME}/meetings`)} />
        <Kpi index={2} label="Quotations Sent" value={mine.filter((l) => AFTER_QUOTE.includes(l.stage)).length} icon={<FiFileText />} tone="violet" foot={added || "All time"} onClick={() => navigate(`${LEADS_HOME}/all?tab=progress`)} />
        <Kpi index={3} label="Converted" value={mine.filter((l) => l.stage === "WON").length} icon={<FiAward />} tone="success" foot={`${compactMoney(mine.filter((l) => l.stage === "WON").reduce((s, l) => s + l.quote, 0))} won`} onClick={() => navigate(`${LEADS_HOME}/all?tab=closed`)} />
      </div>

      <div className="lm-grid two">
        <Card
          title="My Meetings"
          sub={date ? `On ${longDay(date)}` : undefined}
          index={2}
          flush
          action={
            // A picked day shows just that day, so Today / Upcoming only apply without one.
            !date && (
              <div className="lm-seg">
                <button type="button" className={range === "today" ? "on" : ""} onClick={() => setRange("today")}>
                  Today ({today.length})
                </button>
                <button type="button" className={range === "upcoming" ? "on" : ""} onClick={() => setRange("upcoming")}>
                  Upcoming ({upcoming.length})
                </button>
              </div>
            )
          }
        >
          <div style={{ height: 12 }} />
          {!ready ? (
            <SkeletonRows rows={4} />
          ) : shown.length === 0 ? (
            <Empty title={date ? "No meetings on this day" : range === "today" ? "No meetings today" : "Nothing upcoming"} text="Meetings scheduled by the telecaller appear here." icon={<FiCalendar />} />
          ) : (
            <div key={date || range}>
              <Agenda meetings={shown} leads={leads} showDay={!date && range === "upcoming"} />
            </div>
          )}
        </Card>

        <Card title="My Pipeline" sub={date ? `Leads added ${longDay(date)}, by stage` : "Leads by stage"} index={3}>
          <Bars data={stages} />
        </Card>
      </div>

      <div style={{ marginTop: 18 }}>
        <TodayTasks index={4} />
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
  const viewer = useViewer();
  const navigate = useNavigate();
  const { leads: allLeads, meetings } = useLeadData();
  // Only leads a telecaller has verified - the manager never sees the calling queue.
  const leads = useMemo(() => visibleLeads(allLeads, viewer), [allLeads, viewer]);
  const ready = useLoaded();
  const [period, setPeriod] = useState("all");
  const [date, setDate] = useState(""); // a picked day replaces the period
  const [member, setMember] = useState("");
  const team = salesTeam();

  const scoped = useMemo(() => {
    const inPeriod = date ? (iso) => onDay(iso, date) : PERIODS.find((p) => p.key === period).match;
    return leads.filter((l) => inPeriod(l.createdAt) && (!member || l.salesId === member));
  }, [leads, period, date, member]);

  const total = scoped.length;
  const n = (stages) => scoped.filter((l) => stages.includes(l.stage)).length;
  const awaitingMeeting = n(["QUALIFIED"]);
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
      <div className="lm-welcome">
        <div>
          <span className="lm-welcome-kicker">
            <FiSun /> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <h1>
            {greeting()}, {viewer.me.name.split(" ")[0]}
          </h1>
          <p>
            Your team has <strong>{total} verified lead{total === 1 ? "" : "s"}</strong>, <strong>{met} meetings</strong> and <strong>{won} converted</strong>
            {date ? ` on ${longDay(date)}` : ` - ${PERIODS.find((p) => p.key === period).label.toLowerCase()}`}.
          </p>
        </div>
        <div className="lm-welcome-side">
          <div className="lm-seg">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={!date && p.key === period ? "on" : ""}
                onClick={() => {
                  setPeriod(p.key);
                  setDate("");
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <DatePick date={date} onDate={setDate} />
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
      <div key={`${period}:${date}:${member}`}>
        <div className="lm-grid kpi">
          <Kpi index={0} label="Verified Leads" value={total} icon={<FiInbox />} tone="info" foot="Marked genuine by telecallers" onClick={() => navigate(`${LEADS_HOME}/all`)} />
          <Kpi index={1} label="Awaiting Meeting" value={awaitingMeeting} icon={<FiUserCheck />} tone="success" foot="Verified, no visit yet" onClick={() => navigate(`${LEADS_HOME}/all?tab=qualified`)} />
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
                { label: "Verified leads", value: total, tone: "success" },
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
