import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import JobCard from "../components/JobCard";

export default function TechnicianDashboard() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  let tab = (searchParams.get("tab") || "pending").toLowerCase();
  if (tab === "tomorrow") tab = "pending";

  // ✅ FILTER LOGIC (visit-based)
  const filteredVisits = useMemo(() => {
    if (!Array.isArray(visits)) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const toDate = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    if (tab === "today") {
      return visits.filter(
        (v) => toDate(v.scheduled_date).getTime() === today.getTime()
      );
    }

    // pending = past visits
    return visits.filter(
      (v) => toDate(v.scheduled_date) < today
    );
  }, [visits, tab]);

  // ✅ FETCH VISITS
  async function fetchMyVisits() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/visits/my");

      if (!res.ok) throw new Error("Failed to fetch visits");

      const data = await res.json();
      setVisits(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMyVisits();
  }, []);

  // (Optional: keep these if still needed elsewhere)
  async function updateStatus(jobId, status) {
    const res = await apiFetch(`/api/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      console.error("Status update failed");
      return;
    }

    fetchMyVisits();
  }

  async function submitForApproval(jobId) {
    const res = await apiFetch(`/api/jobs/${jobId}/submit-approval`, {
      method: "POST",
    });

    if (!res.ok) {
      console.error("Submit for approval failed");
      return;
    }

    fetchMyVisits();
  }

  return (
    <div className="tech-dashboard">

      {loading && <div>Loading visits...</div>}

      {!loading && visits.length === 0 && (
        <div className="empty-state">
          No work assigned right now.
        </div>
      )}

      {!loading && filteredVisits.length === 0 && visits.length > 0 && (
        <div className="empty-state">
          No visits found.
        </div>
      )}

      {!loading &&
        filteredVisits.length > 0 &&
        filteredVisits.map((visit) => (
          <JobCard
            key={visit.id}
            job={{
              id: visit.job_id,
              visit_id: visit.id, // ✅ critical
              title: visit.sub_service,
              address: visit.address,
              visit_date: visit.scheduled_date,
            }}
            basePath="/technician"
            refreshData={fetchMyVisits} // ✅ IMPORTANT for refresh
          />
        ))

      }

    </div>
  );
}