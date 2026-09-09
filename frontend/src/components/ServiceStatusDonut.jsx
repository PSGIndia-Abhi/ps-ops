import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Sector,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "./ServiceStatusDonut.css";

// Mutually-exclusive slices of the jobs in the selected range — always sums
// back to statusBreakdown.total. Keep in sync with the server's
// GET /api/dashboard/service-overview `statusBreakdown` shape.
const SEGMENTS = [
  { key: "completed", label: "Completed", color: "#16a34a" },
  { key: "inProgress", label: "In Progress", color: "#2f6fed" },
  { key: "pending", label: "Pending", color: "#f59e0b" },
  { key: "overdue", label: "Overdue", color: "#ef4444" },
  { key: "cancelled", label: "Cancelled", color: "#9ca3af" },
];

// Renders the hovered slice ~7px larger, matching the "enlarge outward on
// hover" spec — the transition itself is handled by Recharts tweening
// outerRadius via react-smooth, not CSS (Sector is drawn as an SVG path).
function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 7}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="donut-tooltip">
      <span className="donut-tooltip-name">{name}</span>
      <span className="donut-tooltip-value">{value}</span>
    </div>
  );
}

function DonutSkeleton() {
  return (
    <div className="donut-wrap">
      <div className="donut-skeleton-ring" />
      <div className="donut-legend">
        {SEGMENTS.map((seg) => (
          <div className="donut-legend-row" key={seg.key}>
            <span className="donut-skeleton-dot" />
            <span className="donut-skeleton-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Service Status donut widget.
 *
 * Props:
 *   data    - statusBreakdown object from GET /api/dashboard/service-overview
 *             ({ completed, inProgress, pending, overdue, cancelled, total }),
 *             or null while nothing has loaded yet.
 *   loading - true while the request is in flight.
 *   error   - error message string, or null/falsy if the last request succeeded.
 *   onRetry - called when the user clicks "Retry" in the error state.
 */
export default function ServiceStatusDonut({ data, loading, error, onRetry }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const total = data?.total || 0;

  // Memoized on the `data` prop itself — which only changes when a new
  // fetch resolves, never when activeIndex changes from hovering — so
  // hovering never hands Recharts a new `data` array reference. That's
  // what would otherwise re-trigger the rotating entrance animation on
  // every mouse-over.
  const chartData = useMemo(
    () =>
      SEGMENTS.map((seg) => ({
        key: seg.key,
        name: seg.label,
        color: seg.color,
        value: data ? data[seg.key] || 0 : 0,
      })),
    [data]
  );

  if (loading) {
    return <DonutSkeleton />;
  }

  if (error) {
    return (
      <div className="donut-state donut-state-error">
        <p>Couldn't load service status.</p>
        <button type="button" className="donut-retry-btn" onClick={() => onRetry()}>
          Retry
        </button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="donut-state donut-state-empty">
        No services in this period.
      </div>
    );
  }

  return (
    <div className="donut-wrap">
      <div className="donut-chart-area">
        {/* 180px — larger so the donut fills more of the card's height
            (was 136, leaving empty space below the legend on a stretched
            card). outerRadius (74) + the hover-enlarge growth (7) = 81,
            comfortably under this container's own radius (90), so the
            enlarged sector still has room to grow without spilling past
            its own box on hover. */}
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={74}
              paddingAngle={3}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.key}
                  fill={entry.color}
                  fillOpacity={
                    activeIndex === null || activeIndex === index ? 1 : 0.85
                  }
                  style={{ transition: "fill-opacity 180ms ease-out" }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="donut-hole donut-fade-in">
          <div className="donut-total">{total}</div>
          <div className="donut-total-label">Total</div>
        </div>
      </div>

      <div className="donut-legend donut-fade-in">
        {chartData.map((entry, index) => {
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
          return (
            <div
              className={`donut-legend-row${activeIndex === index ? " is-active" : ""}`}
              key={entry.key}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <span className="donut-dot" style={{ background: entry.color }} />
              <span className="donut-legend-label">{entry.name}</span>
              <span className="donut-legend-value">
                {entry.value} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
