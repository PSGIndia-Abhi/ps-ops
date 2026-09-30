// Per-browser dashboard preferences: which chart type each card shows and
// which cards are hidden. A convenience only — if storage is unavailable
// (private window, blocked site data) everything falls back to defaults.

const KEY = "taskpro.dashboard.v1";

export function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePrefs(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the choice just won't be remembered.
  }
}

export function updatePrefs(fn) {
  const next = fn(loadPrefs());
  savePrefs(next);
  return next;
}
