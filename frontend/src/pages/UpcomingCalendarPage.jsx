import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch, safeJson } from "../api";
import "./AnalysisDataPage.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(monthStr, delta) {
  const [y, m] = monthStr.split("-").map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 1));
}

function monthLabel(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Month-grid calendar behind Upcoming Services' "View Calendar" link — a
// real schedule view (all services plotted by date), not a table, matching
// how that widget is framed differently from the other list-style cards.
export default function UpcomingCalendarPage() {
  const [searchParams] = useSearchParams();
  // Always opens on the real current month — this is an upcoming-services
  // view, not a browser of the Analysis tab's (possibly past-dated)
  // from/to filter, so that filter's `from` never seeds the start month.
  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Only the scope filters carry over here (branch/status/customer) — the
  // Analysis tab's [from,to] range doesn't apply to a calendar that browses
  // month by month on its own axis.
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (searchParams.get("branchId")) params.set("branchId", searchParams.get("branchId"));
    if (searchParams.get("status")) params.set("status", searchParams.get("status"));
    if (searchParams.get("companyId")) params.set("companyId", searchParams.get("companyId"));
    return params.toString();
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams(filterQuery);
        params.set("month", month);
        const res = await apiFetch(`/api/dashboard/upcoming-calendar?${params.toString()}`);
        if (!res?.ok) throw new Error("Failed to load calendar");
        const data = await safeJson(res);
        if (!mounted) return;
        setDays(Array.isArray(data?.days) ? data.days : []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load calendar");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [month, filterQuery]);

  const countByDate = useMemo(() => new Map(days.map((d) => [d.date, d.count])), [days]);

  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const startWeekday = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();

    const list = [];
    for (let i = 0; i < startWeekday; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      list.push({ day: d, date: dateStr, count: countByDate.get(dateStr) || 0 });
    }
    return list;
  }, [month, countByDate]);

  const todayStr = new Date().toISOString().slice(0, 10);
  // The grey "already passed" treatment only makes sense while looking at
  // the current month (today's still-upcoming days vs. its already-gone
  // ones) — browsing back to an entirely past month should show its dates
  // in normal full color, same as future ones, not grey the whole grid out.
  const isCurrentMonth = month === monthKeyOf(new Date());

  return (
    <div className="adp-page">
      <Link to="/admin/analysis" className="adp-back-link">← Back to Analysis</Link>

      <div className="adp-header">
        <h1>Upcoming Services</h1>
      </div>

      <div className="cal-toolbar">
        <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))}>‹ Prev</button>
        <span className="cal-month-label">{monthLabel(month)}</span>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))}>Next ›</button>
      </div>

      {error ? (
        <div className="adp-state adp-state-error">{error}</div>
      ) : loading ? (
        <div className="adp-state">Loading…</div>
      ) : (
        <div className="cal-grid">
          {WEEKDAY_LABELS.map((w) => (
            <div className="cal-weekday" key={w}>{w}</div>
          ))}
          {cells.map((cell, i) =>
            cell ? (
              <div
                key={cell.date}
                className={`cal-cell${cell.date === todayStr ? " is-today" : ""}${cell.count > 0 ? " has-services" : ""}${isCurrentMonth && cell.date < todayStr ? " is-past" : ""}`}
              >
                <span className="cal-day-num">{cell.day}</span>
                {cell.count > 0 && (
                  <span className="cal-day-count">
                    {cell.count} service{cell.count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            ) : (
              <div className="cal-cell cal-cell-empty" key={`empty-${i}`} />
            )
          )}
        </div>
      )}
    </div>
  );
}
