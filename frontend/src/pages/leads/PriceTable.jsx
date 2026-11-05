// The quotation's own price table (optional): some clients want the price laid out in their format.
// The salesperson picks how many rows and columns, types the cells; the first row is the headings
// (bold on the quotation) and the last row the total - a label and, in the last column, the amount,
// which becomes the quotation's one package price. The server draws it on the PDF.

import { useLayoutEffect, useRef } from "react";
import { FiMinus, FiPlus, FiTrash2 } from "react-icons/fi";
import { money } from "./format";
import { autoWidths, DEFAULT_TABLE_TITLE, newPriceTable, priceTableTotal, resizePriceTable, TABLE_LIMITS } from "./priceTableData";
import { Button } from "./ui";

function Stepper({ label, value, min, max, onChange }) {
  return (
    <span className="lm-ptable-stepper">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
        <FiMinus />
      </button>
      <b>{value}</b>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
        <FiPlus />
      </button>
    </span>
  );
}

// A line that is a numbered point: "1. text" or "2) text" ("1.5 kg" is not one).
const POINT_RE = /^(\s*)(\d{1,3})([.)])(?!\d)\s*(.*)$/;

/**
 * A table cell that holds several lines, like Word: Enter (or Alt+Enter) starts a new line, and on a
 * numbered point ("1. ...") the next line starts with the next number ("2. "). Enter on an empty
 * point removes its number. The box grows with its text.
 */
function CellText({ value, onChange, maxLength, placeholder }) {
  const ref = useRef(null);
  const caret = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  function onKeyDown(e) {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const before = value.slice(0, el.selectionStart);
    const after = value.slice(el.selectionEnd);
    const lineStart = before.lastIndexOf("\n") + 1;
    const point = POINT_RE.exec(before.slice(lineStart));
    const restOfLine = after.split("\n")[0];

    let next;
    let at;
    if (point && !point[4].trim() && !restOfLine.trim()) {
      // An empty point: take its number away, as Word does.
      next = before.slice(0, lineStart) + after;
      at = lineStart;
    } else {
      const insert = point ? `\n${point[1]}${Number(point[2]) + 1}${point[3]} ` : "\n";
      next = before + insert + after;
      at = before.length + insert.length;
    }
    if (next.length > maxLength) return;
    caret.current = at;
    onChange(next);
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

export function PriceTableEditor({ table, onChange }) {
  const tableRef = useRef(null);
  if (!table) {
    return (
      <div className="lm-ptable-empty">
        <div>
          <strong>Need the price in the client&apos;s own format?</strong>
          <span className="lm-hint">Lay it out as a table - you choose the rows and columns. The amount in the last row becomes the package price.</span>
        </div>
        <Button variant="ghost" icon={<FiPlus />} onClick={() => onChange(newPriceTable())}>
          Add a price table
        </Button>
      </div>
    );
  }
  const rows = table.rows.length;
  const cols = table.rows[0].length;
  const set = (r, c, v) => onChange({ ...table, rows: table.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const total = priceTableTotal(table);
  // Column widths in percent: the ones set by dragging, else automatic from the text.
  const dragged = Array.isArray(table.widths) && table.widths.length === cols;
  const widths = dragged ? table.widths : autoWidths(table);

  // Dragging the edge between two headings moves width from one column to its neighbour; what is set
  // here is saved with the quotation and used as it is in the PDF and the Word file.
  function startDrag(e, c) {
    e.preventDefault();
    const tableWidth = tableRef.current?.getBoundingClientRect().width || 1;
    const startX = e.clientX;
    const start = [...widths];
    const MIN = 5;
    // The Amount column (the last) keeps room for its amounts and the auto total.
    const rightMin = c + 1 === cols - 1 ? 14 : MIN;
    const move = (ev) => {
      const delta = ((ev.clientX - startX) / tableWidth) * 100;
      const pair = start[c] + start[c + 1];
      const left = Math.min(Math.max(start[c] + delta, MIN), pair - rightMin);
      const next = [...start];
      next[c] = Math.round(left * 10) / 10;
      next[c + 1] = Math.round((pair - left) * 10) / 10;
      onChange({ ...table, widths: next });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div className="lm-ptable">
      {/* The heading printed above the table on the quotation. */}
      <label className="lm-field wide">
        <span className="lm-label">Table heading</span>
        <input className="lm-input" value={table.title ?? ""} maxLength={80} placeholder={DEFAULT_TABLE_TITLE} onChange={(e) => onChange({ ...table, title: e.target.value })} />
      </label>
      <div className="lm-ptable-bar">
        <Stepper label="Rows" value={rows} min={TABLE_LIMITS.minRows} max={TABLE_LIMITS.maxRows} onChange={(n) => onChange(resizePriceTable(table, n, cols))} />
        <Stepper label="Columns" value={cols} min={TABLE_LIMITS.minCols} max={TABLE_LIMITS.maxCols} onChange={(n) => onChange(resizePriceTable(table, rows, n))} />
        {dragged && (
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...table, widths: null })}>
            Reset widths
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => onChange(null)}>
          Remove table
        </Button>
      </div>
      <div className="lm-hint">Drag the edge between two headings to set the column widths - the PDF uses the same widths.</div>
      <div className="lm-ptable-wrap">
        <table ref={tableRef} className="fixed">
          <colgroup>
            {widths.map((w, c) => (
              <col key={c} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <tbody>
            {table.rows.map((row, r) => {
              const head = r === 0;
              const totalRow = r === rows - 1;
              return (
                <tr key={r} className={head ? "head" : totalRow ? "total" : ""}>
                  {row.map((cell, c) => {
                    const amountCell = totalRow && c === cols - 1;
                    const amountCol = !head && !totalRow && c === cols - 1;
                    if (totalRow && c > 0 && !amountCell) return <td key={c} className="blank" />;
                    // The total adds the Amount column up by itself.
                    if (amountCell) {
                      return (
                        <td key={c} className="num auto" title="Added up automatically">
                          <span className="lm-ptable-auto">
                            <small>auto</small>
                            {total > 0 ? money(total) : "-"}
                          </span>
                        </td>
                      );
                    }
                    // The lines between the headings and the total (not the amounts) can hold several lines.
                    if (!head && !totalRow && !amountCol) {
                      return (
                        <td key={c}>
                          <CellText value={cell} maxLength={5000} placeholder={r === 1 && c === cols - 2 ? "Enter = new line (1. 2. ...)" : ""} onChange={(v) => set(r, c, v)} />
                        </td>
                      );
                    }
                    return (
                      <td key={c} className={c === cols - 1 ? "num" : ""}>
                        <input
                          value={cell}
                          maxLength={head ? 300 : 120}
                          inputMode={amountCol ? "decimal" : undefined}
                          placeholder={head ? `Heading ${c + 1}` : amountCol ? "0" : totalRow ? "Total" : ""}
                          onChange={(e) => set(r, c, amountCol ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
                        />
                        {/* the grip between this heading and the next one */}
                        {head && c < cols - 1 && <span className="lm-ptable-grip" onPointerDown={(e) => startDrag(e, c)} aria-hidden="true" />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`lm-ptable-foot${total > 0 ? "" : " empty"}`}>
        {total > 0 ? (
          <>
            Total (added up automatically), the package price: <b>{money(total)}</b>
          </>
        ) : (
          "Type the amounts in the last column - the total adds up by itself and becomes the package price."
        )}
      </div>
    </div>
  );
}
