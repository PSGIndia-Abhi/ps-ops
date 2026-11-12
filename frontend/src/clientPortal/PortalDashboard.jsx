import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  HiOutlineClipboardDocumentList, HiOutlineCalendarDays, HiOutlineCheckBadge, HiOutlineChatBubbleLeftRight,
  HiOutlineArrowPath, HiOutlineSparkles, HiOutlinePlus,
  HiOutlineArrowRight, HiOutlineMapPin, HiOutlineCamera, HiOutlineBolt, HiOutlineFlag, HiOutlineChevronRight,
} from "react-icons/hi2";
import { apiFetch, safeJson } from "../api";
import OutletPicker from "./OutletPicker";
import {
  PERIODS, periodRange, formatDate, formatDateTime, relativeDay, RISK_STYLE, serviceLabel,
} from "./portalUtils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function activityIcon(message = "") {
  const m = message.toLowerCase();
  if (m.includes("photo")) return <HiOutlineCamera aria-hidden="true" />;
  if (m.includes("complaint")) return <HiOutlineFlag aria-hidden="true" />;
  if (m.includes("status")) return <HiOutlineBolt aria-hidden="true" />;
  return <HiOutlineSparkles aria-hidden="true" />;
}

function activityText(message = "") {
  const m = /status changed from\s+(\w+)\s+to\s+(\w+)/i.exec(message);
  if (!m) return message;
  const label = { COMPLETED: "Completed", IN_PROGRESS: "In progress", NOT_STARTED: "Scheduled" }[m[2].toUpperCase()] || m[2];
  return `Status changed to ${label}`;
}

const DONUT_COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#f59e0b"];

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
        { key: "jobs", icon: <HiOutlineClipboardDocumentList />, tone: "blue", label: "Jobs", value: k.jobs_in_period, sub: k.jobs_in_period ? `${k.active_jobs} active · ${k.completed_jobs} completed` : "No jobs in this period", to: "/client/jobs" },
        { key: "visits", icon: <HiOutlineCalendarDays />, tone: "violet", label: "Visits scheduled", value: k.visits_total, sub: k.visits_total ? `${k.upcoming_visits} upcoming · ${k.visits_in_progress} in progress` : "No visits in this period", to: "/client/jobs?tab=visits" },
        { key: "done", icon: <HiOutlineCheckBadge />, tone: "green", label: "Services completed", value: k.visits_done, sub: completionRate != null ? `${completionRate}% on schedule · ${k.visits_missed} missed` : "None in this period", to: "/client/jobs?tab=visits" },
        { key: "complaints", icon: <HiOutlineChatBubbleLeftRight />, tone: k.open_complaints ? "amber" : "slate", label: "Complaints", value: k.complaints_raised, sub: k.complaints_raised ? (k.open_complaints ? `${k.open_complaints} still open` : "All resolved") : "None raised", to: "/client/complaints" },
        { key: "requests", icon: <HiOutlineSparkles />, tone: k.pending_requests ? "teal" : "slate", label: "Service requests", value: k.requests_sent, sub: k.requests_sent ? (k.pending_requests ? `${k.pending_requests} waiting to be scheduled` : "All scheduled") : "None sent", to: "/client/request-service" },
      ]
    : [];

  return (
    <div className="cp-page cp-dash">
      {/* Welcome banner */}
      <section className="cp-welcome">
        <div className="cp-welcome-main">
          <span className="cp-welcome-date">{today}</span>
          <h2>{greeting()}{firstName ? `, ${firstName}` : ""}</h2>
          <p>
            {periodLabel ? `${periodLabel.charAt(0).toUpperCase()}${periodLabel.slice(1)}` : "In this period"}
            {outletName ? <> at <strong>{outletName}</strong></> : <> across your {portal.outlets.length} outlet{portal.outlets.length === 1 ? "" : "s"}</>}: {summary || "…"}.
          </p>
          <div className="cp-welcome-actions">
            <button className="cp-btn cp-btn-light" onClick={() => navigate("/client/request-service")}><HiOutlinePlus /> Request a service</button>
            <button className="cp-btn cp-btn-glass" onClick={() => navigate("/client/complaints?new=1")}><HiOutlineChatBubbleLeftRight /> Raise a complaint</button>
          </div>
        </div>
        <div className="cp-welcome-next">
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
              <HiOutlineCalendarDays aria-hidden="true" />
              <span>No visit scheduled yet</span>
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
          <OutletPicker outlets={portal.outlets} value={outletId} onChange={setOutletId} align="right" className="cp-picker-box" />
          <div className="cp-segmented" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p.key} role="tab" aria-selected={period === p.key} className={period === p.key ? "active" : ""} onClick={() => setPeriod(p.key)}>
                {p.label.replace("Last ", "")}
              </button>
            ))}
          </div>
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
        <div className="cp-kpis">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="cp-kpi cp-skeleton" />)}</div>
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
                <span className={`cp-kpi-value ${c.small ? "sm" : ""}`}>{c.value}</span>
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
                  <span><i style={{ background: "#2563eb" }} />Completed</span>
                  <span><i style={{ background: "#f59e0b" }} />Missed</span>
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
                        cursor={{ fill: "rgba(37,99,235,0.06)" }}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e8ecf3", boxShadow: "0 8px 24px rgba(16,24,40,.08)", fontSize: 13 }}
                        labelFormatter={(l) => (granularity === "week" ? `Week of ${l}` : l)}
                      />
                      <Bar name="Completed" dataKey="completed" stackId="v" fill="#2563eb" maxBarSize={34} />
                      <Bar name="Missed" dataKey="missed" stackId="v" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={34} />
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
                  <ul className="cp-legend">
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
                <div className="cp-empty-state compact"><HiOutlineCalendarDays aria-hidden="true" /><strong>Nothing scheduled</strong><span>Need something done? Request a service.</span></div>
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

            <section className="cp-card">
              <header className="cp-card-head">
                <div><h3>Recent activity</h3><small>Updates on your jobs</small></div>
              </header>
              {data.activity.length === 0 ? (
                <div className="cp-empty-state compact"><HiOutlineSparkles aria-hidden="true" /><strong>No updates in this period</strong><span>New job updates will appear here.</span></div>
              ) : (
                <ul className="cp-timeline cp-timeline-icons">
                  {data.activity.slice(0, 7).map((a) => (
                    <li key={a.id} className="cp-clickable" onClick={() => navigate(`/client/jobs/${encodeURIComponent(a.job_id)}`)}>
                      <span className="cp-timeline-icon">{activityIcon(a.message)}</span>
                      <div>
                        <p>{activityText(a.message)}</p>
                        <small>{a.site_name || "—"} · {serviceLabel(a.service_type)} · {formatDateTime(a.created_at)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {data.outlets.length > 1 && (
            <section className="cp-card cp-card-flush">
              <header className="cp-card-head cp-card-head-pad">
                <div><h3>Outlets at a glance</h3><small>Click an outlet to focus the dashboard on it</small></div>
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
