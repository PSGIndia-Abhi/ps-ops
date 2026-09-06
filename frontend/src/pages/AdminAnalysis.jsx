import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiEye } from "react-icons/fi";
import { apiFetch } from "../api";
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
  chevronDown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
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

// Service Pipeline — funnel rows. The first four are chained with a
// down-arrow (each stage is "of the jobs in the selected range, how many
// made it this far"); Pending/Overdue are shown below as flags, not
// funnel steps.
const PIPELINE_STAGES = [
  { key: "scheduled", label: "Scheduled", color: "#2f6fed", arrow: true },
  { key: "assigned", label: "Assigned", color: "#2f6fed", arrow: true },
  { key: "inProgress", label: "In Progress", color: "#f59e0b", arrow: true },
  { key: "completed", label: "Completed", color: "#16a34a", arrow: false },
];

const FLAG_STAGES = [
  { key: "pending", label: "Pending", color: "#f59e0b" },
  { key: "overdue", label: "Overdue", color: "#ef4444" },
];

// Service Status donut — mutually-exclusive slices of the jobs in the
// selected range, always summing back to statusBreakdown.total.
const DONUT_SEGMENTS = [
  { key: "completed", label: "Completed", color: "#16a34a" },
  { key: "inProgress", label: "In Progress", color: "#2f6fed" },
  { key: "pending", label: "Pending", color: "#f59e0b" },
  { key: "overdue", label: "Overdue", color: "#ef4444" },
  { key: "cancelled", label: "Cancelled", color: "#9ca3af" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Short label used for a single date within a range description, e.g. "05 Sep".
function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  // Always includes the year — ranges can now span multiple years (the
  // trend/monthly-summary widgets go back up to 5 years), and a bare
  // "05 Sep" would be ambiguous across year boundaries.
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Turns the active from/to filter into a human label used on tile
// subtitles and widget headers — "Today", a single date, or a range.
function formatRangeLabel(from, to) {
  if (!from || !to) return "";
  if (from === to) {
    return from === todayStr() ? "Today" : formatShortDate(from);
  }
  return `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

function buildConicGradient(segments, breakdown) {
  const total = breakdown?.total || 0;
  if (!total) return "conic-gradient(#e5e7eb 0% 100%)";

  let cumulative = 0;
  const stops = segments.map((seg) => {
    const value = breakdown[seg.key] || 0;
    const start = cumulative;
    cumulative += (value / total) * 100;
    return `${seg.color} ${start}% ${cumulative}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
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

// Reshapes the flat onTimeTrend list (one entry per "YYYY-MM" bucket) into
// a year-columns / month-rows grid: years across the X axis, Jan-Dec down
// the Y axis. A (year, month) with no bucket in range renders as an empty
// cell rather than 0%, since "no data" and "0% on time" mean different
// things.
function buildTrendGrid(onTimeTrend) {
  const valueByKey = new Map(onTimeTrend.map((t) => [t.month, t.onTimePct]));
  const years = Array.from(new Set(onTimeTrend.map((t) => t.month.slice(0, 4)))).sort();

  const rows = MONTH_LABELS.map((label, i) => {
    const monthNum = String(i + 1).padStart(2, "0");
    const cells = years.map((year) => {
      const key = `${year}-${monthNum}`;
      return {
        key,
        value: valueByKey.has(key) ? valueByKey.get(key) : null,
      };
    });
    return { label, cells };
  });

  return { years, rows };
}

function heatClass(value) {
  if (value === null || value === undefined) return "heat-empty";
  if (value >= 90) return "heat-good";
  if (value >= 75) return "heat-warn";
  return "heat-bad";
}

const DEFAULT_FILTERS = {
  from: todayStr(),
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

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
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

        if (!isMounted) return;
        setTiles(tilesData);
        setOverview(overviewData);
        setTeam(teamData);
        setActionItems(actionData);
      } catch (err) {
        console.error(err);
        if (isMounted) setError(err.message || "Failed to load analysis data");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [queryString]);

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

  const employeePerformance = team?.employeePerformance || [];
  const onTimeTrend = team?.onTimeTrend || [];
  const upcomingServices = team?.upcomingServices || [];
  const workload = [...employeePerformance].sort(
    (a, b) => b.assigned - a.assigned
  );
  const maxWorkload = Math.max(1, ...workload.map((w) => w.assigned));
  const trendGrid = buildTrendGrid(onTimeTrend);

  const overdueServices = actionItems?.overdueServices || [];
  const monthlySummary = actionItems?.monthlySummary || [];

  return (
    <div className="analysis-page">
      <div className="analysis-header">
        <div>
          <h1>Analysis</h1>
          <p>Overview of all services</p>
        </div>

        <div className="analysis-header-controls">
          <div className="date-range-group">
            <label className="date-field">
              <span>From</span>
              <input
                type="date"
                value={filters.from}
                max={filters.to}
                onChange={(e) => updateFilter("from", e.target.value)}
              />
            </label>
            <label className="date-field">
              <span>To</span>
              <input
                type="date"
                value={filters.to}
                min={filters.from}
                onChange={(e) => updateFilter("to", e.target.value)}
              />
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
          <div className="analysis-tile" key={tile.key}>
            <div
              className="analysis-tile-icon"
              style={{ background: tile.color }}
            >
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
        <div className="widget-card">
          <div className="widget-header-row">
            <h3 className="widget-title">Service Pipeline</h3>
            <span className="widget-range-badge">{rangeLabel}</span>
          </div>
          <div className="pipeline-list">
            {PIPELINE_STAGES.map((stage) => (
              <div className="pipeline-item" key={stage.key}>
                <div className="pipeline-row">
                  <span className="pipeline-label" style={{ color: stage.color }}>
                    {stage.label}
                  </span>
                  <span className="pipeline-value">
                    {loading || !pipeline ? "—" : pipeline[stage.key]}
                  </span>
                </div>
                {stage.arrow && (
                  <div className="pipeline-arrow">{ICONS.chevronDown}</div>
                )}
              </div>
            ))}
          </div>
          <div className="pipeline-flags">
            {FLAG_STAGES.map((stage) => (
              <div className="pipeline-row pipeline-flag" key={stage.key}>
                <span className="pipeline-label" style={{ color: stage.color }}>
                  {stage.label}
                </span>
                <span className="pipeline-value" style={{ color: stage.color }}>
                  {loading || !pipeline ? "—" : pipeline[stage.key]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Service Status (donut) */}
        <div className="widget-card">
          <div className="widget-header-row">
            <h3 className="widget-title">Service Status</h3>
            <span className="widget-range-badge">{rangeLabel}</span>
          </div>
          <div className="donut-wrap">
            <div
              className="donut-chart"
              style={{
                background: buildConicGradient(DONUT_SEGMENTS, statusBreakdown),
              }}
            >
              <div className="donut-hole">
                <div className="donut-total">
                  {loading || !statusBreakdown ? "—" : statusBreakdown.total}
                </div>
                <div className="donut-total-label">Total</div>
              </div>
            </div>

            <div className="donut-legend">
              {DONUT_SEGMENTS.map((seg) => {
                const value = statusBreakdown ? statusBreakdown[seg.key] || 0 : 0;
                const total = statusBreakdown?.total || 0;
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
                return (
                  <div className="donut-legend-row" key={seg.key}>
                    <span className="donut-dot" style={{ background: seg.color }} />
                    <span className="donut-legend-label">{seg.label}</span>
                    <span className="donut-legend-value">
                      {loading || !statusBreakdown ? "—" : `${value} (${pct}%)`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Customer Pending Services */}
        <div className="widget-card">
          <div className="widget-header-row">
            <h3 className="widget-title">Customer Pending Services</h3>
          </div>

          {!loading && pendingCustomers.length === 0 ? (
            <div className="widget-empty">No pending services 🎉</div>
          ) : (
            <div className="table-scroll">
              <table className="widget-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Pending</th>
                    <th>Oldest Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(loading ? [] : pendingCustomers).map((row) => (
                    <tr key={row.companyId}>
                      <td>{row.companyName}</td>
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
            </div>
          )}

          <a href="/admin/companies" target="_blank" rel="noopener noreferrer" className="widget-view-all">
            View All
          </a>
        </div>

        {/* Customers At Risk */}
        <div className="widget-card at-risk-card">
          <div className="at-risk-top">
            <div className="at-risk-count">
              {loading || atRiskCount === null ? "—" : atRiskCount}
            </div>
            <div className="at-risk-icon">{ICONS.users}</div>
          </div>
          <div className="at-risk-label">Customers At Risk</div>

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

          <a href="/admin/companies" target="_blank" rel="noopener noreferrer" className="widget-view-all">
            View All
          </a>
        </div>

      </div>

      {/* ---------- TEAM / TREND / UPCOMING WIDGETS ---------- */}
      <div className="analysis-widgets">

        {/* Employee Performance */}
        <div className="widget-card">
          <div className="widget-header-row">
            <h3 className="widget-title">Employee Performance</h3>
            <span className="widget-range-badge">{rangeLabel}</span>
          </div>

          {!loading && employeePerformance.length === 0 ? (
            <div className="widget-empty">No technicians found</div>
          ) : (
            <div className="table-scroll">
              <table className="widget-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Assigned</th>
                    <th>Completed</th>
                    <th>Pending</th>
                    <th>Overdue</th>
                    <th>On-Time %</th>
                  </tr>
                </thead>
                <tbody>
                  {(loading ? [] : employeePerformance).map((emp) => (
                    <tr key={emp.technicianId}>
                      <td>{emp.technicianName}</td>
                      <td>{emp.assigned}</td>
                      <td>{emp.completed}</td>
                      <td>{emp.pending}</td>
                      <td>{emp.overdue}</td>
                      <td className={onTimeClass(emp.onTimePct)}>
                        {emp.onTimePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <a href="/admin/team" target="_blank" rel="noopener noreferrer" className="widget-view-all">
            View All
          </a>
        </div>

        {/* On-Time Completion Trend */}
        <div className="widget-card">
          <div className="widget-header-row">
            <h3 className="widget-title">On-Time Completion Trend</h3>
            <span className="trend-range">{rangeLabel}</span>
          </div>

          {trendGrid.years.length === 0 ? (
            <div className="widget-empty">No completed jobs in this period</div>
          ) : (
            <div className="table-scroll">
              <table className="trend-heatmap">
                <thead>
                  <tr>
                    <th className="trend-heatmap-corner" />
                    {trendGrid.years.map((year) => (
                      <th key={year}>{year}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trendGrid.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {row.cells.map((cell) => (
                        <td key={cell.key} className={`trend-heatmap-cell ${heatClass(cell.value)}`}>
                          {cell.value === null ? "-" : `${cell.value}%`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Employee Workload */}
        <div className="widget-card">
          <div className="widget-header-row">
            <h3 className="widget-title">Employee Workload</h3>
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
        </div>

        {/* Upcoming Services */}
        <div className="widget-card">
          <h3 className="widget-title">Upcoming Services</h3>

          <div className="upcoming-list">
            {(loading ? [] : upcomingServices).map((day) => (
              <div className="upcoming-row" key={day.date}>
                <span className="upcoming-label">{day.label}</span>
                <span className="upcoming-count">{day.count}</span>
              </div>
            ))}
          </div>

          <a href="/admin/bookings" target="_blank" rel="noopener noreferrer" className="widget-view-all">
            View Calendar
          </a>
        </div>

      </div>

      {/* ---------- OVERDUE ACTION LIST / MONTHLY SUMMARY ---------- */}
      <div className="analysis-widgets-wide">

        {/* Overdue Services - Action Required */}
        <div className="widget-card">
          <h3 className="widget-title">Overdue Services - Action Required</h3>

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
                          <FiEye />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <a href="/admin/bookings" target="_blank" rel="noopener noreferrer" className="widget-view-all">
            View All
          </a>
        </div>

        {/* Monthly Service Summary */}
        <div className="widget-card">
          <h3 className="widget-title">Monthly Service Summary</h3>

          <div className="table-scroll">
            <table className="widget-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Scheduled</th>
                  <th>Completed</th>
                  <th>Pending</th>
                  <th>Overdue</th>
                  <th>Completion %</th>
                  <th>On-Time %</th>
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : monthlySummary).map((row) => (
                  <tr key={row.month}>
                    <td>{row.label}</td>
                    <td>{row.scheduled}</td>
                    <td>{row.completed}</td>
                    <td>{row.pending}</td>
                    <td>{row.overdue}</td>
                    <td className={onTimeClass(row.completionPct)}>
                      {row.completionPct}%
                    </td>
                    <td className={onTimeClass(row.onTimePct)}>
                      {row.onTimePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="widget-view-all">
            View Full Report
          </button>
        </div>

      </div>
    </div>
  );
}
