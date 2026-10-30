// The performance report (GET /api/crm/reports/sales-performance). Telecallers and sales
// executives see their own numbers (and the executive their monthly target); the sales manager
// picks anyone on the team, sets each person's monthly target and gets the whole team side by side.

import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FiAward, FiBarChart2, FiCalendar, FiCheckCircle, FiChevronDown, FiFileText, FiInbox, FiMapPin, FiPhoneCall, FiThumbsDown, FiUserCheck } from "react-icons/fi";
import { LEADS_HOME, ROLE_ALIASES } from "./access";
import { getPerformance, getPerformanceItems, getTargetHistory, getTargets, leadTeam, setTarget, useLeadData } from "./leadsApi";
import { money } from "./format";
import { useToast } from "./hooks";
import { Button, Card, Empty, Kpi, Modal, Note, SkeletonRows, StageBadge, Who } from "./ui";
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
  // Everything so far: from before the first lead was ever added.
  { key: "lifetime", label: "Lifetime", from: () => "2020-01-01" },
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
  const [opened, setOpened] = useState(null); // the card whose records are showing

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

  // Not for a lead provider.
  if (viewer.persona === "lead_provider") return <Navigate to={LEADS_HOME} replace />;

  const current = result.key === key ? result : null;
  const report = current?.data;
  const error = current?.error;
  const teamRows = teamResult.key === teamKey ? teamResult.rows : null;
  const period = { from, to };
  const whose = personId ? team.find((u) => u.id === personId)?.name || "Team member" : me?.name || "You";
  // The achievement card is for sales people (they have targets), not telecallers.
  const rawRole = personId ? team.find((u) => u.id === personId)?.role : viewer.persona;
  const whoseRole = ROLE_ALIASES[rawRole] || rawRole; // "Sales Executive" -> "sales"
  const showAchievement = whoseRole === "sales" || whoseRole === "sales_manager";
  const periodText = range === "lifetime" ? "All time" : period.from === period.to ? period.from : `${period.from} to ${period.to}`;

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

      {(manager || viewer.persona === "sales") && <Targets manager={manager} myId={String(me?.id || "")} />}

      {showAchievement && <Achievement userId={personId || undefined} whose={whose} />}

      <Card title={whose} sub={`${periodText} - click a number to see what is behind it`} index={0}>
        {error ? (
          <Empty title="Could not load the report" text={error} icon={<FiCheckCircle />} />
        ) : !report || badCustom ? (
          <SkeletonRows rows={2} />
        ) : (
          // `key` replays the numbers when the period or person changes.
          <div className="lm-grid kpi" key={`${period.from}:${period.to}:${personId}`} style={{ marginBottom: 0 }}>
            {METRICS.map((m, i) => (
              <Kpi key={m.key} index={i} label={m.label} value={report[m.key] || 0} icon={m.icon} tone={m.tone} foot={m.foot} onClick={() => setOpened(m)} />
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

      {opened && (
        <ReportItems metric={opened} from={from} to={to} employeeId={personId || undefined} whose={whose} periodText={periodText} onClose={() => setOpened(null)} />
      )}
    </>
  );
}

/** "17 Oct, 11:00 AM" (or "17 Oct" for a follow-up's day), with the year only when it is not this year. */
function whenText(iso, dayOnly) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts = { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) };
  const day = d.toLocaleDateString("en-IN", opts);
  return dayOnly ? day : `${day}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

/** The records behind one number (a clicked card): the leads, meetings, quotations or follow-ups. */
function ReportItems({ metric, from, to, employeeId, whose, periodText, onClose }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ items: null, error: "" });
  useEffect(() => {
    let alive = true;
    getPerformanceItems({ metric: metric.key, from, to, employeeId })
      .then((items) => alive && setState({ items, error: "" }))
      .catch((err) => alive && setState({ items: [], error: err.message || "Could not load the list." }));
    return () => {
      alive = false;
    };
  }, [metric.key, from, to, employeeId]);
  const { items, error } = state;
  return (
    <Modal wide title={metric.label} sub={`${whose} - ${periodText}${items ? ` - ${items.length} ${items.length === 1 ? "record" : "records"}` : ""}`} onClose={onClose}>
      {error && <Note tone="warn">{error}</Note>}
      {!items ? (
        <SkeletonRows rows={4} />
      ) : items.length === 0 ? (
        !error && <Empty title="Nothing here" text="No records for this period." icon={metric.icon} />
      ) : (
        <div className="lm-report-items">
          {items.map((it, i) => (
            <button key={`${it.lead_id}-${it.at}-${i}`} type="button" className="lm-report-item" onClick={() => navigate(`/leads/${it.lead_id}`)}>
              <span className="lm-report-item-main">
                <strong>{it.company || it.contact || "Lead"}</strong>
                <small>{[it.detail, whenText(it.at, metric.key === "followUpsDue")].filter(Boolean).join("  ·  ")}</small>
              </span>
              <span className="lm-report-item-side">
                {it.amount !== null && it.amount !== undefined && <b>{money(it.amount)}</b>}
                <span className="lm-report-item-meta">
                  {!!it.lead_number && <small>{it.lead_number}</small>}
                  {!!it.stage && <StageBadge stage={it.stage === "CONVERTED" ? "WON" : it.stage === "CANCELLED" ? "LOST" : it.stage} />}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });

/** ₹27.6K, ₹1.2L - short enough to sit on a bar. */
function compactINR(n) {
  const trim = (v) => String(Math.round(v * 10) / 10).replace(/\.0$/, "");
  if (n >= 10000000) return `₹${trim(n / 10000000)}Cr`;
  if (n >= 100000) return `₹${trim(n / 100000)}L`;
  if (n >= 1000) return `₹${trim(n / 1000)}K`;
  return `₹${Math.round(n)}`;
}

/**
 * One sales person's achievement beyond this month: last month against its target, everything they
 * have converted so far, and the last six months as bars - the amount on each bar, that month's
 * target as a dashed line. Achieved = what their converted leads are worth: the deal (closure)
 * amount entered at conversion.
 */
function Achievement({ userId, whose }) {
  const [state, setState] = useState({ key: null, data: null, error: "" });
  const [open, setOpen] = useState(false); // closed to start with: the header gives the headline numbers
  const key = userId || "me";
  useEffect(() => {
    let alive = true;
    getTargetHistory(userId)
      .then((data) => alive && setState({ key, data, error: "" }))
      .catch((err) => alive && setState({ key, data: null, error: err.message || "Could not load the achievement." }));
    return () => {
      alive = false;
    };
  }, [userId, key]);
  const current = state.key === key ? state : null;
  const data = current?.data;
  const months = data?.months || [];
  const last = months.length >= 2 ? months[months.length - 2] : null;
  const lastPct = last?.target ? Math.round((last.achieved / last.target) * 100) : null;
  const top = Math.max(1, ...months.map((m) => Math.max(m.achieved, m.target || 0)));
  const pctOfTop = (v) => `${(v / top) * 100}%`;
  return (
    <Card index={1} className="lm-achieve-card">
      <button type="button" className={`lm-achieve-toggle${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="lm-achieve-toggle-icon">
          <FiBarChart2 />
        </span>
        <span className="lm-achieve-toggle-text">
          <strong>Achievement</strong>
          <small>
            {data ? (
              <>
                Lifetime <b>{money(data.lifetime.achieved)}</b> - Last month <b>{money(last?.achieved || 0)}</b> - {whose}
              </>
            ) : (
              `${whose} - last month, lifetime and the last six months`
            )}
          </small>
        </span>
        <span className="lm-achieve-toggle-chevron">
          <FiChevronDown />
        </span>
      </button>
      {!open ? null : current?.error ? (
        <Note tone="warn">{current.error}</Note>
      ) : !data ? (
        <SkeletonRows rows={2} />
      ) : (
        <div className="lm-achieve">
          <div className="lm-achieve-stats">
            <div>
              <small>Last month{last ? ` (${shortMonth(last.month)})` : ""}</small>
              <strong>{money(last?.achieved || 0)}</strong>
              <span>{last?.target ? `of ${money(last.target)} - ${lastPct}%` : "No target set"}</span>
              <span>{last?.converted || 0} converted</span>
            </div>
            <div>
              <small>Lifetime</small>
              <strong>{money(data.lifetime.achieved)}</strong>
              <span>{data.lifetime.converted} converted</span>
              {!!data.lifetime.since && (
                <span>since {new Date(data.lifetime.since).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
              )}
            </div>
          </div>
          <div className="lm-achieve-head">
            <b>Last 6 months</b>
            <span className="lm-achieve-key">
              <i className="bar" /> Achieved <i className="dash" /> Target
            </span>
          </div>
          <div className="lm-achieve-chart">
            {months.map((m, i) => {
              const now = i === months.length - 1;
              const hit = !!m.target && m.achieved >= m.target;
              // The target's amount is left out when it would sit on the bar's own amount.
              const showTargetText = !!m.target && Math.abs(m.target - m.achieved) / top > 0.22;
              return (
                <div
                  key={m.month}
                  className={`lm-achieve-col${now ? " now" : ""}${hit ? " hit" : ""}`}
                  title={`${shortMonth(m.month)}: ${money(m.achieved)}${m.target ? ` of ${money(m.target)} target` : ""} - ${m.converted} converted`}
                >
                  <div className="lm-achieve-area">
                    {m.achieved > 0 ? (
                      <span className="lm-achieve-bar" style={{ height: pctOfTop(m.achieved) }}>
                        <em>{compactINR(m.achieved)}</em>
                      </span>
                    ) : (
                      <span className="lm-achieve-none">-</span>
                    )}
                    {!!m.target && (
                      <span className="lm-achieve-target" style={{ bottom: pctOfTop(m.target) }}>
                        {showTargetText && <em>{compactINR(m.target)}</em>}
                      </span>
                    )}
                  </div>
                  <small>{shortMonth(m.month)}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

const thisMonth = () => ymd(new Date()).slice(0, 7);
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const pctOf = (t) => (t.target ? Math.round((Number(t.achieved) / Number(t.target)) * 100) : null);

/** Achieved against target: a bar that turns green at 100%. */
function TargetBar({ t }) {
  const pct = pctOf(t);
  if (pct === null) return <span className="muted">No target</span>;
  return (
    <span className="lm-target">
      <span className="lm-target-track">
        <span className={`lm-target-fill${pct >= 100 ? " done" : pct < 50 ? " low" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <b>{pct}%</b>
    </span>
  );
}

/**
 * Monthly sales targets. The sales manager sees every sales executive's target against what they
 * converted this month (the amounts of their converted leads) and sets or changes each one; a sales
 * executive sees their own.
 */
function Targets({ manager, myId }) {
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const load = () =>
    getTargets(month)
      .then((list) => {
        setRows(list);
        setError("");
      })
      .catch((err) => {
        setRows([]);
        setError(err.message || "Could not load the targets.");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), [month]);

  const mine = rows?.find((t) => String(t.user_id) === myId);
  const list = manager ? rows || [] : mine ? [mine] : [];
  const totals = list.reduce((s, t) => ({ target: s.target + (Number(t.target) || 0), achieved: s.achieved + Number(t.achieved || 0) }), { target: 0, achieved: 0 });

  return (
    <Card
      title={manager ? "Monthly Targets" : "My Target"}
      sub={`${monthLabel(month)} - achieved = the deal (closure) amount of the leads converted in the month`}
      index={0}
      action={<input className="lm-input" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" style={{ width: 170 }} />}
      flush={manager}
    >
      {error && <Note tone="warn">{error}</Note>}
      {rows === null ? (
        <SkeletonRows rows={manager ? 3 : 1} />
      ) : manager ? (
        list.length === 0 ? (
          <Empty title="No sales executives yet" />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Sales person</th>
                  <th className="num">Target</th>
                  <th className="num">Achieved</th>
                  <th>Progress</th>
                  <th className="num">Converted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((t, i) => (
                  <tr key={t.user_id} style={{ "--i": i }}>
                    <td>
                      <Who name={t.name} sub={ROLE_LABEL[t.role] || t.role} size={34} />
                    </td>
                    <td className="num">{t.target ? money(t.target) : "-"}</td>
                    <td className="num">{money(t.achieved)}</td>
                    <td style={{ minWidth: 180 }}>
                      <TargetBar t={t} />
                    </td>
                    <td className="num">{t.converted}</td>
                    <td className="num">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                        {t.target ? "Change" : "Set target"}
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="lm-total-row">
                  <td>
                    <strong>Team total</strong>
                  </td>
                  <td className="num">
                    <strong>{money(totals.target)}</strong>
                  </td>
                  <td className="num">
                    <strong>{money(totals.achieved)}</strong>
                  </td>
                  <td>
                    <TargetBar t={totals} />
                  </td>
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )
      ) : !mine || !mine.target ? (
        <Empty title="No target set for this month" text={mine && Number(mine.achieved) > 0 ? `Converted so far: ${money(mine.achieved)}.` : "Your sales manager sets your monthly target."} />
      ) : (
        <div className="lm-target-me">
          <div>
            <small>Target</small>
            <strong>{money(mine.target)}</strong>
          </div>
          <div>
            <small>Achieved</small>
            <strong>{money(mine.achieved)}</strong>
          </div>
          <div>
            <small>{Number(mine.achieved) >= Number(mine.target) ? "Target reached" : "To go"}</small>
            <strong>{money(Math.max(0, Number(mine.target) - Number(mine.achieved)))}</strong>
          </div>
          <div className="wide">
            <TargetBar t={mine} />
            <small>
              {mine.converted} lead{Number(mine.converted) === 1 ? "" : "s"} converted this month
            </small>
          </div>
        </div>
      )}
      {editing && (
        <SetTargetModal
          target={editing}
          month={month}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </Card>
  );
}

function SetTargetModal({ target, month, onClose, onSaved }) {
  const toast = useToast();
  const [amount, setAmount] = useState(target.target ? String(Math.round(target.target)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await setTarget(target.user_id, month, amount);
      toast(amount ? `Target saved for ${target.name}` : `Target removed for ${target.name}`);
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save the target.");
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Target for ${target.name}`}
      sub={`${monthLabel(month)} - the amount of leads to convert`}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} onClick={save}>
            Save target
          </Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <Note tone="warn">{error}</Note>}
        <label className="lm-field">
          <span className="lm-label">Target amount (₹)</span>
          <input className="lm-input" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="e.g. 500000" autoFocus />
          <span className="lm-hint">Leave empty to remove the target for this month.</span>
        </label>
      </div>
    </Modal>
  );
}
