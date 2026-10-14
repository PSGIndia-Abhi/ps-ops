import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiBell, FiX } from "react-icons/fi";
import { apiFetch } from "../../api";
import { getJson } from "./tasksApi";
import { TASKPRO_HOME } from "./access";

const POLL_MS = 30000;
const SEEN_KEY = "taskpro.reminderAlerts.seen"; // notifications already popped up in this browser
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

// Pop-ups for task reminders. The backend (jobs/taskReminder.cron.js) adds a notification for the
// task's assignee - only them - 30 minutes before (TASK_REMINDER_SOON) and at the due time
// (TASK_REMINDER_DUE) of a task that has a reminder set; this shows each new one once while Task
// Management is open (they also stay in its bell). "Open task" goes to the task.
const TYPES = ["TASK_REMINDER_SOON", "TASK_REMINDER_DUE"];
export default function TaskReminderAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);

  const check = useCallback(async () => {
    try {
      const rows = await getJson("/api/notifications?limit=10&unreadOnly=true");
      const seen = readSeen();
      const fresh = (Array.isArray(rows) ? rows : []).filter((n) => TYPES.includes(n.type) && !seen.includes(n.id));
      if (!fresh.length) return;
      saveSeen([...seen, ...fresh.map((n) => n.id)]);
      setAlerts((list) => [...fresh.filter((n) => !list.some((a) => a.id === n.id)), ...list]);
    } catch {
      // a failed check is simply retried on the next tick
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(check, 0);
    // A hidden tab does not poll; it checks once as soon as it is shown again.
    const timer = window.setInterval(() => {
      if (!document.hidden) check();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const dismiss = (id) => setAlerts((list) => list.filter((a) => a.id !== id));

  function open(alert) {
    dismiss(alert.id);
    apiFetch(`/api/notifications/${alert.id}/read`, { method: "PATCH" }).catch(() => {});
    if (alert.entity_id) navigate(`${TASKPRO_HOME}/tasks/${alert.entity_id}`);
  }

  if (!alerts.length) return null;
  const shown = alerts.slice(0, MAX_SHOWN);

  return (
    <div className="tp-alert-stack" role="region" aria-label="Task reminders due">
      {shown.map((a) => (
        <div key={a.id} className="tp-alert" role="alert">
          <span className="tp-alert-icon" aria-hidden="true">
            <FiBell />
          </span>
          <div className="tp-alert-body">
            <strong>{a.title}</strong>
            <span>{a.message}</span>
            <div className="tp-alert-actions">
              <button type="button" className="tp-btn primary" onClick={() => open(a)}>
                Open task
              </button>
              <button type="button" className="tp-btn ghost" onClick={() => dismiss(a.id)}>
                Dismiss
              </button>
            </div>
          </div>
          <button type="button" className="tp-alert-close" onClick={() => dismiss(a.id)} aria-label="Dismiss">
            <FiX />
          </button>
        </div>
      ))}
      {alerts.length > MAX_SHOWN && <div className="tp-alert-more">+{alerts.length - MAX_SHOWN} more</div>}
    </div>
  );
}
