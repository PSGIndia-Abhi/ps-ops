// Brigade flats report (.xlsx) for the Brigade Executive's Flats board.
//   Summary          – totals and one line per property
//   Flat status      – one row per flat, one column per service (coloured)
//   Service details  – one row per job (price, PO, billed, supervisor, technicians)
// The controller loads the data; this file only lays out the workbook.

const ExcelJS = require("exceljs");

const COLORS = {
  ink: "FF0F172A",
  soft: "FF64748B",
  line: "FFE2E8F0",
  zebra: "FFF8FAFC",
  doneFill: "FFDCFCE7",
  doneInk: "FF166534",
  bookedFill: "FFFEF3C7",
  bookedInk: "FF92400E",
  noneInk: "FF94A3B8",
};

const STATUS_LABEL = {
  CREATED: "Created",
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

const DATE_FMT = "dd-mmm-yyyy";
const INR_FMT = '"₹"#,##0.00';

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const thin = { style: "thin", color: { argb: COLORS.line } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeader(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = BORDER;
  });
}

function styleBody(row, index) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = BORDER;
    cell.alignment = { vertical: "middle", wrapText: true, ...(cell.alignment || {}) };
    if (index % 2 === 1 && !cell.fill?.fgColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
    }
  });
}

function addTitle(sheet, title, subtitle, width) {
  sheet.mergeCells(1, 1, 1, width);
  const t = sheet.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 16, color: { argb: COLORS.ink } };
  sheet.getRow(1).height = 26;
  sheet.mergeCells(2, 1, 2, width);
  const s = sheet.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 10, color: { argb: COLORS.soft } };
  sheet.addRow([]);
}

/**
 * @param {object} data
 *   generatedAt, filters: { property, state }, subServices: string[],
 *   flats: [{ property, flat_number, bhk, last_activity, completed, booked, services: [summary] }],
 *   jobs: [{ property, flat_number, bhk, sub_service, code, status, booked_at, start_date,
 *            completed_at, price, po_number, billed, supervisor, technicians }]
 */
async function buildFlatsReport(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BestServe";
  wb.created = data.generatedAt;

  const subtitle = `Generated ${fmtDate(data.generatedAt)} · Property: ${data.filters.property} · Flats: ${data.filters.state} · Amounts exclude GST`;

  /* ---------------- Summary ---------------- */
  const sum = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  sum.columns = [{ width: 32 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }];
  addTitle(sum, "Brigade Flats Report", subtitle, 5);

  const totals = {
    flats: data.flats.length,
    done: data.flats.reduce((s, f) => s + f.completed, 0),
    booked: data.flats.reduce((s, f) => s + f.booked, 0),
    open: data.flats.filter((f) => f.booked > 0).length,
    jobs: data.jobs.length,
  };
  const kpis = [
    ["Flats booked", totals.flats],
    ["Services done (latest job completed)", totals.done],
    ["Services booked (scheduled / in progress)", totals.booked],
    ["Flats with open work", totals.open],
    ["Jobs in this report", totals.jobs],
  ];
  kpis.forEach(([label, value], i) => {
    const row = sum.addRow([label, value]);
    row.getCell(1).font = { color: { argb: COLORS.soft } };
    row.getCell(2).font = { bold: true, size: 12, color: { argb: COLORS.ink } };
    row.getCell(2).alignment = { horizontal: "left" };
    styleBody(row, i);
  });

  sum.addRow([]);
  const propHead = sum.addRow(["Property", "Flats", "Services done", "Services booked", "Flats with open work"]);
  styleHeader(propHead);
  const byProperty = new Map();
  for (const f of data.flats) {
    const key = f.property || "—";
    if (!byProperty.has(key)) byProperty.set(key, { flats: 0, done: 0, booked: 0, open: 0 });
    const p = byProperty.get(key);
    p.flats += 1;
    p.done += f.completed;
    p.booked += f.booked;
    if (f.booked > 0) p.open += 1;
  }
  [...byProperty.entries()].forEach(([name, p], i) => {
    styleBody(sum.addRow([name, p.flats, p.done, p.booked, p.open]), i);
  });
  if (!byProperty.size) sum.addRow(["No flats booked for these filters"]);

  /* ---------------- Flat status ---------------- */
  const fs = wb.addWorksheet("Flat status", { views: [{ state: "frozen", xSplit: 3, ySplit: 4, showGridLines: false }] });
  const fixed = ["Property", "Flat", "BHK"];
  const tail = ["Done", "Booked", "Not booked", "Last booking"];
  const width = fixed.length + data.subServices.length + tail.length;
  fs.columns = [
    { width: 22 }, { width: 10 }, { width: 9 },
    ...data.subServices.map(() => ({ width: 18 })),
    { width: 8 }, { width: 9 }, { width: 11 }, { width: 14 },
  ];
  addTitle(fs, "Flat status", `${subtitle} · Each service shows the latest job for the flat`, width);
  styleHeader(fs.addRow([...fixed, ...data.subServices, ...tail]));

  data.flats.forEach((f, i) => {
    const byName = Object.fromEntries(f.services.map((s) => [s.sub_service, s]));
    const cells = data.subServices.map((name) => {
      const s = byName[name];
      if (!s || s.state === "none") return "—";
      if (s.state === "completed") return `Done · ${fmtDate(s.job?.date)}`;
      return `Booked · ${STATUS_LABEL[s.job?.status] || s.job?.status || ""}${s.job?.date ? ` · ${fmtDate(s.job.date)}` : ""}`;
    });
    const notBooked = data.subServices.length - f.completed - f.booked;
    const row = fs.addRow([f.property, f.flat_number, f.bhk, ...cells, f.completed, f.booked, notBooked, asDate(f.last_activity)]);
    styleBody(row, i);
    row.getCell(2).font = { bold: true };
    data.subServices.forEach((name, k) => {
      const cell = row.getCell(fixed.length + 1 + k);
      const state = byName[name]?.state || "none";
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      if (state === "completed") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.doneFill } };
        cell.font = { color: { argb: COLORS.doneInk }, bold: true, size: 9 };
      } else if (state === "booked") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.bookedFill } };
        cell.font = { color: { argb: COLORS.bookedInk }, bold: true, size: 9 };
      } else {
        cell.font = { color: { argb: COLORS.noneInk }, size: 9 };
      }
    });
    const last = row.getCell(width);
    last.numFmt = DATE_FMT;
    for (let c = width - 3; c < width; c += 1) row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
  });
  fs.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: width } };

  /* ---------------- Service details ---------------- */
  const ds = wb.addWorksheet("Service details", { views: [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: false }] });
  const headers = [
    "Property", "Flat", "BHK", "Service", "Job", "Status", "Booked on", "Visit date",
    "Completed on", "Price (₹)", "PO number", "Billed (₹)", "Supervisor", "Technicians",
  ];
  ds.columns = [
    { width: 22 }, { width: 10 }, { width: 9 }, { width: 30 }, { width: 12 }, { width: 13 }, { width: 13 },
    { width: 13 }, { width: 14 }, { width: 13 }, { width: 16 }, { width: 13 }, { width: 18 }, { width: 26 },
  ];
  addTitle(ds, "Service details", `${subtitle} · Every job booked for these flats (canceled jobs left out)`, headers.length);
  styleHeader(ds.addRow(headers));

  data.jobs.forEach((j, i) => {
    const row = ds.addRow([
      j.property, j.flat_number, j.bhk, j.sub_service, j.code, STATUS_LABEL[j.status] || j.status,
      asDate(j.booked_at), asDate(j.start_date), asDate(j.completed_at),
      j.price, j.po_number || "", j.billed, j.supervisor || "", j.technicians || "",
    ]);
    styleBody(row, i);
    [7, 8, 9].forEach((c) => { row.getCell(c).numFmt = DATE_FMT; });
    [10, 12].forEach((c) => {
      row.getCell(c).numFmt = INR_FMT;
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    });
    const status = row.getCell(6);
    if (j.status === "COMPLETED") status.font = { color: { argb: COLORS.doneInk }, bold: true };
    else status.font = { color: { argb: COLORS.bookedInk }, bold: true };
  });

  if (data.jobs.length) {
    const first = 5;
    const last = 4 + data.jobs.length;
    const total = ds.addRow([
      "Total", "", "", `${data.jobs.length} job${data.jobs.length === 1 ? "" : "s"}`, "", "", "", "", "",
      { formula: `SUM(J${first}:J${last})` }, "", { formula: `SUM(L${first}:L${last})` }, "", "",
    ]);
    total.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: COLORS.ink } };
      cell.border = { top: { style: "medium", color: { argb: COLORS.ink } } };
    });
    [10, 12].forEach((c) => {
      total.getCell(c).numFmt = INR_FMT;
      total.getCell(c).alignment = { horizontal: "right" };
    });
    ds.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: headers.length } };
  } else {
    ds.addRow(["No jobs for these filters"]);
  }

  return wb;
}

module.exports = { buildFlatsReport };
