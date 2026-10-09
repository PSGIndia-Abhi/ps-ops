// Small hooks shared by the Lead Management screens.

import { createContext, useContext, useMemo, useState } from "react";
import { useLeadData } from "./leadsApi";

/** True once the leads have come back from the server - until then a screen shows its loading skeleton. */
export function useLoaded() {
  return useLeadData().ready;
}

/** Splits a list into pages and goes back to page 1 whenever the list changes size. */
export function usePaged(list, perPage = 8) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const safePage = Math.min(page, pages);
  const rows = useMemo(() => list.slice((safePage - 1) * perPage, safePage * perPage), [list, safePage, perPage]);
  return { rows, page: safePage, pages, total: list.length, perPage, onPage: setPage };
}

/** Shows a short message at the corner of the screen: toast("Saved") or toast("Could not save", true). */
export const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
