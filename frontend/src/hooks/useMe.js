import { useEffect, useState } from "react";
import { apiFetch } from "../api";

export default function useMe() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await apiFetch("/api/auth/me");
        const data = await res.json();
        if (mounted) setUser(data);
      } catch (err) {
        console.error("Failed to load user");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    function handleProfileRefresh() {
      load();
    }

    load();
    window.addEventListener("profile-updated", handleProfileRefresh);
    return () => {
      mounted = false;
      window.removeEventListener("profile-updated", handleProfileRefresh);
    };
  }, []);

  return { user, loading };
}
