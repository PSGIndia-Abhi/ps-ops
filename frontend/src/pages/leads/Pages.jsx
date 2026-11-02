// The smaller Lead Management pages: the provider's submit form, follow-ups,
// meetings and the provider list.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiCalendar, FiCheckCircle, FiChevronRight, FiClock, FiExternalLink, FiPause, FiPhoneCall, FiPlay, FiPlus, FiShield } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { CallVerifyModal, FollowUpCallModal, FollowUpModal, LeadForm, ScheduleMeetingModal } from "./dialogs";
import { Agenda } from "./Home";
import { request, useLeadData, userName } from "./leadsApi";
import { compactMoney, dateTime, dayLabel, isPast, isToday, timeLabel } from "./format";
import { useLoaded, useToast } from "./hooks";
import { Badge, Button, Card, Done, Empty, Field, Modal, SkeletonRows, StageBadge, Tabs, Who } from "./ui";
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
  const toast = useToast();
  const { leads, activities } = useLeadData();
  // Your own follow-ups on commercial leads - the sales manager too (residential follow-up calls are
  // in the Residential area). An admin looking in sees everyone's, with a filter by person.
  const team = viewer.canPick;
  const myId = String(viewer.me.id || "");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("today");
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState("");
  const [calling, setCalling] = useState(null);
  const [scheduling, setScheduling] = useState(null);

  const load = useCallback(() => {
    request(`/api/crm/follow-ups?done=1&lead_type=commercial${team ? "&scope=team" : ""}`)
      .then((list) => {
        setRows(Array.isArray(list) ? list : []);
        setError("");
      })
      .catch((err) => {
        setRows((cur) => cur || []);
        setError(err.message || "Could not load the follow-ups.");
      });
  }, [team]);
  // Read again whenever the leads change (a call logged or a follow-up added from a dialog here).
  useEffect(load, [load, leads]);

  const local = localDay();
  const people = useMemo(() => {
    const seen = new Map();
    for (const f of rows || []) if (f.assigned_to && !seen.has(String(f.assigned_to))) seen.set(String(f.assigned_to), f.assigned_to_name || "");
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const picked = (rows || []).filter((f) => !person || String(f.assigned_to) === person);
  const open = picked.filter((f) => f.status !== "COMPLETED");
  const groups = {
    overdue: open.filter((f) => f.due_date && f.due_date < local),
    today: open.filter((f) => !f.due_date || f.due_date === local),
    upcoming: open.filter((f) => f.due_date && f.due_date > local),
    done: picked.filter((f) => f.status === "COMPLETED").reverse(),
  };
  const shown = groups[tab];
  const fresh = (id) => leads.find((l) => l.id === id);
  const leadLink = (f) => (f.lead_type === "commercial" ? `${LEADS_HOME}/${f.lead_id}` : `${LEADS_HOME}/residential/${f.lead_id}`);

  // The same steps as a task in Task Management: Start, then Done (Resume first when paused).
  async function step(f) {
    const action = f.status === "OPEN" ? "start" : f.status === "PAUSED" ? "resume" : "complete";
    setBusy(f.id);
    try {
      await followUpStep(f.id, action);
      toast({ start: "Follow-up started", resume: "Follow-up resumed", complete: "Follow-up done" }[action]);
      load();
    } catch (err) {
      toast(err.message || "Could not update the follow-up.", true);
    } finally {
      setBusy("");
    }
  }

  return (
    <Only personas={["telecaller", "sales", "sales_manager"]}>
      <div className="lm-head">
        <div>
          <h1>Follow-ups</h1>
          <p>{team ? "Your team's follow-ups, in the order they fall due." : "Calls promised to customers, in the order they fall due."}</p>
        </div>
        {team && people.length > 1 && (
          <select className="lm-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Whose follow-ups" style={{ minWidth: 200 }}>
            <option value="">Whole team</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {id === myId ? "Me" : name}
              </option>
            ))}
          </select>
        )}
      </div>

      <Card flush>
        <Tabs
          tabs={[
            { key: "overdue", label: "Overdue", count: groups.overdue.length },
            { key: "today", label: "Today", count: groups.today.length },
            { key: "upcoming", label: "Upcoming", count: groups.upcoming.length },
            { key: "done", label: "Done (7 days)", count: groups.done.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        {rows === null ? (
          <SkeletonRows />
        ) : error && rows.length === 0 ? (
          <Empty title="Could not load the follow-ups" text={error} />
        ) : shown.length === 0 ? (
          <Empty
            title={{ overdue: "Nothing overdue", today: "Nothing due today", upcoming: "No upcoming follow-ups", done: "Nothing done in the last 7 days" }[tab]}
            text="Add a follow-up from a lead and it shows here - it rings on the phone at its time."
            icon={<FiCheckCircle />}
          />
        ) : (
          <div className="lm-agenda" key={tab}>
            {shown.map((f, i) => {
              const lead = f.lead_type === "commercial" ? fresh(f.lead_id) : null;
              const mine = String(f.assigned_to) === myId;
              const done = f.status === "COMPLETED";
              return (
                <div key={f.id} className="lm-slot" style={{ "--i": i }}>
                  <div className="lm-slot-time">
                    {done ? "Done" : clockText(f.due_time)}
                    <small>{done ? shortDay(String(f.completed_at || "").slice(0, 10)) : f.due_date === local ? "Today" : shortDay(f.due_date)}</small>
                  </div>
                  <div className="lm-slot-main">
                    <Link to={leadLink(f)}>
                      <strong>{f.company_name || f.customer_name}</strong>
                    </Link>
                    <small>
                      {[f.lead_type === "commercial" ? f.lead_number : "Residential", f.phone, team ? (mine ? "for me" : `for ${f.assigned_to_name}`) : null].filter(Boolean).join(" · ")}
                    </small>
                    {!!f.description && <small>{f.description}</small>}
                    {lead && followUpCount(activities, lead.id) > 0 && (
                      <Link className="lm-fu-link" to={`${LEADS_HOME}/follow-ups/lead/${lead.id}`}>
                        {followUpCount(activities, lead.id)} follow-up{followUpCount(activities, lead.id) === 1 ? "" : "s"} so far <FiChevronRight />
                      </Link>
                    )}
                  </div>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {!done && <Badge tone={{ overdue: "danger", today: "warn" }[tab] || "info"}>{{ overdue: "Overdue", today: "Due today" }[tab] || "Scheduled"}</Badge>}
                    {!done && f.status !== "OPEN" && <Badge tone={WORK_STATUS[f.status]?.tone || "neutral"}>{WORK_STATUS[f.status]?.label || f.status}</Badge>}
                    {!done && lead && (
                      <Button size="sm" icon={<FiPhoneCall />} onClick={() => setCalling(lead)}>
                        {VERIFYING.includes(lead.stage) ? "Call & Verify" : "Call"}
                      </Button>
                    )}
                    {!done && !lead && !!f.phone && (
                      <a className="lm-btn primary sm" href={`tel:${f.phone}`}>
                        <FiPhoneCall /> Call
                      </a>
                    )}
                    {!done && mine && (
                      <Button
                        size="sm"
                        variant={f.status === "IN_PROGRESS" ? "primary" : "ghost"}
                        icon={f.status === "IN_PROGRESS" ? <FiCheckCircle /> : <FiPlay />}
                        busy={busy === f.id}
                        onClick={() => step(f)}
                      >
                        {f.status === "IN_PROGRESS" ? "Done" : f.status === "PAUSED" ? "Resume" : "Start"}
                      </Button>
                    )}
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

/** Today as "YYYY-MM-DD" in this browser's time zone. */
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const clockText = (t) => {
  if (!t) return "Any time";
  const [h, m] = String(t).split(":").map(Number);
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const shortDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

/* ------------------------------------------------------------ one lead's follow-ups */

// A follow-up history note reads "Due 14 Oct, 4:16 pm: what to cover" (the note part is optional).
const DUE_NOTE = /^Due (.+?)(?:: ([\s\S]*))?$/;

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "PAUSED"];
const WORK_STATUS = {
  OPEN: { label: "Open", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  PAUSED: { label: "Paused", tone: "warn" },
};

/** Start / pause / resume / complete a follow-up - it is a work task, so Task Management's own endpoints. */
function followUpStep(taskId, action, body = {}) {
  return request(`/api/work-tasks/${taskId}/${action}`, { method: "POST", body });
}

/** Time worked on a follow-up: start -> now (or -> the pause / completion), minus earlier pauses. */
function workedMs(t) {
  if (!t.started_at) return 0;
  const end = t.status === "PAUSED" && t.paused_at ? new Date(t.paused_at).getTime() : t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
  return Math.max(0, end - new Date(t.started_at).getTime() - (Number(t.paused_seconds) || 0) * 1000);
}
function workedText(ms) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}
const dueText = (t) => [shortDay(t.due_date), t.due_time ? clockText(t.due_time) : ""].filter(Boolean).join(", ");

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
      .filter((t) => t.started_at)
      .map((t) => ({ id: `start-${t.id}`, kind: "start", at: t.started_at, due: dueText(t), note: "", by: userName(String(t.started_by || t.assigned_to)) })),
    ...tasks
      .filter((t) => t.status === "COMPLETED" && t.completed_at)
      .map((t) => ({
        id: `done-${t.id}`,
        kind: "done",
        at: t.completed_at,
        due: dueText(t),
        note: t.completion_note || "",
        by: userName(String(t.completed_by)),
        worked: t.started_at ? workedText(workedMs(t)) : "",
      })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  // A lead can have several follow-ups open at once: each time set is Current while a follow-up is
  // still open at that time, Done once that one was done, else it was Moved (Closed: none open).
  const key = (t) => `${t.due_date || ""} ${t.due_time ? String(t.due_time).slice(0, 5) : ""}`;
  const openKeys = new Set(tasks.filter((t) => OPEN_STATUSES.includes(t.status)).map(key));
  const doneKeys = new Set(tasks.filter((t) => t.status === "COMPLETED").map(key));
  for (const e of events) {
    if (e.kind !== "set") continue;
    const k = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(e.due);
    const at = k ? `${k[1]} ${k[2] || ""}` : null;
    e.status = at && openKeys.has(at) ? "current" : at && doneKeys.has(at) ? "done" : openKeys.size ? "moved" : "closed";
  }
  return events.reverse();
}

export function LeadFollowUps() {
  const { id } = useParams();
  const navigate = useNavigate();
  const viewer = useViewer();
  const { leads, activities } = useLeadData();
  const ready = useLoaded();
  const toast = useToast();
  const [tasks, setTasks] = useState(null); // the lead's follow-up tasks, open and done
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState("");
  const [pausing, setPausing] = useState(null); // the follow-up being paused (asks for a reason)
  const [editing, setEditing] = useState(null); // the follow-up being changed (date, time, note)
  const [, setTick] = useState(0);
  const lead = visibleLeads(leads, viewer).find((l) => l.id === id);
  const myId = String(viewer.me.id || "");

  const loadTasks = useCallback(
    () =>
      request(`/api/work-tasks?source_id=${encodeURIComponent(id)}&task_type=LEAD_FOLLOW_UP`)
        .then((rows) => setTasks(Array.isArray(rows) ? rows : []))
        .catch(() => setTasks((cur) => cur || [])),
    [id]
  );
  // Read again whenever the workspace reloads, so a call saved here shows straight away.
  useEffect(() => {
    loadTasks();
  }, [loadTasks, activities]);

  const openTasks = useMemo(
    () => (tasks || []).filter((t) => OPEN_STATUSES.includes(t.status)).sort((a, b) => `${a.due_date} ${a.due_time || "99"}`.localeCompare(`${b.due_date} ${b.due_time || "99"}`)),
    [tasks]
  );
  // While one is running its "Worked" time moves on.
  const running = openTasks.some((t) => t.status === "IN_PROGRESS");
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, [running]);

  async function work(t, action, body) {
    setBusy(t.id);
    try {
      await followUpStep(t.id, action, body);
      toast({ start: "Follow-up started", pause: "Follow-up paused", resume: "Follow-up resumed", complete: "Follow-up done" }[action]);
      await loadTasks();
      return true;
    } catch (err) {
      toast(err.message || "Could not update the follow-up.", true);
      return false;
    } finally {
      setBusy("");
    }
  }

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
  const next = openTasks[0] || null;
  const later = openTasks.slice(1);
  const late = (t) => !!t.due_date && new Date(`${t.due_date}T${String(t.due_time || "23:59").slice(0, 5)}`) < new Date();

  /** Start, then Pause / Completed, or Resume - the same steps as a task in Task Management. */
  const stepButtons = (t, size) => (
    <>
      {t.status === "OPEN" && (
        <Button size={size} icon={<FiPlay />} busy={busy === t.id} onClick={() => work(t, "start")}>
          Start
        </Button>
      )}
      {t.status === "IN_PROGRESS" && (
        <>
          <Button size={size} variant="ghost" icon={<FiPause />} disabled={!!busy} onClick={() => setPausing(t)}>
            Pause
          </Button>
          <Button size={size} icon={<FiCheckCircle />} busy={busy === t.id} onClick={() => work(t, "complete")}>
            Completed
          </Button>
        </>
      )}
      {t.status === "PAUSED" && (
        <Button size={size} icon={<FiPlay />} busy={busy === t.id} onClick={() => work(t, "resume")}>
          Resume
        </Button>
      )}
    </>
  );
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
            <div className="lm-fu-main">
            {later.length > 0 && (
              <Card flush title="Later follow-ups" sub={`${later.length} more planned on this lead`} index={0}>
                <ul className="lm-fu-open">
                  {later.map((t) => {
                    const mine = String(t.assigned_to) === myId;
                    const status = WORK_STATUS[t.status] || { label: t.status, tone: "neutral" };
                    return (
                      <li key={t.id}>
                        <div className="lm-fu-open-main">
                          <strong>{dueText(t) || "Any day"}</strong>
                          {!!t.description && <p className="lm-fu-note">{t.description}</p>}
                          <div className="lm-fu-open-meta">
                            <Badge tone={status.tone}>{status.label}</Badge>
                            {!!t.started_at && <small>Worked {workedText(workedMs(t))}</small>}
                            {!mine && !!t.assigned_to_name && <small>For {t.assigned_to_name}</small>}
                          </div>
                        </div>
                        {mine && (
                          <div className="lm-fu-open-acts">
                            {stepButtons(t, "sm")}
                            <Button size="sm" variant="ghost" icon={<FiCalendar />} disabled={!!busy} onClick={() => setEditing(t)}>
                              Change
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
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
                        <span className="lm-fu-dot">{e.kind === "done" ? <FiCheckCircle /> : e.kind === "start" ? <FiPlay /> : <FiClock />}</span>
                        <div className="lm-fu-body">
                          <div className="lm-fu-top">
                            <strong>{e.kind === "done" ? "Follow-up done" : e.kind === "start" ? "Follow-up started" : `Call due ${e.due || "-"}`}</strong>
                            {status && <Badge tone={status.tone}>{status.label}</Badge>}
                          </div>
                          {e.kind !== "set" && !!e.due && <small>Due {e.due}</small>}
                          {!!e.note && <p className="lm-fu-note">{e.note}</p>}
                          {!!e.worked && <small>Worked {e.worked}</small>}
                          <small>
                            {e.kind === "done" ? "Marked done" : e.kind === "start" ? "Started" : "Set"} {dateTime(e.at)}
                            {e.by ? ` by ${e.by}` : ""}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
            </div>

            <div className="lm-fu-side">
              <Card title="Next follow-up" index={1}>
                {next ? (
                  <div className="lm-fu-next">
                    <strong>{next.due_time ? clockText(next.due_time) : "Any time"}</strong>
                    <span>{next.due_date === localDay() ? "Today" : shortDay(next.due_date)}</span>
                    {!!next.description && <p className="lm-fu-note">{next.description}</p>}
                    <div className="lm-fu-open-meta">
                      <Badge tone={(WORK_STATUS[next.status] || {}).tone || "neutral"}>{(WORK_STATUS[next.status] || {}).label || next.status}</Badge>
                      {late(next) && <Badge tone="danger">Overdue</Badge>}
                      {!!next.started_at && <small>Worked {workedText(workedMs(next))}</small>}
                      {String(next.assigned_to) !== myId && !!next.assigned_to_name && <small>For {next.assigned_to_name}</small>}
                    </div>
                  </div>
                ) : due ? (
                  <div className="lm-fu-next">
                    <strong>{timeLabel(due)}</strong>
                    <span>{dayLabel(due)}</span>
                    <Badge tone={isPast(due) ? "danger" : isToday(due) ? "warn" : "info"}>{isPast(due) ? "Overdue" : isToday(due) ? "Due today" : "Scheduled"}</Badge>
                  </div>
                ) : (
                  <p className="lm-fu-none">No follow-up is open on this lead.</p>
                )}
                {!!next && String(next.assigned_to) === myId && <div className="lm-fu-actions">{stepButtons(next)}</div>}
                <div className="lm-fu-actions">
                  <Button variant={next ? "ghost" : "primary"} icon={<FiPhoneCall />} onClick={() => setDialog("call")}>
                    {VERIFYING.includes(lead.stage) ? "Call & Verify" : "Call"}
                  </Button>
                  {next && String(next.assigned_to) === myId ? (
                    <Button variant="ghost" icon={<FiCalendar />} onClick={() => setEditing(next)}>
                      Change
                    </Button>
                  ) : (
                    !next && (
                      <Button variant="ghost" icon={<FiCalendar />} onClick={() => setDialog("followup")}>
                        {due ? "Change Time" : "Add Follow-up"}
                      </Button>
                    )
                  )}
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
          {editing && (
            <FollowUpModal
              lead={lead}
              task={editing}
              onClose={() => {
                setEditing(null);
                loadTasks();
              }}
            />
          )}
          {pausing && <PauseFollowUpModal task={pausing} onPause={(reason) => work(pausing, "pause", { reason })} onClose={() => setPausing(null)} />}
        </>
      )}
    </Only>
  );
}

/** Pause a running follow-up: the timer stops until it is resumed; a reason is required (as for a task). */
function PauseFollowUpModal({ task, onPause, onClose }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(close) {
    if (busy || !reason.trim()) return;
    setBusy(true);
    if (await onPause(reason.trim())) close();
    else setBusy(false);
  }
  return (
    <Modal
      title="Pause Follow-up"
      sub={`Due ${dueText(task) || "-"} - the timer stops until you resume; the due date does not change`}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Back
          </Button>
          <Button busy={busy} disabled={!reason.trim()} icon={<FiPause />} onClick={() => save(close)}>
            Pause
          </Button>
        </>
      )}
    >
      <Field label="Reason" required>
        <textarea className="lm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Customer asked to call after lunch." />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------ meetings */

export function Meetings() {
  const viewer = useViewer();
  const { leads, meetings } = useLeadData();
  const ready = useLoaded();
  const [tab, setTab] = useState("today");
  // One sales person's meetings, when opened from the sales manager's dashboard with a person picked.
  const [params, setParams] = useSearchParams();
  const salesPerson = params.get("sales") || "";

  const mine = useMemo(
    () =>
      visibleMeetings(meetings, viewer)
        .filter((m) => !salesPerson || String(m.salesId) === salesPerson)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
    [meetings, viewer, salesPerson],
  );
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
          <p>
            {salesPerson
              ? `${userName(salesPerson) || "This sales person"}'s sales meetings and site visits.`
              : everyone
                ? "Sales meetings and site visits across the team."
                : "Your sales meetings and site visits."}
          </p>
        </div>
        {salesPerson && (
          <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
            Show everyone
          </Button>
        )}
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
