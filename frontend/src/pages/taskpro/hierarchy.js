// Small, pure helpers over the real org hierarchy already loaded onto the
// viewer (see ViewerProvider.jsx / viewerContext.js). Visibility itself is
// entirely enforced server-side (GET /api/work-tasks only ever returns what
// the requester may see) — nothing here decides who can see or do what;
// it only decides what the UI shows as a convenience, and the server has the
// final word (a refused action comes back as a 403/404 and is surfaced as a
// toast, not silently prevented up front).

/**
 * Who this viewer can offer in an "assign to" picker: themselves, plus their
 * real team (from /api/users/me/team). `allUsers`, if already loaded (admin
 * only — see fetchAllUsers in tasksApi.js), replaces that with everyone, since
 * an admin may assign to anyone.
 */
export function assignableUsers(viewer, allUsers) {
  if (!viewer?.id) return [];
  if (viewer.isAdmin && allUsers?.length) return allUsers;
  const self = { id: viewer.id, name: viewer.name, role: viewer.role };
  return [self, ...viewer.team];
}

/** Best-effort "is this one of my reports" hint — not an access check. */
export const inMyTeam = (viewer, userId) => viewer?.teamIds?.has(Number(userId));
