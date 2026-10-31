import { useLocation, useNavigate } from "react-router-dom";

// "Site Audits" sidebar entry. `base` is the panel root: "/admin" or "/supervisor".
// (Status filtering lives on the Audits page itself, not in the menu.)
export default function AuditsNav({ base }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const root = `${base}/audits`;
  return (
    <button className={`nav-btn ${pathname.startsWith(root) ? "active" : ""}`} onClick={() => navigate(root)}>
      Site Audits
    </button>
  );
}
