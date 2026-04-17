import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { roleBasePath } from "../auth/roleBasePath";
import useNotifications from "../hooks/useNotifications";

function formatNotificationTime(value) {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatNotificationType(type) {
  if (!type) return "UPDATE";
  return String(type).replaceAll("_", " ");
}

function resolveNotificationPath(notification, role) {
  const basePath = roleBasePath(role);

  if (notification.entity_type === "job" && notification.entity_id) {
    return role === "client"
      ? `/client/jobs/${notification.entity_id}`
      : `${basePath}/jobs/${notification.entity_id}`;
  }

  if (notification.entity_type === "branch") {
    return role === "admin" || role === "branch_admin"
      ? "/admin/branches"
      : basePath;
  }

  if (notification.entity_type === "team") {
    if (role === "admin" || role === "branch_admin") return "/admin/team";
    if (role === "supervisor") return "/supervisor/team";
  }

  return basePath;
}

export default function NotificationsMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotifications(8);

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

  async function handleOpenToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      await refresh({ unreadOnly: showUnreadOnly });
    }
  }

  async function handleNotificationClick(notification) {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    setOpen(false);
    navigate(resolveNotificationPath(notification, role));
  }

  async function handleMarkAll() {
    await markAllAsRead();
    await refresh({ unreadOnly: showUnreadOnly });
  }

  return (
    <div className="notifications-root" ref={menuRef}>
      <button
        type="button"
        className="notifications-trigger"
        onClick={handleOpenToggle}
      >
        <span>Notifications</span>
        {unreadCount > 0 && (
          <span className="notifications-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="notifications-backdrop"
            onClick={() => setOpen(false)}
            aria-label="Close notifications"
          />
          <div className="notifications-popover">
            <div className="notifications-header">
              <div>
                <div className="notifications-title">Notifications</div>
                <div className="notifications-subtitle">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </div>
              </div>
              <button
                type="button"
                className="notifications-mark-all"
                onClick={handleMarkAll}
                disabled={unreadCount === 0}
              >
                Mark all read
              </button>
              <button
                type="button"
                className="notifications-mark-all"
                onClick={() => {
                  setShowUnreadOnly(true);
                  refresh({ unreadOnly: true });
                }}
              >
                Clear read
              </button>

            </div>

            {loading ? (
              <div className="notifications-empty">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="notifications-empty">No notifications yet.</div>
            ) : (
              <div className="notifications-list">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`notifications-item ${notification.is_read ? "" : "unread"}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="notifications-item-top">
                      <span className="notifications-item-type">
                        {formatNotificationType(notification.type)}
                      </span>
                      <span className="notifications-item-time">
                        {formatNotificationTime(notification.created_at)}
                      </span>
                    </div>
                    <div className="notifications-item-title">{notification.title}</div>
                    <div className="notifications-item-message">{notification.message}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
