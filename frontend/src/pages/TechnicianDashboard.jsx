import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import JobCard from "../components/JobCard";

export default function TechnicianDashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  let tab = (searchParams.get("tab") || "pending").toLowerCase();
  if (tab === "tomorrow") tab = "pending";

  const filteredJobs = useMemo(() => {
    if (!Array.isArray(jobs)) return [];

    const toLocalDateKey = (value) => {
      if (!value) return null;
      if (value instanceof Date) {
        return value.toLocaleDateString("en-CA");
      }
      if (typeof value === "string") {
        let iso = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          const [y, m, d] = iso.split("-").map(Number);
          if (Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)) {
            const localDate = new Date(y, m - 1, d);
            return localDate.toLocaleDateString("en-CA");
          }
          return null;
        } else if (/^\d{4}-\d{2}-\d{2} /.test(iso) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) {
          iso = iso.replace(" ", "T") + "Z";
        }
        const parsed = new Date(iso);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toLocaleDateString("en-CA");
        }
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toLocaleDateString("en-CA");

      
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toLocaleDateString("en-CA");

    if (tab === "today") {
      const targetKey = todayKey;
      return jobs.filter((job) => {
        const visitDate =
          job.next_visit_date ||
          job.visit_date ||
          job.nextVisitDate;
        const startDate = job.start_date || job.startDate || job.due_date || job.dueDate;
        const jobKey = toLocalDateKey(visitDate || startDate);
        if (!jobKey) return false;
        return jobKey === targetKey;
      });
    }

    // pending (default) -> include all non-closed jobs (including older + LOST)
    const closedStatuses = new Set(["COMPLETED", "CANCELLED", "CLOSED"]);
    return jobs.filter((job) => {
  const status = String(job.status || "").toUpperCase();
  if (closedStatuses.has(status)) return false;

  const visitDate =
    job.next_visit_date ||
    job.visit_date ||
    job.nextVisitDate;

  const startDate =
    job.start_date ||
    job.startDate ||
    job.due_date ||
    job.dueDate;

  const jobKey = toLocalDateKey(visitDate || startDate);
  if (!jobKey) return false;

  return jobKey < todayKey; // ✅ ONLY past jobs
});
  }, [jobs, tab]);

  async function fetchMyJobs() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/jobs?scope=all");

      if (!res.ok) throw new Error("Failed to fetch jobs");

      const data = await res.json();
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }

    
  }

  useEffect(() => {
    fetchMyJobs();
  }, []);

  async function updateStatus(jobId, status) {
    const res = await apiFetch(`/api/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      console.error("Status update failed");
      return;
    }

    fetchMyJobs();
  }

  async function submitForApproval(jobId) {
    const res = await apiFetch(`/api/jobs/${jobId}/submit-approval`, {
      method: "POST",
    });

    if (!res.ok) {
      console.error("Submit for approval failed");
      return;
    }

    fetchMyJobs();

 
  }

  

  return (
    <div className="tech-dashboard">

      {loading && <div>Loading jobs...</div>}

      {!loading && jobs.length === 0 && (
        <div className="empty-state">
          No work assigned right now.
        </div>
      )}

      {!loading && filteredJobs.length === 0 && jobs.length > 0 && (
        <div className="empty-state">
          No jobs found for this view.
        </div>
      )}

      {!loading && filteredJobs.length > 0 && filteredJobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          updateStatus={updateStatus}
          onSubmitApproval={submitForApproval}
          basePath="/technician"
        />
      ))}

    </div>
  );
}
