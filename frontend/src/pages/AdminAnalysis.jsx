import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye } from "react-icons/fa";
import { apiFetch } from "../api";
import { formatDate } from "../utils/date";
import ServiceStatusDonut from "../components/ServiceStatusDonut";
import "./AdminAnalysis.css";

const ICONS = {
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l10 18H2L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  timer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="2" x2="14" y2="2" />
      <line x1="12" y1="14" x2="12" y2="8" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  userCheck: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  ),
  spinner: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  ),
  pipeline: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="10" y1="18" x2="14" y2="18" />
    </svg>
  ),
  pieChart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  trendUp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  barChart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  ),
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "CREATED", label: "Created" },
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
];

const TILES = [
  {
    key: "scheduled",
    label: "Scheduled",
    dynamicSub: true,
    color: "#2f6fed",
    icon: "calendar",
    format: (v) => v ?? 0,
  },
  {
    key: "completed",
    label: "Completed",
    dynamicSub: true,
    color: "#16a34a",
    icon: "check",
    format: (v) => v ?? 0,
  },
  {
    key: "pending",
    label: "Pending",
    dynamicSub: true,
    color: "#f59e0b",
    icon: "clock",
    format: (v) => v ?? 0,
  },
  {
    key: "overdue",
    label: "Overdue",
    sub: "Services Overdue",
    color: "#ef4444",
    icon: "alert",
    format: (v) => v ?? 0,
  },
  {
    key: "completionPct",
    label: "Completion %",
    sub: "Completed / Scheduled",
    color: "#7c3aed",
    icon: "target",
    format: (v) => `${v ?? 0}%`,
  },
  {
    key: "onTimePct",
    label: "On-time %",
    sub: "On-time Completion",
    color: "#0d9488",
    icon: "timer",
    format: (v) => `${v ?? 0}%`,
  },
];

// Service Pipeline — funnel rows, each "of the jobs in the selected range,
// how many made it this far". A drop-off line (this stage's count vs. the
// previous stage's) renders between every consecutive pair. Pending/Overdue
// are shown below as a separate "needs attention" block, not funnel steps.
const PIPELINE_STAGES = [
  { key: "scheduled", label: "Scheduled", color: "#2f6fed", icon: "calendar" },
  { key: "assigned", label: "Assigned", color: "#2f6fed", icon: "userCheck" },
  { key: "inProgress", label: "In Progress", color: "#f59e0b", icon: "spinner" },
  { key: "completed", label: "Completed", color: "#16a34a", icon: "check" },
];

const FLAG_STAGES = [
  { key: "pending", label: "Pending", color: "#f59e0b", icon: "clock", tint: "amber" },
  { key: "overdue", label: "Overdue", color: "#ef4444", icon: "alert", tint: "red" },
];

// ((previous - current) / previous) * 100, rounded — how much the funnel
// dropped off between two consecutive stages. Guards divide-by-zero when
// the previous stage's count is 0.
function dropOffPct(previous, current) {
  if (!previous) return 0;
  return Math.round(((previous - current) / previous) * 100);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Good Morning / Afternoon / Evening / Night — based on the viewer's local
// clock, recomputed on every render.
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  if (hour < 21) return "Good Evening";
  return "Good Night";
}

// First day of the current calendar month, as "YYYY-MM-DD" — recomputed
// from `now` every time this runs (not a hardcoded date), so it's always
// the 1st of whatever month the page happens to load in. Built from local
// getFullYear/getMonth rather than `new Date().toISOString()` so a
// negative UTC offset can't roll it back to the last day of the previous
// month.
function firstOfMonthStr() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
}

// dd/mm/yyyy display text for the "From" field's overlay (see render) —
// the native <input type="date"> underneath keeps "YYYY-MM-DD" throughout,
// unchanged, for its own value/onChange and everything downstream.
function toDDMMYYYY(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// Turns the active from/to filter into a human label used on tile
// subtitles and widget headers — a single DD/MM/YYYY date, or a range of
// two. No "Today" special-case: every displayed date on this dashboard
// renders through the same DD/MM/YYYY formatDate() (see utils/date.js) so
// the format stays consistent regardless of which date happens to be
// selected.
function formatRangeLabel(from, to) {
  if (!from || !to) return "";
  if (from === to) return formatDate(from);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

function statusBadgeClass(status) {
  if (status === "Overdue") return "status-badge status-overdue";
  if (status === "Pending") return "status-badge status-pending";
  return "status-badge status-upcoming";
}

function onTimeClass(pct) {
  if (pct >= 90) return "metric-good";
  if (pct >= 75) return "metric-warn";
  return "metric-bad";
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Dropdown options for the On-Time Completion Trend line chart — a
// per-widget window over the tail of `onTimeTrend`, independent of the
// page-level from/to filter (which only controls how far back the server
// buckets data, up to 60 months).
const TREND_RANGE_OPTIONS = [
  { value: 3, label: "Last 3 Months" },
  { value: 6, label: "Last 6 Months" },
  { value: 12, label: "Last 12 Months" },
];

// Takes the trailing `monthsCount` entries of the flat onTimeTrend list
// (one entry per "YYYY-MM" bucket, chronological) and reduces each to a
// {key, label, value} point — label is the bare month name (no year), since
// the chart's X axis only ever shows month names.
function buildTrendSeries(onTimeTrend, monthsCount) {
  return onTimeTrend.slice(-monthsCount).map((t) => {
    const monthIndex = Number(t.month.slice(5, 7)) - 1;
    return { key: t.month, label: MONTH_LABELS[monthIndex] ?? t.month, value: t.onTimePct };
  });
}

// Smooth curve through `points` as cubic-bezier segments (Catmull-Rom
// spline, tau=1 → the standard /6 control-point formula) instead of
// straight line-to-line segments — a simple, dependency-free way to get a
// rounded "monotone-style" curve out of hand-rolled SVG. With percentage
// data that doesn't swing wildly between adjacent months this reads
// visually identical to a true monotone spline.
function buildSmoothPath(points) {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// Lays out the On-Time Completion Trend line chart over `series` as plain
// SVG coordinates — no charting library in this project, so this mirrors
// the hand-rolled donut/heatmap widgets already on this page. Y-axis is a
// full 0-100% domain — a 60-100 floor was flattening every real value
// below 60% onto the same gridline (this data's actual on-time rate is
// well under 60%), which is exactly what made the line look dead/flat.
function buildLineChartGeometry(series) {
  const width = 560;
  const height = 200;
  const padding = { top: 20, right: 16, bottom: 30, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;
  const DOMAIN_MIN = 0;
  const DOMAIN_MAX = 100;
  const yFor = (pct) => {
    const clamped = Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, pct));
    return padding.top + innerH - ((clamped - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * innerH;
  };

  const points = series.map((s, i) => ({
    ...s,
    x: padding.left + i * stepX,
    y: yFor(s.value),
  }));
  const path = buildSmoothPath(points);

  return { width, height, padding, points, path, yFor };
}

// Auto-refresh cadence for the Analysis dashboard's data fetch.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const DEFAULT_FILTERS = {
  from: firstOfMonthStr(),
  to: todayStr(),
  branchId: "",
  status: "",
  companyId: "",
};

export default function AdminAnalysis() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = role?.trim() === "admin";

  const [tiles, setTiles] = useState(null);
  const [overview, setOverview] = useState(null);
  const [team, setTeam] = useState(null);
  const [actionItems, setActionItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isFilterPanelOpen, setFilterPanelOpen] = useState(false);
  const [branches, setBranches] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [trendMonths, setTrendMonths] = useState(6);

  // Branch/Customer dropdown data — loaded once. Branch list is admin-only
  // (every other role is already locked to their own branch server-side).
  useEffect(() => {
    let isMounted = true;

    async function loadFilterOptions() {
      try {
        const requests = [apiFetch("/api/companies")];
        if (isAdmin) requests.unshift(apiFetch("/api/branches"));

        const results = await Promise.all(requests);
        const [branchesRes, companiesRes] = isAdmin
          ? [results[0], results[1]]
          : [null, results[0]];

        if (branchesRes?.ok) {
          const data = await branchesRes.json();
          if (isMounted) setBranches(Array.isArray(data) ? data : []);
        }
        if (companiesRes?.ok) {
          const data = await companiesRes.json();
          if (isMounted) setCompanies(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load filter options", err);
      }
    }

    loadFilterOptions();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.branchId) params.set("branchId", filters.branchId);
    if (filters.status) params.set("status", filters.status);
    if (filters.companyId) params.set("companyId", filters.companyId);
    return params.toString();
  }, [filters]);

  // Stable per-queryString loader so the Service Status widget's own
  // "Retry" button can re-run the same fetch the page uses, instead of a
  // full page reload.
  const loadData = useCallback(async ({ isMounted = () => true } = {}) => {
    try {
      setLoading(true);
      setError(null);
      const [tilesRes, overviewRes, teamRes, actionRes] = await Promise.all([
        apiFetch(`/api/dashboard/top-tiles?${queryString}`),
        apiFetch(`/api/dashboard/service-overview?${queryString}`),
        apiFetch(`/api/dashboard/team-overview?${queryString}`),
        apiFetch(`/api/dashboard/overdue-overview?${queryString}`),
      ]);

      if (!tilesRes?.ok || !overviewRes?.ok || !teamRes?.ok || !actionRes?.ok) {
        throw new Error("Failed to load analysis data");
      }

      const [tilesData, overviewData, teamData, actionData] = await Promise.all([
        tilesRes.json(),
        overviewRes.json(),
        teamRes.json(),
        actionRes.json(),
      ]);

      if (!isMounted()) return;
      setTiles(tilesData);
      setOverview(overviewData);
      setTeam(teamData);
      setActionItems(actionData);
    } catch (err) {
      console.error(err);
      if (isMounted()) setError(err.message || "Failed to load analysis data");
    } finally {
      if (isMounted()) setLoading(false);
    }
  }, [queryString]);

  // Bumped by manualRefresh() (the Retry button) to force the effect below
  // to tear down its current interval and start a fresh one — so a manual
  // refresh resets the 10-minute countdown instead of the old interval
  // firing again right on its heels.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const manualRefresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;

    loadData({ isMounted });
    // Only one interval is ever live: the cleanup below always clears the
    // previous one (on every dep change — queryString via loadData, or a
    // manual refresh via refreshNonce — and on unmount) before this effect
    // can set a new one.
    const interval = setInterval(() => loadData({ isMounted }), REFRESH_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loadData, refreshNonce]);

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  const activeFilterCount = [filters.branchId, filters.status, filters.companyId]
    .filter(Boolean).length;

  const rangeLabel = formatRangeLabel(filters.from, filters.to);

  const pipeline = overview?.pipeline || null;
  const statusBreakdown = overview?.statusBreakdown || null;
  const pendingCustomers = overview?.customerPendingServices || [];
  const atRiskCount = overview?.customersAtRisk?.count ?? null;

  // Least-performing technician first (lowest On-Time % at the top).
  const employeePerformance = [...(team?.employeePerformance || [])].sort(
    (a, b) => a.onTimePct - b.onTimePct
  );
  const onTimeTrend = team?.onTimeTrend || [];
  // Only real upcoming dates: today onward, at least one service scheduled
  // (the API's window includes zero-count days too), capped to the next 5
  // — the rest live behind "View Calendar".
  const upcomingServices = (team?.upcomingServices || [])
    .filter((day) => day.count > 0 && day.date >= todayStr())
    .slice(0, 5);
  // Highest workload first.
  const workload = [...(team?.employeePerformance || [])].sort(
    (a, b) => b.assigned - a.assigned
  );
  const maxWorkload = Math.max(1, ...workload.map((w) => w.assigned));
  const trendSeries = buildTrendSeries(onTimeTrend, trendMonths);
  const trendGeometry = buildLineChartGeometry(trendSeries);

  const overdueServices = actionItems?.overdueServices || [];
  const monthlySummary = actionItems?.monthlySummary || [];

  return (
    <div className="analysis-page">
      <div className="analysis-header">
        <div>
          <h1>{getGreeting()}</h1>
          <p>Overview of all services</p>
        </div>

        <div className="analysis-header-controls">
          <div className="date-range-group">
            <label className="date-field">
              <span>From</span>
              {/* Same native date input as before (same box, same
                  click-to-open picker, same value/onChange) — the overlay
                  span just paints dd/mm/yyyy on top of it. The input's own
                  text is made transparent via CSS so only the overlay
                  shows, but every native behavior (typing, the calendar
                  popup, keyboard nav) still belongs to the real input. */}
              <span className="date-input-wrap">
                <input
                  type="date"
                  className="date-input-native"
                  value={filters.from}
                  max={filters.to}
                  onChange={(e) => updateFilter("from", e.target.value)}
                />
                <span className="date-display-overlay" aria-hidden="true">
                  {toDDMMYYYY(filters.from)}
                </span>
              </span>
            </label>
            <label className="date-field">
              <span>To</span>
              <span className="date-input-wrap">
                <input
                  type="date"
                  className="date-input-native"
                  value={filters.to}
                  min={filters.from}
                  onChange={(e) => updateFilter("to", e.target.value)}
                />
                <span className="date-display-overlay" aria-hidden="true">
                  {toDDMMYYYY(filters.to)}
                </span>
              </span>
            </label>
          </div>

          <div className="filter-popover-root">
            <button
              type="button"
              className="filter-toggle-btn"
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              {ICONS.filter}
              Filters
              {activeFilterCount > 0 && (
                <span className="filter-count-badge">{activeFilterCount}</span>
              )}
            </button>

            {isFilterPanelOpen && (
              <div className="filter-panel">
                {isAdmin && (
                  <label className="filter-field">
                    <span>Branch</span>
                    <select
                      value={filters.branchId}
                      onChange={(e) => updateFilter("branchId", e.target.value)}
                    >
                      <option value="">All branches</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="filter-field">
                  <span>Job status</span>
                  <select
                    value={filters.status}
                    onChange={(e) => updateFilter("status", e.target.value)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>

                <label className="filter-field">
                  <span>Customer</span>
                  <select
                    value={filters.companyId}
                    onChange={(e) => updateFilter("companyId", e.target.value)}
                  >
                    <option value="">All customers</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <button type="button" className="filter-reset-btn" onClick={resetFilters}>
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="analysis-error">{error}</div>}

      {/* ---------- TOP KPI TILES ---------- */}
      <div className="analysis-tiles">
        {TILES.map((tile) => (
          <div
            className="analysis-tile"
            key={tile.key}
            style={{ background: tile.color }}
          >
            <div className="analysis-tile-icon">
              {ICONS[tile.icon]}
            </div>
            <div className="analysis-tile-body">
              <div className="analysis-tile-label">{tile.label}</div>
              <div className="analysis-tile-value">
                {loading || !tiles ? "—" : tile.format(tiles[tile.key])}
              </div>
              <div className="analysis-tile-sub">
                {tile.dynamicSub ? rangeLabel : tile.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- PIPELINE / STATUS / CUSTOMER WIDGETS ---------- */}
      <div className="analysis-widgets">

        {/* Service Pipeline */}
        <div className="widget-card widget-card-accent">
          <div className="widget-header-row">
            <h3 className="widget-title">
              <span className="widget-title-icon">{ICONS.pipeline}</span>
              Service Pipeline
            </h3>
            <span className="widget-range-badge">{rangeLabel}</span>
          </div>
          <div className="pipeline-list">
            {PIPELINE_STAGES.map((stage, index) => {
              const value = pipeline ? pipeline[stage.key] || 0 : 0;
              const topValue = pipeline ? pipeline[PIPELINE_STAGES[0].key] || 0 : 0;
              const barPct = topValue > 0 ? Math.min(100, (value / topValue) * 100) : 0;

              const prevStage = index > 0 ? PIPELINE_STAGES[index - 1] : null;
              const prevValue = prevStage && pipeline ? pipeline[prevStage.key] || 0 : 0;
              const drop = prevStage ? dropOffPct(prevValue, value) : null;

              return (
                <div className="pipeline-item" key={stage.key}>
                  {prevStage && (
                    <div className="pipeline-dropoff">
                      {loading || !pipeline
                        ? "—"
                        : `↓ ${value} ${drop >= 0 ? "-" : "+"}${Math.abs(drop)}%`}
                    </div>
                  )}
                  <div className="pipeline-row">
                    <span className="pipeline-label-group">
                      <span className="pipeline-icon" style={{ color: stage.color }}>
                        {ICONS[stage.icon]}
                      </span>
                      <span className="pipeline-label" style={{ color: stage.color }}>
                        {stage.label}
                      </span>
                    </span>
                    <span className="pipeline-bar-track">
                      <span
                        className="pipeline-bar-fill"
                        style={{ width: `${barPct}%`, background: stage.color }}
                      />
                    </span>
                    <span className="pipeline-value">
                      {loading || !pipeline ? "—" : value}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pipeline-flags">
            {FLAG_STAGES.map((stage) => (
              <div className={`pipeline-flag-row pipeline-flag-${stage.tint}`} key={stage.key}>
                <span className="pipeline-flag-icon" style={{ color: stage.color }}>
                  {ICONS[stage.icon]}
                </span>
                <span className="pipeline-flag-label">{stage.label}</span>
                <span className="pipeline-flag-value" style={{ color: stage.color }}>
                  {loading || !pipeline ? "—" : pipeline[stage.key]}
                </span>
              </div>
            ))}
          </div>

          <div className="pipeline-footer">
            {loading || !pipeline
              ? "— total · — completed · — need action"
              : `${pipeline.scheduled} total · ${pipeline.completed} completed · ${pipeline.overdue} need action`}
          </div>
        </div>

        {/* Service Status (donut) */}
        <div className="widget-card widget-card-accent">
          <div className="widget-header-row">
            <h3 className="widget-title">
              <span className="widget-title-icon">{ICONS.pieChart}</span>
              Service Status
            </h3>
            {/* <span className="widget-range-badge">{rangeLabel}</span>   */}
          </div>
          <ServiceStatusDonut
            data={statusBreakdown}
            loading={loading}
            error={error}
            onRetry={manualRefresh}
          />
        </div>

        {/* Customer Pending Services */}
        <div className="widget-card widget-card-accent">
          <div className="widget-header-row">
            <h3 className="widget-title">
              <span className="widget-title-icon">{ICONS.users}</span>
              Customer Pending Services
            </h3>
          </div>

          {!loading && pendingCustomers.length === 0 ? (
            <div className="widget-empty">No pending services 🎉</div>
          ) : (
            <table className="widget-table widget-table-fixed">
              <colgroup>
                <col style={{ width: "35%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Pending</th>
                  <th>Oldest due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : pendingCustomers).map((row) => (
                  <tr key={row.companyId}>
                    <td className="cell-truncate">{row.companyName}</td>
                    <td>{row.pending}</td>
                    <td>{formatDate(row.oldestDue)}</td>
                    <td>
                      <span className={statusBadgeClass(row.status)}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <a
            href={`/admin/analysis/pending-customers?${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="widget-view-all"
          >
            View All
          </a>
        </div>

        {/* Customers At Risk */}
        <div className="widget-card at-risk-card">
          <div className="widget-header-row">
            <h3 className="widget-title">
              <span className="widget-title-icon">{ICONS.alert}</span>
              Customers At Risk
            </h3>
          </div>

          {/* Positioned via CSS to sit at the card's vertical middle,
              filling the whitespace the row's stretch height leaves. */}
          <div className="at-risk-icon">{ICONS.users}</div>

          <div className="at-risk-count-block">
            <div className="at-risk-count">
              {loading || atRiskCount === null ? "—" : atRiskCount}
            </div>
            <div className="at-risk-sublabel">Customers At Risk</div>
          </div>

          <div className="at-risk-criteria">
            <div className="at-risk-criteria-title">Risk Criteria:</div>
            <div className="at-risk-criteria-item">
              {ICONS.check} Overdue services exist
            </div>
            <div className="at-risk-criteria-item">
              {ICONS.check} Multiple pending services
            </div>
            <div className="at-risk-criteria-item">
              {ICONS.check} Repeated late services
            </div>
          </div>

          <a
            href={`/admin/analysis/at-risk-customers?${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="widget-view-all"
          >
            View All
          </a>
        </div>

      </div>

      {/* ---------- TEAM / TREND / UPCOMING WIDGETS ---------- */}
      <div className="analysis-widgets">

        {/* Employee Performance */}
        <div className="widget-card widget-card-accent">
          <div className="widget-header-row">
            <h3 className="widget-title">
              <span className="widget-title-icon">{ICONS.userCheck}</span>
              Employee Performance
            </h3>
            <span className="widget-range-badge">{rangeLabel}</span>
          </div>

          {!loading && employeePerformance.length === 0 ? (
            <div className="widget-empty">No technicians found</div>
          ) : (
            <table className="widget-table widget-table-fixed">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "30%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Assigned</th>
                  <th>Completed</th>
                  <th>On-Time</th>
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : employeePerformance).map((emp) => (
                  <tr key={emp.technicianId}>
                    <td className="cell-truncate">{emp.technicianName}</td>
                    <td>{emp.assigned}</td>
                    <td>{emp.completed}</td>
                    <td className={onTimeClass(emp.onTimePct)}>
                      {emp.onTimePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <a
            href={`/admin/analysis/employee-performance?${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="widget-view-all"
          >
            View All
          </a>
        </div>

        {/* On-Time Completion Trend */}
        <div className="widget-card widget-card-accent">
          <div className="widget-header-row">
            <h3 className="widget-title widget-title-nowrap">
              <span className="widget-title-icon">{ICONS.trendUp}</span>
              On-Time Completion Trend
            </h3>
            <select
              className="trend-range-select"
              value={trendMonths}
              onChange={(e) => setTrendMonths(Number(e.target.value))}
            >
              {TREND_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {trendSeries.length === 0 ? (
            <div className="widget-empty">No completed jobs in this period</div>
          ) : (
            <svg
              className="trend-line-chart"
              viewBox={`0 0 ${trendGeometry.width} ${trendGeometry.height}`}
              preserveAspectRatio="none"
            >
              {[0, 20, 40, 60, 80, 100].map((tick) => {
                const y = trendGeometry.yFor(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={trendGeometry.padding.left}
                      x2={trendGeometry.width - trendGeometry.padding.right}
                      y1={y}
                      y2={y}
                      className="trend-gridline"
                    />
                    <text
                      x={trendGeometry.padding.left - 8}
                      y={y}
                      className="trend-axis-label"
                      textAnchor="end"
                      dominantBaseline="middle"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              <path d={trendGeometry.path} className="trend-line-path" fill="none" />

              {trendGeometry.points.map((p) => (
                <circle key={p.key} cx={p.x} cy={p.y} r="3" className="trend-line-dot" />
              ))}

              {trendGeometry.points.map((p) => (
                <text
                  key={p.key}
                  x={p.x}
                  y={trendGeometry.height - trendGeometry.padding.bottom + 18}
                  className="trend-axis-label"
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              ))}
            </svg>
          )}
        </div>

        {/* Employee Workload */}
        <div className="widget-card widget-card-accent">
          <div className="widget-header-row">
            <h3 className="widget-title">
              <span className="widget-title-icon">{ICONS.barChart}</span>
              Employee Workload
            </h3>
            <span className="widget-range-badge">{rangeLabel}</span>
          </div>

          {!loading && workload.length === 0 ? (
            <div className="widget-empty">No technicians found</div>
          ) : (
            <div className="workload-list">
              {(loading ? [] : workload).map((emp) => (
                <div className="workload-row" key={emp.technicianId}>
                  <span className="workload-label">{emp.technicianName}</span>
                  <div className="workload-bar-track">
                    <div
                      className="workload-bar-fill"
                      style={{
                        width: `${(emp.assigned / maxWorkload) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="workload-value">{emp.assigned}</span>
                </div>
              ))}
            </div>
          )}

          <a
            href={`/admin/analysis/employee-workload?${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="widget-view-all"
          >
            View All
          </a>
        </div>

        {/* Upcoming Services */}
        <div className="widget-card widget-card-accent">
          <h3 className="widget-title">
            <span className="widget-title-icon">{ICONS.calendar}</span>
            Upcoming Services
          </h3>

          {!loading && upcomingServices.length === 0 ? (
            <div className="widget-empty">No upcoming services</div>
          ) : (
            <div className="upcoming-list">
              {(loading ? [] : upcomingServices).map((day) => (
                <div className="upcoming-row" key={day.date}>
                  <span className="upcoming-label">{day.label}</span>
                  <span className="upcoming-count">{day.count}</span>
                </div>
              ))}
            </div>
          )}

          <a
            href={`/admin/analysis/upcoming-calendar?${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="widget-view-all"
          >
            View Calendar
          </a>
        </div>

      </div>

      {/* ---------- OVERDUE ACTION LIST / MONTHLY SUMMARY ---------- */}
      <div className="analysis-widgets-wide">

        {/* Overdue Services - Action Required */}
        <div className="widget-card widget-card-accent">
          <h3 className="widget-title">
            <span className="widget-title-icon">{ICONS.clock}</span>
            Overdue Services - Action Required
          </h3>

          {!loading && overdueServices.length === 0 ? (
            <div className="widget-empty">No overdue services 🎉</div>
          ) : (
            <div className="table-scroll">
              <table className="widget-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Site</th>
                    <th>Service</th>
                    <th>Due Date</th>
                    <th>Employee</th>
                    <th>Days Late</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(loading ? [] : overdueServices).map((row) => (
                    <tr key={row.jobId}>
                      <td>{row.companyName}</td>
                      <td>{row.siteName}</td>
                      <td>{row.service}</td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td>{row.employee}</td>
                      <td className="metric-bad">{row.daysLate}</td>
                      <td>
                        <button
                          type="button"
                          className="row-action-btn"
                          title="View job"
                          onClick={() => navigate(`/admin/jobs/${row.jobId}`)}
                        >
                          <FaEye />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <a
            href={`/admin/analysis/overdue-services?${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="widget-view-all"
          >
            View All
          </a>
        </div>

        {/* Monthly Service Summary */}
        <div className="widget-card widget-card-accent">
          <h3 className="widget-title">
            <span className="widget-title-icon">{ICONS.clipboard}</span>
            Monthly Service Summary
          </h3>

          <div className="table-scroll">
            {/* min-width forces this to genuinely overflow a narrow card
                instead of table-layout: fixed just shrinking every column
                to fit — that shrinking is what was clipping "On-Time %" on
                mobile instead of letting it scroll/drag into view. */}
            <table className="widget-table widget-table-fixed" style={{ minWidth: "420px" }}>
              <colgroup>
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Scheduled</th>
                  <th>Completed</th>
                  <th>On-Time %</th>
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : monthlySummary).map((row) => (
                  <tr key={row.month}>
                    <td>{row.label}</td>
                    <td>{row.scheduled}</td>
                    <td>{row.completed}</td>
                    <td className={onTimeClass(row.onTimePct)}>
                      {row.onTimePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <a
            href={`/admin/analysis/monthly-summary?${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="widget-view-all"
          >
            View Full Report
          </a>
        </div>

      </div>
    </div>
  );
}
