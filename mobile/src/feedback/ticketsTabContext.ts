import { createContext, useContext } from 'react';

/** The Tickets tab in another app's tabs (see FeedbackTicketsTab): shown or not, and its badge. */
export interface TicketsTab {
  /** Show the Tickets tab. */
  show: boolean;
  /** Open tickets waiting for this person - the tab's badge. */
  count: number;
  /** Reload the count (the list does it when it comes into view). */
  refresh: () => void;
}
export const TicketsTabContext = createContext<TicketsTab>({ show: false, count: 0, refresh: () => {} });
export const useTicketsTab = () => useContext(TicketsTabContext);
