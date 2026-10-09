import { useCallback, useEffect, useState } from "react";
import { FiCalendar, FiPause, FiPlay, FiRepeat, FiSlash } from "react-icons/fi";
import { SERIES_STATUS, STATUS } from "./data";
import { recurrenceSummary } from "./format";
import { getSeries, pauseSeries, resumeSeries, stopSeries } from "./tasksApi";
import { useToast } from "./toastContext";
import { Modal, Skeleton } from "./ui";

/**
 * "Recurring schedule" — a series's rule, its next date, recent occurrences,
 * and Pause/Resume/Stop. Shared by the task detail page (opened via a real
 * occurrence's series_id) and the task list screens (opened for a series
 * that hasn't produced its first occurrence yet — see NotStartedSeries).
 * Either way it's driven purely by `seriesId`, so it works before any
 * occurrence exists.
 */
export default function SeriesDialog({ seriesId, allowManage, onClose, onChanged }) {
  const toast = useToast();
  const [series, setSeries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pauseUntil, setPauseUntil] = useState("");

  const load = useCallback(async () => {
    try {
      setSeries(await getSeries(seriesId));
    } catch {
      setSeries(null);
    }
  }, [seriesId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn, label) {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged?.();
      toast.push({ type: "success", title: label });
    } catch (err) {
      toast.push({ type: "error", title: "Couldn't update the schedule", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Recurring schedule" onClose={onClose} size="md">
      {() =>
        !series ? (
          <Skeleton height={120} radius={12} />
        ) : (
          <div className="tp-form">
            <div className="tp-related">
              <span className="tp-file-icon blue">
                <FiRepeat />
              </span>
              <div>
                <strong>{series.title}</strong>
                <small>{recurrenceSummary(series.recurrence)}</small>
              </div>
              <span className="tp-badge" style={{ color: SERIES_STATUS[series.status].color, background: SERIES_STATUS[series.status].soft }}>
                {SERIES_STATUS[series.status].label}
              </span>
            </div>

            {series.occurrences_created === 0 && (
              <p className="tp-desc muted">No occurrences yet — the first one is created on its due date.</p>
            )}
            {series.status === "PAUSED" && series.pause_from && (
              <p className="tp-desc muted">
                Paused from {series.pause_from}
                {series.pause_until ? ` to ${series.pause_until}` : " (until resumed)"}.
              </p>
            )}
            {series.next_occurrence_date && <p className="tp-desc">Next occurrence: {series.next_occurrence_date}</p>}

            {(series.occurrences || []).length > 0 && (
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Recent occurrences</span>
                <ul className="tp-files" style={{ marginTop: 8 }}>
                  {series.occurrences.slice(0, 6).map((o) => (
                    <li key={o.id}>
                      <span className="tp-file-icon">
                        <FiCalendar />
                      </span>
                      <span>
                        <strong>{o.due_date}</strong>
                        <small>{STATUS[o.status]?.label}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!allowManage && (
              <p className="tp-desc muted">You can view this schedule. Only its creator or your manager can pause, resume or stop it.</p>
            )}

            {allowManage && series.status !== "CANCELLED" && (
              <div className="tp-form-grid">
                {series.status === "ACTIVE" && (
                  <label className="tp-field">
                    <span>
                      Pause until <em>(optional)</em>
                    </span>
                    <input className="tp-input" type="date" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} />
                  </label>
                )}
              </div>
            )}

            {allowManage && (
              <div className="tp-modal-actions">
                {series.status === "ACTIVE" && (
                  <button
                    type="button"
                    className="tp-btn outline"
                    disabled={busy}
                    onClick={() => act(() => pauseSeries(series.id, series.next_occurrence_date || series.recurrence?.start_date, pauseUntil || undefined), "Schedule paused")}
                  >
                    <FiPause /> Pause
                  </button>
                )}
                {series.status === "PAUSED" && (
                  <button type="button" className="tp-btn outline" disabled={busy} onClick={() => act(() => resumeSeries(series.id), "Schedule resumed")}>
                    <FiPlay /> Resume
                  </button>
                )}
                {series.status !== "CANCELLED" && (
                  <button type="button" className="tp-btn danger" disabled={busy} onClick={() => act(() => stopSeries(series.id), "Schedule stopped")}>
                    <FiSlash /> Stop schedule
                  </button>
                )}
              </div>
            )}
          </div>
        )
      }
    </Modal>
  );
}
