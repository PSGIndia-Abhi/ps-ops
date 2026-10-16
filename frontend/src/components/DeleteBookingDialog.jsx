import { useState } from "react";
import { apiFetch } from "../api";

/**
 * Admin / branch admin: take back a booking made by mistake (POST /api/jobs/:id/delete).
 * Only work that has not started is removed - the job(s) disappear from every list and app,
 * nothing is erased. "Whole booking" removes all its not-started jobs and stops new repeat jobs.
 * `onDeleted({ deleted, kept })` runs after a successful delete.
 */
export default function DeleteBookingDialog({ job, onClose, onDeleted }) {
  const recurring = !!job?.booking_id;
  const [whole, setWhole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = job?.sub_service || job?.title || job?.service_type || "this job";

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/jobs/${job.id}/delete`, {
        method: "POST",
        body: JSON.stringify({ whole_booking: whole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete the booking");
      onDeleted?.(data);
    } catch (err) {
      setError(err.message || "Could not delete the booking");
      setBusy(false);
    }
  }

  return (
    <div className="delete-booking-overlay" role="dialog" aria-modal="true" aria-label="Delete booking" onClick={busy ? undefined : onClose}>
      <div className="delete-booking-card" onClick={(e) => e.stopPropagation()}>
        <h3>Delete booking?</h3>
        <p>
          <strong>{title}</strong>
          {job?.code ? ` (${job.code})` : ""} will be removed from the dashboard, bookings and the technician and supervisor apps.
          Only work that has not started can be deleted.
        </p>
        {recurring && (
          <div className="delete-booking-options">
            <label>
              <input type="radio" name="delete-scope" checked={!whole} onChange={() => setWhole(false)} />
              <span>
                <b>Only this job</b>
                <small>The rest of the booking stays as it is.</small>
              </span>
            </label>
            <label>
              <input type="radio" name="delete-scope" checked={whole} onChange={() => setWhole(true)} />
              <span>
                <b>The whole booking</b>
                <small>All its jobs not started yet, and no new repeat jobs. Jobs already worked on are kept.</small>
              </span>
            </label>
          </div>
        )}
        {error && <div className="delete-booking-error">{error}</div>}
        <div className="delete-booking-actions">
          <button type="button" className="delete-booking-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="delete-booking-confirm" onClick={confirm} disabled={busy}>
            {busy ? "Deleting..." : whole ? "Delete whole booking" : "Delete job"}
          </button>
        </div>
      </div>
    </div>
  );
}
