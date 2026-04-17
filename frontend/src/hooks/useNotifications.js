import { useEffect, useState } from "react";
import { apiFetch } from "../api";

export default function useNotifications(limit = 8) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [listRes, countRes] = await Promise.all([
        apiFetch(`/api/notifications?limit=${limit}`),
        apiFetch("/api/notifications/unread-count"),
      ]);

      const listData = listRes?.ok ? await listRes.json() : [];
      const countData = countRes?.ok ? await countRes.json() : { count: 0 };

      setNotifications(Array.isArray(listData) ? listData : []);
      setUnreadCount(Number(countData?.count || 0));
    } catch (err) {
      console.error("Failed to load notifications:", err);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(notificationId) {
    const res = await apiFetch(`/api/notifications/${notificationId}/read`, {
      method: "PATCH",
    });

    if (!res?.ok) return false;

    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    return true;
  }

  async function markAllAsRead() {
    const res = await apiFetch("/api/notifications/read-all", {
      method: "POST",
    });

    if (!res?.ok) return false;

    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, is_read: true }))
    );
    setUnreadCount(0);
    return true;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      await refresh();
    }

    function handleFocus() {
      if (!cancelled) {
        refresh();
      }
    }

    load();

    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        refresh();
      }
    }, 10000);

    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [limit]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
