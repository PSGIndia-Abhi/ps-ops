import { useCallback, useEffect, useMemo, useState } from "react";
import { USERS, userById } from "./data";
import { levelOf } from "./hierarchy";
import { setActor } from "./tasksApi";
import { ViewerContext } from "./viewerContext";

const KEY = "taskpro_viewer";
const DEFAULT_VIEWER = "u5"; // the CEO, so the first look shows everything

function initialViewer() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && USERS.some((u) => u.id === saved)) return saved;
  } catch {
    /* storage unavailable — fall back to the default */
  }
  return DEFAULT_VIEWER;
}

/**
 * Who is looking at TaskPro. On sample data this is chosen with the
 * "Viewing as" switcher so every role can be tried. With the real backend it
 * becomes the logged-in user and the switcher goes away.
 */
export default function ViewerProvider({ children }) {
  const [viewerId, setId] = useState(initialViewer);

  useEffect(() => {
    setActor(viewerId);
  }, [viewerId]);

  const setViewerId = useCallback((id) => {
    setId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => {
    const u = userById(viewerId);
    return { id: viewerId, name: u.name, role: u.role, level: levelOf(viewerId), setViewerId };
  }, [viewerId, setViewerId]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}
