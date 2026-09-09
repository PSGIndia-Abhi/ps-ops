/** Small date/time helpers shared by dashboard and job/booking cards. */

export function formatTime(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * "Tomorrow" by calendar day, mirroring the exact comparison the existing
 * web technician dashboard uses (frontend/src/pages/TechnicianDashboard.jsx
 * filteredVisits: `toDate(v.scheduled_date).getTime() === tomorrow.getTime()`,
 * where both sides are truncated to midnight first).
 */
export function isTomorrow(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  );
}

/**
 * Before today's calendar date (regardless of time-of-day or status) - this
 * is the web technician dashboard's exact definition of its "Pending" tab
 * (`toDate(v.scheduled_date) < today`), i.e. overdue/backlog work rather
 * than "not yet started". Kept as its own helper so that definition doesn't
 * get silently confused with the unrelated "pending today" (today's work
 * that isn't in progress yet) concept used elsewhere.
 */
export function isBeforeToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  return dateOnly.getTime() < startOfToday.getTime();
}

/** "Good morning" / "Good afternoon" / "Good evening" from the device clock. */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** e.g. "Tuesday, 8 September" - today's real date, for a dashboard's context line. */
export function formatFriendlyDate(date: Date = new Date()): string {
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}
