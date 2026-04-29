import { useEffect, useMemo, useRef, useState } from "react";

function formatRole(role) {
  if (!role) return "User";
  return String(role)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function UserMenu({ user, onLogout, actions = [] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const branchLabel = useMemo(
    () => user?.branch?.name || user?.branch_name || null,
    [user]
  );

  return (
    <div className="user-menu-root" ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="user-menu-avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="user-menu-avatar-icon">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M5 19c1.8-3.3 4.3-4.9 7-4.9s5.2 1.6 7 4.9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div className="user-menu-popover">
          <div className="user-menu-card">
            <div className="user-menu-name">{user?.name || "User"}</div>
            <div className="user-menu-role">{formatRole(user?.role)}</div>
            {branchLabel && <div className="user-menu-branch">{branchLabel}</div>}
          </div>

          <div className="user-menu-actions">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="user-menu-action"
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}

            <button
              type="button"
              className="user-menu-action user-menu-logout"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
