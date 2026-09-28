import { useCallback, useEffect, useMemo, useState } from "react";
import useMe from "../../hooks/useMe";
import { apiFetch, safeJson } from "../../api";
import { ViewerContext } from "./viewerContext";

/**
 * Loads the real logged-in user (useMe, same hook the rest of the app uses)
 * plus their real team from the org hierarchy (GET /api/users/me/team — the
 * endpoint the backend already built for exactly this: "Team Tasks and the
 * assign-to picker read this"). No sample data, no per-session role
 * switching — this is who is actually signed in.
 */
export default function ViewerProvider({ children }) {
  const { user, loading: meLoading } = useMe();
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);

  const loadTeam = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users/me/team");
      const data = await safeJson(res);
      setTeam(res?.ok ? data?.members || [] : []);
    } catch {
      setTeam([]);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const value = useMemo(() => {
    const teamIds = new Set(team.map((m) => m.id));
    return {
      id: user?.id ?? null,
      name: user?.name || "",
      role: user?.role || "",
      isAdmin: user?.role === "admin",
      team,
      teamIds,
      ready: !meLoading && !teamLoading,
      refreshTeam: loadTeam,
    };
  }, [user, meLoading, team, teamLoading, loadTeam]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}
