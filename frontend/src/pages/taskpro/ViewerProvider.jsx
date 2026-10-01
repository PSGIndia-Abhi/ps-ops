import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson } from "./tasksApi";
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
 * Loads the real logged-in user (GET /api/auth/me — the same endpoint the
 * app's useMe hook reads) plus their real team from the org hierarchy
 * (GET /api/users/me/team — "Team Tasks and the assign-to picker read
 * this"). No sample data, no per-session role switching — this is who is
 * actually signed in.
 *
 * Also loads a people directory (GET /api/hierarchy/tree, VIEW_HIERARCHY —
 * granted to every TaskPro role) so lists can show and filter by each
 * person's department without opening the task. Display-only: if it fails,
 * departments simply show as unknown.
 *
 * All three go through getJson, so a second identical request made while the
 * first is still on its way (e.g. React's development double-run of effects)
 * shares it instead of hitting the server again.
 */
export default function ViewerProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meLoading, setMeLoading] = useState(true);
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [directory, setDirectory] = useState(() => new Map());

  const loadMe = useCallback(async () => {
    try {
      setUser(await getJson("/api/auth/me"));
    } catch {
      // Same as useMe: keep whatever we had; the app's auth redirect handles a 401.
    } finally {
      setMeLoading(false);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    try {
      const data = await getJson("/api/users/me/team");
      setTeam(data?.members || []);
    } catch {
      setTeam([]);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  const loadDirectory = useCallback(async () => {
    try {
      setDirectory(buildDirectory(await getJson("/api/hierarchy/tree")));
    } catch {
      // Display-only; leave the directory empty.
    }
  }, []);

  useEffect(() => {
    loadMe();
    loadTeam();
    loadDirectory();
    // Same as useMe: the profile page fires this after saving changes.
    window.addEventListener("profile-updated", loadMe);
    return () => window.removeEventListener("profile-updated", loadMe);
  }, [loadMe, loadTeam, loadDirectory]);

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
