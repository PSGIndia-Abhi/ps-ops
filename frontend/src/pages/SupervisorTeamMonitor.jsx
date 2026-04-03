import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import "./SupervisorTeamMonitor.css";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB");
}

export default function SupervisorTeamMonitor() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMonitor = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/teams/monitor");
      if (!res?.ok) throw new Error("Failed to load team monitor");
      const data = await res.json();
      setTechnicians(Array.isArray(data.technicians) ? data.technicians : []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load team monitor");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonitor();
    const interval = setInterval(loadMonitor, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="monitor-page">Loading team monitor...</div>;
  }

  if (error) {
    return <div className="monitor-page">Error: {error}</div>;
  }

  return (
    <div className="monitor-page">
      <div className="monitor-header">
        <div>
          <h2>Team Monitor</h2>
          <p>Live technician workload and job status updates.</p>
        </div>
        <button className="monitor-refresh" onClick={loadMonitor}>
          Refresh
        </button>
      </div>

      {technicians.length === 0 && (
        <div className="monitor-empty">No technicians assigned yet.</div>
      )}

      <div className="monitor-grid">
        {technicians.map((tech) => (
          <div key={tech.id} className="monitor-card">
            <div className="monitor-card-header">
              <div>
                <div className="monitor-tech-name">{tech.name || "Technician"}</div>
                <div className="monitor-tech-email">{tech.email || `ID ${tech.id}`}</div>
              </div>
              <div className="monitor-count">
                {tech.jobs?.length || 0} active
              </div>
            </div>

            <div className="monitor-card-body">
              {(tech.jobs || []).length === 0 && (
                <div className="monitor-empty">No active jobs.</div>
              )}
              {(tech.jobs || []).map((job) => (
                <div key={job.id} className="monitor-job-row">
                  <div className="monitor-job-main">
                    <div className="monitor-job-title">{job.task_name || job.code}</div>
                    <div className="monitor-job-meta">
                      Start: {formatDateTime(job.start_time)} · Last: {formatDateTime(job.last_activity)}
                    </div>
                  </div>
                  <div className={`monitor-status status-${job.status}`}>
                    {job.status?.replace("_", " ") || "UNKNOWN"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
