import { createContext, useContext } from "react";

/**
 * { id, name, role, isAdmin, team, teamIds, directory, ready, refreshTeam } — the
 * logged-in person using TaskPro right now. See ViewerProvider.jsx.
 *
 * `team` is everyone below them in the real org hierarchy (from
 * GET /api/users/me/team) — used for the assign-to picker and for a
 * best-effort "is this my report" hint in the UI. The server is always the
 * final word on what a person may actually see or do; this is only used to
 * decide what to show, never to enforce anything.
 */
export const ViewerContext = createContext(null);

export const useViewer = () => useContext(ViewerContext);
