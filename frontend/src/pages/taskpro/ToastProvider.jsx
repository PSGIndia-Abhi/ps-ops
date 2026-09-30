import { useCallback, useMemo, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo, FiX } from "react-icons/fi";
import { ToastContext } from "./toastContext";

const ICONS = { success: FiCheckCircle, error: FiAlertCircle, info: FiInfo };
const DEFAULT_MS = 4200;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 220);
  }, []);

  /** { type, title, text, action?: { label, onClick }, duration? } */
  const push = useCallback(
    ({ type = "info", title, text, action, duration = DEFAULT_MS }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list.slice(-3), { id, type, title, text, action, duration }]);
      setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="tp-toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || FiInfo;
          return (
            <div key={t.id} className={`tp-toast ${t.type} ${t.leaving ? "leaving" : ""}`}>
              <span className="tp-toast-icon">
                <Icon />
              </span>
              <div className="tp-toast-body">
                <strong>{t.title}</strong>
                {t.text && <span>{t.text}</span>}
              </div>
              {t.action && (
                <button
                  type="button"
                  className="tp-toast-action"
                  onClick={() => {
                    t.action.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="tp-toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <FiX />
              </button>
              <span className="tp-toast-bar" style={{ animationDuration: `${t.duration}ms` }} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
