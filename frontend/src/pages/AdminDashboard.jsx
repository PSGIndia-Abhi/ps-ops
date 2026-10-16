import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import JobRow from "../components/JobRow";
import JobDetails from "../components/JobDetails";
import DeleteBookingDialog from "../components/DeleteBookingDialog";
import "../components/DeleteBookingDialog.css";
import AssignWorkOrderModal from "../components/AssignWorkOrderModal";
import CreateBookingModal from "../components/CreateBookingModal";
import { apiFetch } from "../api";
import JobFilters from "../components/JobFilters";
import { filterJobs, getSupervisorOptions, getTechnicianOptions, getCompanyOptions } from "../utils/jobFilters";
import Pagination from "../components/Pagination";
import { getTotalPages, paginate } from "../utils/pagination";

// Jobs shown per page on the dashboard list.
const JOBS_PER_PAGE = 30;





export default function AdminDashboard() {
  const outletContext = useOutletContext();
  const setActionsConfig = outletContext?.setActionsConfig;
  //toast
  const [toast, setToast] = useState(null);
  //Assign open  
  const [isAssignOpen, setIsAssignOpen] = useState(false);

  //the create new booking -  form
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Multiple selection (checkboxes)
  const [selectedJobIds, setSelectedJobIds] = useState([]);

  // Single expanded row (accordion)
  const [expandedJobId, setExpandedJobId] = useState(null);

  // The job being deleted (admin / branch admin take back a booking made by mistake).
  const [deleting, setDeleting] = useState(null);
  const canDelete = ["admin", "branch_admin"].includes(localStorage.getItem("role"));

  //job usestates
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const defaultFilters = {
    status: "",
    startDate: "",
    endDate: "",
    supervisorId: "",
    technicianId: "",
    companyId: "",
  };
  const [filters, setFiltersState] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  // Any filter change starts again from page 1.
  const setFilters = (next) => {
    setFiltersState(next);
    setPage(1);
  };
  const [supervisors, setSupervisors] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/jobs`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    setSelectedJobIds([]);
    setExpandedJobId(null);
  }, [jobs]);

  useEffect(() => {
    let isMounted = true;

    async function fetchUsersByRole(role) {
      const res = await apiFetch(`/api/users?role=${role}`);
      if (!res?.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }

    async function loadPeople() {
      try {
        const [sData, tData] = await Promise.all([
          fetchUsersByRole("supervisor"),
          fetchUsersByRole("technician"),
        ]);

        if (isMounted) {
          setSupervisors(sData);
          setTechnicians(tData);
        }
      } catch (err) {
        console.error("Failed to load supervisors/technicians", err);
      }
    }

    loadPeople();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!setActionsConfig) return undefined;

    setActionsConfig({
      onCreate: () => setIsCreateOpen(true),
      onAssign: () => setIsAssignOpen(true),
      disableAssign: selectedJobIds.length === 0,
    });

    return () => setActionsConfig(null);
  }, [setActionsConfig, selectedJobIds.length]);

  const supervisorOptions = useMemo(() => {
    if (supervisors.length > 0) {
      return supervisors.map((s) => ({
        value: String(s.id),
        label: s.name || s.email || String(s.id),
      }));
    }
    return getSupervisorOptions(jobs);
  }, [supervisors, jobs]);

  const technicianOptions = useMemo(() => {
    if (technicians.length > 0) {
      return technicians.map((t) => ({
        value: String(t.id),
        label: t.name || t.email || String(t.id),
      }));
    }
    return getTechnicianOptions(jobs);
  }, [technicians, jobs]);

  const companyOptions = useMemo(() => getCompanyOptions(jobs), [jobs]);
  // Filtered by a date range: in job-date order, earliest first - the order the work happens.
  // Otherwise the newest-created job first, so a just-created booking shows at the top.
  const byDate = !!(filters.startDate || filters.endDate);
  const filteredJobs = useMemo(
    () =>
      filterJobs(jobs, filters).sort((a, b) => {
        if (byDate) {
          const at = new Date(a.start_date || a.startDate || a.created_at).getTime() || 0;
          const bt = new Date(b.start_date || b.startDate || b.created_at).getTime() || 0;
          if (at !== bt) return at - bt;
          return String(a.code || "").localeCompare(String(b.code || ""), undefined, { numeric: true });
        }
        return (
          (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0) ||
          String(b.code || "").localeCompare(String(a.code || ""), undefined, { numeric: true })
        );
      }),
    [jobs, filters, byDate]
  );
  // Never past the last page (e.g. after a refresh returns fewer jobs).
  const currentPage = Math.min(page, getTotalPages(filteredJobs.length, JOBS_PER_PAGE));
  const pagedJobs = useMemo(
    () => paginate(filteredJobs, currentPage, JOBS_PER_PAGE),
    [filteredJobs, currentPage]
  );

  function goToPage(p) {
    setPage(p);
    setExpandedJobId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  //  checkbox 
  function toggleJobSelection(jobId) {
    setSelectedJobIds(prev =>
      prev.includes(jobId)
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId]
    );
  }

  //  accordion open
  function toggleJobExpansion(jobId) {
    setExpandedJobId(prev =>
      prev === jobId ? null : jobId
    );
  }
  //handle newbooking

  async function handleCreateBooking(form) {

    const payload = {
      client: {
        contact_id: form.contact_id,
        serviceType: form.serviceType,
      },

      subServices: form.subServices,
      address: form.location || null,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes,
      recurrence: form.recurrence || null,
      serviceSchedules: form.serviceSchedules,


      supervisor_id: form.supervisor_id ?? null,
      technician_ids: form.technician_ids ?? [],
    };

    const res = await apiFetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errorMsg = "Create booking failed";

      try {
        const data = await res.clone().json();
        errorMsg = data.error || errorMsg;
      } catch { }

      // Thrown so the booking form shows the reason in its error popup instead of a success message.
      throw new Error(errorMsg);
    }

    await res.json();

    await fetchJobs();
    // The form stays open to show its "Booking created" popup and closes when that is dismissed.
  }


  // assign the job
  async function handleAssign({ supervisorId, technicianIds, scope, rangeStart, rangeEnd }) {
    const prevJobs = jobs;
    const today = new Date().toISOString().split("T")[0];

    // OPTIMISTIC UPDATE FIRST
    setJobs(prev =>
      prev.map(job => {
        if (!selectedJobIds.includes(job.id)) return job;

        const oldSupervisor = job.supervisor?.name ?? "Unassigned";

        return {
          ...job,
          team: technicianIds,
        };
      })
    );
    try {
      const payload = {
        jobIds: selectedJobIds,
        supervisorId,
        technicianIds,
      };

      if (selectedJobIds.length === 1 && scope) {
        payload.scope = scope;
        payload.rangeStart = rangeStart;
        payload.rangeEnd = rangeEnd;
      }

      // const res = await apiFetch("/api/jobs/assign", {
      //   method: "POST",
      //   body: JSON.stringify(payload),
      // });

      // if (!res.ok) throw new Error("Assign failed");

      const res = await apiFetch("/api/jobs/assign", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      let errorMsg = "Assignment failed";

      if (!res.ok) {
        try {
          const data = await res.clone().json();
          errorMsg = data.error || errorMsg;
        } catch { }

        alert(errorMsg);
        return;
      }

      await fetchJobs();

      setIsAssignOpen(false);
      setSelectedJobIds([]);

    } catch (err) {
      console.error(err);


      setJobs(prevJobs);

      alert(err.message || "Assignment failed");


    }


  }




  return (
    <>
      <div className="dashboard-layout mobile-stack">


        {/* job list  */}
        <div>


          <JobFilters
            filters={filters}
            setFilters={setFilters}
            onReset={() => setFilters(defaultFilters)}
            supervisorOptions={supervisorOptions}
            technicianOptions={technicianOptions}
            companyOptions={companyOptions}
            showSupervisor
            showTechnician
            showCompany
          />

          {filteredJobs.length > 0 && (
            <div className="jobs-count" style={{ margin: "4px 2px 10px", fontSize: 14, color: "#6b7280" }}>
              Showing {(currentPage - 1) * JOBS_PER_PAGE + 1}–{Math.min(currentPage * JOBS_PER_PAGE, filteredJobs.length)} of{" "}
              {filteredJobs.length} jobs
            </div>
          )}

          {pagedJobs.map((job) => (
            <div key={job.id} style={{ marginBottom: "8px" }}>
              <JobRow
                job={job}
                isSelected={selectedJobIds.includes(job.id)}
                isExpanded={expandedJobId === job.id}
                onToggleSelect={() => toggleJobSelection(job.id)}
                onToggleExpand={() => toggleJobExpansion(job.id)}
              />

              {expandedJobId === job.id && <JobDetails job={job} onDelete={canDelete ? setDeleting : undefined} />}
            </div>
          ))}

          {deleting && (
            <DeleteBookingDialog
              job={deleting}
              onClose={() => setDeleting(null)}
              onDeleted={() => {
                setDeleting(null);
                setExpandedJobId(null);
                fetchJobs();
              }}
            />
          )}

          <Pagination
            page={currentPage}
            totalItems={filteredJobs.length}
            pageSize={JOBS_PER_PAGE}
            onChange={goToPage}
          />
        </div>

        {/* RIGHT COLUMN */}
        <div className="dashboard-actions">
          <input
            className="sheet-search"
            placeholder="Global Search"
          />

          <button
            className="primary"
            onClick={() => setIsCreateOpen(true)}
          >
            New Booking
          </button>

          <button
            disabled={selectedJobIds.length === 0}
            onClick={() => setIsAssignOpen(true)}
          >
            Assign Work Order
          </button>
        </div>


      </div>

      {/* MODAL booking form */}
      <CreateBookingModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateBooking}
        supervisors={supervisors}
        technicians={technicians}
      />


      {/* MODAL (outside layout, global) */}
      <AssignWorkOrderModal
        isOpen={isAssignOpen}
        jobCount={selectedJobIds.length}
        onClose={() => setIsAssignOpen(false)}
        onAssign={handleAssign}
      />
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            padding: "12px 16px",
            borderRadius: "8px",
            background: toast.type === "error" ? "#fee2e2" : "#dcfce7",
            color: toast.type === "error" ? "#991b1b" : "#166534",
            fontWeight: 500,
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            zIndex: 2000,
          }}
        >
          {toast.message}
        </div>


      )}




    </>
  )
}



