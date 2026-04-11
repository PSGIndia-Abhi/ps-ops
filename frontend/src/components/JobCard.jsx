import { useNavigate } from "react-router-dom";
import { formatDate, formatTime } from "../utils/date";
import { apiFetch } from "../api";

const role = localStorage.getItem("role");

export default function JobCard({
  job,
  basePath = "/technician",
  refreshData,
}) {
  const navigate = useNavigate();

  // 🔹 Core data
  const title = job.title;
  const visitDate = job.visit_date;

  const companyName = job.companyname;

  const requestedByName =
    job.requestedBy?.name ||
    job.requested_by_name ||
    job.requested_by ||
    job.contact_name ||
    "";

  const requestedById =
    job.requestedBy?.id ||
    job.contact_id ||
    "";

  const requestedByIdText =
    requestedById && /^\d+$/.test(String(requestedById))
      ? ` #${requestedById}`
      : "";

  const companyHeading = companyName
    ? companyName
    : requestedByName
      ? `Requested by: ${requestedByName}${requestedByIdText}`
      : "Individual Customer";

  const site =
    job.site ||
    job.company_site ||
    job.company?.site ||
    "";

  const visitTime = formatTime(visitDate);

  // 🔹 DATE-ONLY LOGIC (IMPORTANT FIX)
  function toDateOnly(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const visitDay = visitDate ? toDateOnly(visitDate) : null;

  const isPast = visitDay && visitDay < today;
  const isToday = visitDay && visitDay.getTime() === today.getTime();

  // 🔹 Navigation
  function openJob() {
    navigate(`${basePath}/jobs/${job.id}`);
  }

  // 🔹 Actions (backend later)
async function startVisit(e) {
  e.stopPropagation();

  const res = await apiFetch(`/api/visits/${job.visit_id}/start`, {
    method: "POST",
  });

  if (!res.ok) {
    console.error("Start visit failed");
    return;
  }

  refreshData?.();
}

  async function startAnyway(e) {
    e.stopPropagation();

    const res = await apiFetch(`/api/visits/${job.visit_id}/start-anyway`, {
      method: "POST",
    });

    if (!res.ok) {
      console.error("Start visit anyway failed");
      return;
    }

    refreshData?.();
  }
  

  return (
    <div className="job-card">

      {/* HEADER */}
      <div className="job-card-header" onClick={openJob}>
        <div className="job-card-headings">
          <div className="job-card-company">{companyHeading}</div>
          {site && <div className="job-card-site">{site}</div>}
          <div className="job-card-title">{title}</div>
        </div>

        <div className="job-card-status">
          {isPast ? "MISSED" : isToday ? "TODAY" : "UPCOMING"}
        </div>
      </div>

      {/* BODY */}
      <div className="job-card-body" onClick={openJob}>
        {visitDate && (
          <div className="job-card-visit">
            <div className="job-card-visit-label">
              {isPast ? "Missed Visit" : "Scheduled Visit"}
            </div>

            <div className="job-card-visit-time">
              {visitTime === "-" ? "Time TBD" : visitTime}
            </div>

            <div className="job-card-visit-date">
              {formatDate(visitDate)}
            </div>
          </div>
        )}

        <div className="job-card-address">
          {job.address || "No address"}
        </div>
      </div>

      {/* ACTIONS */}
      {role?.toLowerCase() === "technician" && (
        <div className="job-card-actions">

          {/* ✅ TODAY → Start */}
          {isToday && (
            <button className="btn-start" onClick={startVisit}>
              Start
            </button>
          )}

          {/* ✅ PAST → Start Anyway */}
          {isPast && (
            <button className="btn-start" onClick={startAnyway}>
              Start Anyway
            </button>
          )}

        </div>
      )}
    </div>
  );
}