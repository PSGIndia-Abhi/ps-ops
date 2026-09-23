import "./accountant.css";

// Small shared pieces for the accountant screens.

const STATUS_CLASS = {
  PENDING: "pending",
  PARTIAL: "partial",
  PAID: "paid",
  OVERDUE: "overdue",
  CANCELLED: "cancelled",
  POSTED: "paid",
  OPEN: "upcoming",
  COMPLETED: "completed",
  UPCOMING: "upcoming",
  TODAY: "today",
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  CLEARED: "paid",
  NOT_APPLICABLE: "cancelled",
};

const LABELS = { PARTIAL: "Partially Paid", NOT_APPLICABLE: "Not applicable" };

export function Badge({ value }) {
  const key = String(value || "").toUpperCase();
  const label = LABELS[key] || key.charAt(0) + key.slice(1).toLowerCase();
  return <span className={`ac-badge ${STATUS_CLASS[key] || "normal"}`}>{label}</span>;
}

// Grey pulsing placeholder shown while data loads (same look as MUI's Skeleton).
//   width/height: any CSS size. variant: "text" (default), "rect" or "circular".
export function Skeleton({ width = "100%", height, variant = "text", style }) {
  const size = height ?? (variant === "text" ? 14 : 24);
  return (
    <span
      className={`ac-skel ${variant}`}
      aria-hidden="true"
      style={{ width: variant === "circular" ? size : width, height: size, ...style }}
    />
  );
}

const SKELETON_WIDTHS = [62, 84, 72, 90, 55, 78, 68, 88];

// A full-width "no data" row for tables. With loading, shows placeholder rows instead.
export function EmptyRow({ cols, text = "No data to show yet", loading = false, rows = 5 }) {
  if (loading) {
    return (
      <>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r} className="ac-skel-row" aria-hidden="true">
            {Array.from({ length: cols }, (_, c) => (
              <td key={c}><Skeleton width={`${SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length]}%`} /></td>
            ))}
          </tr>
        ))}
      </>
    );
  }
  return (
    <tr>
      <td className="ac-empty" colSpan={cols}>{text}</td>
    </tr>
  );
}

// Page controls. `page` starts at 0. Use with usePaged() from data.js.
export function Pager({ total = 0, pageSize = 10, page = 0, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  const from = total ? current * pageSize + 1 : 0;
  const to = Math.min(total, (current + 1) * pageSize);

  // At most 5 page numbers around the current page.
  const first = Math.max(0, Math.min(current - 2, pages - 5));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);

  return (
    <div className="ac-pager">
      <span>Showing {from} to {to} of {total}</span>
      <div className="ac-pager-btns">
        <button type="button" disabled={current === 0} onClick={() => onPage?.(current - 1)}>&lsaquo;</button>
        {numbers.map((n) => (
          <button key={n} type="button" className={n === current ? "active" : ""} onClick={() => onPage?.(n)}>{n + 1}</button>
        ))}
        <button type="button" disabled={current >= pages - 1} onClick={() => onPage?.(current + 1)}>&rsaquo;</button>
      </div>
    </div>
  );
}

// Shown when a screen could not load its data from the server.
export function DataError({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="ac-info error" role="alert">
      <span style={{ flex: 1 }}>{error}</span>
      {onRetry && <button type="button" className="ac-link" onClick={onRetry}>Try again</button>}
    </div>
  );
}
