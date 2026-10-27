// The dashboard each persona lands on. LeadsHome picks the right one.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  FiAward,
  FiCalendar,
  FiCheckCircle,
  FiFileText,
  FiInbox,
  FiMapPin,
  FiPhoneCall,
  FiPlus,
  FiSun,
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
/** How many rows a dashboard card lists before "View all". */
const ROWS = 6;

const thisMonth = (iso) => {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
};
/** Since Monday 00:00 of this week. */
const thisWeek = (iso) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return new Date(iso) >= start;
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const newest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** A date as the "yyyy-mm-dd" a date input uses, in local time. */
const dayKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const onDay = (iso, key) => !!iso && dayKey(iso) === key;
const longDay = (key) => new Date(`${key}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
/** A follow-up that is due now: today, or a day already gone. */
const dueNow = (iso) => !!iso && (isToday(iso) || isPast(iso));
const ms = (iso) => (iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER);

/**
 * The dashboard's day, as a chip: "Pick a day" until one is chosen, then the day with a cross
 * that goes back to the usual view (today / this month). The date input itself stays out of
 * sight; the chip opens its calendar.
 */
function DatePick({ date, onDate }) {
  const input = useRef(null);
  const open = () => {
    try {
      input.current?.showPicker();
    } catch {
      input.current?.focus();
    }
  };
  return (
    <div className={`lm-day-chip${date ? " on" : ""}`}>
      <button type="button" className="lm-day-chip-main" onClick={open} title="Show a particular day">
        <FiCalendar />
        {date ? longDay(date) : "Pick a day"}
      </button>
      {!!date && (
        <button type="button" className="lm-day-chip-clear" onClick={() => onDate("")} aria-label="Clear the date">
          <FiX />
        </button>
      )}
      <input ref={input} type="date" className="lm-day-chip-input" value={date} onChange={(e) => onDate(e.target.value)} tabIndex={-1} aria-label="Pick a date" />
    </div>
  );
}

/**
 * The signed-in person's own lead tasks due today (GET /my-tasks/today): follow-up calls and
 * visits from Task Management. Read again whenever the leads change, since saving a call or a
 * visit can add or finish one.
 */
function useTodayTasks() {
  const { leads } = useLeadData();
  const [result, setResult] = useState({ tasks: null, error: "" });
  useEffect(() => {
    let alive = true;
    getTodayTasks()
      .then((tasks) => alive && setResult({ tasks, error: "" }))
      .catch((err) => alive && setResult({ tasks: [], error: err.message || "Could not load today's tasks." }));
    return () => {
      alive = false;
    };
  }, [leads]);
  return result;
}

/**
 * One list of the calls to make: follow-ups promised on the leads (`dueLeads`) plus the
 * follow-up tasks given for today, one row per lead - a lead whose promised call is also a task
 * is listed once. Soonest first, so overdue calls lead.
 */
function callRows(dueLeads, tasks, leads) {
  const rows = dueLeads.map((l) => ({ key: `l-${l.id}`, lead: l, at: l.nextFollowUpAt, company: l.company, sub: `${l.contact} · ${l.phone}` }));
  const seen = new Set(rows.map((r) => r.lead.id));
  (tasks || [])
    .filter((t) => t.type === "FOLLOW_UP" && !(t.leadId && seen.has(t.leadId)))
    .forEach((t) => {
      const lead = leads.find((l) => l.id === t.leadId) || null;
      rows.push({ key: `t-${t.id}`, lead, leadId: t.leadId, at: t.dueAt, company: t.company || t.title, sub: lead ? `${lead.contact} · ${lead.phone}` : t.number || t.title });
      if (t.leadId) seen.add(t.leadId);
    });
  return rows.sort((a, b) => ms(a.at) - ms(b.at));
}

function CallList({ rows, onOpen }) {
  return (
    <div className="lm-agenda">
      {rows.map((r, i) => {
        const late = !!r.at && isPast(r.at);
        return (
          <button key={r.key} type="button" className="lm-slot" style={{ "--i": i }} onClick={() => onOpen(r)}>
            <div className="lm-slot-time">
              {r.at ? timeLabel(r.at) : "Today"}
              <small>{r.at ? dayLabel(r.at) : "Any time"}</small>
            </div>
            <div className="lm-slot-main">
              <strong>{r.company}</strong>
              <small>{r.sub}</small>
            </div>
            <Badge tone={late ? "danger" : "warn"}>{late ? "Overdue" : "Due"}</Badge>
          </button>
        );
      })}
    </div>
  );
}

/** Small numbers in tinted tiles, two to a row. */
function Stats({ items }) {
  return (
    <div className="lm-stats">
      {items.map((s, i) => (
        <div key={s.label} className={`lm-stat tone-${s.tone}`} style={{ "--i": i }}>
          <span className="lm-stat-icon">{s.icon}</span>
          <div>
            <b>{s.value}</b>
            <span>{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const viewAll = (to) => (
  <Link className="lm-link" to={to}>
    View all
  </Link>
);

export default function LeadsHome() {
  const { persona } = useViewer();
  // The provider has no dashboard; their home is their list of leads.
  if (persona === "lead_provider") return <Navigate to={`${LEADS_HOME}/all`} replace />;
  if (persona === "telecaller") return <TelecallerHome />;
  if (persona === "sales") return <SalesHome />;
  return <ManagerHome />;
}

/** The welcome banner at the top of each dashboard, in Task Management's style (.tp-hero). */
function Hello({ sub, children }) {
  const { me } = useViewer();
  return (
    <div className="lm-welcome">
      <div>
        <span className="lm-welcome-kicker">
          <FiSun /> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <h1>{`${greeting()}, ${me.name.split(" ")[0]}`}</h1>
        <p>{sub}</p>
      </div>
      {!!children && <div className="lm-welcome-side">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ telecaller */

function TelecallerHome() {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { leads, activities } = useLeadData();
  const ready = useLoaded();
  const { tasks } = useTodayTasks();
  const [calling, setCalling] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const [date, setDate] = useState(""); // a picked day: leads added and follow-ups due that day

  const visible = useMemo(() => visibleLeads(leads, viewer), [leads, viewer]);
  const all = useMemo(() => (date ? visible.filter((l) => onDay(l.createdAt, date)) : visible), [visible, date]);
  const queue = useMemo(() => all.filter((l) => QUEUE.includes(l.stage)).sort((a, b) => (a.stage === "NEW" ? -1 : 1) - (b.stage === "NEW" ? -1 : 1) || newest(a, b)), [all]);
  const awaiting = useMemo(() => all.filter((l) => l.stage === "QUALIFIED").sort(newest), [all]);
  const calls = useMemo(() => {
    const dueLeads = visible.filter((l) => (date ? onDay(l.nextFollowUpAt, date) : dueNow(l.nextFollowUpAt)));
    // Today's tasks are today's; a picked day only has the follow-ups promised on the leads.
    return callRows(dueLeads, date ? [] : tasks, leads);
  }, [visible, date, tasks, leads]);

  // What I did: calls logged and leads judged by me, this week or on the picked day.
  const done = useMemo(() => {
    const mine = activities.filter((a) => a.byId === String(viewer.me.id) && (date ? onDay(a.at, date) : thisWeek(a.at)));
    const count = (action) => mine.filter((a) => a.action === action).length;
    return [
      { label: "Calls logged", value: count("CALL_LOGGED"), tone: "info", icon: <FiPhoneCall /> },
      { label: "Marked genuine", value: mine.filter((a) => a.type === "QUALIFIED").length, tone: "success", icon: <FiUserCheck /> },
      { label: "Not genuine", value: count("REJECT"), tone: "danger", icon: <FiXCircle /> },
      { label: "Meetings set", value: count("MEETING_SCHEDULED"), tone: "violet", icon: <FiCalendar /> },
    ];
  }, [activities, viewer.me.id, date]);

  const inPeriod = (iso) => (date ? true : thisMonth(iso));
  const period = date ? `Added ${longDay(date)}` : "This month";
  const fresh = (id) => leads.find((l) => l.id === id);
  const openCall = (row) => {
    if (row.lead && visible.some((l) => l.id === row.lead.id)) setCalling(row.lead);
    else if (row.leadId || row.lead) navigate(`${LEADS_HOME}/${row.leadId || row.lead.id}`);
  };

  return (
    <>
      <Hello
        sub={
          <>
            You have <strong>{plural(queue.length, "lead")} to verify</strong>, <strong>{plural(calls.length, "call")} due</strong> and{" "}
            <strong>{awaiting.length} awaiting a meeting</strong>
            {date ? ` on ${longDay(date)}` : ""}.
          </>
        }
      >
        <DatePick date={date} onDate={setDate} />
      </Hello>

      {/* `key` replays the numbers when the date changes. */}
      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="New Leads" value={all.filter((l) => l.stage === "NEW").length} icon={<FiInbox />} tone="info" foot={date ? period : "Waiting for a first call"} onClick={() => navigate(`${LEADS_HOME}/all?tab=new`)} />
        <Kpi index={1} label="To Call" value={all.filter((l) => l.stage === "TO_CALL" || l.stage === "NEED_MORE_INFO").length} icon={<FiPhoneCall />} tone="warn" foot={`${plural(calls.length, "follow-up")} due`} onClick={() => navigate(`${LEADS_HOME}/follow-ups`)} />
        <Kpi index={2} label="Qualified" value={all.filter((l) => AFTER_QUALIFY.includes(l.stage) && inPeriod(l.createdAt)).length} icon={<FiUserCheck />} tone="success" foot={period} onClick={() => navigate(`${LEADS_HOME}/all?tab=qualified`)} />
        <Kpi index={3} label="Not Genuine" value={all.filter((l) => l.stage === "NOT_GENUINE" && inPeriod(l.createdAt)).length} icon={<FiXCircle />} tone="danger" foot={period} onClick={() => navigate(`${LEADS_HOME}/all?tab=rejected`)} />
      </div>

      <div className="lm-grid two wide fill lm-row">
        <Card title="Calling Queue" sub={`${plural(queue.length, "lead")} to verify`} index={2} flush className="lm-tight" action={viewAll(`${LEADS_HOME}/all`)}>
          <div style={{ height: 14 }} />
          {!ready ? (
            <SkeletonRows />
          ) : queue.length === 0 ? (
            <Empty title="Queue is clear" text={date ? `No lead added ${longDay(date)} is waiting for a call.` : "Every lead has been called. New ones appear here."} icon={<FiCheckCircle />} />
          ) : (
            <LeadTable leads={queue.slice(0, ROWS)} persona="telecaller" onCall={setCalling} compact />
          )}
        </Card>

        <Card title="Today's Calls" sub={date ? `Follow-ups due ${longDay(date)}` : "Follow-ups due today or earlier"} index={3} flush action={viewAll(`${LEADS_HOME}/follow-ups`)}>
          <div style={{ height: 8 }} />
          {!ready || (!date && !tasks) ? (
            <SkeletonRows rows={3} />
          ) : calls.length === 0 ? (
            <Empty title="No calls due" text={date ? "No follow-up is due on this day." : "Promised calls show up here on their day."} icon={<FiCheckCircle />} />
          ) : (
            <CallList rows={calls.slice(0, ROWS)} onOpen={openCall} />
          )}
        </Card>
      </div>

      <div className="lm-grid two wide fill">
        <Card title="Awaiting a Meeting" sub="Genuine leads with no sales visit yet" index={4} flush>
          <div style={{ height: 8 }} />
          {!ready ? (
            <SkeletonRows rows={3} />
          ) : awaiting.length === 0 ? (
            <Empty title="All scheduled" text="Every genuine lead has a meeting." icon={<FiCalendar />} />
          ) : (
            <div className="lm-agenda">
              {awaiting.slice(0, ROWS).map((l, i) => (
                <div key={l.id} className="lm-slot" style={{ "--i": i, gridTemplateColumns: "1fr auto" }}>
                  <div className="lm-slot-main">
                    <strong>{l.company}</strong>
                    <small>
                      {l.contact} · <FiMapPin /> {l.area} · {compactMoney(l.quote)}
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

        <Card title="My Activity" sub={date ? `On ${longDay(date)}` : "This week"} index={5} flush>
          <Stats items={done} />
        </Card>
      </div>

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
  const { tasks } = useTodayTasks();
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
  // Calls only: today's visits are already under My Meetings.
  const calls = useMemo(() => {
    const dueLeads = visible.filter((l) => (date ? onDay(l.nextFollowUpAt, date) : dueNow(l.nextFollowUpAt)));
    return callRows(dueLeads, date ? [] : tasks, leads);
  }, [visible, date, tasks, leads]);
  // Visited, but no quotation yet - the next thing a sales person owes the customer.
  const toQuote = useMemo(() => visible.filter((l) => l.stage === "VISIT_COMPLETED").sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [visible]);

  const stages = [
    { label: "Awaiting verification", value: mine.filter((l) => QUEUE.includes(l.stage)).length },
    { label: "Meeting scheduled", value: mine.filter((l) => l.stage === "MEETING_SCHEDULED").length },
    { label: "Visit completed", value: mine.filter((l) => l.stage === "VISIT_COMPLETED").length },
    { label: "Quotation sent", value: mine.filter((l) => l.stage === "QUOTATION_SENT").length },
    { label: "Converted", value: mine.filter((l) => l.stage === "WON").length },
  ];
  const wonValue = mine.filter((l) => l.stage === "WON").reduce((s, l) => s + l.quote, 0);

  return (
    <>
      <Hello
        sub={
          <>
            You have <strong>{plural(today.length, "meeting")}</strong> {date ? `on ${longDay(date)}` : "today"}, <strong>{plural(calls.length, "call")} due</strong> and{" "}
            <strong>{toQuote.length} waiting for a quotation</strong>.
          </>
        }
      >
        <DatePick date={date} onDate={setDate} />
        <Button icon={<FiPlus />} onClick={() => setAdding(true)}>
          Add Lead
        </Button>
      </Hello>

      {/* `key` replays the numbers when the date changes. */}
      <div className="lm-grid kpi" key={date}>
        <Kpi index={0} label="My Leads" value={mine.filter((l) => date || thisMonth(l.createdAt)).length} icon={<FiUsers />} tone="info" foot={added || "This month"} onClick={() => navigate(`${LEADS_HOME}/all`)} />
        <Kpi index={1} label={date ? "Meetings" : "Meetings Today"} value={today.length} icon={<FiCalendar />} tone="warn" foot={date ? `On ${longDay(date)}` : `${upcoming.length} upcoming`} onClick={() => navigate(`${LEADS_HOME}/meetings`)} />
        <Kpi index={2} label="Quotations Sent" value={mine.filter((l) => AFTER_QUOTE.includes(l.stage)).length} icon={<FiFileText />} tone="violet" foot={added || "All time"} onClick={() => navigate(`${LEADS_HOME}/all?tab=progress`)} />
        <Kpi index={3} label="Converted" value={mine.filter((l) => l.stage === "WON").length} icon={<FiAward />} tone="success" foot={`${compactMoney(wonValue)} won`} onClick={() => navigate(`${LEADS_HOME}/all?tab=closed`)} />
      </div>

      <div className="lm-grid two fill lm-row">
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
              <Agenda meetings={shown.slice(0, ROWS)} leads={leads} showDay={!date && range === "upcoming"} />
            </div>
          )}
        </Card>

        <Card title="Today's Calls" sub={date ? `Follow-ups due ${longDay(date)}` : "Follow-ups due today or earlier"} index={3} flush action={viewAll(`${LEADS_HOME}/follow-ups`)}>
          <div style={{ height: 8 }} />
          {!ready || (!date && !tasks) ? (
            <SkeletonRows rows={3} />
          ) : calls.length === 0 ? (
            <Empty title="No calls due" text={date ? "No follow-up is due on this day." : "Promised calls show up here on their day."} icon={<FiCheckCircle />} />
          ) : (
            <CallList rows={calls.slice(0, ROWS)} onOpen={(r) => (r.leadId || r.lead) && navigate(`${LEADS_HOME}/${r.leadId || r.lead.id}`)} />
          )}
        </Card>
      </div>

      <div className="lm-grid two fill">
        <Card title="My Pipeline" sub={date ? `Leads added ${longDay(date)}, by stage` : "Leads by stage"} index={4}>
          <Bars data={stages} />
        </Card>

        <Card title="Needs a Quotation" sub="Visits done, no quotation sent yet" index={5} flush>
          <div style={{ height: 8 }} />
          {!ready ? (
            <SkeletonRows rows={3} />
          ) : toQuote.length === 0 ? (
            <Empty title="All quoted" text="Every visited lead has a quotation." icon={<FiFileText />} />
          ) : (
            <div className="lm-agenda">
              {toQuote.slice(0, ROWS).map((l, i) => (
                <button key={l.id} type="button" className="lm-slot" style={{ "--i": i, gridTemplateColumns: "1fr auto" }} onClick={() => navigate(`${LEADS_HOME}/${l.id}`)}>
                  <div className="lm-slot-main">
                    <strong>{l.company}</strong>
                    <small>
                      <FiMapPin /> {l.area} · {l.contact}
                    </small>
                  </div>
                  <Badge tone="violet">{compactMoney(l.quote)}</Badge>
                </button>
              ))}
            </div>
          )}
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
  // The sales person picked here goes along to the page a card opens (?sales=<id>).
  const withMember = (path) => (member ? `${path}${path.includes("?") ? "&" : "?"}sales=${encodeURIComponent(member)}` : path);

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
  const wonValue = scoped.filter((l) => l.stage === "WON").reduce((s, l) => s + l.quote, 0);
  const scope = date ? `on ${longDay(date)}` : PERIODS.find((p) => p.key === period).label.toLowerCase();

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
      <Hello
        sub={
          <>
            Your team has <strong>{plural(total, "verified lead")}</strong>, <strong>{plural(met, "meeting")}</strong> and <strong>{won} converted</strong> - {scope}.
          </>
        }
      />

      {/* The dashboard's filters, in one row: period (or one day) and who. */}
      <div className="lm-toolbar">
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

      {/* `key` replays the numbers and charts when the filter changes. */}
      <div key={`${period}:${date}:${member}`}>
        <div className="lm-grid kpi">
          <Kpi index={0} label="Verified Leads" value={total} icon={<FiInbox />} tone="info" foot={`${awaitingMeeting} awaiting a meeting`} onClick={() => navigate(withMember(`${LEADS_HOME}/all`))} />
          <Kpi index={1} label="Meetings" value={met} icon={<FiCalendar />} tone="warn" foot={`${pct(met, total)}% of leads`} onClick={() => navigate(withMember(`${LEADS_HOME}/meetings`))} />
          <Kpi index={2} label="Quotations" value={quoted} icon={<FiFileText />} tone="violet" foot={`${pct(quoted, total)}% of leads`} onClick={() => navigate(withMember(`${LEADS_HOME}/all?tab=progress`))} />
          <Kpi index={3} label="Converted" value={won} icon={<FiAward />} tone="success" foot={`${pct(won, total)}% · ${compactMoney(wonValue)} won`} onClick={() => navigate(withMember(`${LEADS_HOME}/all?tab=closed`))} />
        </div>

        <div className="lm-grid two wide fill lm-row">
          <Card title="Team Performance" sub="Ranked by conversions - click a name to filter" index={2} flush className="lm-tight">
            <div style={{ height: 14 }} />
            {!ready ? (
              <SkeletonRows rows={4} />
            ) : perPerson.length === 0 ? (
              <Empty title="No sales people yet" text="Sales executives appear here once they have leads." icon={<FiUsers />} />
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
                      <tr key={row.user.id} style={{ "--i": i }} className={member === row.user.id ? "on" : ""} onClick={() => setMember(member === row.user.id ? "" : row.user.id)}>
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

        <div className="lm-grid half fill">
          <Card title="Pipeline" sub="How far verified leads get" index={4}>
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
