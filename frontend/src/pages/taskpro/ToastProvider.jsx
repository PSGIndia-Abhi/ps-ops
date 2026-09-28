import { useCallback, useMemo, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo, FiX } from "react-icons/fi";
import { ToastContext } from "./toastContext";

const ICONS = { success: FiCheckCircle, error: FiAlertCircle, info: FiInfo };

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 220);
  }, []);

  const push = useCallback(
    ({ type = "info", title, text }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list.slice(-3), { id, type, title, text }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

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
              <button type="button" className="tp-toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <FiX />
              </button>
              <span className="tp-toast-bar" />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
