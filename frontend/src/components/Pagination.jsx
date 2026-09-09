import { getTotalPages } from "../utils/pagination";
import "./Pagination.css";

// Simple numbered pager: 1 2 3 4 ... — always visible whenever there's at
// least one row (even a single page shows "1"), only hidden when the list
// is empty, since the empty-state message already covers that case.
export default function Pagination({ page, totalItems, onChange }) {
  if (totalItems === 0) return null;
  const totalPages = getTotalPages(totalItems);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="pagination">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1}>
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className={p === page ? "active" : ""}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages}>
        Next
      </button>
    </div>
  );
}
