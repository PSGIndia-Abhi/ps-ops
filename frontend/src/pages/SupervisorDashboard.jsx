import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import JobRow from "../components/JobRow";
import JobDetails from "../components/JobDetails";
import AssignWorkOrderModal from "../components/AssignWorkOrderModal";
import "../components/jobrow.css";
import { apiFetch } from "../api";
import JobFilters from "../components/JobFilters";
import { filterJobs, getTechnicianOptions, getCompanyOptions } from "../utils/jobFilters";
import CreateBookingModal from "../components/CreateBookingModal";
async function handleCreateBooking(form) {
  const payload = {
    client: {
      contact_id: form.contact_id,
      serviceType: form.serviceType,
    },
    subServices: form.subServices,
    start_date: form.start_date,
    end_date: form.end_date,
    notes: form.notes,
    recurrence: form.recurrence || null,
    serviceSchedules: form.serviceSchedules,

    // IMPORTANT
    supervisor_id: null, // backend will auto use req.user.id
    technician_id: form.technician_id || null,
  };

  const res = await apiFetch("/api/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Create booking failed");

  await res.json();
  await fetchJobs();
  setIsCreateOpen(false);
}


export default function SupervisorDashboard() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const outletContext = useOutletContext();
  const setActionsConfig = outletContext?.setActionsConfig;
  //toast
  const [toast, setToast] = useState(null);
  //Assign open  
  const [isAssignOpen, setIsAssignOpen] = useState(false);


  // Multiple selection (checkboxes)
  const [selectedJobIds, setSelectedJobIds] = useState([]);

  // Single expanded row (accordion)
  const [expandedJobId, setExpandedJobId] = useState(null);

  //job usestates
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("active");
  const defaultFilters = {
    status: "",
    startDate: "",
    endDate: "",
    supervisorId: "",
    technicianId: "",
    companyId: "",
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [technicians, setTechnicians] = useState([]);

  const fetchJobs = async (scope = viewMode) => {
    setLoading(true);
    setError(null);

    try {
      const query = scope === "summary" ? "?scope=summary" : "";
      const res = await apiFetch(`/api/jobs${query}`);
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
  }, [viewMode]);

  useEffect(() => {
    setSelectedJobIds([]);
    setExpandedJobId(null);
  }, [viewMode]);

  useEffect(() => {
    let isMounted = true;

    async function fetchUsersByRole(role) {
      const endpoints = [`/api/users?role=${role}`, `/users?role=${role}`];
      for (const endpoint of endpoints) {
        try {
          const res = await apiFetch(endpoint);
          if (res?.ok) {
            const data = await res.json();
            return Array.isArray(data) ? data : [];
          }
        } catch (err) {
          // try next endpoint
        }
      }
      return [];
    }

    async function loadTechnicians() {
      try {
        const data = await fetchUsersByRole("technician");
        if (isMounted) {
          setTechnicians(data);
        }
      } catch (err) {
        console.error("Failed to load technicians", err);
      }
    }

    loadTechnicians();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!setActionsConfig) return undefined;

    setActionsConfig({
      onCreate: () => setIsCreateOpen(true),
      onAssign: () => setIsAssignOpen(true),
      disableAssign: viewMode === "summary" || selectedJobIds.length === 0,
    });

    return () => setActionsConfig(null);
  }, [setActionsConfig, selectedJobIds.length, viewMode]);

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
  const filteredJobs = useMemo(() => filterJobs(jobs, filters), [jobs, filters]);

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


      supervisor_id: form.supervisor_id ?? null,
      technician_id: form.technician_id ?? null,
    };

    const res = await apiFetch("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("Create booking failed:", t);
      throw new Error("Create booking failed");
    }

    await res.json();

    await fetchJobs();
    setIsCreateOpen(false);
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

      const res = await apiFetch("/api/jobs/assign", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Assign failed");

      await fetchJobs();

      setIsAssignOpen(false);
      setSelectedJobIds([]);

    } catch (err) {
      console.error(err);


      setJobs(prevJobs);

      setToast({
        type: "error",
        message: "Assignment failed. Changes reverted.",
      });

      setTimeout(() => setToast(null), 3000);
    }


  }




  return (
    <>
      <div className="dashboard-layout">


        {/* job list  */}
        <div>
          <div style={viewToggleRowStyle}>
            <button
              type="button"
              onClick={() => setViewMode("active")}
              style={viewToggleButtonStyle(viewMode === "active")}
            >
              Active Jobs
            </button>
            <button
              type="button"
              onClick={() => setViewMode("summary")}
              style={viewToggleButtonStyle(viewMode === "summary")}
            >
              Summary Jobs
            </button>
          </div>

          <JobFilters
            filters={filters}
            setFilters={setFilters}
            onReset={() => setFilters(defaultFilters)}
            technicianOptions={technicianOptions}
            companyOptions={companyOptions}
            showTechnician
            showCompany
          />

          {filteredJobs.map((job) => (
            <div key={job.id} style={{ marginBottom: "8px" }}>
              <JobRow
                job={job}
                isSelected={selectedJobIds.includes(job.id)}
                isExpanded={expandedJobId === job.id}
                onToggleSelect={() => toggleJobSelection(job.id)}
                onToggleExpand={() => toggleJobExpansion(job.id)}
              />

              {expandedJobId === job.id && <JobDetails job={job} />}
            </div>
          ))}
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
            disabled={viewMode === "summary" || selectedJobIds.length === 0}
            onClick={() => setIsAssignOpen(true)}
          >
            Assign Work Order
          </button>
        </div>


      </div>

      {/* assign work order) */}
<AssignWorkOrderModal
  isOpen={isAssignOpen}
  jobCount={selectedJobIds.length}
  onClose={() => setIsAssignOpen(false)}
  onAssign={handleAssign}
  hideSupervisor={true}
/>

  <CreateBookingModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateBooking}
        technicians={technicians}
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

const viewToggleRowStyle = {
  display: "flex",
  gap: "8px",
  marginBottom: "12px",
};

const viewToggleButtonStyle = (active) => ({
  padding: "8px 12px",
  borderRadius: "999px",
  border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
  background: active ? "#eff6ff" : "#ffffff",
  color: "#111827",
  fontWeight: 600,
  cursor: "pointer",
});
