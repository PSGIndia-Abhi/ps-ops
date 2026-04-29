import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RequesterPopover from "./RequesterPopover";
import { apiFetch } from "../api";
import { compareDateValues, formatDate, formatDateTime, formatTime, parseDateValue } from "../utils/date";
import { roleBasePath } from "../auth/roleBasePath";

function getValueOrFallback(value, fallback = "Not Available") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  return value ?? fallback;
}

function truncateText(value, maxLength = 110) {
  const text = getValueOrFallback(value, "");
  if (!text) return "Not Available";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function IconBadge({ name }) {
  const icons = {
    calendar: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      </svg>
    ),
    user: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      </svg>
    ),
    team: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    map: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s7-5.33 7-11a7 7 0 1 0-14 0c0 5.67 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      </svg>
    ),
    note: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6l4 4v14H5V3h4Zm6 0v4h4M8 12h8M8 16h6M8 8h3" />
      </svg>
    ),
    building: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M9 14h.01M9 18h.01M15 10h.01M15 14h.01M15 18h.01" />
      </svg>
    ),
  };

  return <span className="job-details-icon-badge">{icons[name] || icons.note}</span>;
}

function DetailTile({ icon, label, value, fullWidth = false, children }) {
  return (
    <div className={`job-details-tile ${fullWidth ? "full" : ""}`}>
      <div className="job-details-tile-top">
        <IconBadge name={icon} />
        <div className="job-details-tile-label">{label}</div>
      </div>
      <div className="job-details-tile-value">{children || value}</div>
    </div>
  );
}

export default function JobDetails({ job }) {
  const [history, setHistory] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visitLoading, setVisitLoading] = useState(true);
  const [teamNames, setTeamNames] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [showRequester, setShowRequester] = useState(false);
  const navigate = useNavigate();

  const role = localStorage.getItem("role");
  const base = roleBasePath(role);
  const canShowRequester = role !== "technician";

  const title =
    job.title ||
    job.name ||
    job.serviceType ||
    job.service_type ||
    (Array.isArray(job.subServices) && job.subServices.length
      ? job.subServices.join(", ")
      : "") ||
    "Service Job";
  const displayStatus = job.display_status || job.status || "";
  const workType = job.companyname ? "Corporate Work Order" : "Individual Customer";
  const latestUpdate = history.length > 0 ? history[0] : null;
  const now = new Date();
  const sortedVisits = [...visits].sort((first, second) =>
    compareDateValues(first.scheduled_date, second.scheduled_date)
  );
  const activeVisit = sortedVisits.find((visit) => {
    const scheduledAt = parseDateValue(visit.scheduled_date);
    if (!scheduledAt) return false;
    return ["SCHEDULED", "IN_PROGRESS", "AWAITING_APPROVAL"].includes(visit.status)
      && scheduledAt.getTime() >= now.getTime();
  });
  const fallbackVisit = [...sortedVisits]
    .reverse()
    .find((visit) => Boolean(visit?.scheduled_date));
  const featuredVisit = activeVisit || fallbackVisit || null;
  const featuredVisitLabel = activeVisit ? "Upcoming Visit" : "Last Visit";

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    (async () => {
      try {
        const res = await apiFetch(`/api/jobs/${job.id}/history`);
        if (!res?.ok) throw new Error("History fetch failed");
        const data = await res.json();
        if (isMounted) setHistory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (isMounted) setHistory([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [job.id]);

  useEffect(() => {
    let isMounted = true;
    setVisitLoading(true);

    (async () => {
      try {
        const res = await apiFetch(`/api/visits/jobs/${job.id}/visits`);
        if (!res?.ok) throw new Error("Visits fetch failed");
        const data = await res.json();
        if (isMounted) setVisits(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load visits", err);
        if (isMounted) setVisits([]);
      } finally {
        if (isMounted) setVisitLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [job.id]);

  useEffect(() => {
    let isMounted = true;
    setTeamLoading(true);

    (async () => {
      try {
        const res = await apiFetch(`/api/jobs/${job.id}`);
        if (!res?.ok) throw new Error("Job fetch failed");
        const data = await res.json();
        const names = Array.isArray(data.team)
          ? data.team.map((member) => member?.name).filter(Boolean)
          : [];
        if (isMounted) setTeamNames(names);
      } catch (err) {
        console.error("Failed to load team names", err);
        if (isMounted) setTeamNames([]);
      } finally {
        if (isMounted) setTeamLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [job.id]);

  return (
    <div className="job-details-card">
      <div className="job-details-header">
        <div className="job-details-title-block">
          <div className="job-details-code">{getValueOrFallback(job.code)}</div>
          <div className="job-details-title">{title}</div>
          <div className="job-details-badges">
            <div className={`job-details-status ${displayStatus.toLowerCase()}`}>
              {displayStatus ? displayStatus.replace(/_/g, " ") : "Not Available"}
            </div>
            <div className="job-details-tag">{workType}</div>
          </div>
        </div>
      </div>

      <div className="job-details-layout">
        <div className="job-details-main">
          <div className="job-details-tiles">
            <DetailTile
              icon="calendar"
              label="Date of Service"
              value={job.start_date ? formatDate(job.start_date) : "Not Available"}
            />

            <DetailTile
              icon="calendar"
              label="Schedule Ends"
              value={job.dueDate ? formatDate(job.dueDate) : "Not Available"}
            />

            <DetailTile
              icon="user"
              label="Supervisor"
              value={getValueOrFallback(job.supervisor?.name)}
            />

            <DetailTile
              icon="team"
              label="Team Members"
              value={
                teamLoading
                  ? "Loading..."
                  : teamNames.length > 0
                    ? teamNames.join(", ")
                    : "Not Available"
              }
            />

            {canShowRequester && (
              <DetailTile icon="building" label="Requested By" fullWidth={true}>
                <button
                  onClick={() => setShowRequester((value) => !value)}
                  className="job-details-requester"
                >
                  {getValueOrFallback(job.requestedBy?.name)}
                </button>

                {showRequester && (
                  <RequesterPopover
                    contact={job.requestedBy}
                    onClose={() => setShowRequester(false)}
                  />
                )}
              </DetailTile>
            )}

            <DetailTile
              icon="map"
              label="Address"
              value={getValueOrFallback(job.address)}
              fullWidth={true}
            />
          </div>
        </div>

        <aside className="job-details-side">
          <div className="job-details-side-card">
            <div className="job-details-side-title">
              <IconBadge name="calendar" />
              <span>{featuredVisitLabel}</span>
            </div>

            {visitLoading && (
              <div className="job-details-muted">Loading visit...</div>
            )}

            {!visitLoading && !featuredVisit && (
              <div className="job-details-empty">Not Available</div>
            )}

            {!visitLoading && featuredVisit && (
              <>
                <div className="job-details-visit-service">{title}</div>
                <div className="job-details-visit-meta">
                  <span className={`job-details-inline-badge ${String(featuredVisit.status || "").toLowerCase()}`}>
                    {featuredVisit.status ? featuredVisit.status.replace(/_/g, " ") : "Not Available"}
                  </span>
                </div>
                <div className="job-details-visit-datetime">
                  <span>{featuredVisit.scheduled_date ? formatDate(featuredVisit.scheduled_date) : "Not Available"}</span>
                  <span>{featuredVisit.scheduled_date ? (formatTime(featuredVisit.scheduled_date) === "-" ? "Time TBD" : formatTime(featuredVisit.scheduled_date)) : "Not Available"}</span>
                </div>

              </>
            )}
          </div>

          <div className="job-details-side-card">
            <div className="job-details-side-title">
              <IconBadge name="note" />
              <span>Latest Update</span>
            </div>

            {loading && (
              <div className="job-details-muted">Loading update...</div>
            )}

            {!loading && !latestUpdate && (
              <div className="job-details-empty">Not Available</div>
            )}

            {!loading && latestUpdate && (
              <>
                <div className="job-details-update">
                  {truncateText(latestUpdate.message)}
                </div>
                <div className="job-details-timestamp">
                  {formatDateTime(latestUpdate.created_at)}
                </div>
              </>
            )}
          </div>

          <div className="job-details-actions">
            <button
              onClick={() => navigate(`${base}/jobs/${job.id}`)}
              className="job-action-btn primary"
            >
              View / Update
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
