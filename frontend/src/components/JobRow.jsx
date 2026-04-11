import "./JobRow.css";
import { formatDate } from "../utils/date";

export default function JobRow({
  job,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
}) {
  const companyLabel = job.companyname;
  const requestedByName =
    job.requestedBy?.name ||
    job.requestedBy?.full_name ||
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
  const title = companyLabel
    ? companyLabel
    : requestedByName || requestedById
      ? `Requested by: ${requestedByName || "Contact"}${requestedByIdText}`
      : "Not Available";
  const service = job.title || job.service_type || "Service Not Available";
  const displayStatus = job.display_status || job.status || "";
  const location = job.site || job.company_site || job.address || "Not Available";
  const workType = job.companyname ? "Corporate Work Order" : "Individual Customer";
  const scheduleDate = job.dueDate || job.start_date;

  function formatScheduleDate(date) {
    if (!date) return "Not Available";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() === 1970) {
      return "Not Available";
    }
    return formatDate(parsed);
  }

  return (
    <div
      className={`job-row ${isExpanded ? "expanded" : ""}`}
      onClick={onToggleExpand}
    >
      <div className="job-row-top">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="job-checkbox"
          onClick={(event) => event.stopPropagation()}
        />

        <div className="job-row-content">
          <div className="job-row-header">
            <div className="job-row-heading">
              <div className="job-companyname">{title}</div>
              <div className="job-meta-line">
                <span className="job-location">{location}</span>
                <span className="job-meta-separator" />
                <span className="job-tag">{workType}</span>
              </div>
            </div>

            <div className={`job-status ${displayStatus}`}>
              {displayStatus ? displayStatus.replace(/_/g, " ") : "Not Available"}
            </div>
          </div>

          <div className="job-service">{service}</div>

          <div className="job-row-footer">
            <div className="job-info-block">
              <div className="job-supervisor-label">Supervisor</div>
              <div className="job-supervisor-name">
                {job.supervisor?.name || "Not Available"}
              </div>
            </div>

            <div className="job-info-block job-info-block-right">
              <div className="job-supervisor-label">Date of Service</div>
              <div className="job-date">{formatScheduleDate(scheduleDate)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
