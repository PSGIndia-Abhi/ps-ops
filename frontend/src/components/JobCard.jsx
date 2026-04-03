import { useNavigate } from "react-router-dom";

const role = localStorage.getItem("role");

export default function JobCard({
  job,
  updateStatus,
  onSubmitApproval,
  basePath = "/technician"
}) {
  const navigate = useNavigate();

  const title = job.title;
  const displayStatus = job.display_status || job.status || "";
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
  const awaitingApproval =
    job.approval_status === "PENDING" &&
    ["IN_PROGRESS", "PAUSED"].includes(job.status);
  const isCanceled = job.status === "CANCELED";
  const isLost = displayStatus === "LOST";
const canStart =
  ["CREATED", "NOT_STARTED"].includes(job.status) &&
  !isCanceled &&
  !isLost;

  function openJob() {
    navigate(`${basePath}/jobs/${job.id}`);
  }
 

  return (
    <div className="job-card">

      {/* top section */}
      <div className="job-card-header" onClick={openJob}>
        <div className="job-card-headings">
          <div className="job-card-company">{companyHeading}</div>
          {site && <div className="job-card-site">{site}</div>}
          <div className="job-card-title">
            {title}
          </div>
        </div>

        <div className={`job-card-status status-${displayStatus}`}>
          {displayStatus.replace("_", " ")}
        </div>
      </div>

      <div className="job-card-body" onClick={openJob}>
        <div className="job-card-address">
          {job.address || "No address"}
        </div>
      </div>

      {/* actions */}
      {role !== "technician" && (
        <div className="job-card-actions">

        {awaitingApproval && (
          <button className="btn-complete" disabled>
            Awaiting Approval
          </button>
        )}

        {!awaitingApproval && canStart && (
          <button className="btn-start" onClick={() => updateStatus(job.id, "IN_PROGRESS")}>
            Start
          </button>
        )}

        {!awaitingApproval && job.status === "IN_PROGRESS" && onSubmitApproval && (
          <button className="btn-complete" onClick={() => onSubmitApproval(job.id)}>
            Submit for Approval
          </button>
        )}

        {!awaitingApproval && job.status === "PAUSED" && onSubmitApproval && (
          <button className="btn-complete" onClick={() => onSubmitApproval(job.id)}>
            Submit for Approval
          </button>
        )}
        

      </div>)}
    </div>
  );
}
