// Page numbers under a Brigade list, centred: "1–25 of 562", then ‹ Previous 1 … 4 5 6 7 8 … 23 Next ›.
// 5 numbers around the open page, plus the first and last with "…" for the gaps. Nothing shows for
// one page. total = rows in the list, page = the open page (1-based), size = rows a page.

function pageNumbers(at, pages) {
  const first = Math.max(1, Math.min(at - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);
  const out = [];
  if (nums[0] > 1) out.push(1);
  if (nums[0] > 2) out.push("…start");
  out.push(...nums);
  if (nums[nums.length - 1] < pages - 1) out.push("…end");
  if (nums[nums.length - 1] < pages) out.push(pages);
  return out;
}

export default function BrigadePager({ total, page, size = 25, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  const at = Math.min(Math.max(1, page), pages);
  const from = (at - 1) * size;
  return (
    <nav className="bnp-pager" aria-label="Pages">
      <span className="bnp-pager-info">{from + 1}–{Math.min(from + size, total)} of {total}</span>
      <div className="bnp-pager-nums">
        <button type="button" className="bnp-pg nav" disabled={at <= 1} onClick={() => onPage(at - 1)}>‹ Previous</button>
        {pageNumbers(at, pages).map((n) => typeof n === "string" ? (
          <span key={n} className="bnp-pg-gap" aria-hidden="true">…</span>
        ) : (
          <button key={n} type="button" className={`bnp-pg ${n === at ? "on" : ""}`} aria-current={n === at ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
        ))}
        <button type="button" className="bnp-pg nav" disabled={at >= pages} onClick={() => onPage(at + 1)}>Next ›</button>
      </div>
    </nav>
  );
}
