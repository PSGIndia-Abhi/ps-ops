import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RequesterPopover from "./RequesterPopover";
import { apiFetch } from "../api";
import { formatDateTime } from "../utils/date";
import { roleBasePath } from "../auth/roleBasePath";

export default function JobDetails({ job }) {
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamNames, setTeamNames] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const navigate = useNavigate();
  const [showRequester, setShowRequester] = useState(false);
  
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
  const hasScheduleRange = Boolean(job.dueDate);
  

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    (async () => {
      try {
        const res = await apiFetch(`/api/jobs/${job.id}/history`);
        if (!res?.ok) throw new Error("History fetch failed");
        const data = await res.json();
        if (isMounted) setHistory(data);
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
    setTeamLoading(true);

    (async () => {
      try {
        const res = await apiFetch(`/api/jobs/${job.id}`);
        if (!res?.ok) throw new Error("Job fetch failed");
        const data = await res.json();
        const names = Array.isArray(data.team)
          ? data.team.map(member => member?.name).filter(Boolean)
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
  


  // Latest update only (history comes DESC from backend)
  const latestUpdate = history.length > 0 ? history[0] : null;

    return (
    <div className="job-details-card">
      <div className="job-details-header">
        <div className="job-details-title-block">
          <div className="job-details-code">{job.code}</div>
          <div className="job-details-title">{title}</div>
        </div>

        <div className={`job-details-status ${displayStatus.toLowerCase()}`}>
          {displayStatus.replace("_", " ")}
        </div>
      </div>

      <div className="job-details-meta">
        <div className="job-details-item">
          <div className="job-details-label">
            {hasScheduleRange ? "Start Date" : "Date of Service"}
          </div>
          <div className="job-details-value">
            {job.start_date
              ? formatDateTime(job.start_date)
              : "—"}
          </div>
        </div>
        {hasScheduleRange && (
          <div className="job-details-item">
            <div className="job-details-label">End Date</div>
            <div className="job-details-value">
              {job.dueDate
                ? formatDateTime(job.dueDate)
                : "—"}
            </div>
          </div>
        )}
        <div className="job-details-item">
          <div className="job-details-label">Address</div>
          <div className="job-details-value">
            {job.address || "—"}
          </div>
        </div>
        <div className="job-details-item">
          <div className="job-details-label">Supervisor</div>
          <div className="job-details-value">
            {job.supervisor?.name || "Unassigned"}
          </div>
        </div>
        <div className="job-details-item">
          <div className="job-details-label">Team Members</div>
          <div className="job-details-value">
            {teamLoading
              ? "Loading..."
              : teamNames.length > 0
                ? teamNames.join(", ")
                : "Not assigned"}
          </div>
        </div>
        {canShowRequester && (
          <div className="job-details-item" style={{ position: "relative" }}>
          <div className="job-details-label">Requested by</div>
          <button
            onClick={() => setShowRequester(v => !v)}
            className="job-details-requester"
          >
            {job.requestedBy?.name || "—"}
            {job.requestedBy?.company && (
              <span className="job-details-company">
                {job.requestedBy.company.code}
              </span>
            )}
          </button>

          {showRequester && (
            <RequesterPopover
              contact={job.requestedBy}
              onClose={() => setShowRequester(false)}
            />
          )}
          </div>
        )}
      </div>

      <div className="job-details-latest">
        <div className="job-details-section-title">Latest Update</div>

        {loading && (
          <div className="job-details-muted">Loading update…</div>
        )}

        {!loading && !latestUpdate && (
          <div className="job-details-empty">No updates yet</div>
        )}

        {!loading && latestUpdate && (
          <>
            <div className="job-details-update">
              {latestUpdate.message}
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
    </div>
  );
}



