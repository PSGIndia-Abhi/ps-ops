import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import "./BookingsPage.css";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
}

export default function BookingsPage() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({
    companyId: "",
    contactId: "",
    startDate: "",
    endDate: "",
    search: "",
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

  const hasFilters = Boolean(
    filters.companyId || filters.contactId || filters.startDate || filters.endDate || filters.search
  );
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

  const companyOptions = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const id = b.company_id || b.company_code || b.company_name;
      const label = b.company_name
        ? `${b.company_name}${b.company_code ? ` (${b.company_code})` : ""}`
        : b.company_code || b.company_site || "Residential";
      if (id) {
        map.set(String(id), { value: String(id), label });
      }
      (b.jobs || []).forEach((j) => {
        const jobId = j.company_id || j.company_code || j.company_name;
        const jobLabel = j.company_name
          ? `${j.company_name}${j.company_code ? ` (${j.company_code})` : ""}`
          : j.company_code || j.company_site || "Residential";
        if (jobId) {
          map.set(String(jobId), { value: String(jobId), label: jobLabel });
        }
      });
    });
    return Array.from(map.values());
  }, [bookings]);

  const contactOptions = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const id = b.contact_id || b.contact_name;
      const label = b.contact_name || b.contact_email || "Unknown contact";
      if (id) {
        map.set(String(id), { value: String(id), label });
      }
      (b.jobs || []).forEach((j) => {
        const jobId = j.contact_id || j.contact_name;
        const jobLabel = j.contact_name || j.contact_email || "Unknown contact";
        if (jobId) {
          map.set(String(jobId), { value: String(jobId), label: jobLabel });
        }
      });
    });
    return Array.from(map.values());
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    if (!hasFilters) return bookings;
    const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`) : null;
    const search = filters.search.trim().toLowerCase();

    const matchesCompany = (booking, jobs) => {
      if (!filters.companyId) return true;
      const target = String(filters.companyId);
      const bookingCompany = booking.company_id || booking.company_code || booking.company_name;
      if (bookingCompany && String(bookingCompany) === target) return true;
      return jobs.some((job) => {
        const jobCompany = job.company_id || job.company_code || job.company_name;
        return jobCompany && String(jobCompany) === target;
      });
    };

    const matchesContact = (booking, jobs) => {
      if (!filters.contactId) return true;
      const target = String(filters.contactId);
      const bookingContact = booking.contact_id || booking.contact_name;
      if (bookingContact && String(bookingContact) === target) return true;
      return jobs.some((job) => {
        const jobContact = job.contact_id || job.contact_name;
        return jobContact && String(jobContact) === target;
      });
    };

    const matchesJobDate = (job) => {
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
      if (!matchesCompany(booking, jobs)) return acc;
      if (!matchesContact(booking, jobs)) return acc;

      const bookingText = [
        booking.code,
        booking.contact_name,
        booking.contact_email,
        booking.company_name,
        booking.company_code,
        booking.company_site,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const dateFiltered = jobs.filter(matchesJobDate);
      let filteredJobs = dateFiltered;

      if (search) {
        const bookingMatches = bookingText.includes(search);
        if (!bookingMatches) {
          filteredJobs = dateFiltered.filter((job) => {
            const jobText = [
              job.sub_service,
              job.code,
              job.contact_name,
              job.contact_email,
              job.company_name,
              job.company_code,
              job.company_site,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return jobText.includes(search);
          });
        }
      }

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
          <label>Company</label>
          <select
            value={filters.companyId}
            onChange={(e) => setFilters((prev) => ({ ...prev, companyId: e.target.value }))}
          >
            <option value="">All companies</option>
            {companyOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="bookings-filter-field">
          <label>Contact</label>
          <select
            value={filters.contactId}
            onChange={(e) => setFilters((prev) => ({ ...prev, contactId: e.target.value }))}
          >
            <option value="">All contacts</option>
            {contactOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="bookings-filter-field">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search booking, contact, company, or service"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
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
            setFilters({ companyId: "", contactId: "", startDate: "", endDate: "", search: "" });
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
