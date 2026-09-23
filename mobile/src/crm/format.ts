import { formatDate, formatTime, isToday } from '../utils/date';

/** Indian digit grouping: 1234567 -> "₹12,34,567". Whole rupees only. */
export function formatINR(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded));
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  return `${rounded < 0 ? '-' : ''}₹${grouped}`;
}

function isYesterday(iso: string): boolean {
  const d = new Date(iso);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return (
    d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()
  );
}

/** "Today, 11:30 AM" / "Yesterday, 4:05 PM" / "Sep 7, 4:05 PM". */
export function formatLeadWhen(iso: string): string {
  const time = formatTime(iso);
  if (isToday(iso)) return `Today, ${time}`;
  if (isYesterday(iso)) return `Yesterday, ${time}`;
  return `${formatDate(iso)}, ${time}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

