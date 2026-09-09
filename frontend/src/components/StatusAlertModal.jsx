import { useEffect } from "react";
import "./StatusAlertModal.css";

// A center-of-screen confirmation popup for the outcome of an add/edit/delete
// action. `status` is null (hidden) or { type: "success" | "error", message }.
// Success toasts auto-dismiss (nothing to read/act on); errors stay put —
// they're often explaining *why* an action was blocked (e.g. "delete the
// sites first"), so the admin needs to actually read them, not have them
// vanish after 3s. Only clicking OK or the overlay closes an error.
export default function StatusAlertModal({ status, onClose }) {
  useEffect(() => {
    if (!status || status.type !== "success") return undefined;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [status, onClose]);

  if (!status) return null;

  return (
    <div className="status-alert-overlay" onClick={onClose}>
      <div
        className={`status-alert-card status-alert-${status.type}`}
        onClick={(e) => e.stopPropagation()}
        role="alert"
      >
        <div className="status-alert-icon">{status.type === "success" ? "✓" : "!"}</div>
        <p>{status.message}</p>
        <button type="button" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
