import { createContext, useContext } from "react";

/**
 * Who is looking at the lead area:
 *   persona  - "lead_provider" | "telecaller" | "sales" | "sales_manager"
 *   me       - { id, name, title, role, providerId? } - the person the lists are filtered for
 *   canPick  - true when the signed-in role is not itself a lead role (an admin looking around)
 */
export const ViewerContext = createContext(null);

export function useViewer() {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error("useViewer must be used inside the Lead Management layout");
  return viewer;
}

/**
 * The leads this person is allowed to see. The server will enforce the same rule.
 * Always a new array, so a caller may sort it without touching the stored list.
 */
export function visibleLeads(leads, viewer) {
  const { persona, me } = viewer;
  if (persona === "lead_provider") return leads.filter((l) => l.providerId === me.providerId);
  if (persona === "sales") return leads.filter((l) => l.salesId === me.id || l.createdBy === me.id);
  return [...leads]; // telecaller: the shared queue; sales manager: everything
}

export function visibleMeetings(meetings, viewer) {
  return viewer.persona === "sales" ? meetings.filter((m) => m.salesId === viewer.me.id) : [...meetings];
}
