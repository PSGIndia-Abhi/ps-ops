import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { formatDate, formatDateTime } from "../utils/date";
import JobTimeline from "../components/JobTimeline";

export default function ClientJobUpdates() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const [jobRes, histRes, visitsRes] = await Promise.all([
          apiFetch(`/api/jobs/${jobId}`),
          apiFetch(`/api/jobs/${jobId}/history`),
          apiFetch(`/api/visits/jobs/${jobId}/visits`)
        ]);
        if (!jobRes?.ok) throw new Error("Failed to load job");
        if (!histRes?.ok) throw new Error("Failed to load updates");
        if (!visitsRes?.ok) throw new Error("Failed to load visits");

        const [jobData, histData, visitsData] = await Promise.all([
          jobRes.json(),
          histRes.json(),
          visitsRes.json()
        ]);

        if (isMounted) {
          setJob(jobData);
          setHistory(Array.isArray(histData) ? histData : []);
          setVisits(Array.isArray(visitsData) ? visitsData : []);
          setError("");
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setError("Unable to load updates");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading updates...</div>;
  }

  if (error) {
    return <div style={{ padding: 24, color: "#b91c1c" }}>{error}</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Booking</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {job?.title || job?.sub_service || "Service Job"}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Booking #{job?.booking_id || "—"}
          </div>
        </div>

        <button
          type="button"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            cursor: "pointer",
          }}
          onClick={() => navigate("/client")}
        >
          Back
        </button>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Status</div>
            <div style={{ fontWeight: 600 }}>{job?.status || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Start</div>
            <div style={{ fontWeight: 600 }}>
              {job?.start_date ? formatDate(job.start_date) : "Not scheduled"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>End</div>
            <div style={{ fontWeight: 600 }}>
              {job?.dueDate ? formatDate(job.dueDate) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Supervisor</div>
            <div style={{ fontWeight: 600 }}>{job?.supervisor?.name || "Unassigned"}</div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Visits</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {visits.length} total
          </div>
        </div>

        {visits.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No visits scheduled yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  {[
                    "Visit",
                    "Scheduled",
                    "Status",
                    "Technicians",
                    "Started",
                    "Completed"
                  ].map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        fontSize: 12,
                        color: "#6b7280",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "8px 10px"
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => {
                  const techs = (visit.technicians || [])
                    .map((t) => t?.name)
                    .filter(Boolean)
                    .join(", ") || "Unassigned";
                  return (
                    <tr key={visit.id}>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f3f4f6", fontWeight: 600 }}>
                        #{visit.visit_number}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f3f4f6" }}>
                        {formatDate(visit.scheduled_date)}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f3f4f6" }}>
                        <span
                          style={{
                            display: "inline-block",
                            background: "#e0f2fe",
                            color: "#0369a1",
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 12
                          }}
                        >
                          {visit.status || "â€”"}
                        </span>
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f3f4f6" }}>
                        {techs}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f3f4f6" }}>
                        {formatDateTime(visit.started_at)}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f3f4f6" }}>
                        {formatDateTime(visit.completed_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JobTimeline history={history} />
      {history.length === 0 && (
        <div style={{ marginTop: 12, color: "#6b7280" }}>No updates yet.</div>
      )}
    </div>
  );
}

