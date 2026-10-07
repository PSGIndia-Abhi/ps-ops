// The smaller Lead Management pages: the provider's submit form, follow-ups,
// meetings and the provider list.

import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { FiCalendar, FiCheckCircle, FiEdit2, FiPhoneCall, FiPlus, FiShield } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { CallVerifyModal, LeadForm, ProviderModal, ScheduleMeetingModal } from "./dialogs";
import { Agenda } from "./Home";
import { setProviderActive, useLeadData } from "./leadsApi";
import { compactMoney, dayLabel, isPast, isToday, timeLabel } from "./format";
import { useLoaded, useToast } from "./hooks";
import { Badge, Button, Card, Done, Empty, SkeletonRows, Tabs, Who } from "./ui";
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
              ["Outcome", "You see whether it converted, with feedback, in My Leads."],
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

export function FollowUps() {
  const viewer = useViewer();
  const { leads } = useLeadData();
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
    <Only personas={["telecaller", "sales_manager"]}>
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
                  </div>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Badge tone={overdue ? "danger" : tab === "due" ? "warn" : "info"}>{overdue ? "Overdue" : tab === "due" ? "Due today" : "Scheduled"}</Badge>
                    <Button size="sm" icon={<FiPhoneCall />} onClick={() => setCalling(l)}>
                      Call
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {calling && <CallVerifyModal lead={fresh(calling.id) || calling} onClose={() => setCalling(null)} onScheduleMeeting={setScheduling} />}
      {scheduling && <ScheduleMeetingModal lead={fresh(scheduling.id) || scheduling} onClose={() => setScheduling(null)} />}
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
            <Agenda meetings={groups[tab]} leads={leads} showOwner={everyone} showDay={tab !== "today"} />
          </div>
        )}
      </Card>
    </Only>
  );
}

/* ------------------------------------------------------------ providers */

export function Providers() {
  const toast = useToast();
  const { providers, leads } = useLeadData();
  const ready = useLoaded();
  const [editing, setEditing] = useState(null); // null | "new" | provider
  const [busyId, setBusyId] = useState(null);

  async function toggle(provider) {
    setBusyId(provider.id);
    try {
      await setProviderActive(provider.id, !provider.active);
      toast(provider.active ? `${provider.name} can no longer sign in` : `${provider.name} can sign in again`);
    } catch (err) {
      toast(err.message || "Could not update the provider.", true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Only personas={["sales_manager"]}>
      <div className="lm-head">
        <div>
          <h1>Lead Providers</h1>
          <p>External partners who submit commercial leads through the restricted portal.</p>
        </div>
        <div className="lm-head-actions">
          <Button icon={<FiPlus />} onClick={() => setEditing("new")}>
            Add Provider
          </Button>
        </div>
      </div>

      <Card flush>
        {!ready ? (
          <SkeletonRows rows={3} />
        ) : providers.length === 0 ? (
          <Empty title="No providers yet" text="Add a provider to give them a login." />
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
                  <th aria-label="Actions" />
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
                      <td>
                        <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <Button size="sm" variant="ghost" icon={<FiEdit2 />} onClick={() => setEditing(p)}>
                            Edit
                          </Button>
                          <Button size="sm" variant={p.active ? "danger" : "ghost"} busy={busyId === p.id} onClick={() => toggle(p)}>
                            {p.active ? "Disable" : "Enable"}
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <ProviderModal provider={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Only>
  );
}
