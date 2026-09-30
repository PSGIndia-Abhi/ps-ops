import { useCallback, useEffect, useMemo, useState } from "react";
import useMe from "../../hooks/useMe";
import { apiFetch, safeJson } from "../../api";
import { ViewerContext } from "./viewerContext";

/**
 * Flattens GET /api/hierarchy/tree into one Map of user id -> person card:
 * { id, name, role, designation, dept, unit, manager_id }. `dept` is the
 * top-level department (the unit directly under the root "BestServe" unit);
 * people sitting on the root itself (e.g. the MD) get the root's name.
 */
function buildDirectory(tree) {
  const map = new Map();
  const walk = (units, depth, dept) => {
    for (const unit of units || []) {
      const unitDept = depth <= 1 ? unit.name : dept;
      for (const m of unit.members || []) {
        map.set(Number(m.user_id), {
          id: Number(m.user_id),
          name: m.name,
          role: m.role,
          designation: m.designation,
          dept: unitDept,
          unit: unit.name,
          manager_id: m.primary_manager_id,
        });
      }
      walk(unit.children, depth + 1, unitDept);
    }
  };
  walk(tree?.units, 0, null);
  for (const u of tree?.unassigned || []) {
    if (!map.has(Number(u.user_id))) {
      map.set(Number(u.user_id), { id: Number(u.user_id), name: u.name, role: u.role, designation: null, dept: null, unit: null, manager_id: null });
    }
  }
  return map;
}

/**
 * Loads the real logged-in user (useMe, same hook the rest of the app uses)
 * plus their real team from the org hierarchy (GET /api/users/me/team — the
 * endpoint the backend already built for exactly this: "Team Tasks and the
 * assign-to picker read this"). No sample data, no per-session role
 * switching — this is who is actually signed in.
 *
 * Also loads a people directory (GET /api/hierarchy/tree, VIEW_HIERARCHY —
 * granted to every TaskPro role) so lists can show and filter by each
 * person's department without opening the task. Display-only: if it fails,
 * departments simply show as unknown.
 */
export default function ViewerProvider({ children }) {
  const { user, loading: meLoading } = useMe();
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [directory, setDirectory] = useState(() => new Map());

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

  const loadDirectory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/hierarchy/tree");
      const data = await safeJson(res);
      if (res?.ok) setDirectory(buildDirectory(data));
    } catch {
      // Display-only; leave the directory empty.
    }
  }, []);

  useEffect(() => {
    loadTeam();
    loadDirectory();
  }, [loadTeam, loadDirectory]);

  const value = useMemo(() => {
    const teamIds = new Set(team.map((m) => m.id));
    return {
      id: user?.id ?? null,
      name: user?.name || "",
      role: user?.role || "",
      isAdmin: user?.role === "admin",
      team,
      teamIds,
      directory,
      ready: !meLoading && !teamLoading,
      refreshTeam: loadTeam,
    };
  }, [user, meLoading, team, teamLoading, loadTeam, directory]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}
