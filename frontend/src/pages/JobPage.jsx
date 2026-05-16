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
  const isTemporaryWorker = role === "temporary_worker";
  const isTechnician = role === "technician";
  const canAssign = !isTechnician && !isTemporaryWorker;
  const canGenerateRecurring = ["admin", "branch_admin", "supervisor"].includes(role);
  const canGenerateTemporaryAccess = ["admin", "branch_admin", "supervisor"].includes(role);
  const canManageJobSchedule = !isTechnician && !isTemporaryWorker;
  const canManageJobStatus = !isTechnician && !isTemporaryWorker;
  const canScheduleVisits = !isTechnician && !isTemporaryWorker;
  const canManageVisitActions = !isTechnician && !isTemporaryWorker;
  const [openVisitMenu, setOpenVisitMenu] = useState(null);
  const [tempWorkerName, setTempWorkerName] = useState("");
  const [tempWorkerPhone, setTempWorkerPhone] = useState("");
  const [tempAccessLoading, setTempAccessLoading] = useState(false);
  const [tempAccessData, setTempAccessData] = useState(null);
  const [tempAccessRecords, setTempAccessRecords] = useState([]);
  const [revokingAccessId, setRevokingAccessId] = useState(null);
  const [openAccordions, setOpenAccordions] = useState({
    schedule: true,
    booking: true,
    temporaryAccess: true,
  });

  // Visit scheduling state
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [visitTechs, setVisitTechs] = useState([]);
  const [visitTempWorkers, setVisitTempWorkers] = useState([]);
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
    setVisitTempWorkers([]);
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

  useEffect(() => {
    if (!canGenerateTemporaryAccess || !jobId) return;
    const storageKey = `temp-access:${jobId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved) return;
      const shareLink = saved.share_link
        || (saved.access_id
          ? `${window.location.origin}/temp-access?access=${encodeURIComponent(saved.access_id)}&job=${encodeURIComponent(jobId)}`
          : null);
      setTempAccessData({
        ...saved,
        share_link: shareLink,
      });
      if (saved.worker_name) setTempWorkerName(saved.worker_name);
      if (saved.phone_number) setTempWorkerPhone(saved.phone_number);
    } catch (err) {
      console.error("Failed to restore temporary access state:", err);
    }
  }, [canGenerateTemporaryAccess, jobId]);

  async function loadTemporaryAccessRecords() {
    if (!canGenerateTemporaryAccess || !jobId) return;
    try {
      const res = await apiFetch(`/api/auth/temporary-access?job_id=${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch temporary access records");
      }
      setTempAccessRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadTemporaryAccessRecords();
  }, [canGenerateTemporaryAccess, jobId]);
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
  let tempAccessId = null;

  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userId = payload.id;
      tempAccessId = payload.temp_access_id || null;
    } catch (err) {
      console.error("Token parse failed", err);
    }
  }
  const today = toDateInputValue(new Date());

  const sortedVisits = [...visits].sort((a, b) =>
    compareDateValues(a.scheduled_date, b.scheduled_date)
  );





  const visibleVisits =
    isTechnician
      ? sortedVisits.filter((v) => {
        const assigned =
          v.technicians?.some((t) => Number(t.id) === Number(userId));

        return assigned; // ✅ NO DATE FILTER
      })
      : isTemporaryWorker
        ? sortedVisits.filter((v) =>
          v.temporary_workers?.some((w) => String(w.id) === String(tempAccessId))
        )
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
    v.status === "MISSED"
);

  const todayVisits = visibleVisits.filter(
    v =>
      toDateOnly(v.scheduled_date).getTime() === todayDate.getTime()
  );

  const upcomingVisits = visibleVisits.filter(
    v =>
      toDateOnly(v.scheduled_date) > todayDate
  );

  const hasPendingVisits = visits.some(v =>
  ["SCHEDULED", "IN_PROGRESS", "AWAITING_APPROVAL"].includes(v.status)
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

  async function startVisitAnyway(visitId) {
    try {
      const res = await apiFetch(`/api/visits/${visitId}/start-anyway`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Start anyway failed");

      await loadVisits();
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
          technician_ids: visitTechs,
          temporary_access_ids: visitTempWorkers,
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

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Status update failed");
        return;
      }

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
    setVisitTempWorkers(visit.temporary_workers?.map((w) => w.id) || []);
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
    const canManageVisit =
      canManageVisitActions &&
      !["COMPLETED", "CANCELED"].includes(String(visit.status || "").toUpperCase());

    async function handleStart() {
      if (isMissed) {
        await startVisitAnyway(visit.id);
      } else {
        await startVisit(visit.id);
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

        {visit.technicians?.length > 0 && (
          <div className="job-visit-techs">
            {visit.technicians.map((tech) => (
              <span key={tech.id} className="job-visit-tech">
                {tech.name}
              </span>
            ))}
          </div>
        )}

        {visit.temporary_workers?.length > 0 && (
          <div className="job-visit-techs">
            {visit.temporary_workers.map((worker) => (
              <span key={worker.id} className="job-visit-tech">
                {worker.name} (Temp)
              </span>
            ))}
          </div>
        )}

        {/* 🔥 BUTTON LOGIC */}

        <div className="job-visit-actions">
          {["SCHEDULED", "MISSED"].includes(visit.status) && (
            <button
              className="visit-start-btn"
              onClick={handleStart}
            >
              {isMissed ? "Start Anyway" : "Start Visit"}
            </button>
          )}

          {/* SUBMIT (technician + supervisor) */}
          {visit.status === "IN_PROGRESS" && (
            <button
              className="visit-start-btn"
              onClick={() => submitVisit(visit.id)}>
              Submit for Approval
            </button>
          )
          }

          {visit.status === "AWAITING_APPROVAL" && !isTechnician && !isTemporaryWorker && (
            <button onClick={() => approveVisit(visit.id)}>
              Approve
            </button>
          )}


          {canManageVisit && (
            <>
              <button
                className="visit-action-btn"
                onClick={() =>
                  setOpenVisitMenu((prev) => (prev === visit.id ? null : visit.id))
                }
              >
                Edit Visit
              </button>

              {openVisitMenu === visit.id && (
                <div className="visit-menu">
                  <button
                    onClick={() => {
                      setOpenVisitMenu(null);
                      openReschedule(visit);
                    }}
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => {
                      setOpenVisitMenu(null);
                      openChangeTech(visit);
                    }}
                  >
                    Change Technicians
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      setOpenVisitMenu(null);
                      cancelVisit(visit.id);
                    }}
                  >
                    Cancel Visit
                  </button>
                </div>
              )}
            </>
          )}
        </div>

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
          temporary_access_ids: visitTempWorkers,
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

  async function handleGenerateTemporaryAccess() {
    if (!job?.id) return;
    if (!tempWorkerPhone.trim()) {
      alert("Phone number is required");
      return;
    }
    try {
      setTempAccessLoading(true);
      const res = await apiFetch("/api/auth/temporary-access/send-otp", {
        method: "POST",
        body: JSON.stringify({
          job_id: job.id,
          phone_number: tempWorkerPhone.trim(),
          worker_name: tempWorkerName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to generate temporary access");
        return;
      }

      const shareLink = `${window.location.origin}/temp-access?access=${encodeURIComponent(data.access_id)}&job=${encodeURIComponent(job.id)}`;
      const nextData = {
        ...data,
        worker_name: tempWorkerName.trim() || null,
        phone_number: tempWorkerPhone.trim(),
        share_link: shareLink,
      };
      setTempAccessData(nextData);
      localStorage.setItem(`temp-access:${job.id}`, JSON.stringify(nextData));
      await loadTemporaryAccessRecords();
    } catch (err) {
      console.error("Generate temporary access failed:", err);
      alert("Failed to generate temporary access");
    } finally {
      setTempAccessLoading(false);
    }
  }

  async function copyText(value, successMessage) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      alert(successMessage);
    } catch (err) {
      console.error("Copy failed:", err);
      alert("Copy failed");
    }
  }

  function buildTempAccessLink(accessId) {
    if (!accessId || !jobId) return "";
    return `${window.location.origin}/temp-access?access=${encodeURIComponent(accessId)}&job=${encodeURIComponent(jobId)}`;
  }

  function getTempAccessStatus(record) {
    if (!record) return "UNKNOWN";
    if (record.revoked_at) return "REVOKED";
    if (record.used_at) return "USED";
    if (record.expires_at && new Date(record.expires_at) < new Date()) return "EXPIRED";
    return "ACTIVE";
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  async function revokeTemporaryAccess(accessId) {
    if (!accessId) return;
    const ok = window.confirm("Revoke this temporary access? This cannot be undone.");
    if (!ok) return;
    try {
      setRevokingAccessId(accessId);
      const res = await apiFetch(`/api/auth/temporary-access/${accessId}/revoke`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to revoke temporary access");
      }
      await loadTemporaryAccessRecords();
      if (tempAccessData?.access_id === accessId) {
        const updated = { ...tempAccessData, revoked_at: new Date().toISOString() };
        setTempAccessData(updated);
        localStorage.setItem(`temp-access:${jobId}`, JSON.stringify(updated));
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to revoke temporary access");
    } finally {
      setRevokingAccessId(null);
    }
  }

  function toggleAccordion(sectionKey) {
    setOpenAccordions((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }

  // Handle assignment from AssignWorkOrderModal
  async function handleAssignSingle({
    supervisorId,
    technicianIds,
    scope,
    rangeStart,
    rangeEnd,
  }) {
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

      // 👇 handle error properly
      if (!res.ok) {
        let errorMsg = "Assignment failed";

        try {
          const data = await res.clone().json();
          errorMsg = data.error || errorMsg;
        } catch { }

        alert(errorMsg);
        return; // ⛔ stop execution
      }

      // ✅ success flow
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

          {canManageJobSchedule && (
            <section className="job-accordion job-schedule-card">
              <button
                type="button"
                className="job-accordion-trigger"
                onClick={() => toggleAccordion("schedule")}
                aria-expanded={!!openAccordions.schedule}
                aria-controls="accordion-schedule"
              >
                <span>Schedule</span>
                <span className={`job-accordion-chevron ${openAccordions.schedule ? "open" : ""}`}>▾</span>
              </button>
              {openAccordions.schedule && (
                <div id="accordion-schedule" className="job-accordion-content">
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
                </div>
              )}
            </section>
          )}

          {canGenerateRecurring && job?.booking_id && (
            <section className="job-accordion job-booking-card">
              <button
                type="button"
                className="job-accordion-trigger"
                onClick={() => toggleAccordion("booking")}
                aria-expanded={!!openAccordions.booking}
                aria-controls="accordion-booking"
              >
                <span>Booking</span>
                <span className={`job-accordion-chevron ${openAccordions.booking ? "open" : ""}`}>▾</span>
              </button>
              {openAccordions.booking && (
                <div id="accordion-booking" className="job-accordion-content">
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
            </section>
          )}

          {canGenerateTemporaryAccess && (
            <section className="job-accordion job-booking-card">
              <button
                type="button"
                className="job-accordion-trigger"
                onClick={() => toggleAccordion("temporaryAccess")}
                aria-expanded={!!openAccordions.temporaryAccess}
                aria-controls="accordion-temporaryAccess"
              >
                <span>Temporary Worker OTP Access</span>
                <span className={`job-accordion-chevron ${openAccordions.temporaryAccess ? "open" : ""}`}>▾</span>
              </button>
              {openAccordions.temporaryAccess && (
                <div id="accordion-temporaryAccess" className="job-accordion-content">
                  <div className="job-booking-note" style={{ marginBottom: 10 }}>
                    Generate one-time OTP access for this job only.
                  </div>
                  <div className="visit-form-group">
                    <label>Worker Name (optional)</label>
                    <input
                      className="visit-date-input"
                      type="text"
                      placeholder="Temporary worker name"
                      value={tempWorkerName}
                      onChange={(e) => setTempWorkerName(e.target.value)}
                    />
                  </div>
                  <div className="visit-form-group">
                    <label>Phone Number</label>
                    <input
                      className="visit-date-input"
                      type="text"
                      placeholder="Phone number"
                      value={tempWorkerPhone}
                      onChange={(e) => setTempWorkerPhone(e.target.value)}
                    />
                  </div>
                  <button
                    className="job-btn job-btn-primary"
                    onClick={handleGenerateTemporaryAccess}
                    disabled={tempAccessLoading}
                  >
                    {tempAccessLoading ? "Generating..." : "Generate OTP Access"}
                  </button>

                  {tempAccessData && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, color: "#0f172a", marginBottom: 8 }}>
                        OTP: <strong>{tempAccessData.otp || "Shared via secure channel"}</strong>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#334155",
                          marginBottom: 8,
                          wordBreak: "break-all",
                        }}
                      >
                        Link: {tempAccessData.share_link}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="job-btn"
                          type="button"
                          onClick={() => copyText(tempAccessData.share_link, "Link copied")}
                        >
                          Copy Link
                        </button>
                        {tempAccessData.otp && (
                          <button
                            className="job-btn"
                            type="button"
                            onClick={() => copyText(tempAccessData.otp, "OTP copied")}
                          >
                            Copy OTP
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {tempAccessRecords.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                        Generated Temporary Access
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {tempAccessRecords.map((record) => {
                          const status = getTempAccessStatus(record);
                          const link = buildTempAccessLink(record.id);
                          const canRevoke = status === "ACTIVE" || status === "USED";
                          return (
                            <div
                              key={record.id}
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 10,
                                padding: 10,
                                background: "#f8fafc",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>
                                  {record.worker_name || "Temporary Worker"}
                                </div>
                                <span
                                  style={{
                                    fontSize: 11,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background:
                                      status === "ACTIVE" ? "#dcfce7" :
                                        status === "REVOKED" ? "#fee2e2" :
                                          status === "USED" ? "#dbeafe" : "#f1f5f9",
                                    color:
                                      status === "ACTIVE" ? "#166534" :
                                        status === "REVOKED" ? "#991b1b" :
                                          status === "USED" ? "#1d4ed8" : "#334155",
                                    fontWeight: 600,
                                  }}
                                >
                                  {status}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                                Phone: {record.phone_number || "-"}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                Expires: {formatDateTime(record.expires_at)}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                Created: {formatDateTime(record.created_at)}
                              </div>
                              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                                <button
                                  className="job-btn"
                                  type="button"
                                  onClick={() => copyText(link, "Link copied")}
                                >
                                  Copy Link
                                </button>
                                <button
                                  className="job-btn"
                                  type="button"
                                  disabled={!canRevoke || revokingAccessId === record.id}
                                  onClick={() => revokeTemporaryAccess(record.id)}
                                >
                                  {revokingAccessId === record.id ? "Revoking..." : "Revoke Access"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}


          {canManageJobStatus && (
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
                isTechnician || role === "supervisor" || isTemporaryWorker
                  ? (
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
                        disabled={hasPendingVisits}
                        onClick={() => updateStatus("COMPLETED")}
                      >
                        Complete
                      </button>

                      {hasPendingVisits && (
                        <div style={{ color: "red", fontSize: 12 }}>
                          Cannot complete job until all visits are finished
                        </div>
                      )}
                    </div>
                  )
              )}

              {jobstatus === "PAUSED" && !awaitingApproval && (
                isTechnician || role === "supervisor" || isTemporaryWorker ? (
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
                isTechnician || isTemporaryWorker ? (
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




          {/* Visits------------------------------------------------------------------------------------------------------------------------------------- */}

          <div className="job-visits">
            <h3>Visits</h3>

            {/* MISSED */}
            {missedVisits.length > 0 && (
              <>
                <h4>Missed Or Canceled</h4>
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


          {canScheduleVisits && (
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
                min={new Date().toISOString().split("T")[0]}
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
                {!job.team || job.team.length === 0 ? (
                  <div className="empty-state">
                    No technicians assigned to this job
                  </div>
                ) : (
                  job.team.map((t) => (
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
                  ))
                )}
              </div>

              {Array.isArray(job.temporary_workers) && job.temporary_workers.length > 0 && (
                <>
                  <label style={{ marginTop: 10 }}>Temporary Workers</label>
                  <div className="visit-tech-list">
                    {job.temporary_workers
                      .filter((w) => !w.revoked_at)
                      .map((w) => (
                        <label key={w.id} className="visit-tech-item">
                          <input
                            type="checkbox"
                            checked={visitTempWorkers.includes(w.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setVisitTempWorkers([...visitTempWorkers, w.id]);
                              } else {
                                setVisitTempWorkers(visitTempWorkers.filter((id) => id !== w.id));
                              }
                            }}
                          />
                          <span>{w.name}</span>
                        </label>
                      ))}
                  </div>
                </>
              )}



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

            {Array.isArray(job.temporary_workers) && job.temporary_workers.length > 0 && (
              <>
                <h4 style={{ marginTop: 14, marginBottom: 8 }}>Temporary Workers</h4>
                <div className="visit-tech-list">
                  {job.temporary_workers
                    .filter((w) => !w.revoked_at)
                    .map((w) => (
                      <label key={w.id} className="visit-tech-item">
                        <input
                          type="checkbox"
                          checked={visitTempWorkers.includes(w.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setVisitTempWorkers([...visitTempWorkers, w.id]);
                            } else {
                              setVisitTempWorkers(visitTempWorkers.filter((id) => id !== w.id));
                            }
                          }}
                        />
                        <span>{w.name}</span>
                      </label>
                    ))}
                </div>
              </>
            )}

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
                min={new Date().toISOString().split("T")[0]}
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





