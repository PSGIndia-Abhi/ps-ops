import { createContext, useContext } from 'react';

/** The Tickets tab in another app's tabs (see FeedbackTicketsTab): shown or not, and its badge. */
export interface TicketsTab {
  /** Show the Tickets tab. */
  show: boolean;
  /** Open tickets waiting for this person - the tab's badge. */
  count: number;
  /** Reload the count (the list does it when it comes into view). */
  refresh: () => void;
  /** The list was opened: the number clears until new tickets come. */
  markSeen: () => void;
}
export const TicketsTabContext = createContext<TicketsTab>({ show: false, count: 0, refresh: () => {}, markSeen: () => {} });
export const useTicketsTab = () => useContext(TicketsTabContext);

/** Set when the tickets are opened as a page (from More): the list shows a back arrow that calls it. */
export const TicketsBackContext = createContext<(() => void) | null>(null);
