import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import JobHeader from "../components/JobHeader";
import JobUpdateComposer from "../components/JobUpdateComposer";
import JobTimeline from "../components/JobTimeline";
import "./jobpage.css";
import AssignWorkOrderModal from "../components/AssignWorkOrderModal";
import { apiFetch } from "../api";
import {
  compareDateValues,
  formatDate,
  formatTime,
  toDateInputValue,
  toTimeInputValue,
} from "../utils/date";






export default function JobPage() {
  const { jobId } = useParams();
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dateForm, setDateForm] = useState({ start_date: "", end_date: "" });
  const [scheduleType, setScheduleType] = useState("single");
  const [savingDates, setSavingDates] = useState(false);
  const role = localStorage.getItem("role");
  const canAssign = role !== "technician";
  const canGenerateRecurring = ["admin", "branch_admin", "supervisor"].includes(role);
  const [openVisitMenu, setOpenVisitMenu] = useState(null);

  // Visit scheduling state
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [visitTechs, setVisitTechs] = useState([]);
  const [savingVisit, setSavingVisit] = useState(false);
  const [generatingRecurring, setGeneratingRecurring] = useState(false);
  const [recurringMessage, setRecurringMessage] = useState("");

  //visit reschedule/change tech state
  const [editVisit, setEditVisit] = useState(null);
  const [isEditVisitModalOpen, setIsEditVisitModalOpen] = useState(false);

  const [rescheduleVisit, setRescheduleVisit] = useState(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);

  function resetVisitForm() {
    setVisitDate("");
    setVisitTime("");
    setVisitTechs([]);
  }


  // ✅ Fetch job visits (reusable)
  const loadVisits = async () => {
    try {
      const res = await apiFetch(`/api/visits/jobs/${jobId}/visits`);
      const data = await res.json();
      setVisits(Array.isArray(data) ? data : data.visits || []);
    } catch (err) {
      console.error("Failed to load visits", err);
    }
  };

  // ✅ Fetch job history (reusable)
  const reloadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await apiFetch(`/api/jobs/${jobId}/history`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error("Failed to reload history", err);
    } finally {
      setLoadingHistory(false);
    }
  };



  // ✅ Initial load
  useEffect(() => {
    async function loadJob() {
      try {
        const jobRes = await apiFetch(`/api/jobs/${jobId}`);

        if (!jobRes.ok) throw new Error("Job fetch failed");

        const jobData = await jobRes.json();
        setJob(jobData);

        setDateForm({
          start_date: jobData.start_date
            ? new Date(jobData.start_date).toISOString().slice(0, 10)
            : "",
          end_date: jobData.dueDate
            ? new Date(jobData.dueDate).toISOString().slice(0, 10)
            : "",
        });

        setScheduleType(jobData.dueDate ? "range" : "single");

        await reloadHistory();

      } catch (err) {
        console.error("Failed to load job", err);
      } finally {
        setLoading(false);
      }
    }

    loadJob();
  }, [jobId]);
  // ✅ Load visits when jobId changes
  useEffect(() => {
    if (!jobId) return;
    loadVisits();
  }, [jobId]);


  // Early returns
  if (loading) return <div>Loading…</div>;
  if (!job) return <div>Job not found</div>;
  const jobstatus = job.status;
  const displayStatus = job.display_status || jobstatus;
  const approvalStatus = job.approval_status;
  const awaitingApproval = approvalStatus === "PENDING" && ["IN_PROGRESS", "PAUSED"].includes(jobstatus);
  const isCanceled = jobstatus === "CANCELED";
  const isLost = displayStatus === "LOST";
  const canStart = jobstatus === "NOT_STARTED" && !isCanceled && !isLost;

  const token = localStorage.getItem("token");

  let userId = null;

  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userId = payload.id;
    } catch (err) {
      console.error("Token parse failed", err);
    }
  }
  const today = toDateInputValue(new Date());

  const sortedVisits = [...visits].sort((a, b) =>
    compareDateValues(a.scheduled_date, b.scheduled_date)
  );





  const visibleVisits =
    role === "technician"
      ? sortedVisits.filter((v) => {
        const assigned =
          v.technicians?.some((t) => Number(t.id) === Number(userId));

        return assigned; // ✅ NO DATE FILTER
      })
      : sortedVisits;

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const toDateOnly = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const missedVisits = visibleVisits.filter(
    v =>
      toDateOnly(v.scheduled_date) < todayDate &&
      v.status === "SCHEDULED"
  );

  const todayVisits = visibleVisits.filter(
    v =>
      toDateOnly(v.scheduled_date).getTime() === todayDate.getTime()
  );

  const upcomingVisits = visibleVisits.filter(
    v =>
      toDateOnly(v.scheduled_date) > todayDate
  );


  //visits status flow: SCHEDULED -> IN_PROGRESS -> AWAITING_APPROVAL -> COMPLETED
  async function startVisit(visitId) {
    try {

      const res = await apiFetch(`/api/visits/${visitId}/start`, {
        method: "PATCH"
      });

      if (!res.ok) throw new Error("Start visit failed");

      await loadVisits();   // refresh UI

    } catch (err) {
      console.error(err);
    }
  }

  async function submitVisit(visitId) {
    try {

      const res = await apiFetch(`/api/visits/${visitId}/submit`, {
        method: "PATCH"
      });

      if (!res.ok) throw new Error("Submit failed");

      await loadVisits();

    } catch (err) {
      console.error(err);
    }
  }

  async function approveVisit(visitId) {
    try {

      const res = await apiFetch(`/api/visits/${visitId}/approve`, {
        method: "PATCH"
      });

      if (!res.ok) throw new Error("Approve failed");

      await loadVisits();

    } catch (err) {
      console.error(err);
    }
  }


  // Handle technician updates for a visit
  async function updateVisitTechnicians(visitId) {
    try {

      const res = await apiFetch(`/api/visits/${visitId}/technicians`, {
        method: "PATCH",
        body: JSON.stringify({
          technician_ids: visitTechs
        })
      });

      if (!res.ok) throw new Error("Update failed");

      setEditVisit(null);
      await loadVisits();

    } catch (err) {
      console.error(err);
    }
  }

  // Separate function for rescheduling to keep it clean
  async function rescheduleVisitDate(visitId) {
    try {

      const res = await apiFetch(`/api/visits/${visitId}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduled_date: visitDate,
          scheduled_time: visitTime,
        })
      });

      if (!res.ok) throw new Error("Reschedule failed");

      setRescheduleVisit(null);
      setVisitDate("");
      setVisitTime("");
      await loadVisits();

    } catch (err) {
      console.error(err);
    }
  }

  // Handle status updates (start, pause, complete, etc.)
  async function updateStatus(newStatus) {
    try {
      const token = localStorage.getItem("token");

      const res = await apiFetch(`/api/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Status update failed");

      const jobRes = await apiFetch(`/api/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setJob(await jobRes.json());
      await reloadHistory();
    } catch (err) {
      console.error(err);
    }
  }

  // Handle submit for approval (technician action)
  async function submitForApproval() {
    try {
      const res = await apiFetch(`/api/jobs/${jobId}/submit-approval`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Submit for approval failed");

      const jobRes = await apiFetch(`/api/jobs/${jobId}`);
      setJob(await jobRes.json());
      await reloadHistory();
    } catch (err) {
      console.error(err);
    }
  }

  // Handle visit cancellation
  function openChangeTech(visit) {
    setEditVisit(visit);
    setVisitTechs(visit.technicians?.map(t => t.id) || []);
    setIsEditVisitModalOpen(true);
  }
  // Handle visit cancellation
  function openReschedule(visit) {
    setRescheduleVisit(visit);
    setVisitDate(toDateInputValue(visit.scheduled_date));
    setVisitTime(toTimeInputValue(visit.scheduled_date));
    setIsRescheduleModalOpen(true);
  }

  function VisitCard({ visit, type }) {

  const isMissed = type === "missed";

  async function handleStart() {
    if (isMissed) {
      console.log("Start Anyway", visit.id); //change to visit.id when API ready
      // later → start-anyway API
    } else {
      await startVisit(visit.id);
      // existing startVisit
    }
  }

  return (
    <div className="job-visit-card">

      <div className="job-visit-header">
        <strong>Visit #{visit.visit_number}</strong>
        <span className={`job-visit-status ${visit.status}`}>
          {isMissed ? "MISSED" : visit.status}
        </span>
      </div>

      <div className="job-visit-schedule">
        <div>{formatDate(visit.scheduled_date)}</div>
        <div>{formatTime(visit.scheduled_date)}</div>
      </div>

      {/* 🔥 BUTTON LOGIC */}
      {visit.status === "SCHEDULED" && (
        <button
          className="visit-start-btn"
          onClick={handleStart}
        >
          {isMissed ? "Start Anyway" : "Start Visit"}
        </button>
      )}

    </div>
  );
}

  // Handle visit cancellation
  async function cancelVisit(visitId) {
    try {

      const res = await apiFetch(`/api/visits/${visitId}/cancel`, {
        method: "PATCH"
      });

      if (!res.ok) throw new Error("Cancel failed");

      await loadVisits();

    } catch (err) {
      console.error(err);
    }
  }

  // Handle visit creation
  async function handleCreateVisit() {
    try {
      setSavingVisit(true);

      const res = await apiFetch(`/api/visits/jobs/${jobId}/visits`, {
        method: "POST",
        body: JSON.stringify({
          scheduled_date: visitDate,
          scheduled_time: visitTime,
          technician_ids: visitTechs,
        }),
      });

      if (!res.ok) throw new Error("Failed to create visit");

      await res.json();

      setIsVisitModalOpen(false);
      resetVisitForm();

      await reloadHistory();
      await loadVisits();

    } catch (err) {
      console.error(err);
    } finally {
      setSavingVisit(false);
    }
  }

  async function handleGenerateRecurring() {
    if (!job?.booking_id) return;
    try {
      setGeneratingRecurring(true);
      const res = await apiFetch(`/api/bookings/${job.booking_id}/generate-jobs`, {
        method: "POST",
        body: JSON.stringify({ days: 30 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate recurring jobs");
      }
      const createdCount = Number(data?.created || 0);
      setRecurringMessage(`Generated ${createdCount} job${createdCount === 1 ? "" : "s"} for the next 30 days.`);
    } catch (err) {
      console.error(err);
      setRecurringMessage("Failed to generate recurring jobs.");
    } finally {
      setGeneratingRecurring(false);
    }
  }

  // Handle assignment from AssignWorkOrderModal
  async function handleAssignSingle({ supervisorId, technicianIds, scope, rangeStart, rangeEnd }) {
    try {
      const res = await apiFetch(`/api/jobs/assign`, {
        method: "POST",
        body: JSON.stringify({
          jobIds: [job.id],
          supervisorId,
          technicianIds,
          scope,
          rangeStart,
          rangeEnd,
        }),
      });

      if (!res.ok) throw new Error("Assign failed");

      // refresh job + timeline
      const jobRes = await apiFetch(`/api/jobs/${job.id}`);
      setJob(await jobRes.json());

      await reloadHistory();
      await loadVisits();
      setIsAssignOpen(false);
    } catch (err) {
      console.error("Assignment failed", err);
    }



  }

  return (
    <div className="job-page">
      <div className="job-page-layout">


        {/* LEFT COLUMN */}
        <div className="job-left">
          <JobHeader job={job} setIsAssignOpen={canAssign ? setIsAssignOpen : null} />

          {role !== "technician" && (
            <div className="job-schedule-card">
              <div className="job-schedule-title">Schedule</div>

              {!job.start_date ? (
                <div className="job-schedule-empty">
                  Schedule not set
                </div>
              ) : job.dueDate ? (
                <div className="job-schedule-grid">
                  <div className="job-schedule-field">
                    <span>Start date</span>
                    <div className="job-schedule-value">
                      {formatDate(job.start_date)}
                    </div>
                  </div>

                  <div className="job-schedule-field">
                    <span>End date</span>
                    <div className="job-schedule-value">
                      {formatDate(job.dueDate)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="job-schedule-grid">
                  <div className="job-schedule-field">
                    <span>Date of service</span>
                    <div className="job-schedule-value">
                      {formatDate(job.start_date)}
                    </div>
                  </div>
                </div>
              )}
            </div>)}

          {canGenerateRecurring && job?.booking_id && (
            <div className="job-booking-card">
              <div className="job-booking-title">Booking</div>
              <div className="job-booking-row">
                <span>Booking Code</span>
                <strong>{job.booking_code || job.booking_id}</strong>
              </div>
              {job.has_recurring ? (
                <button
                  className="job-btn job-btn-primary"
                  onClick={handleGenerateRecurring}
                  disabled={generatingRecurring}
                >
                  {generatingRecurring ? "Generating..." : "Generate Next 30 Days"}
                </button>
              ) : (
                <div className="job-booking-note">No recurring schedule for this booking.</div>
              )}
              {recurringMessage && (
                <div className="job-booking-message">{recurringMessage}</div>
              )}
            </div>
          )}


          {role !== "technician" && (
            <div className="job-actions">

              {jobstatus === "CREATED" && (
                <div className="job-actions-info">
                  Waiting for assignment
                </div>
              )}

              {canStart && (
                <button
                  className="job-btn job-btn-start"
                  onClick={() => updateStatus("IN_PROGRESS")}
                >
                  Start Job
                </button>
              )}

              {jobstatus === "IN_PROGRESS" && !awaitingApproval && (
                role === "technician" ? (
                  <button
                    className="job-btn job-btn-complete"
                    onClick={submitForApproval}
                  >
                    Submit for Approval
                  </button>
                ) : (
                  <div className="job-actions-row">
                    <button
                      className="job-btn job-btn-pause"
                      onClick={() => updateStatus("PAUSED")}
                    >
                      Pause
                    </button>
                    <button
                      className="job-btn job-btn-complete"
                      onClick={() => updateStatus("COMPLETED")}
                    >
                      Complete
                    </button>
                  </div>
                )
              )}

              {jobstatus === "PAUSED" && !awaitingApproval && (
                role === "technician" ? (
                  <button
                    className="job-btn job-btn-complete"
                    onClick={submitForApproval}
                  >
                    Submit for Approval
                  </button>
                ) : (
                  <div className="job-actions-row">
                    <button
                      className="job-btn job-btn-resume"
                      onClick={() => updateStatus("IN_PROGRESS")}
                    >
                      Resume
                    </button>
                    <button
                      className="job-btn job-btn-complete"
                      onClick={() => updateStatus("COMPLETED")}
                    >
                      Complete
                    </button>
                  </div>
                )
              )}

              {awaitingApproval && (
                role === "technician" ? (
                  <div className="job-actions-info">
                    Awaiting supervisor approval
                  </div>
                ) : (
                  <button
                    className="job-btn job-btn-complete"
                    onClick={() => updateStatus("COMPLETED")}
                  >
                    Approve & Complete
                  </button>
                )
              )}

              {jobstatus === "COMPLETED" && (
                <div className="job-actions-success">
                  Completed
                </div>
              )}

              {jobstatus === "CANCELED" && (
                <div className="job-actions-cancel">
                  Canceled
                </div>
              )}

            </div>)}

          <div className="job-visits">
            <h3>Visits</h3>

            {/* MISSED */}
            {missedVisits.length > 0 && (
              <>
                <h4>Missed</h4>
                {missedVisits.map((visit) => (
                  <VisitCard key={visit.id} visit={visit} type="missed" />
                ))}
              </>
            )}

            {/* TODAY */}
            {todayVisits.length > 0 && (
              <>
                <h4>Today</h4>
                {todayVisits.map((visit) => (
                  <VisitCard key={visit.id} visit={visit} type="today" />
                ))}
              </>
            )}

            {/* UPCOMING */}
            {upcomingVisits.length > 0 && (
              <>
                <h4>Upcoming</h4>
                {upcomingVisits.map((visit) => (
                  <VisitCard key={visit.id} visit={visit} type="upcoming" />
                ))}
              </>
            )}

            {/* EMPTY */}
            {visibleVisits.length === 0 && (
              <div className="job-visits-empty">
                No visits assigned
              </div>
            )}
          </div>


          {role !== "technician" && (
            <div className="job-visits-actions">
              <button
                className="job-btn job-btn-primary"
                onClick={() => {
                  resetVisitForm();
                  setIsVisitModalOpen(true);
                }}
              >
                Schedule Visit
              </button>
            </div>
          )}
          {/* Add comments and files  */}
          <JobUpdateComposer
            onSubmit={async ({ message, files }) => {
              try {
                // 1. Create comment
                const commentRes = await apiFetch(
                  `/api/jobs/${jobId}/comments`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      message,
                      created_by_user_id: 101, // TEMP
                    }),
                  }
                );

                const commentData = await commentRes.json();
                const history_id = commentData.history_id;

                // 2. Upload real files (MinIO + DB)
                for (const file of files) {
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("history_id", history_id);
                  formData.append(
                    "type",
                    file.type.startsWith("image") ? "IMAGE" : "FILE"
                  );

                  await apiFetch(`/api/jobs/${jobId}/attachments/upload`, {
                    method: "POST",
                    body: formData, // no headers
                  });
                }

                await reloadHistory();
              } catch (err) {
                console.error("Failed to submit update", err);
              }
            }}
          />


          <JobTimeline history={history} />
        </div>

        {/* RIGHT COLUMN */}
        <div className="job-right">
          <h4>Files & Documents</h4>
          <p>No files yet</p>
        </div>
        {canAssign && (
          <AssignWorkOrderModal
            isOpen={isAssignOpen}
            jobCount={1}
            onClose={() => setIsAssignOpen(false)}
            onAssign={handleAssignSingle}
          />
        )}



      </div>
      {isVisitModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">

            <h3>Schedule Visit</h3>

            <div className="visit-form-group">
              <label>Visit Date</label>

              <input
                type="date"
                className="visit-date-input"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>

            <div className="visit-form-group">
              <label>Visit Time</label>

              <input
                type="time"
                className="visit-date-input"
                value={visitTime}
                onChange={(e) => setVisitTime(e.target.value)}
              />
            </div>

            <div className="visit-form-group">
              <label>Technicians</label>

              <div className="visit-tech-list">
                {job.team?.map((t) => (
                  <label key={t.id} className="visit-tech-item">
                    <input
                      type="checkbox"
                      checked={visitTechs.includes(t.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setVisitTechs([...visitTechs, t.id]);
                        } else {
                          setVisitTechs(visitTechs.filter(id => id !== t.id));
                        }
                      }}
                    />
                    <span>{t.name}</span>
                  </label>
                ))}
              </div>



            </div>

            <div className="modal-actions">
              <button
                onClick={() => {
                  setIsVisitModalOpen(false);
                  resetVisitForm();
                }}
              >
                Cancel
              </button>

              <button
                disabled={savingVisit || !visitDate || !visitTime}
                onClick={handleCreateVisit}
              >
                {savingVisit ? "Saving..." : "Create Visit"}
              </button>
            </div>

          </div>
        </div>
      )}

      {editVisit && (
        <div className="modal-overlay">
          <div className="modal-card">

            <h3>Change Technicians</h3>

            <div className="visit-tech-list">
              {job.team?.map((t) => (
                <label key={t.id} className="visit-tech-item">
                  <input
                    type="checkbox"
                    checked={visitTechs.includes(t.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setVisitTechs([...visitTechs, t.id]);
                      } else {
                        setVisitTechs(visitTechs.filter(id => id !== t.id));
                      }
                    }}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>

            <div className="modal-actions">
              <button onClick={() => setEditVisit(null)}>Cancel</button>

              <button
                onClick={() => updateVisitTechnicians(editVisit.id)}
              >
                Save
              </button>
            </div>

          </div>
        </div>
      )}

      {rescheduleVisit && (
        <div className="modal-overlay">
          <div className="modal-card">

            <h3>Reschedule Visit</h3>

            <div className="visit-form-group">
              <label>Visit Date</label>
              <input
                type="date"
                className="visit-date-input"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>

            <div className="visit-form-group">
              <label>Visit Time</label>
              <input
                type="time"
                className="visit-date-input"
                value={visitTime}
                onChange={(e) => setVisitTime(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button
                onClick={() => {
                  setRescheduleVisit(null);
                  setVisitDate("");
                  setVisitTime("");
                }}
              >
                Cancel
              </button>

              <button
                disabled={!visitDate || !visitTime}
                onClick={() => rescheduleVisitDate(rescheduleVisit.id)}
              >
                Save
              </button>
            </div>

          </div>
        </div>
      )}





    </div>



  );



}





