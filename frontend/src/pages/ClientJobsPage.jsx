import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { formatDate } from "../utils/date";

export default function ClientJobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadJobs() {
      try {
        setLoading(true);
        const res = await apiFetch("/api/jobs");
        const data = await res.json();
        if (!res?.ok) {
          throw new Error(data?.error || "Failed to load jobs");
        }

        if (isMounted) {
          setJobs(Array.isArray(data) ? data : []);
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Unable to load jobs");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadJobs();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2>My Jobs</h2>
          <p style={{ color: "#6b7280" }}>Track all requested services</p>
        </div>

        <button
          onClick={() => navigate("/client")}
          style={{
            padding: "8px 14px",
            background: "#111827",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer"
          }}
        >
          Back to Dashboard
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 10,
          border: "1px solid #e5e7eb"
        }}
      >
        {loading ? (
          <div>Loading jobs...</div>
        ) : error ? (
          <div style={{ color: "#b91c1c" }}>{error}</div>
        ) : jobs.length === 0 ? (
          <div>No jobs found.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {jobs.map((job) => (
              <div
                key={job.id}
                style={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  padding: 16,
                  background: "#f8fafc",
                  cursor: "pointer",
                }}
                onClick={() => navigate(`/client/jobs/${job.id}`)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{job.title || job.service_type || `Job #${job.id}`}</div>
                    <div style={{ color: "#475569", marginTop: 4 }}>{job.companyname || job.site || "Client job"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "#475569" }}>Status</div>
                    <div style={{ fontWeight: 700 }}>{job.status}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Scheduled</div>
                    <div style={{ fontWeight: 600 }}>{job.start_date ? formatDate(job.start_date) : "TBD"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Next Visit</div>
                    <div style={{ fontWeight: 600 }}>{job.next_visit_date ? formatDate(job.next_visit_date) : "TBD"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}