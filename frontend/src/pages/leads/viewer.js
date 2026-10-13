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
  const { persona, me, canPick } = viewer;
  if (persona === "lead_provider") return leads.filter((l) => l.providerId === me.providerId);
  // Sales: leads given to them, plus the ones they added themselves (to follow their verification).
  // An admin previewing this dashboard is not the sales person, so their own leads do not count.
  if (persona === "sales") return leads.filter((l) => l.salesId === me.id || (!canPick && l.createdBy === me.id));
  // Sales manager: only what the telecallers have verified - the calling queue stays with them.
  if (persona === "sales_manager") return leads.filter((l) => !UNVERIFIED.includes(l.stage));
  // Telecaller: the shared queue - every lead except a sales executive's own, which needs no call.
  return leads.filter((l) => !l.salesOwn);
}

/** Stages a lead is in before (or instead of) a telecaller marking it genuine. */
export const UNVERIFIED = ["NEW", "TO_CALL", "NEED_MORE_INFO", "NOT_GENUINE"];

export function visibleMeetings(meetings, viewer) {
  return viewer.persona === "sales" ? meetings.filter((m) => m.salesId === viewer.me.id) : [...meetings];
}
