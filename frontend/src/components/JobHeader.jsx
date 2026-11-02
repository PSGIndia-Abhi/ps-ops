import "./JobRow.css";
import "./JobHeader.css";
import { useState } from "react";
import RequesterPopover from "./RequesterPopover";

export default function JobHeader({ job, setIsAssignOpen }) {
  const [showRequester, setShowRequester] = useState(false);
  if (!job) return null;

  const role = localStorage.getItem("role");
  const canAssign = role !== "technician";
  const canViewRequester = role !== "technician" && role !== "temporary_worker";

  const {
    title,
    code,
    status,
    requestedBy,
    supervisor,
    team = []
  } = job;

  const displayStatus = job.display_status || status || "";

  const companyName = job.requestedBy?.company?.site ?? "-";
  // The service address entered on the booking; the site address if none.
  const address = job.address || job.requestedBy?.company?.address || "";
  const companyLabel = job.requestedBy?.company?.name;

  return (
    <div className="job-header jh">
      <div className="jh-top">
        <span className="jh-code">{code}</span>
        <span className={`job-status ${displayStatus}`}>
          {displayStatus ? displayStatus.replace(/_/g, " ") : "-"}
        </span>
      </div>

      <h1 className="jh-title">{title}</h1>
      <div className="jh-sub">
        {companyLabel && companyLabel !== companyName ? `${companyLabel} · ${companyName}` : companyName}
      </div>

      {/* PEOPLE */}
      <div className="jh-people">
        {/* REQUESTED BY */}
        {canViewRequester && (
          <div className="jh-person">
            <span className="jh-label">Requested by</span>
            {requestedBy ? (
              <button
                type="button"
                className="jh-link"
                onClick={() => setShowRequester(prev => !prev)}
                aria-expanded={showRequester}
              >
                {requestedBy.name}
              </button>
            ) : (
              <span className="jh-value">-</span>
            )}
          </div>
        )}

        {/* SUPERVISOR */}
        {role !== "technician" && (
          <div className="jh-person">
            <span className="jh-label">Supervisor</span>
            {canAssign && setIsAssignOpen ? (
              <button
                type="button"
                className="jh-link"
                onClick={() => setIsAssignOpen(true)}
                title="Change team"
              >
                {supervisor?.name ?? "Unassigned"}
              </button>
            ) : (
              <span className="jh-value">{supervisor?.name ?? "Unassigned"}</span>
            )}
          </div>
        )}

        {/* TEAM */}
        {role !== "technician" && team.length > 0 && (
          <div className="jh-person">
            <span className="jh-label">Technician</span>
            <span className="jh-value">{team.map(m => m.name).join(", ")}</span>
          </div>
        )}
      </div>

      {address && (
        <div className="jh-address">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <span>
            <span className="jh-label">Address</span>
            <span className="jh-address-text">{address}</span>
          </span>
        </div>
      )}

      {/* POPOVER (always below the people row) */}
      {showRequester && requestedBy && (
        <div className="requester-popover">
          <RequesterPopover
            contact={requestedBy}
            onClose={() => setShowRequester(false)}
          />
        </div>
      )}
    </div>
  );
}
