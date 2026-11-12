const ExcelJS = require("exceljs");
const { computeDay } = require("../utils/salesFieldTracking");

// ---------------------------------------------------------------------------
// Field Tracking report: every field day of the chosen sales executives over a date range, built
// with the same computeDay() the day view uses, so the numbers always match the map screen.
// Returns plain rows (days, visits, petrol trips, stops, GPS gaps, alerts) for the screen and the
// same rows as an Excel file. Read-only.
// ---------------------------------------------------------------------------

const MAX_DAYS = 31;

/** The days with something to show: a shift started, or a client check-in. */
async function activeDays(db, userIds, from, to) {
  const [rows] = await db.query(
    `SELECT user_id, DATE_FORMAT(d, '%Y-%m-%d') AS day FROM (
       SELECT user_id, DATE(started_at) AS d FROM sales_field_shifts
        WHERE user_id IN (?) AND DATE(started_at) BETWEEN ? AND ?
       UNION
       SELECT sales_employee_id, DATE(check_in_at) FROM crm_lead_meetings
        WHERE sales_employee_id IN (?) AND check_in_at IS NOT NULL AND DATE(check_in_at) BETWEEN ? AND ?
     ) x ORDER BY day ASC`,
    [userIds, from, to, userIds, from, to]
  );
  return rows;
}

const minutesBetween = (a, b) => {
  if (!a || !b) return null;
  const ms = Date.parse(b.replace(" ", "T")) - Date.parse(a.replace(" ", "T"));
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : null;
};

/** Builds the report rows for these executives ([{id, name}]) between from and to (inclusive). */
async function buildFieldReport(db, executives, from, to) {
  const byId = new Map(executives.map((e) => [Number(e.id), e]));
  const result = { from, to, days: [], visits: [], trips: [], stops: [], gaps: [], alerts: [] };
  if (!executives.length) return result;

  const pairs = await activeDays(db, [...byId.keys()], from, to);
  for (const { user_id: uid, day } of pairs) {
    const exec = byId.get(Number(uid));
    if (!exec) continue;
    const d = await computeDay(db, { id: exec.id, name: exec.name }, day);
    const s = d.summary;
    const base = { date: day, executive: exec.name, userId: Number(exec.id) };
    result.days.push({
      ...base,
      status: d.shifts.some((x) => x.status === "ACTIVE") ? "On duty" : d.shifts.length ? "Day ended" : "No shift",
      shifts: d.shifts.length,
      firstStart: s.firstStart,
      lastEnd: s.lastEnd,
      durationMin: s.durationMin,
      visits: s.visitCount,
      unplannedVisits: s.unplannedVisitCount,
      gpsKm: s.gpsKm,
      petrolKm: s.petrolKm,
      petrolFinal: s.petrolFinal,
      gaps: s.gapCount,
      longStops: s.longStopAlertCount,
      flaggedTrips: s.flaggedLegCount,
      gpsPoints: s.pointCount,
    });
    for (const v of d.visits) {
      result.visits.push({
        ...base,
        shift: v.shift,
        leadNumber: v.leadNumber || "",
        company: v.company || "",
        address: v.address || "",
        planned: v.unplanned ? "Unplanned" : "Planned",
        scheduledAt: v.scheduledAt,
        checkInAt: v.checkInAt,
        checkOutAt: v.checkOutAt,
        spentMin: minutesBetween(v.checkInAt, v.checkOutAt),
        distanceFromLeadM: v.distanceFromLeadM,
        status: v.status,
        outcome: v.outcomeNotes || "",
      });
    }
    for (const l of d.petrol.legs) {
      result.trips.push({
        ...base,
        shift: l.shift,
        kind: { RETURN: "Return", SHIFT: "Whole shift", TRAVEL: "Travel" }[l.kind] || l.kind,
        from: l.from,
        to: l.to,
        fromAt: l.fromAt,
        toAt: l.toAt,
        gpsKm: l.gpsKm,
        roadKm: l.roadKm,
        maxKm: l.maxKm,
        paidKm: l.paidKm,
        status: l.status,
      });
    }
    for (const st of d.stops) result.stops.push({ ...base, from: st.from, to: st.to, minutes: st.minutes, latitude: st.latitude, longitude: st.longitude });
    for (const g of d.gaps) result.gaps.push({ ...base, from: g.from, to: g.to, minutes: g.minutes });
    for (const a of d.alerts) {
      result.alerts.push({ ...base, shift: a.shift, startedAt: a.startedAt, minutes: a.minutes, notifiedAt: a.notifiedAt, latitude: a.location?.latitude ?? null, longitude: a.location?.longitude ?? null });
    }
  }
  return result;
}

// ---- Excel -----------------------------------------------------------------

function xlDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))) : null;
}
const hours = (min) => (min === null || min === undefined ? null : Math.round((min / 60) * 100) / 100);
const mapLink = (lat, lng) => (lat === null || lat === undefined ? null : { text: "Open map", hyperlink: `https://www.google.com/maps?q=${lat},${lng}` });
const TRIP_STATUS = { OK: "OK (GPS km)", CAPPED: "Capped at road km + allowance", NO_GPS: "No GPS - road km paid", PENDING: "Road km not worked out yet", OPEN: "Shift still open", GPS_ONLY: "No client visit - GPS km" };

const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
function sheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 14 }));
  const head = ws.getRow(1);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEAD_FILL;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  head.height = 30;
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    columns.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      const v = c.value ? c.value(r) : r[c.key];
      cell.value = v ?? null;
      if (c.type === "date") cell.numFmt = "dd-mmm-yyyy";
      if (c.type === "time") cell.numFmt = "dd-mmm hh:mm";
      if (c.type === "num") cell.numFmt = "0.0";
      if (c.wrap) cell.alignment = { wrapText: true, vertical: "top" };
      if (v && v.hyperlink) cell.font = { color: { argb: "FF1D4ED8" }, underline: true };
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 2), column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  return ws;
}

const who = [
  { key: "date", header: "Date", width: 13, type: "date", value: (r) => xlDate(r.date) },
  { key: "executive", header: "Sales Executive", width: 22 },
];

async function fieldReportWorkbook(report, title) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BestServe";

  // Totals per executive at the top of the Summary sheet.
  const totals = new Map();
  for (const d of report.days) {
    const t = totals.get(d.executive) || { executive: d.executive, days: 0, durationMin: 0, visits: 0, unplanned: 0, gpsKm: 0, petrolKm: 0, petrolMissing: 0, gaps: 0, longStops: 0 };
    t.days++;
    t.durationMin += d.durationMin || 0;
    t.visits += d.visits || 0;
    t.unplanned += d.unplannedVisits || 0;
    t.gpsKm += d.gpsKm || 0;
    if (d.petrolKm === null) t.petrolMissing++;
    else t.petrolKm += d.petrolKm;
    t.gaps += d.gaps || 0;
    t.longStops += d.longStops || 0;
    totals.set(d.executive, t);
  }
  const sum = sheet(wb, "Summary", [
    { key: "executive", header: "Sales Executive", width: 24 },
    { key: "days", header: "Field Days", width: 10 },
    { key: "hours", header: "Hours on Duty", width: 12, type: "num", value: (t) => hours(t.durationMin) },
    { key: "visits", header: "Client Visits", width: 11 },
    { key: "unplanned", header: "Unplanned Visits", width: 11 },
    { key: "gpsKm", header: "GPS km", width: 10, type: "num" },
    { key: "petrolKm", header: "Petrol km", width: 10, type: "num" },
    { key: "petrolMissing", header: "Days Petrol Not Worked Out", width: 14 },
    { key: "gaps", header: "GPS Gaps", width: 9 },
    { key: "longStops", header: "Long-stop Alerts", width: 11 },
  ], [...totals.values()]);
  sum.spliceRows(1, 0, [`Field Tracking report - ${title}`], [`${report.from} to ${report.to}`], []);
  sum.getRow(1).font = { bold: true, size: 14 };
  sum.autoFilter = undefined;
  sum.views = [{ state: "frozen", ySplit: 4 }];

  sheet(wb, "Daily Summary", [
    ...who,
    { key: "status", header: "Status", width: 11 },
    { key: "shifts", header: "Shifts", width: 8 },
    { key: "firstStart", header: "Shift Start", width: 14, type: "time", value: (r) => xlDate(r.firstStart) },
    { key: "lastEnd", header: "Shift End", width: 14, type: "time", value: (r) => xlDate(r.lastEnd) },
    { key: "hours", header: "Hours on Duty", width: 11, type: "num", value: (r) => hours(r.durationMin) },
    { key: "visits", header: "Client Visits", width: 10 },
    { key: "unplannedVisits", header: "Unplanned", width: 10 },
    { key: "gpsKm", header: "GPS km", width: 9, type: "num" },
    { key: "petrolKm", header: "Petrol km", width: 10, type: "num" },
    { key: "petrolNote", header: "Petrol Note", width: 26, value: (r) => (r.petrolKm === null ? "Not worked out - open this day on the map once" : r.petrolFinal ? "" : "Provisional (day still open)") },
    { key: "gaps", header: "GPS Gaps", width: 9 },
    { key: "longStops", header: "Long-stop Alerts", width: 10 },
    { key: "flaggedTrips", header: "Trips to Check", width: 10 },
  ], report.days);

  sheet(wb, "Client Visits", [
    ...who,
    { key: "shift", header: "Shift", width: 7 },
    { key: "leadNumber", header: "Lead No", width: 15 },
    { key: "company", header: "Company", width: 28 },
    { key: "address", header: "Address", width: 36, wrap: true },
    { key: "planned", header: "Planned?", width: 11 },
    { key: "scheduledAt", header: "Scheduled For", width: 14, type: "time", value: (r) => xlDate(r.scheduledAt) },
    { key: "checkInAt", header: "Check-in", width: 14, type: "time", value: (r) => xlDate(r.checkInAt) },
    { key: "checkOutAt", header: "Check-out", width: 14, type: "time", value: (r) => xlDate(r.checkOutAt) },
    { key: "spentMin", header: "Time Spent (min)", width: 11 },
    { key: "distance", header: "Check-in Distance from Lead (m)", width: 15, value: (r) => (r.distanceFromLeadM === null ? null : Math.round(r.distanceFromLeadM)) },
    { key: "status", header: "Visit Status", width: 12, value: (r) => String(r.status || "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) },
    { key: "outcome", header: "Outcome", width: 36, wrap: true },
  ], report.visits);

  sheet(wb, "Petrol Trips", [
    ...who,
    { key: "shift", header: "Shift", width: 7 },
    { key: "kind", header: "Trip", width: 9 },
    { key: "from", header: "From", width: 24 },
    { key: "to", header: "To", width: 24 },
    { key: "fromAt", header: "Left At", width: 14, type: "time", value: (r) => xlDate(r.fromAt) },
    { key: "toAt", header: "Reached At", width: 14, type: "time", value: (r) => xlDate(r.toAt) },
    { key: "gpsKm", header: "GPS km", width: 9, type: "num" },
    { key: "roadKm", header: "Direct Road km", width: 10, type: "num" },
    { key: "maxKm", header: "Max Allowed km", width: 10, type: "num" },
    { key: "paidKm", header: "Paid km", width: 9, type: "num" },
    { key: "status", header: "Status", width: 28, value: (r) => TRIP_STATUS[r.status] || r.status },
  ], report.trips);

  sheet(wb, "Stops & Gaps", [
    ...who,
    { key: "type", header: "Type", width: 16 },
    { key: "from", header: "From", width: 14, type: "time", value: (r) => xlDate(r.from) },
    { key: "to", header: "To", width: 14, type: "time", value: (r) => xlDate(r.to) },
    { key: "minutes", header: "Minutes", width: 9 },
    { key: "where", header: "Where", width: 12, value: (r) => mapLink(r.latitude, r.longitude) },
  ], [
    ...report.stops.map((s) => ({ ...s, type: "Stop" })),
    ...report.alerts.map((a) => ({ ...a, type: "Long-stop alert", from: a.startedAt, to: null })),
    ...report.gaps.map((g) => ({ ...g, type: "GPS gap (no signal)" })),
  ].sort((a, b) => `${a.date}${a.executive}${a.from}`.localeCompare(`${b.date}${b.executive}${b.from}`)));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildFieldReport, fieldReportWorkbook, MAX_DAYS };
