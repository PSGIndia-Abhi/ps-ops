// Tracks how many groups/companies/sites were added (from the Companies page)
// since the admin last opened each Group Management sub-tab — shown as a
// notification-style badge both on the sidebar tab (total) and on the
// specific sub-tab (Groups/Companies/Sites), clearing per-section as each is opened.
const STORAGE_KEY = "gm_pending_counts";
const EVENT_NAME = "gm-pending-counts-changed";

const CATEGORIES = ["groups", "companies", "sites"];
const EMPTY_COUNTS = { groups: 0, companies: 0, sites: 0 };

function readCounts() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const counts = {};
    CATEGORIES.forEach((category) => {
      const value = Number(parsed?.[category]);
      counts[category] = Number.isFinite(value) && value > 0 ? value : 0;
    });
    return counts;
  } catch {
    return { ...EMPTY_COUNTS };
  }
}

function writeCounts(counts) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // localStorage unavailable (private mode, etc.) — badges just won't persist.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: counts }));
}

export function getPendingGroupManagementCounts() {
  return readCounts();
}

export function getPendingGroupManagementTotal(counts = readCounts()) {
  return CATEGORIES.reduce((sum, category) => sum + (counts[category] || 0), 0);
}

export function bumpPendingGroupManagementCount(category, by = 1) {
  if (!CATEGORIES.includes(category)) return readCounts();
  const counts = readCounts();
  counts[category] = (counts[category] || 0) + by;
  writeCounts(counts);
  return counts;
}

export function clearPendingGroupManagementCount(category) {
  if (!CATEGORIES.includes(category)) return;
  const counts = readCounts();
  if (!counts[category]) return;
  counts[category] = 0;
  writeCounts(counts);
}

export function subscribePendingGroupManagementCounts(callback) {
  function handler(event) {
    callback(event.detail);
  }
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
