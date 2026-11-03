// The quotation's own price table (optional): some clients want the price laid out in their format.
// The salesperson picks how many rows and columns, types the cells; the first row is the headings
// (bold on the quotation) and the last row the total - a label and, in the last column, the amount,
// which becomes the quotation's one package price. The server draws it on the PDF.

import { FiMinus, FiPlus, FiTrash2 } from "react-icons/fi";
import { money } from "./format";
import { DEFAULT_TABLE_TITLE, newPriceTable, priceTableTotal, resizePriceTable, TABLE_LIMITS } from "./priceTableData";
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

export function PriceTableEditor({ table, onChange }) {
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
        <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => onChange(null)}>
          Remove table
        </Button>
      </div>
      <div className="lm-ptable-wrap">
        <table>
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
                    return (
                      <td key={c} className={c === cols - 1 ? "num" : ""}>
                        <input
                          value={cell}
                          maxLength={120}
                          inputMode={amountCol ? "decimal" : undefined}
                          placeholder={head ? `Heading ${c + 1}` : amountCol ? "0" : totalRow ? "Total" : ""}
                          onChange={(e) => set(r, c, amountCol ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
                        />
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
