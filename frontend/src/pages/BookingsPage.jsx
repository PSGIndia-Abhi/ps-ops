import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import "./BookingsPage.css";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BookingsPage() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({
    status: "",
    startDate: "",
    endDate: "",
  });
  const [dateError, setDateError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBookings() {
      try {
        setLoading(true);
        const res = await apiFetch("/api/bookings?include_unbooked=1");
        if (!res?.ok) throw new Error("Failed to load bookings");
        const list = await res.json();
        if (isMounted) {
          setBookings(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        console.error("Bookings load failed", err);
        if (isMounted) {
          setError(err.message || "Failed to load bookings");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadBookings();
    return () => {
      isMounted = false;
    };
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

  const totalBookings = useMemo(
    () => filteredBookings.length,
    [filteredBookings.length]
  );

  if (loading) {
    return <div className="bookings-page">Loading bookings...</div>;
  }

  if (error) {
    return <div className="bookings-page">Error: {error}</div>;
  }

  return (
    <div className="bookings-page">
      <div className="bookings-header">
        <div>
          <h2>Bookings</h2>
          <div className="bookings-subtitle">{totalBookings} total</div>
        </div>
      </div>

      <div className="bookings-filters">
        <div className="bookings-filter-field">
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
        <div className="bookings-filter-field">
          <label>Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => updateDateFilter("startDate", e.target.value)}
          />
        </div>
        <div className="bookings-filter-field">
          <label>End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => updateDateFilter("endDate", e.target.value)}
          />
        </div>
        <button
          type="button"
          className="bookings-filter-reset"
          onClick={() => {
            setFilters({ status: "", startDate: "", endDate: "" });
            setDateError("");
          }}
        >
          Reset
        </button>
        {dateError && <div className="bookings-filter-error">{dateError}</div>}
      </div>

      <div className="bookings-list">
        {filteredBookings.length === 0 && (
          <div className="booking-job-empty">No bookings match the current filters.</div>
        )}
        {filteredBookings.map(booking => (
          <div key={booking.id} className="booking-list-card">
            <div className="booking-card-top">
              <div>
                <div className="booking-code">
                  {booking.is_unbooked ? "Unbooked Jobs" : booking.code}
                </div>
                <div className="booking-created">
                  Created {formatDate(booking.created_at)}
                </div>
                {booking.service_type && (
                  <div className="booking-type">{booking.service_type}</div>
                )}
                {booking.is_unbooked && (
                  <div className="booking-type booking-type-muted">No booking record</div>
                )}
              </div>
            </div>

            <div className="booking-sections">
              <div className="booking-section-card">
                <div className="booking-section-title">Client</div>
                <div className="booking-client-grid">
                  <div>
                    <div className="booking-client-label">Contact</div>
                    <div className="booking-client-value">
                      {booking.contact_name || "Unknown contact"}
                    </div>
                  </div>
                  <div>
                    <div className="booking-client-label">Phone</div>
                    <div className="booking-client-value">
                      {booking.contact_phone || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="booking-client-label">Email</div>
                    <div className="booking-client-value">
                      {booking.contact_email || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="booking-client-label">Company</div>
                    <div className="booking-client-value">
                      {booking.company_name || booking.company_code
                        ? `${booking.company_name || "Company"}${booking.company_code ? ` (${booking.company_code})` : ""}`
                        : "Residential"}
                    </div>
                  </div>
                  {booking.company_type && (
                    <div>
                      <div className="booking-client-label">Company Type</div>
                      <div className="booking-client-value">
                        {booking.company_type}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="booking-section-card">
                <div className="booking-section-title">Tasks</div>
                <div className="booking-job-list">
                  {(booking.jobs || []).map(job => (
                    <div
                      key={job.id}
                      className="booking-job-row"
                      onClick={() => navigate(`/${role}/jobs/${job.id}`)}
                    >
                      <div className="job-service">{job.sub_service}</div>
                      <div className="job-date">{formatDate(job.start_date)}</div>
                      <div className={`job-status status-${job.status}`}>
                        {job.status}
                      </div>
                    </div>
                  ))}
                  {(booking.jobs || []).length === 0 && (
                    <div className="booking-job-empty">No jobs yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
