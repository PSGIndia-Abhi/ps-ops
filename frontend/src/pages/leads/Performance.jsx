// The performance report (GET /api/crm/reports/sales-performance). Telecallers
// see their own numbers; the sales manager picks anyone on the team and also
// gets the whole team side by side. Sales executives have no performance page.

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiAward, FiCalendar, FiCheckCircle, FiFileText, FiInbox, FiMapPin, FiPhoneCall, FiThumbsDown, FiUserCheck } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { getPerformance, leadTeam, useLeadData } from "./leadsApi";
import { Card, Empty, Kpi, SkeletonRows, Who } from "./ui";
import { useViewer } from "./viewer";

/** A YYYY-MM-DD in the user's own time zone (the server reads the dates as wall-clock days). */
function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const RANGES = [
  { key: "today", label: "Today", from: () => ymd(new Date()) },
  {
    key: "week",
    label: "This week",
    // Weeks start on Monday.
    from: () => {
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return ymd(d);
    },
  },
  { key: "month", label: "This month", from: () => ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) },
  { key: "custom", label: "Custom" },
];

/** The report's numbers, in the order they are shown. */
const METRICS = [
  { key: "leadsGenerated", label: "Leads Added", icon: <FiInbox />, tone: "info", foot: "Created by them" },
  { key: "genuineLeads", label: "Marked Genuine", icon: <FiUserCheck />, tone: "success", foot: "Verified on a call" },
  { key: "followUpsDue", label: "Follow-ups Due", icon: <FiPhoneCall />, tone: "warn", foot: "Calls planned in the period" },
  { key: "meetingsScheduled", label: "Meetings Assigned", icon: <FiCalendar />, tone: "info", foot: "Visits given to them" },
  { key: "visitsCompleted", label: "Visits Completed", icon: <FiMapPin />, tone: "teal", foot: "Outcome recorded" },
  { key: "quotationsSent", label: "Quotations Sent", icon: <FiFileText />, tone: "violet", foot: "Uploaded by them" },
  { key: "leadsConverted", label: "Converted", icon: <FiAward />, tone: "success", foot: "Became customers" },
  { key: "leadsLost", label: "Lost", icon: <FiThumbsDown />, tone: "danger", foot: "Closed without a deal" },
];

const ROLE_LABEL = { telecaller: "Telecaller", sales: "Sales Executive", sales_manager: "Sales Manager", marketing: "Marketing", admin: "Admin" };

export default function Performance() {
  const viewer = useViewer();
  const { me, ready } = useLeadData();
  const manager = viewer.persona === "sales_manager";
  const team = useMemo(() => (ready && manager ? leadTeam() : []), [ready, manager]);

  const [range, setRange] = useState("month");
  const [custom, setCustom] = useState(() => ({ from: RANGES[2].from(), to: ymd(new Date()) }));
  const [personId, setPersonId] = useState(""); // "" = the signed-in person
  // Each answer is kept with the question it answers, so an old one is never shown for a new period.
  const [result, setResult] = useState({ key: null, data: null, error: "" });
  const [teamResult, setTeamResult] = useState({ key: null, rows: null });

  const today = ymd(new Date());
  const from = range === "custom" ? custom.from : RANGES.find((r) => r.key === range).from();
  const to = range === "custom" ? custom.to : today;
  const badCustom = range === "custom" && (!from || !to || to < from);
  const key = `${from}|${to}|${personId}`;
  const teamKey = `${from}|${to}|${team.length}`;

  // One person's numbers.
  useEffect(() => {
    if (!ready || badCustom) return undefined;
    let alive = true;
    getPerformance({ from, to, employeeId: personId || undefined })
      .then((data) => alive && setResult({ key, data, error: "" }))
      .catch((err) => alive && setResult({ key, data: null, error: err.message || "Could not load the report." }));
    return () => {
      alive = false;
    };
  }, [ready, badCustom, from, to, personId, key]);

  // The manager's side-by-side view: one report per person, read together.
  useEffect(() => {
    if (!manager || team.length === 0 || badCustom) return undefined;
    let alive = true;
    Promise.allSettled(team.map((u) => getPerformance({ from, to, employeeId: u.id }))).then((results) => {
      if (alive) setTeamResult({ key: teamKey, rows: team.map((u, i) => ({ user: u, data: results[i].status === "fulfilled" ? results[i].value : null })) });
    });
    return () => {
      alive = false;
    };
  }, [manager, team, badCustom, from, to, teamKey]);

  // Not for a lead provider, and not for a sales executive (their menu has no performance page).
  if (viewer.persona === "lead_provider" || viewer.persona === "sales") return <Navigate to={LEADS_HOME} replace />;

  const current = result.key === key ? result : null;
  const report = current?.data;
  const error = current?.error;
  const teamRows = teamResult.key === teamKey ? teamResult.rows : null;
  const period = { from, to };
  const whose = personId ? team.find((u) => u.id === personId)?.name || "Team member" : me?.name || "You";

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>{manager ? "Team Report" : "My Performance"}</h1>
          <p>{manager ? "What each person on the lead team did in the period." : "What you did in the period - calls, visits, quotations and conversions."}</p>
        </div>
        <div className="lm-head-actions">
          <div className="lm-seg">
            {RANGES.map((r) => (
              <button key={r.key} type="button" className={r.key === range ? "on" : ""} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          {manager && (
            <select className="lm-select" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Whose numbers">
              <option value="">Me</option>
              {team
                .filter((u) => u.id !== String(me?.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {range === "custom" && (
        <div className="lm-head-actions" style={{ marginBottom: 16 }}>
          <label className="lm-check">
            From
            <input className="lm-input" type="date" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </label>
          <label className="lm-check">
            To
            <input className="lm-input" type="date" value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </label>
          {badCustom && <span className="muted">Choose a start date on or before the end date.</span>}
        </div>
      )}

      <Card title={whose} sub={period.from === period.to ? period.from : `${period.from} to ${period.to}`} index={0}>
        {error ? (
          <Empty title="Could not load the report" text={error} icon={<FiCheckCircle />} />
        ) : !report || badCustom ? (
          <SkeletonRows rows={2} />
        ) : (
          // `key` replays the numbers when the period or person changes.
          <div className="lm-grid kpi" key={`${period.from}:${period.to}:${personId}`} style={{ marginBottom: 0 }}>
            {METRICS.map((m, i) => (
              <Kpi key={m.key} index={i} label={m.label} value={report[m.key] || 0} icon={m.icon} tone={m.tone} foot={m.foot} />
            ))}
          </div>
        )}
      </Card>

      {manager && (
        <Card title="Whole Team" sub="Click a person to see their numbers above" index={1} flush className="lm-detail">
          <div style={{ height: 14 }} />
          {!teamRows ? (
            <SkeletonRows rows={4} />
          ) : teamRows.length === 0 ? (
            <Empty title="No one on the lead team yet" />
          ) : (
            <div className="lm-table-wrap">
              <table className="lm-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Added</th>
                    <th>Genuine</th>
                    <th>Meetings</th>
                    <th>Visits</th>
                    <th>Quotes</th>
                    <th>Converted</th>
                    <th>Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map(({ user, data }, i) => (
                    <tr key={user.id} style={{ "--i": i }} onClick={() => setPersonId(user.id === String(me?.id) ? "" : user.id)}>
                      <td>
                        <Who name={user.name} sub={ROLE_LABEL[user.role] || user.role || ""} size={34} />
                      </td>
                      {data ? (
                        ["leadsGenerated", "genuineLeads", "meetingsScheduled", "visitsCompleted", "quotationsSent", "leadsConverted", "leadsLost"].map((k) => (
                          <td key={k} className="num">
                            {data[k]}
                          </td>
                        ))
                      ) : (
                        <td colSpan={7} className="muted">
                          Could not load
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
