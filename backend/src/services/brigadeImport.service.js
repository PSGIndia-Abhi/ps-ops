// Brigade bulk import — reading the client's Excel tracker.
//
// The tracker has one sheet per property and one row per flat; each service is
// a group of columns (done? / count / completed date / amount). This file only
// READS the workbook into plain objects and notes what is wrong with each row;
// brigadeImport.controller.js matches them to the database and saves them.
//
// Rules (agreed with the business):
//   "Yes" in a service column      -> the service happened  -> completed job
//   blank, but listed in PO Items  -> ordered, not done yet  -> Pending
//   blank and not listed, NA / No  -> not ordered           -> skipped
// Filters and hidden rows in Excel are ignored: every row is read.

const ExcelJS = require("exceljs");

// Service column groups: the header that starts the group, our service name, the
// columns that follow it.
const SERVICE_GROUPS = [
  { headers: ["floorguard"], service: "Floor Protection", cols: ["flag", "date", "amount"], code: "FG" },
  { headers: ["electricalpointshifting"], service: "Electrical Shifting", cols: ["flag", "count", "date", "amount"], code: "ES" },
  { headers: ["electricalchipping", "electricalcipping"], service: "Electrical Chipping", cols: ["flag", "count", "date", "amount"], code: "EC" },
  { headers: ["tvunit"], service: "TV Unit", cols: ["flag", "amount"], code: "TV" },
  { headers: ["plumbingwork"], service: "Plumbing Work", cols: ["flag", "date", "amount"], code: "PL" },
  // "Task Type 5": painting type, then its status / date / amount
  { headers: ["tasktype5"], service: "Painting Work", cols: ["type", "flag", "date", "amount"], code: "PT" },
  { headers: ["debrisremoval", "debrisremove"], service: "Debris Removal", cols: ["flag", "date", "amount"], code: "DR" },
  { headers: ["deepcleaning"], service: "Deep Cleaning", cols: ["flag", "date", "amount"], code: "DC" },
];

// PO Items codes (FG,ES2,PT,DR,DC) -> our service. Digits after a code are counts.
const PO_ITEM_CODES = {
  FG: "Floor Protection",
  ES: "Electrical Shifting",
  EES: "Electrical Shifting",
  EC: "Electrical Chipping",
  TV: "TV Unit",
  TVU: "TV Unit",
  PL: "Plumbing Work",
  PT: "Painting Work",
  P: "Painting Work",
  DR: "Debris Removal",
  DC: "Deep Cleaning",
};

const FLAT_HEADERS = ["flatnumber", "flatno", "unit"];
const MAX_ISSUES_PER_SHEET = 2000;

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** A cell's value with formulas resolved to their saved result. */
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.text !== undefined) return cellValue(v.text); // hyperlink (its text can be rich text too)
    if ("result" in v) return v.result === undefined ? null : cellValue(v.result);
    if (v.formula || v.sharedFormula) return null; // formula never calculated
    if (v.error) return null;
    return null;
  }
  return v;
}

function text(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoDate(v);
  return String(v).replace(/\s+/g, " ").trim();
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** "Yes" -> "yes"; NA / No / false / - -> "no"; blank -> ""; anything else -> "other". */
function readFlag(v) {
  if (v === true) return "yes";
  if (v === false) return "no";
  const s = norm(text(v));
  if (!s) return "";
  if (["yes", "y", "yea", "yess", "done", "completed"].includes(s)) return "yes";
  if (["na", "no", "n", "false", "nil", "0", "notrequired"].includes(s)) return "no";
  if (text(v) === "-") return "no";
  return "other";
}

/** A real Excel date, or dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd text. { date: "YYYY-MM-DD" } | { bad: "text" } | null */
function readDate(v) {
  if (v === null || v === undefined || text(v) === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? { bad: String(v) } : { date: isoDate(v) };
  const s = text(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3], s);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, +m[2], +m[1], s);
  }
  return { bad: s };
}

function validDate(y, mo, d, raw) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { bad: raw };
  if (y < 2015 || y > 2100) return { bad: raw };
  return { date: isoDate(dt) };
}

function readNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "l-123" / "L 0123" / "I-0206," -> "L-0123". null when it cannot be a flat number. */
function normalizeFlat(raw) {
  const s = text(raw).toUpperCase().replace(/\s+/g, "").replace(/[,.;:]+$/, "");
  const m = s.match(/^([A-Z])-?(\d{1,4})$/);
  return m ? `${m[1]}-${m[2].padStart(4, "0")}` : null;
}

/** "2 bhk" / "2BHK" -> "2 BHK"; "1rk" -> "1 RK"; "villa" -> "Villa". */
function normalizeBhk(raw) {
  const s = text(raw);
  if (!s) return "";
  const compact = s.toLowerCase().replace(/\s+/g, "");
  let m = compact.match(/^(\d+(?:\.\d+)?)bhk$/);
  if (m) return `${m[1]} BHK`;
  m = compact.match(/^(\d+)rk$/);
  if (m) return `${m[1]} RK`;
  if (compact === "villa") return "Villa";
  return s;
}

/** The PO cell: { number } | { none: true, note } | { error } */
function readPo(raw) {
  const s = text(raw);
  if (!s) return { none: true };
  if (/^pending$|^yet\s*to|^not\s*received/i.test(s)) return { none: true, note: `PO "${s}" read as no PO yet` };
  if (/[/,;&]|\s/.test(s)) return { error: `Two PO numbers in one cell ("${s}") - keep one PO per row` };
  if (s.length > 100) return { error: "PO number is too long" };
  return { number: s };
}

/** "FG,ES2,PT,DR,DC" -> { services: Set, unknown: [] } */
function readPoItems(raw) {
  const services = new Set();
  const unknown = [];
  for (const token of text(raw).toUpperCase().split(/[,\s.+/&]+/).filter(Boolean)) {
    const code = token.replace(/[^A-Z]/g, "");
    if (!code) continue;
    if (PO_ITEM_CODES[code]) services.add(PO_ITEM_CODES[code]);
    else unknown.push(token);
  }
  return { services, unknown };
}

function headerMap(ws) {
  const map = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = norm(text(cellValue(cell.value)));
    if (key && !map[key]) map[key] = col;
  });
  return map;
}

/**
 * Reads the workbook buffer. Returns
 * { sheets: [{ name, isProject, reason?, flats: [...], issues: [...], notes: [...], stats }] }
 * Each flat: { sheet, row, flat, bhk, poNumber, poValue, remarks, services: [{ service, status, date, amount, count, row }] }
 */
async function readWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    const err = new Error("This is not a readable Excel (.xlsx) file");
    err.status = 400;
    throw err;
  }

  const sheets = [];
  for (const ws of wb.worksheets) {
    const head = headerMap(ws);
    const flatCol = FLAT_HEADERS.map((h) => head[h]).find(Boolean);
    const groups = SERVICE_GROUPS.map((g) => ({ ...g, start: g.headers.map((h) => head[h]).find(Boolean) })).filter((g) => g.start);
    if (!flatCol || !groups.length) {
      sheets.push({ name: ws.name, isProject: false, reason: "No Flat No and service columns - not a project sheet, skipped", flats: [], issues: [], notes: [], stats: {} });
      continue;
    }
    sheets.push(readProjectSheet(ws, head, flatCol, groups));
  }
  return { sheets };
}

function readProjectSheet(ws, head, flatCol, groups) {
  const col = (...names) => names.map((n) => head[n]).find(Boolean);
  const cBhk = col("bhk");
  const cPo = col("postatus", "ponumber", "pono", "po");
  const cPoValue = col("povalue");
  const cItems = col("poitems", "poitem");
  const cRemarks = col("remarks");

  const issues = [];
  const notes = [];
  const flats = [];
  const unknownCodes = new Map();
  const stats = { rows: 0, emptyRows: 0, hiddenRows: 0, filterOn: Boolean(ws.autoFilter) };
  const addIssue = (row, flat, level, message) => {
    if (issues.length < MAX_ISSUES_PER_SHEET) issues.push({ sheet: ws.name, row, flat, level, message });
  };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (c) => (c ? cellValue(row.getCell(c).value) : null);
    const flatRaw = text(get(flatCol));
    if (!flatRaw) {
      stats.emptyRows++;
      continue;
    }
    stats.rows++;
    if (row.hidden) stats.hiddenRows++;

    const flat = normalizeFlat(flatRaw);
    if (!flat) {
      addIssue(r, flatRaw, "error", `Flat number "${flatRaw}" is not like L-0123`);
      continue;
    }

    const po = readPo(get(cPo));
    if (po.error) addIssue(r, flat, "error", po.error);
    if (po.note) addIssue(r, flat, "warning", po.note);

    const items = readPoItems(get(cItems));
    for (const u of items.unknown) unknownCodes.set(u, (unknownCodes.get(u) || 0) + 1);

    const services = [];
    for (const g of groups) {
      const cell = {};
      g.cols.forEach((name, i) => { cell[name] = get(g.start + i); });
      const flag = readFlag(cell.flag);
      const date = g.cols.includes("date") ? readDate(cell.date) : null;
      const amount = readNumber(cell.amount);
      const count = g.cols.includes("count") ? readNumber(cell.count) : null;

      if (date?.bad) addIssue(r, flat, "warning", `${g.service}: date "${date.bad}" could not be read - left empty`);
      const hasDate = Boolean(date?.date);

      let status = "skip";
      if (flag === "yes") {
        status = "completed";
      } else if (flag === "other") {
        addIssue(r, flat, "warning", `${g.service}: "${text(cell.flag)}" is not Yes / NA - treated as not done`);
        if (items.services.has(g.service)) status = "pending";
      } else if (flag === "" && hasDate) {
        status = "completed";
        addIssue(r, flat, "warning", `${g.service}: completed date given but not marked Yes - imported as completed`);
      } else if (flag === "no" && hasDate) {
        addIssue(r, flat, "warning", `${g.service}: marked "${text(cell.flag)}" but has a completed date - skipped`);
      } else if (flag === "" && items.services.has(g.service)) {
        status = "pending";
      }
      if (status === "skip") continue;

      if (status === "completed" && !hasDate && g.cols.includes("date")) {
        addIssue(r, flat, "warning", `${g.service}: marked Yes but no completed date - imported as completed, date unknown`);
      }
      services.push({
        service: g.service,
        status,
        date: hasDate ? date.date : null,
        amount: amount && amount > 0 ? amount : null,
        count: count && count > 0 ? count : null,
        type: g.cols.includes("type") ? text(cell.type) || null : null,
      });
    }

    flats.push({
      sheet: ws.name,
      row: r,
      flat,
      bhk: normalizeBhk(get(cBhk)),
      poNumber: po.number || null,
      poError: Boolean(po.error),
      poValue: readNumber(get(cPoValue)),
      remarks: text(get(cRemarks)) || null,
      services,
    });
  }

  // The same flat twice in one sheet: we cannot tell a repeat from a copy.
  const rowsByFlat = new Map();
  for (const f of flats) (rowsByFlat.get(f.flat) || rowsByFlat.set(f.flat, []).get(f.flat)).push(f.row);
  for (const [flat, rows] of rowsByFlat) {
    if (rows.length > 1) {
      for (const r of rows) addIssue(r, flat, "error", `Flat ${flat} is in this sheet ${rows.length} times (rows ${rows.join(", ")}) - keep one row per flat`);
    }
  }

  if (stats.filterOn && stats.hiddenRows) notes.push(`A filter is on in Excel - ${stats.hiddenRows} hidden flat rows are included anyway.`);
  if (stats.emptyRows) notes.push(`${stats.emptyRows} empty rows (no flat number) skipped.`);
  if (unknownCodes.size) {
    notes.push(`PO Items codes not recognised (ignored): ${[...unknownCodes].map(([c, n]) => `${c}×${n}`).join(", ")}.`);
  }
  if (groups.some((g) => g.service === "TV Unit")) notes.push("TV Unit has no completed-date column - TV Unit jobs are imported with the date unknown.");

  return { name: ws.name, isProject: true, flats, issues, notes, stats };
}

module.exports = { readWorkbook, normalizeFlat, normalizeBhk, readDate, readFlag, readPoItems, SERVICE_GROUPS };
