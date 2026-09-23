import { useEffect } from "react";

// On phones, tables marked with the "ac-stack" class are shown as cards (see accountant.css).
// Each cell needs its column heading as a data-label so the card can show "Heading: value".
// This sets the labels from the table's header row, and keeps them up to date as rows change.
function labelTables(root) {
  root.querySelectorAll("table.ac-stack").forEach((table) => {
    const head = table.tHead?.rows[0];
    if (!head) return;
    const names = [];
    Array.from(head.cells).forEach((th) => {
      for (let i = 0; i < th.colSpan; i += 1) names.push(th.textContent.trim());
    });
    Array.from(table.tBodies).forEach((body) => {
      Array.from(body.rows).forEach((row) => {
        let col = 0;
        Array.from(row.cells).forEach((cell) => {
          const label = cell.colSpan > 1 ? "" : names[col] || "";
          if (cell.dataset.label !== label) cell.dataset.label = label;
          col += cell.colSpan;
        });
      });
    });
  });
}

export default function useStackedTables(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelTables(root));
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);
}
