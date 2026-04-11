import "./jobrow.css";
import { useState } from "react";
import RequesterPopover from "./RequesterPopover";

export default function JobHeader({ job, setIsAssignOpen }) {
  const [showRequester, setShowRequester] = useState(false);
  if (!job) return null;

  const role = localStorage.getItem("role");
  const canAssign = role !== "technician";

  const {
    title,
    code,
    status,
    requestedBy,
    supervisor,
    team = []
  } = job;

  const displayStatus = job.display_status || status || "";

  const companyName =
    job.companyname ||
    job.requestedBy?.company?.name ||
    job.requestedBy?.company ||
    "-";

  return (
    <div className="job-header">

      {/* LEFT */}
      <div className="job-header-left">

        <h1 className="job-title">{title}</h1>
        <h3 className="job-subtitle">{companyName}</h3>

        <div className="job-meta">
          <span className="job-code">{code}</span>
        </div>

        {/* PEOPLE ROW */}
        <div className="job-people-row">

          {/* REQUESTED BY */}
          <div className="job-person">
            <span className="label">Requested By:</span>

            {requestedBy ? (
              <button
                className="link-button"
                onClick={() => setShowRequester(prev => !prev)}
              >
                {requestedBy.name}
              </button>
            ) : (
              <span>-</span>
            )}
          </div>

          {/* SUPERVISOR */}
          {role !== "technician" && (
            <div className="job-person">
              <span className="label">Supervisor:</span>

              {canAssign && setIsAssignOpen ? (
                <button
                  className="link-button"
                  onClick={() => setIsAssignOpen(true)}
                >
                  {supervisor?.name ?? "Unassigned"}
                </button>
              ) : (
                <span>{supervisor?.name ?? "Unassigned"}</span>
              )}
            </div>
          )}

        </div>

        {/* POPOVER (always below row) */}
        {showRequester && requestedBy && (
          <div className="requester-popover">
            <RequesterPopover
              contact={requestedBy}
              onClose={() => setShowRequester(false)}
            />
          </div>
        )}

      </div>

      {/* RIGHT */}
      <div className="job-header-right">

        {/* TEAM */}
        {role !== "technician" && team.length > 0 && (
          <div className="team-line">
            <span className="label">Team:</span>{" "}
            {team.map(m => m.name).join(", ")}
          </div>
        )}

        <button className={`job-status ${displayStatus.toLowerCase()}`}>
          {displayStatus}
        </button>

      </div>
    </div>
  );
}