import { createContext, useContext } from "react";

/** { id, name, role, level, setViewerId } — see ViewerProvider. */
export const ViewerContext = createContext(null);

export const useViewer = () => useContext(ViewerContext);
