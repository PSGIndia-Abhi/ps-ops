import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiBell, FiX } from "react-icons/fi";
import { apiFetch } from "../../api";
import "../../pages/accountant/accountant.css";

const POLL_MS = 30000;
const SEEN_KEY = "accountant.reminderAlerts.seen"; // ids already popped up in this browser
const MAX_SHOWN = 3;

function readSeen() {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function saveSeen(ids) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // storage unavailable (private window): the pop-up may simply show again after a reload
  }
}

// Pop-ups for payment reminders that have just come due. The backend adds a PAYMENT_REMINDER
// notification at the reminder's date and time; this shows each new one once as a pop-up while
// the accountant panel is open (it also stays in the bell). "Open" goes to the reminder.
export default function ReminderAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);

  const check = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications?limit=10&unreadOnly=true");
      if (!res?.ok) return;
      const rows = await res.json();
      const seen = readSeen();
      const fresh = (Array.isArray(rows) ? rows : []).filter((n) => n.type === "PAYMENT_REMINDER" && !seen.includes(n.id));
      if (!fresh.length) return;
      saveSeen([...seen, ...fresh.map((n) => n.id)]);
      setAlerts((list) => [...fresh.filter((n) => !list.some((a) => a.id === n.id)), ...list]);
    } catch {
      // a failed check is simply retried on the next tick
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(check, 0); // first check right after the panel opens
    const timer = window.setInterval(check, POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  const dismiss = (id) => setAlerts((list) => list.filter((a) => a.id !== id));

  async function open(alert) {
    dismiss(alert.id);
    apiFetch(`/api/notifications/${alert.id}/read`, { method: "PATCH" }).catch(() => {});
    if (alert.entity_id) navigate(`/accountant/follow-ups/${alert.entity_id}`);
  }

  if (!alerts.length) return null;
  const shown = alerts.slice(0, MAX_SHOWN);

  return (
    <div className="ac-alert-stack" role="region" aria-label="Payment reminders due">
      {shown.map((a) => (
        <div key={a.id} className="ac-alert" role="alert">
          <span className="ac-alert-icon" aria-hidden="true"><FiBell /></span>
          <div className="ac-alert-body">
            <strong>{a.title}</strong>
            <span>{a.message}</span>
            <div className="ac-alert-actions">
              <button type="button" className="ac-btn ac-btn-primary ac-btn-sm" onClick={() => open(a)}>Open</button>
              <button type="button" className="ac-btn ac-btn-sm" onClick={() => dismiss(a.id)}>Dismiss</button>
            </div>
          </div>
          <button type="button" className="ac-alert-close" onClick={() => dismiss(a.id)} aria-label="Dismiss"><FiX /></button>
        </div>
      ))}
      {alerts.length > MAX_SHOWN && <div className="ac-alert-more">+{alerts.length - MAX_SHOWN} more in the bell</div>}
    </div>
  );
}
