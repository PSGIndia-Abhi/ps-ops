import { useNavigate } from "react-router-dom";

// Shown for portal sections that are not built yet.
export default function PortalPlaceholder({ title, text }) {
  const navigate = useNavigate();
  return (
    <div className="cp-page">
      <div className="cp-card cp-placeholder">
        <h2>{title}</h2>
        <p>{text || "This section is coming soon."}</p>
        <button className="cp-btn" onClick={() => navigate("/client")}>Back to dashboard</button>
      </div>
    </div>
  );
}
