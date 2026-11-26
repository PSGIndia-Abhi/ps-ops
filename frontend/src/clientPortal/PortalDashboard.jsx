import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  HiOutlineClipboardDocumentList, HiOutlineCalendarDays, HiOutlineCheckBadge, HiOutlineChatBubbleLeftRight,
  HiOutlineArrowPath, HiOutlineSparkles, HiOutlinePlus,
  HiOutlineArrowRight, HiOutlineMapPin, HiOutlineCamera, HiOutlineBolt, HiOutlineFlag, HiOutlineChevronRight,
  HiOutlineCheck,
} from "react-icons/hi2";
import { apiFetch, safeJson } from "../api";
import PortalLoader from "./PortalLoader";
import ColorGuide from "./ColorGuide";
import {
  PERIODS, periodRange, formatDate, relativeDay, RISK_STYLE, serviceLabel,
} from "./portalUtils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Recent activity: friendly title, colour and icon for one job update.
// tone: done = green ✓, new = blue +, photo = violet camera, issue = orange flag, status = blue bolt.
function activityInfo(message = "") {
  const m = message.toLowerCase();
  const status = /status changed from\s+(\w+)\s+to\s+(\w+)/i.exec(message);
  if (status && status[2].toUpperCase() === "COMPLETED") return { title: "Job completed", tone: "done", icon: <HiOutlineCheck aria-hidden="true" /> };
  if (status) {
    const label = { IN_PROGRESS: "Work started", NOT_STARTED: "Job scheduled" }[status[2].toUpperCase()] || `Status: ${status[2]}`;
    return { title: label, tone: "status", icon: <HiOutlineBolt aria-hidden="true" /> };
  }
  if (m.includes("created")) return { title: "New job created", tone: "new", icon: <HiOutlinePlus aria-hidden="true" /> };
  if (m.includes("photo")) return { title: message, tone: "photo", icon: <HiOutlineCamera aria-hidden="true" /> };
  if (m.includes("complaint")) return { title: message, tone: "issue", icon: <HiOutlineFlag aria-hidden="true" /> };
  return { title: message, tone: "status", icon: <HiOutlineSparkles aria-hidden="true" /> };
}

// "OPERATION" -> "Operation"; known codes (PEST, DEEP...) keep their nice label.
function niceService(code) {
  const label = serviceLabel(code);
  return /^[A-Z_]+$/.test(label) ? label.charAt(0) + label.slice(1).toLowerCase().replace(/_/g, " ") : label;
}

// Latest updates grouped by calendar day: [{ day: "12 Nov", items: [...] }]
function groupActivity(list, limit = 5) {
  const groups = [];
  for (const a of list.slice(0, limit)) {
    const day = formatDate(a.created_at, { day: "2-digit", month: "short" });
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(a);
    else groups.push({ day, items: [a] });
  }
  return groups;
}

// Visit colours used everywhere on the dashboard: green = completed, red = missed.
const VISIT_DONE = "#16a34a";
const VISIT_MISSED = "#dc2626";
const DONUT_COLORS = [VISIT_DONE, "#94a3b8", "#7c3aed", VISIT_MISSED];

// Progress ring used in the welcome banner ("Service health").
function HealthRing({ value }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg className="cp-ring" viewBox="0 0 120 120" role="img" aria-label={value == null ? "No visits yet" : `${pct}% of visits on schedule`}>
      <circle cx="60" cy="60" r={r} fill="none" className="cp-ring-track" strokeWidth="12" />
      {pct > 0 && (
        <circle
          cx="60" cy="60" r={r} fill="none" className="cp-ring-value" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 60 60)"
        />
      )}
      <text x="60" y="68" textAnchor="middle" className="cp-ring-text">{value == null ? "—" : `${pct}%`}</text>
    </svg>
  );
}

// Thin segmented bar under a KPI number. segments: [{ value, color }]
function KpiBar({ segments }) {
  const total = segments.reduce((n, s) => n + (s.value || 0), 0);
  return (
    <span className="cp-kpi-bar" aria-hidden="true">
      {total > 0 && segments.filter((s) => s.value > 0).map((s, i) => (
        <span key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
      ))}
    </span>
  );
}

export default function PortalDashboard() {
  const navigate = useNavigate();
  const { portal, outletId, setOutletId } = useOutletContext();

  const [period, setPeriod] = useState("30d");
  const [custom, setCustom] = useState(() => periodRange("30d"));
  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ from: range.from, to: range.to });
        if (outletId) params.set("site_id", outletId);
        const res = await apiFetch(`/api/client-portal/dashboard?${params}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load dashboard");
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, outletId, reloadKey]);

  const firstName = (portal?.user?.name || "").trim().split(/\s+/)[0];
  const outletName = outletId ? portal.outlets.find((o) => o.id === outletId)?.name : null;
  const k = data?.kpis;
  const nextVisit = data?.upcoming_visits?.[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const granularity = data?.granularity || "day";
  const trend = useMemo(() => {
    const fmt = (bucket) => {
      const d = new Date(`${bucket}T00:00:00`);
      if (granularity === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    };
    return (data?.trend || []).map((t) => ({ ...t, label: fmt(t.bucket) }));
  }, [data, granularity]);
  const trendTotal = trend.reduce((n, t) => n + t.completed + t.missed, 0);
  const bucketWord = granularity === "month" ? "month" : granularity === "week" ? "week" : "day";

  const donut = k
    ? [
        { name: "Completed", value: k.visits_done },
        { name: "Upcoming", value: k.upcoming_visits },
        { name: "In progress", value: k.visits_in_progress },
        { name: "Missed", value: k.visits_missed },
      ]
    : [];
  const donutTotal = donut.reduce((n, d) => n + d.value, 0);
  const completionRate = k && k.visits_done + k.visits_missed > 0
    ? Math.round((k.visits_done / (k.visits_done + k.visits_missed)) * 100)
    : null;
  const periodLabel = period === "custom"
    ? `${formatDate(range.from, { day: "numeric", month: "short" })} – ${formatDate(range.to, { day: "numeric", month: "short" })}`
    : (PERIODS.find((p) => p.key === period)?.label || "").toLowerCase();

  const summary = k
    ? `${k.visits_done} service${k.visits_done === 1 ? "" : "s"} completed, ${k.visits_total} visit${k.visits_total === 1 ? "" : "s"} scheduled and ${k.complaints_raised} complaint${k.complaints_raised === 1 ? "" : "s"} raised`
    : "";

  const cards = k
    ? [
        {
          key: "jobs", icon: <HiOutlineClipboardDocumentList />, tone: "blue", label: "Jobs", value: k.jobs_in_period,
          sub: k.jobs_in_period ? `${k.active_jobs} active · ${k.completed_jobs} completed` : "No jobs in this period", to: "/client/jobs",
          bar: [{ value: k.active_jobs, color: "#2453e6" }, { value: k.completed_jobs, color: VISIT_DONE }],
        },
        {
          key: "visits", icon: <HiOutlineCalendarDays />, tone: "violet", label: "Visits scheduled", value: k.visits_total,
          sub: k.visits_total ? `${k.upcoming_visits} upcoming · ${k.visits_in_progress} in progress` : "No visits in this period", to: "/client/jobs?tab=visits",
          bar: [
            { value: k.visits_done, color: VISIT_DONE },
            { value: k.visits_in_progress, color: "#7c3aed" },
            { value: k.upcoming_visits, color: "#94a3b8" },
            { value: k.visits_missed, color: VISIT_MISSED },
          ],
        },
        {
          key: "done", icon: <HiOutlineCheckBadge />, tone: "green", label: "Services completed", value: k.visits_done,
          badge: completionRate != null ? { text: `${completionRate}% on time`, kind: completionRate >= 80 ? "good" : "warn" } : null,
          sub: completionRate != null ? (k.visits_missed ? `${k.visits_missed} visit${k.visits_missed === 1 ? "" : "s"} missed this period` : "No visits missed") : "None in this period",
          to: "/client/jobs?tab=visits",
          bar: [{ value: k.visits_done, color: VISIT_DONE }, { value: k.visits_missed, color: VISIT_MISSED }],
        },
        {
          key: "complaints", icon: <HiOutlineChatBubbleLeftRight />, tone: "amber", label: "Complaints", value: k.complaints_raised,
          badge: k.open_complaints ? { text: `${k.open_complaints} open`, kind: "warn" } : { text: "All clear", kind: "good" },
          sub: k.complaints_raised ? (k.open_complaints ? `${k.open_complaints} still open` : "All resolved") : "None raised", to: "/client/complaints",
        },
        {
          key: "requests", icon: <HiOutlineSparkles />, tone: "teal", label: "Service requests", value: k.requests_sent,
          cta: k.requests_sent ? null : "Request a service →",
          sub: k.requests_sent ? (k.pending_requests ? `${k.pending_requests} waiting to be scheduled` : "All scheduled") : "None sent", to: "/client/request-service",
        },
      ]
    : [];

  // Banner status pills: one per issue (open complaints = red, missed visits = orange), each a link;
  // a single green "All services on track" when there is nothing to look at.
  const issues = !k ? [] : [
    k.open_complaints > 0 && {
      key: "complaints", tone: "red", to: "/client/complaints",
      text: `${k.open_complaints} complaint${k.open_complaints === 1 ? "" : "s"} open`,
    },
    k.visits_missed > 0 && {
      key: "missed", tone: "orange", to: "/client/jobs?tab=visits&status=missed",
      text: `${k.visits_missed} visit${k.visits_missed === 1 ? "" : "s"} missed`,
    },
  ].filter(Boolean);

  return (
    <div className="cp-page cp-dash">
      {/* Welcome banner */}
      <section className="cp-welcome">
        <svg className="cp-welcome-rings" viewBox="0 0 520 520" aria-hidden="true">
          <circle cx="260" cy="260" r="250" /><circle cx="260" cy="260" r="190" /><circle cx="260" cy="260" r="130" />
        </svg>
        <div className="cp-welcome-main">
          <div className="cp-welcome-meta">
            <span className="cp-welcome-date">{today}</span>
            {k && issues.length === 0 && (
              <span className="cp-welcome-status ok"><i aria-hidden="true" />All services on track</span>
            )}
            {issues.map((p) => (
              <button
                key={p.key} type="button" className={`cp-welcome-status issue tone-${p.tone}`}
                onClick={() => navigate(p.to)} title="Open"
              >
                <i aria-hidden="true" />{p.text}<HiOutlineChevronRight aria-hidden="true" />
              </button>
            ))}
          </div>
          <h2>{greeting()}{firstName ? `, ${firstName}` : ""}</h2>
          <p className="cp-welcome-scope">
            {periodLabel ? `${periodLabel.charAt(0).toUpperCase()}${periodLabel.slice(1)}` : "In this period"}
            {outletName ? <> · {outletName}</> : <> · all {portal.outlets.length} outlet{portal.outlets.length === 1 ? "" : "s"}</>}
          </p>
          {k ? (
            <ul className="cp-welcome-stats">
              <li>
                <span className="cp-ws-icon done" aria-hidden="true"><HiOutlineCheckBadge /></span>
                <span><strong>{k.visits_done}</strong><small>Service{k.visits_done === 1 ? "" : "s"} completed</small></span>
              </li>
              <li>
                <span className="cp-ws-icon" aria-hidden="true"><HiOutlineCalendarDays /></span>
                <span><strong>{k.visits_total}</strong><small>Visit{k.visits_total === 1 ? "" : "s"} scheduled</small></span>
              </li>
              <li>
                <span className={`cp-ws-icon ${k.complaints_raised ? "warn" : ""}`} aria-hidden="true"><HiOutlineChatBubbleLeftRight /></span>
                <span><strong>{k.complaints_raised}</strong><small>Complaint{k.complaints_raised === 1 ? "" : "s"} raised</small></span>
              </li>
            </ul>
          ) : (
            <p>{summary || "…"}</p>
          )}
          <div className="cp-welcome-actions">
            <button className="cp-btn cp-btn-light" onClick={() => navigate("/client/request-service")}><HiOutlinePlus /> Request a service</button>
            <button className="cp-btn cp-btn-glass" onClick={() => navigate("/client/complaints?new=1")}><HiOutlineChatBubbleLeftRight /> Raise a complaint</button>
          </div>
        </div>
        <div className="cp-welcome-next">
          <div className="cp-health">
            <HealthRing value={completionRate} />
            <div className="cp-health-text">
              <span className="cp-welcome-next-label">Service health</span>
              <strong>Visits on schedule</strong>
              <small>
                {k && k.visits_done + k.visits_missed > 0
                  ? `${k.visits_done} completed · ${k.visits_missed} missed`
                  : "No completed visits in this period yet"}
              </small>
            </div>
          </div>
          <span className="cp-welcome-next-label">Next visit</span>
          {nextVisit ? (
            <button className="cp-next-card" onClick={() => navigate(`/client/jobs/${encodeURIComponent(nextVisit.job_id)}`)}>
              <span className="cp-next-date">
                <strong>{formatDate(nextVisit.scheduled_date, { day: "2-digit" })}</strong>
                <small>{formatDate(nextVisit.scheduled_date, { month: "short" })}</small>
              </span>
              <span className="cp-next-text">
                <strong>{serviceLabel(nextVisit.service_type)}</strong>
                <small><HiOutlineMapPin aria-hidden="true" /> {nextVisit.site_name || "—"}</small>
                <small>{relativeDay(nextVisit.scheduled_date)}</small>
              </span>
              <HiOutlineArrowRight className="cp-next-arrow" aria-hidden="true" />
            </button>
          ) : (
            <div className="cp-next-card empty">
              <span className="cp-next-icon"><HiOutlineCalendarDays aria-hidden="true" /></span>
              <span className="cp-next-empty-text">No visit scheduled yet</span>
              <button type="button" className="cp-next-book" onClick={() => navigate("/client/request-service")}>
                Book one <HiOutlineArrowRight aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Section header + period */}
      <div className="cp-section-head">
        <div>
          <h3>Overview</h3>
          <p>{outletName || "All outlets"} · {formatDate(range.from)} – {formatDate(range.to)}</p>
        </div>
        <div className="cp-filters">
          <div className="cp-segmented" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p.key} role="tab" aria-selected={period === p.key} className={period === p.key ? "active" : ""} onClick={() => setPeriod(p.key)}>
                {p.label.replace("Last ", "")}
              </button>
            ))}
          </div>
          <ColorGuide />
          {period === "custom" && (
            <div className="cp-daterange cp-select">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From date" />
              <span>to</span>
              <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To date" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="cp-alert">
          {error}
          <button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><HiOutlineArrowPath /> Retry</button>
        </div>
      )}

      {!data && loading && (
        <PortalLoader label="Loading your dashboard…" />
      )}

      {data && (
        <div className={`cp-dash-body ${loading ? "cp-refreshing" : ""}`}>
          <div className="cp-kpis">
            {cards.map((c) => (
              <button key={c.key} className={`cp-kpi tone-${c.tone}`} onClick={() => navigate(c.to)}>
                <span className="cp-kpi-top">
                  <span className="cp-kpi-label">{c.label}</span>
                  <span className="cp-kpi-icon" aria-hidden="true">{c.icon}</span>
                </span>
                <span className="cp-kpi-valrow">
                  <span className={`cp-kpi-value ${c.small ? "sm" : ""}`}>{c.value}</span>
                  {c.badge && c.bar && <span className={`cp-kpi-badge ${c.badge.kind}`}>{c.badge.text}</span>}
                </span>
                {c.bar && <KpiBar segments={c.bar} />}
                {c.badge && !c.bar && <span className={`cp-kpi-badge ${c.badge.kind}`}>{c.badge.text}</span>}
                {c.cta && <span className="cp-kpi-cta">{c.cta}</span>}
                <span className="cp-kpi-sub">{c.sub}</span>
              </button>
            ))}
          </div>

          <div className="cp-dash-grid">
            <section className="cp-card cp-chart-card">
              <header className="cp-card-head">
                <div>
                  <h3>Visits over time</h3>
                  <small>{periodLabel ? `${periodLabel.charAt(0).toUpperCase()}${periodLabel.slice(1)}` : "Selected period"} · per {bucketWord}</small>
                </div>
                <div className="cp-chart-legend">
                  <span><i style={{ background: VISIT_DONE }} />Completed</span>
                  <span><i style={{ background: VISIT_MISSED }} />Missed</span>
                </div>
              </header>
              {trendTotal > 0 ? (
                <div className="cp-chart">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={trend} margin={{ top: 10, right: 8, left: -18, bottom: 0 }} barCategoryGap={trend.length > 20 ? '18%' : '30%'}>
                      <CartesianGrid vertical={false} stroke="#eef1f6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#6b7a90" }} minTickGap={18} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#6b7a90" }} />
                      <Tooltip
                        cursor={{ fill: "rgba(15,23,42,0.04)" }}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e8ecf3", boxShadow: "0 8px 24px rgba(16,24,40,.08)", fontSize: 13 }}
                        labelFormatter={(l) => (granularity === "week" ? `Week of ${l}` : l)}
                      />
                      <Bar name="Completed" dataKey="completed" stackId="v" fill={VISIT_DONE} radius={[5, 5, 0, 0]} maxBarSize={34} />
                      <Bar name="Missed" dataKey="missed" stackId="v" fill={VISIT_MISSED} radius={[5, 5, 0, 0]} maxBarSize={34} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="cp-empty-state compact">
                  <HiOutlineCheckBadge aria-hidden="true" />
                  <strong>No visits in this period</strong>
                  <span>Pick a longer period or another outlet.</span>
                </div>
              )}
            </section>

            <section className="cp-card cp-donut-card">
              <header className="cp-card-head">
                <div>
                  <h3>Visit status</h3>
                  <small>Selected period</small>
                </div>
              </header>
              {donutTotal > 0 ? (
                <div className="cp-donut-wrap">
                  <div className="cp-donut">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={donut} dataKey="value" innerRadius={58} outerRadius={80} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                          {donut.map((d, i) => <Cell key={d.name} fill={DONUT_COLORS[i]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e8ecf3", fontSize: 13 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="cp-donut-center">
                      <strong>{completionRate != null ? `${completionRate}%` : donutTotal}</strong>
                      <small>{completionRate != null ? "on schedule" : "visits"}</small>
                    </div>
                  </div>
                  <ul className="cp-legend cp-legend-tiles">
                    {donut.map((d, i) => (
                      <li key={d.name}><span style={{ background: DONUT_COLORS[i] }} />{d.name}<strong>{d.value}</strong></li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="cp-empty-state compact">
                  <HiOutlineCalendarDays aria-hidden="true" />
                  <strong>No visits in this period</strong>
                  <span>Try a longer period.</span>
                </div>
              )}
            </section>
          </div>

          <div className="cp-dash-grid even">
            <section className="cp-card">
              <header className="cp-card-head">
                <div><h3>Upcoming visits</h3><small>Next scheduled services</small></div>
                <button className="cp-link" onClick={() => navigate("/client/jobs?tab=visits")}>View all <HiOutlineChevronRight /></button>
              </header>
              {data.upcoming_visits.length === 0 ? (
                <div className="cp-empty-state compact cp-empty-dashed">
                  <HiOutlineCalendarDays aria-hidden="true" />
                  <strong>No visits on the calendar</strong>
                  <span>Your next service will appear here once it is scheduled.</span>
                </div>
              ) : (
                <ul className="cp-list">
                  {data.upcoming_visits.map((v) => (
                    <li key={v.id} className="cp-visit cp-clickable" onClick={() => navigate(`/client/jobs/${encodeURIComponent(v.job_id)}`)}>
                      <div className="cp-visit-date">
                        <strong>{formatDate(v.scheduled_date, { day: "2-digit" })}</strong>
                        <small>{formatDate(v.scheduled_date, { month: "short" })}</small>
                      </div>
                      <div className="cp-visit-text">
                        <strong>{serviceLabel(v.service_type)}</strong>
                        <small><HiOutlineMapPin aria-hidden="true" /> {v.site_name || "—"} · #{v.job_code || v.job_id}</small>
                      </div>
                      <span className="cp-pill">{relativeDay(v.scheduled_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cp-card cp-activity">
              <header className="cp-activity-head">
                <span className="cp-activity-badge" aria-hidden="true"><HiOutlineBolt /></span>
                <div><h3>Recent activity</h3><small>Updates on your jobs</small></div>
                <button className="cp-link cp-activity-all" onClick={() => navigate("/client/jobs")}>All jobs <HiOutlineChevronRight /></button>
              </header>
              {data.activity.length === 0 ? (
                <div className="cp-activity-empty"><strong>No updates in this period</strong><span>New job updates will appear here.</span></div>
              ) : (
                <>
                  {groupActivity(data.activity).map((g) => (
                    <div key={g.day} className="cp-activity-day">
                      <span className="cp-activity-date">{g.day}</span>
                      <ul>
                        {g.items.map((a) => {
                          const info = activityInfo(a.message);
                          return (
                            <li key={a.id}>
                              <button type="button" className="cp-activity-item" onClick={() => navigate(`/client/jobs/${encodeURIComponent(a.job_id)}`)}>
                                <span className={`cp-activity-icon tone-${info.tone}`}>{info.icon}</span>
                                <span className="cp-activity-text">
                                  <strong>{info.title}</strong>
                                  <small>{a.site_name || "—"} · {niceService(a.service_type)}</small>
                                </span>
                                <span className="cp-activity-time">
                                  {new Date(a.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  <p className="cp-activity-foot">
                    Showing the latest {Math.min(5, data.activity.length)} update{Math.min(5, data.activity.length) === 1 ? "" : "s"}
                  </p>
                </>
              )}
            </section>
          </div>

          {data.outlets.length > 0 && (
            <section className="cp-card cp-card-flush">
              <header className="cp-card-head cp-card-head-pad">
                <div>
                  <h3>{data.outlets.length > 1 ? "Outlets at a glance" : "Your outlet"}</h3>
                  <small>{data.outlets.length > 1 ? "Click an outlet to focus the dashboard on it" : "Service and audit status for this location"}</small>
                </div>
                <button className="cp-link" onClick={() => navigate("/client/outlets")}>All outlets <HiOutlineChevronRight /></button>
              </header>
              <div className="cp-table-wrap">
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>Outlet</th>
                      <th>Active jobs</th>
                      <th>Done in period</th>
                      <th>Last visit</th>
                      <th>Next visit</th>
                      <th>Complaints</th>
                      <th>Audit risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outlets.map((o) => {
                      const risk = RISK_STYLE[String(o.audit_risk || "").toUpperCase()];
                      return (
                        <tr key={o.id} onClick={() => setOutletId(o.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOutletId(o.id)}>
                          <td>
                            <div className="cp-cell-outlet">
                              <span className="cp-cell-icon"><HiOutlineMapPin aria-hidden="true" /></span>
                              <span><strong>{o.name || o.id}</strong>{o.city && <small>{o.city}</small>}</span>
                            </div>
                          </td>
                          <td><span className="cp-num">{o.active_jobs}</span></td>
                          <td><span className="cp-num">{o.completed_jobs}</span></td>
                          <td>{formatDate(o.last_visit)}</td>
                          <td>{o.next_visit ? formatDate(o.next_visit) : "—"}</td>
                          <td>{o.open_complaints ? <span className="cp-pill warn">{o.open_complaints} open</span> : <span className="cp-muted">None</span>}</td>
                          <td>{risk ? <span className={`cp-risk ${risk.className}`}>{risk.label}</span> : <span className="cp-muted">No audit</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
