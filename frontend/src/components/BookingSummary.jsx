import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import "./BookingSummary.css";
import { useNavigate } from "react-router-dom";



export default function BookingSummary() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "",
    startDate: "",
    endDate: "",
  });
  const [dateError, setDateError] = useState("");

  useEffect(() => {

    async function loadSummary() {
      try {
        setLoading(true);
        const res = await apiFetch("/api/bookings?include_unbooked=1");
        const list = await res.json();
        setBookings(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("Summary load failed", err);
      } finally {
        setLoading(false);
      }
    }

    loadSummary();

  }, []);

  const statusOptions = [
    { value: "", label: "All statuses" },
    { value: "CREATED", label: "Created" },
    { value: "NOT_STARTED", label: "Not Started" },
    { value: "PENDING", label: "Pending" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "PAUSED", label: "Paused" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELED", label: "Canceled" },
  ];

  const hasFilters = Boolean(filters.status || filters.startDate || filters.endDate);
  const isBefore = (a, b) => {
    if (!a || !b) return false;
    const aDate = new Date(`${a}T00:00:00`);
    const bDate = new Date(`${b}T00:00:00`);
    if (Number.isNaN(aDate.getTime()) || Number.isNaN(bDate.getTime())) return false;
    return aDate < bDate;
  };

  const updateDateFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "startDate" && value && prev.endDate && isBefore(prev.endDate, value)) {
        next.endDate = value;
        setDateError("End date adjusted to match start date.");
      } else if (key === "endDate" && value && prev.startDate && isBefore(value, prev.startDate)) {
        setDateError("End date cannot be before start date.");
        return prev;
      } else {
        setDateError("");
      }

      return next;
    });
  };

  const filteredBookings = useMemo(() => {
    if (!hasFilters) return bookings;
    const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`) : null;

    const matchesJob = (job) => {
      if (filters.status && job.status !== filters.status) return false;
      if (!start && !end) return true;
      if (!job.start_date) return false;
      const jobDate = new Date(job.start_date);
      if (Number.isNaN(jobDate.getTime())) return false;
      if (start && jobDate < start) return false;
      if (end && jobDate > end) return false;
      return true;
    };

    return bookings.reduce((acc, booking) => {
      const jobs = Array.isArray(booking.jobs) ? booking.jobs : [];
      const filteredJobs = jobs.filter(matchesJob);
      if (filteredJobs.length === 0) return acc;
      acc.push({ ...booking, jobs: filteredJobs });
      return acc;
    }, []);
  }, [bookings, filters, hasFilters]);

  const summaryData = useMemo(() => {
    const list = filteredBookings;
    const today = new Date();

    const jobs = list.flatMap((booking) =>
      (booking.jobs || []).map((job) => ({
        ...job,
        _booking: booking,
      }))
    );

    const todayCount = jobs.filter((job) => {
      if (!job.start_date) return false;
      const jobDate = new Date(job.start_date);
      return (
        jobDate.getFullYear() === today.getFullYear()
        && jobDate.getMonth() === today.getMonth()
        && jobDate.getDate() === today.getDate()
      );
    }).length;

    const commercialMap = new Map();
    let residentialJobs = 0;
    let commercialJobs = 0;

    const normalizeCompany = (job, booking) => {
      const name = job?.company_name || booking?.company_name || null;
      const code = job?.company_code || booking?.company_code || null;
      const id = job?.company_id || booking?.company_id || null;
      const label = name && code ? `${name} (${code})` : name || code || "Unknown Company";
      const key = id || code || name || "unknown";
      return { id, name, code, label, key };
    };

    for (const job of jobs) {
      const company = normalizeCompany(job, job._booking);
      const isCommercial = Boolean(company.id || company.name || company.code);

      if (isCommercial) {
        commercialJobs += 1;
        const existing = commercialMap.get(company.key);
        if (existing) {
          existing.count += 1;
        } else {
          commercialMap.set(company.key, { ...company, count: 1 });
        }
      } else {
        residentialJobs += 1;
      }
    }

    const commercialByCompany = Array.from(commercialMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });

    return {
      today: todayCount,
      residential: residentialJobs,
      commercial: commercialJobs,
      total: jobs.length,
      commercialByCompany,
    };
  }, [filteredBookings]);

  if (loading) return <div className="card">Loading...</div>;

  return (
    <div className="booking-card">
      <div className="booking-header">
        <h3>Booking Summary</h3>

      </div>

      <div className="booking-filters">
        <div className="booking-filter-field">
          <label>Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="booking-filter-field">
          <label>Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => updateDateFilter("startDate", e.target.value)}
          />
        </div>
        <div className="booking-filter-field">
          <label>End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => updateDateFilter("endDate", e.target.value)}
          />
        </div>
        <button
          type="button"
          className="booking-filter-reset"
          onClick={() => {
            setFilters({ status: "", startDate: "", endDate: "" });
            setDateError("");
          }}
        >
          Reset
        </button>
        {dateError && <div className="booking-filter-error">{dateError}</div>}
      </div>

      <div className="booking-section">
        <div className="section-title">Details</div>
        <div className="summary-row">
          <span>Today's Jobs</span>
          <span className="value">{summaryData.today}</span>
        </div>
        <div className="summary-row">

          <span>Residential Jobs</span>
          <span className="value">{summaryData.residential}</span>
        </div>

        <div className="summary-row">
          <span>Commercial Jobs</span>
          <span className="value">{summaryData.commercial}</span>
        </div>
        {summaryData.commercialByCompany.length > 0 && (
          <div className="summary-sublist">
            {summaryData.commercialByCompany.map((company) => (
              <div key={company.key} className="summary-subrow">
                <span>{company.label}</span>
                <span className="value">{company.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>



      <div className="summary-row">
        <span>Total Jobs</span>
        <span className="value">{summaryData.total}</span>
      </div>

      <div className="divider" />
      {role !== "technician" && (
        <button
          className="primary booking-view-btn"
          onClick={() => navigate(`/${role}/bookings`)}
        >
          View All Bookings
        </button>
      )}



    </div>
  );

}
