import { getTotalPages } from "../utils/pagination";
import "./Pagination.css";

// How many page numbers show at once; the rest are reached with the arrows.
const WINDOW = 5;

// Compact numbered pager:  «  ‹  1 2 3 4 5  ›  »
// « first page, ‹ previous, a sliding window of WINDOW page numbers around the
// current one, › next, » last page. Always visible whenever there's
// at least one row (even a single page shows "1"), only hidden when the list
// is empty, since the empty-state message already covers that case.
export default function Pagination({ page, totalItems, onChange, pageSize }) {
  if (totalItems === 0) return null;
  const totalPages = getTotalPages(totalItems, pageSize);

  // Keep the current page roughly centred, clamped to 1..totalPages.
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1));
  const end = Math.min(totalPages, start + WINDOW - 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const pageButton = (p) => (
    <button
      key={p}
      type="button"
      className={p === page ? "active" : ""}
      aria-current={p === page ? "page" : undefined}
      onClick={() => onChange(p)}
    >
      {p}
    </button>
  );

  const arrow = (label, symbol, target, disabled) => (
    <button
      type="button"
      className="pagination-arrow"
      onClick={() => onChange(target)}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {symbol}
    </button>
  );

  return (
    <div className="pagination">
      {arrow("First page", "«", 1, page === 1)}
      {arrow("Previous page", "‹", page - 1, page === 1)}
      {pages.map(pageButton)}
      {arrow("Next page", "›", page + 1, page === totalPages)}
      {arrow("Last page", "»", totalPages, page === totalPages)}
    </div>
  );
}
