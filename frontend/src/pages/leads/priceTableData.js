// The quotation price table's data helpers (the editor is PriceTable.jsx). A table is { rows }:
// the first row the headings, the last row the total - a label first and the amount last.

export const TABLE_LIMITS = { minRows: 3, maxRows: 20, minCols: 2, maxCols: 6 };
/** The heading printed above the table on the quotation (editable; `title` on the table). */
export const DEFAULT_TABLE_TITLE = "Price details";

/** A new table: headings, one empty row per service line, and the total row. */
export function newPriceTable(rows = 4, cols = 3) {
  const head = cols === 2 ? ["Service", "Amount"] : ["Service", ...Array(cols - 2).fill(""), "Amount"];
  if (cols >= 3) head[1] = "Frequency";
  const total = ["Total", ...Array(cols - 1).fill("")];
  return { title: DEFAULT_TABLE_TITLE, rows: [head, ...Array.from({ length: rows - 2 }, () => Array(cols).fill("")), total], widths: null };
}

/** A cell's amount (null when it is not a number). */
export function cellAmount(value) {
  const raw = String(value || "").replace(/[₹,\s]/g, "");
  return raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
}

/** The total: the Amount column (the last one) added up over the rows between headings and total. */
export function priceTableTotal(table) {
  if (!table) return 0;
  const cols = table.rows[0].length;
  const sum = table.rows.slice(1, -1).reduce((t, r) => t + (cellAmount(r[cols - 1]) || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** The table as it is sent: trimmed, with the total row's amount filled in from the sum. */
export function priceTableForSave(table) {
  const rows = table.rows.map((r) => r.map((c) => c.trim()));
  const last = rows[rows.length - 1];
  last[last.length - 1] = String(priceTableTotal(table) || "");
  // The column widths set by dragging (percent), when there are any - the PDF uses them.
  return { title: (table.title ?? "").trim(), rows, ...(table.widths ? { widths: table.widths } : {}) };
}

/**
 * The columns' widths (percent) before anyone drags them: from the length of their text, so a short
 * column like "Sl No" starts narrow. The PDF works out its own automatic widths the same way.
 */
export function autoWidths(table) {
  const cols = table.rows[0].length;
  const want = Array.from({ length: cols }, (_, c) =>
    Math.max(
      String(table.rows[0][c] || "").length + 4,
      ...table.rows.slice(1).map((r) => Math.min(70, Math.max(...String(r[c] || "").split("\n").map((l) => l.length)))),
      c === cols - 1 ? 12 : 6
    )
  );
  const sum = want.reduce((a, w) => a + w, 0);
  return want.map((w) => Math.round((w / sum) * 1000) / 10);
}

/** The table as the quotation content stores it -> the editor's rows (total row last). */
export function priceTableFromContent(t) {
  if (!t?.header) return null;
  const cols = t.header.length;
  return {
    title: t.title ?? "",
    rows: [t.header, ...(t.body || []), [t.totalLabel || "Total", ...Array(Math.max(0, cols - 2)).fill(""), String(t.total ?? "")]],
    widths: Array.isArray(t.widths) && t.widths.length === cols ? t.widths : null,
  };
}

/** The table at a new size: cells kept where they still fit; the total row keeps its label and amount. */
export function resizePriceTable(table, rows, cols) {
  const old = table.rows;
  const head = old[0];
  const body = old.slice(1, -1);
  const total = old[old.length - 1];
  const fit = (r) => (r.length >= cols ? r.slice(0, cols) : [...r, ...Array(cols - r.length).fill("")]);
  const bodyRows = rows - 2;
  const nextBody = body.length >= bodyRows ? body.slice(0, bodyRows) : [...body, ...Array.from({ length: bodyRows - body.length }, () => Array(cols).fill(""))];
  // The total row keeps its label first and its amount last, whatever the width.
  const nextTotal = [total[0], ...Array(cols - 2).fill(""), total[total.length - 1]];
  // Another number of columns: the dragged widths no longer fit, so they go back to automatic.
  const widths = cols === head.length ? table.widths ?? null : null;
  return { title: table.title, rows: [fit(head), ...nextBody.map(fit), cols >= 2 ? nextTotal : fit(total)], widths };
}
