// Downloads the rows currently shown on a screen as a CSV file that opens in Excel.
// columns: [{ header: "Invoice No", value: (row) => row.invoice_number }, ...]

// Marks the file as UTF-8 so Excel shows the rupee sign and other characters correctly.
const BOM = String.fromCharCode(0xfeff);

export function exportCsv(fileName, columns, rows) {
  // A cell starting with = + - @ could run as a formula when opened in Excel, so it is marked as text.
  const cell = (v) => {
    let text = String(v ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));

  const blob = new Blob([BOM + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(href);
}
