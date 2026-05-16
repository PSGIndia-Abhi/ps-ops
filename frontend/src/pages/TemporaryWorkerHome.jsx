import { Navigate } from "react-router-dom";

export default function TemporaryWorkerHome() {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const jobId = payload?.job_id;
    if (jobId) {
      return <Navigate to={`/temp/jobs/${jobId}`} replace />;
    }
  } catch (err) {
    console.error("Failed to parse token:", err);
  }

  return <Navigate to="/login" replace />;
}

