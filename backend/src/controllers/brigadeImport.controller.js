// Brigade bulk import (Brigade panel -> Import): existing work from the client's
// Excel tracker into BestServe.
//
//   POST /api/brigade/import/check   file + mapping -> report (nothing saved)
//   POST /api/brigade/import         file + mapping -> starts the import, returns its id
//   GET  /api/brigade/import/history                -> recent imports (progress, counts)
//   POST /api/brigade/import/:id/undo               -> removes everything one import made
//
// Each sheet is mapped to a property, its site and a requested-by contact (guessed
// from the sheet name when possible). Per flat:
//   - completed services -> one booking (+ brigade_booking_details with the Excel
//     amounts and the PO) and one COMPLETED job + COMPLETED visit per service;
//   - services still to do -> one Pending flat (brigade_flat_requests + services).
// Rows are written the way bookings.controller / brigade.controller write them, but
// without notifications and without the photo rule (this is past work).
// The import only runs when the check has no errors. Tables: database/brigade/07_brigade_imports.sql.

const multer = require("multer");
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const { readWorkbook } = require("../services/brigadeImport.service");
const { BRIGADE_GROUP_NAME, BRIGADE_SERVICE_TYPE } = require("../services/brigade.service");

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
const OPEN_JOB_STATUSES = new Set(["CREATED", "NOT_STARTED", "IN_PROGRESS", "PAUSED"]);
const PO_SOURCE = "Imported from Excel";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, err, fallback) {
  if (err?.status) return res.status(err.status).json({ error: err.message });
  if (err?.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({ error: "Import is not set up yet - run database/brigade/07_brigade_imports.sql" });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

// multer for the one Excel file in the "file" field, with readable errors.
function acceptFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large (max 10 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send one Excel file in the 'file' field." });
  });
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Properties, sites and contacts the sheets can be mapped to          */
/* ------------------------------------------------------------------ */

async function loadOptions(db) {
  const [rows] = await db.query(
    `SELECT co.id AS company_id, co.name AS company_name, co.code AS company_code,
            s.id AS site_id, s.name AS site_name, s.address, s.city, s.state, s.branch_id
     FROM companies co
     JOIN group_name g ON g.id = co.group_id
     LEFT JOIN sites s ON s.company_id = co.id AND s.is_active = 1
     WHERE g.name = ? AND co.is_active = 1
     ORDER BY co.name ASC, s.name ASC`,
    [BRIGADE_GROUP_NAME]
  );
  const siteIds = rows.map((r) => r.site_id).filter(Boolean);
  const [contacts] = siteIds.length
    ? await db.query(
        "SELECT id, name, phone, company_id AS site_id FROM contacts WHERE company_id IN (?) AND is_active = 1 ORDER BY name ASC",
        [siteIds]
      )
    : [[]];

  const byCompany = new Map();
  for (const r of rows) {
    if (!byCompany.has(r.company_id)) {
      byCompany.set(r.company_id, { id: r.company_id, name: r.company_name, code: r.company_code, sites: [] });
    }
    if (r.site_id) {
      byCompany.get(r.company_id).sites.push({
        id: r.site_id,
        name: r.site_name,
        branch_id: r.branch_id,
        address: [r.address, r.city, r.state].map((x) => (x || "").trim()).filter(Boolean).join(", "),
        contacts: contacts.filter((c) => String(c.site_id) === String(r.site_id)).map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
      });
    }
  }
  return [...byCompany.values()];
}

// Sheet "El Dorado" -> property "Brigade Eldorado"; one site / one contact is picked when it is the only one.
function guessMapping(sheetName, options) {
  const key = norm(sheetName);
  const company = options.find((c) => {
    const name = norm(c.name).replace(/^brigade/, "");
    return name && key && (name === key || name.includes(key) || key.includes(name));
  });
  if (!company) return { company_id: "", site_id: "", contact_id: "", skip: false };
  const site = company.sites.length === 1 ? company.sites[0] : null;
  const contact = site && site.contacts.length === 1 ? site.contacts[0] : null;
  return { company_id: company.id, site_id: site?.id || "", contact_id: contact?.id || "", skip: false };
}

function readMapping(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new HttpError(400, "Invalid sheet mapping");
  }
}

/* ------------------------------------------------------------------ */
/* Check: workbook + mapping -> plan + report                         */
/* ------------------------------------------------------------------ */

async function buildPlan(db, buffer, mappingInput, user) {
  const { sheets } = await readWorkbook(buffer);
  const options = await loadOptions(db);
  const issues = [];
  const sheetReports = [];
  const plan = [];

  const [bhkRows] = await db.query("SELECT name FROM brigade_bhk_types WHERE is_active = 1");
  const bhkMaster = new Set(bhkRows.map((r) => r.name));
  const [[userRow]] = await db.query("SELECT branch_id FROM users WHERE id = ?", [user.id]);

  // Resolve every project sheet's mapping first, so the database reads below cover all mapped properties.
  const mapped = [];
  for (const sheet of sheets) {
    if (!sheet.isProject) {
      sheetReports.push({ name: sheet.name, is_project: false, reason: sheet.reason });
      continue;
    }
    const given = mappingInput[sheet.name];
    const m = given ? { company_id: given.company_id || "", site_id: given.site_id || "", contact_id: given.contact_id || "", skip: Boolean(given.skip) } : guessMapping(sheet.name, options);
    const company = options.find((c) => String(c.id) === String(m.company_id));
    const site = company?.sites.find((s) => String(s.id) === String(m.site_id));
    const contact = site?.contacts.find((c) => String(c.id) === String(m.contact_id));
    let mappingError = "";
    if (!m.skip) {
      if (!company) mappingError = "Choose the Brigade property for this sheet";
      else if (!site) mappingError = "Choose the property site for this sheet";
      else if (!contact) mappingError = "Choose the requested-by contact for this sheet";
      else if (!site.branch_id && !userRow?.branch_id) mappingError = "This site has no branch - set the branch on the site first";
    }
    mapped.push({ sheet, m, company, site, contact, mappingError, guessed: !given });
  }

  const companyIds = [...new Set(mapped.filter((x) => !x.m.skip && x.company).map((x) => x.company.id))];
  const prices = new Map();
  const existingDone = new Set();
  const openJobs = new Set();
  const pendingFlats = new Set();
  if (companyIds.length) {
    const [priceRows] = await db.query(
      "SELECT company_id, bhk, sub_service, price FROM brigade_prices WHERE flat_id IS NULL AND company_id IN (?)",
      [companyIds]
    );
    for (const p of priceRows) prices.set(`${p.company_id}|${p.bhk}|${p.sub_service}`, Number(p.price));
    const [jobRows] = await db.query(
      `SELECT bd.company_id, bd.flat_number, j.sub_service, j.status,
              DATE_FORMAT(COALESCE(j.completed_at, j.start_date), '%Y-%m-%d') AS d
       FROM jobs j JOIN brigade_booking_details bd ON bd.booking_id = j.booking_id
       WHERE j.status <> 'CANCELED' AND bd.company_id IN (?)`,
      [companyIds]
    );
    for (const j of jobRows) {
      if (j.status === "COMPLETED") existingDone.add(`${j.company_id}|${j.flat_number}|${j.sub_service}|${j.d || ""}`);
      if (OPEN_JOB_STATUSES.has(j.status)) openJobs.add(`${j.company_id}|${j.flat_number}|${j.sub_service}`);
    }
    const [reqRows] = await db.query(
      "SELECT company_id, flat_number FROM brigade_flat_requests WHERE status = 'PENDING' AND company_id IN (?)",
      [companyIds]
    );
    for (const r of reqRows) pendingFlats.add(`${r.company_id}|${r.flat_number}`);
  }

  const flatSheets = new Map(); // company|flat -> first sheet, to catch a flat in two sheets of one property
  for (const { sheet, m, company, site, contact, mappingError, guessed } of mapped) {
    const report = {
      name: sheet.name,
      is_project: true,
      mapping: m,
      guessed,
      flats: sheet.flats.length,
      completed: 0,
      pending_flats: 0,
      pending_services: 0,
      already: 0,
      nothing_to_import: 0,
      notes: sheet.notes,
      errors: 0,
      warnings: 0,
    };
    sheetReports.push(report);
    if (m.skip) {
      report.skipped = true;
      continue;
    }
    const sheetIssues = [...sheet.issues];
    const add = (row, flat, level, message) => sheetIssues.push({ sheet: sheet.name, row, flat, level, message });
    if (mappingError) add(null, null, "error", mappingError);

    const rowsWithErrors = new Set(sheet.issues.filter((i) => i.level === "error").map((i) => i.row));
    for (const f of sheet.flats) {
      if (rowsWithErrors.has(f.row) || f.poError || !company) continue;
      const flatKey = `${company.id}|${f.flat}`;
      if (flatSheets.has(flatKey)) {
        add(f.row, f.flat, "error", `Flat ${f.flat} is also in sheet "${flatSheets.get(flatKey)}" for the same property - keep one row`);
        continue;
      }
      flatSheets.set(flatKey, sheet.name);

      const hasPending = f.services.some((s) => s.status === "pending");
      if (f.bhk && !bhkMaster.has(f.bhk)) {
        add(f.row, f.flat, "error", `BHK "${f.bhk}" is not in the BHK list - add it in Prices & BHK`);
        continue;
      }
      if (!f.bhk && hasPending) {
        add(f.row, f.flat, "error", "BHK is empty - it is needed for the services still to do");
        continue;
      }
      if (!f.bhk) add(f.row, f.flat, "warning", "BHK is empty - imported without BHK");

      const priceOf = (service) => prices.get(`${company.id}|${f.bhk}|${service}`) ?? null;
      const completed = [];
      for (const s of f.services.filter((x) => x.status === "completed")) {
        if (existingDone.has(`${company.id}|${f.flat}|${s.service}|${s.date || ""}`)) {
          report.already++;
          continue;
        }
        let amount = s.amount ?? priceOf(s.service);
        if (amount === null) {
          amount = 0;
          add(f.row, f.flat, "warning", `${s.service}: no amount in Excel and no price in Prices & BHK - imported at ₹0`);
        }
        completed.push({ ...s, amount: round2(amount) });
      }

      const pending = [];
      if (hasPending && pendingFlats.has(flatKey)) {
        add(f.row, f.flat, "warning", "Already waiting in Pending - the services still to do were not added");
      } else {
        for (const s of f.services.filter((x) => x.status === "pending")) {
          if (openJobs.has(`${company.id}|${f.flat}|${s.service}`)) {
            add(f.row, f.flat, "warning", `${s.service}: already booked and not finished - not added to Pending`);
            continue;
          }
          const price = s.amount ?? priceOf(s.service);
          if (price === null) add(f.row, f.flat, "warning", `${s.service}: no price - add it in Prices & BHK before scheduling`);
          pending.push({ ...s, amount: price === null ? null : round2(price) });
        }
      }

      if (!completed.length && !pending.length) {
        report.nothing_to_import++;
        continue;
      }
      report.completed += completed.length;
      report.pending_services += pending.length;
      if (pending.length) report.pending_flats++;
      plan.push({
        sheet: sheet.name,
        row: f.row,
        flat: f.flat,
        bhk: f.bhk,
        company,
        site,
        contact,
        branchId: site.branch_id || userRow?.branch_id || null,
        poNumber: f.poNumber,
        poValue: f.poValue,
        remarks: f.remarks,
        completed,
        pending,
      });
    }
    report.errors = sheetIssues.filter((i) => i.level === "error").length;
    report.warnings = sheetIssues.filter((i) => i.level === "warning").length;
    issues.push(...sheetIssues);
  }

  const project = sheetReports.filter((s) => s.is_project && !s.skipped);
  const totals = {
    sheets: project.length,
    flats: project.reduce((t, s) => t + s.flats, 0),
    completed: project.reduce((t, s) => t + s.completed, 0),
    pending_flats: project.reduce((t, s) => t + s.pending_flats, 0),
    pending_services: project.reduce((t, s) => t + s.pending_services, 0),
    already: project.reduce((t, s) => t + s.already, 0),
    nothing_to_import: project.reduce((t, s) => t + s.nothing_to_import, 0),
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
  };
  issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  const report = {
    sheets: sheetReports,
    totals,
    issues,
    can_import: totals.errors === 0 && plan.length > 0,
    options: options.map((c) => ({ id: c.id, name: c.name, sites: c.sites.map((s) => ({ id: s.id, name: s.name, contacts: s.contacts })) })),
  };
  return { plan, report };
}

function readUpload(req) {
  if (!req.file?.buffer?.length) throw new HttpError(400, "Choose the Excel file to upload");
  if (!/\.xlsx$/i.test(req.file.originalname || "")) throw new HttpError(400, "Upload an Excel .xlsx file");
  return req.file;
}

// POST /api/brigade/import/check  (multipart: file, mapping JSON)
async function checkImport(req, res) {
  try {
    const file = readUpload(req);
    const { report } = await buildPlan(pool, file.buffer, readMapping(req.body?.mapping), req.user);
    res.json({ file_name: file.originalname, ...report });
  } catch (err) {
    sendError(res, err, "Failed to check the file");
  }
}

/* ------------------------------------------------------------------ */
/* Import                                                             */
/* ------------------------------------------------------------------ */

async function nextJobCode(conn, companyCode) {
  const [[row]] = await conn.query("SELECT value FROM sequences WHERE name = 'job_code' FOR UPDATE");
  const next = row.value + 1;
  await conn.query("UPDATE sequences SET value = ? WHERE name = 'job_code'", [next]);
  return companyCode ? `${companyCode} ${next}` : `${new Date().getFullYear()}-${next}`;
}

function jobNotes(item, s) {
  return [
    `Imported from Excel (${item.sheet}, row ${item.row})`,
    s.type && s.type !== s.service ? s.type : null,
    s.count ? `Points: ${s.count}` : null,
  ].filter(Boolean).join(" · ");
}

let bookingSeq = 0;

// One flat in one transaction: its completed jobs and/or its Pending flat.
async function importFlat(conn, item, userId, importId, created) {
  const subServices = item.completed.map((s) => s.service);
  if (item.completed.length) {
    const bookingId = uuid();
    bookingSeq = (bookingSeq + 1) % 1000;
    await conn.query(
      `INSERT INTO bookings
       (id, code, contact_id, company_id, service_type, sub_services, notes, created_by_user_id, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'ACTIVE')`,
      [bookingId, `B-${Date.now()}${String(bookingSeq).padStart(3, "0")}`, item.contact.id, item.site.id, BRIGADE_SERVICE_TYPE,
        JSON.stringify(subServices), item.remarks, userId]
    );
    const prices = Object.fromEntries(item.completed.map((s) => [s.service, s.amount]));
    await conn.query(
      `INSERT INTO brigade_booking_details
       (booking_id, company_id, site_id, flat_id, flat_number, bhk, prices, total_price,
        client_po_number, po_source, po_date, po_amount, created_by_user_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [bookingId, item.company.id, item.site.id, item.flat, item.bhk || "", JSON.stringify(prices),
        round2(item.completed.reduce((t, s) => t + s.amount, 0)),
        item.poNumber, item.poNumber ? PO_SOURCE : null, item.poNumber ? item.poValue : null, userId]
    );
    created.booking_ids.push(bookingId);

    for (const s of item.completed) {
      const jobId = uuid();
      const when = s.date ? `${s.date} 00:00:00` : null;
      await conn.query(
        `INSERT INTO jobs
         (id, code, booking_id, service_type, sub_service, status, supervisor_id, team, company_id, requested_by_contact_id,
          address, created_by_user_id, branch_id, approval_status, approved_at, start_date, completed_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'COMPLETED', NULL, '[]', ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?, NOW(), NOW())`,
        [jobId, await nextJobCode(conn, item.company.code), bookingId, BRIGADE_SERVICE_TYPE, s.service, item.site.id,
          item.contact.id, item.site.address || null, userId, item.branchId, when, when, when, jobNotes(item, s)]
      );
      await conn.query(
        `INSERT INTO job_visits
         (id, job_id, visit_number, scheduled_date, status, started_at, completed_at, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, 1, ?, 'COMPLETED', ?, ?, ?, NOW(), NOW())`,
        [uuid(), jobId, when, when, when, userId]
      );
      await conn.query(
        `INSERT INTO job_history (id, job_id, action, message, metadata, created_by_user_id, created_at)
         VALUES (?, ?, 'IMPORTED', ?, ?, ?, NOW())`,
        [uuid(), jobId, `Imported from Excel - ${item.sheet}, row ${item.row}`,
          JSON.stringify({ import_id: importId, sheet: item.sheet, row: item.row }), userId]
      );
      created.job_ids.push(jobId);
    }
  }

  if (item.pending.length) {
    const requestId = uuid();
    await conn.query(
      `INSERT INTO brigade_flat_requests
       (id, company_id, site_id, flat_number, bhk, contact_id, address,
        client_po_number, po_source, po_date, po_amount, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [requestId, item.company.id, item.site.id, item.flat, item.bhk, item.contact.id, item.site.address || null,
        item.poNumber, item.poNumber ? PO_SOURCE : null, item.poNumber ? item.poValue : null,
        [`Imported from Excel (${item.sheet}, row ${item.row})`, item.remarks].filter(Boolean).join(" · "), userId]
    );
    for (const [i, s] of item.pending.entries()) {
      await conn.query(
        "INSERT INTO brigade_flat_request_services (id, request_id, sub_service, price, sort_order) VALUES (?, ?, ?, ?, ?)",
        [uuid(), requestId, s.service, s.amount, i]
      );
    }
    created.request_ids.push(requestId);
  }

  await conn.query("UPDATE brigade_imports SET created = ? WHERE id = ?", [JSON.stringify(created), importId]);
}

async function runImport(importId, plan, userId) {
  const created = { booking_ids: [], job_ids: [], request_ids: [] };
  const summary = { flats_total: plan.length, flats_done: 0, completed_jobs: 0, pending_flats: 0, failed: [] };
  for (const item of plan) {
    const conn = await pool.getConnection();
    const before = { b: created.booking_ids.length, j: created.job_ids.length, r: created.request_ids.length };
    try {
      await conn.beginTransaction();
      await importFlat(conn, item, userId, importId, created);
      await conn.commit();
      summary.flats_done++;
      summary.completed_jobs += item.completed.length;
      if (item.pending.length) summary.pending_flats++;
    } catch (err) {
      await conn.rollback().catch(() => {});
      // Forget the ids of the rolled-back flat.
      created.booking_ids.length = before.b;
      created.job_ids.length = before.j;
      created.request_ids.length = before.r;
      summary.failed.push({ sheet: item.sheet, row: item.row, flat: item.flat, error: err.message });
      console.error("Brigade import: flat failed", item.sheet, item.row, err);
    } finally {
      conn.release();
    }
    if (summary.flats_done % 20 === 0) {
      await pool.query("UPDATE brigade_imports SET summary = ? WHERE id = ?", [JSON.stringify(summary), importId]).catch(() => {});
    }
  }
  await pool.query(
    "UPDATE brigade_imports SET status = 'DONE', summary = ?, created = ?, finished_at = NOW() WHERE id = ?",
    [JSON.stringify(summary), JSON.stringify(created), importId]
  );
}

// POST /api/brigade/import  (multipart: file, mapping JSON) -> { import_id } and runs in the background
async function startImport(req, res) {
  try {
    const file = readUpload(req);
    const [[running]] = await pool.query(
      "SELECT id FROM brigade_imports WHERE status = 'RUNNING' AND created_at > NOW() - INTERVAL 1 HOUR LIMIT 1"
    );
    if (running) throw new HttpError(409, "Another import is still running. Wait for it to finish.");

    const { plan, report } = await buildPlan(pool, file.buffer, readMapping(req.body?.mapping), req.user);
    if (!report.can_import) {
      return res.status(400).json({ error: report.totals.errors ? "Fix the errors in the file first" : "Nothing to import", ...report });
    }
    const importId = uuid();
    await pool.query(
      "INSERT INTO brigade_imports (id, file_name, status, summary, created, created_by_user_id) VALUES (?, ?, 'RUNNING', ?, ?, ?)",
      [importId, file.originalname.slice(0, 255), JSON.stringify({ flats_total: plan.length, flats_done: 0 }),
        JSON.stringify({ booking_ids: [], job_ids: [], request_ids: [] }), req.user.id]
    );
    res.status(202).json({ import_id: importId, flats: plan.length, totals: report.totals });

    runImport(importId, plan, req.user.id).catch(async (err) => {
      console.error("Brigade import failed", err);
      await pool.query("UPDATE brigade_imports SET status = 'FAILED', error = ?, finished_at = NOW() WHERE id = ?", [String(err.message).slice(0, 1000), importId]).catch(() => {});
    });
  } catch (err) {
    sendError(res, err, "Failed to start the import");
  }
}

/* ------------------------------------------------------------------ */
/* History and undo                                                   */
/* ------------------------------------------------------------------ */

function parseJson(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

// GET /api/brigade/import/history
async function listImports(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT i.id, i.file_name, i.status, i.summary, i.created, i.error, i.created_at, i.finished_at, i.undone_at,
              u.name AS created_by, uu.name AS undone_by
       FROM brigade_imports i
       LEFT JOIN users u ON u.id = i.created_by_user_id
       LEFT JOIN users uu ON uu.id = i.undone_by_user_id
       ORDER BY i.created_at DESC
       LIMIT 30`
    );
    res.json(rows.map((r) => {
      const created = parseJson(r.created, {});
      return {
        id: r.id,
        file_name: r.file_name,
        status: r.status,
        summary: parseJson(r.summary, {}),
        counts: { bookings: created.booking_ids?.length || 0, jobs: created.job_ids?.length || 0, pending: created.request_ids?.length || 0 },
        error: r.error,
        created_at: r.created_at,
        finished_at: r.finished_at,
        undone_at: r.undone_at,
        created_by: r.created_by,
        undone_by: r.undone_by,
      };
    }));
  } catch (err) {
    sendError(res, err, "Failed to load imports");
  }
}

// POST /api/brigade/import/:id/undo — removes the bookings, jobs and Pending flats one import made.
// Refused when any of its jobs is on an invoice or any of its Pending flats was scheduled since.
async function undoImport(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[imp]] = await conn.query("SELECT id, status, created FROM brigade_imports WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!imp) throw new HttpError(404, "Import not found");
    if (imp.status !== "DONE") throw new HttpError(409, imp.status === "UNDONE" ? "This import was already undone" : "Only a finished import can be undone");
    const created = parseJson(imp.created, {});
    const jobIds = created.job_ids || [];
    const bookingIds = created.booking_ids || [];
    const requestIds = created.request_ids || [];

    if (jobIds.length) {
      const [[inv]] = await conn.query("SELECT COUNT(*) AS n FROM brigade_invoice_lines WHERE job_id IN (?)", [jobIds]);
      if (Number(inv.n)) throw new HttpError(409, `${inv.n} imported service(s) are already on an invoice - this import cannot be undone`);
    }
    if (requestIds.length) {
      const [[moved]] = await conn.query("SELECT COUNT(*) AS n FROM brigade_flat_requests WHERE id IN (?) AND status <> 'PENDING'", [requestIds]);
      if (Number(moved.n)) throw new HttpError(409, `${moved.n} imported Pending flat(s) were already scheduled or canceled - this import cannot be undone`);
    }

    if (jobIds.length) {
      await conn.query("DELETE FROM job_history WHERE job_id IN (?)", [jobIds]);
      await conn.query("DELETE FROM jobs WHERE id IN (?)", [jobIds]); // visits and PO lines go with them (ON DELETE CASCADE)
    }
    if (bookingIds.length) await conn.query("DELETE FROM bookings WHERE id IN (?)", [bookingIds]); // + brigade_booking_details
    if (requestIds.length) await conn.query("DELETE FROM brigade_flat_requests WHERE id IN (?)", [requestIds]); // + its services
    await conn.query("UPDATE brigade_imports SET status = 'UNDONE', undone_at = NOW(), undone_by_user_id = ? WHERE id = ?", [req.user.id, imp.id]);
    await conn.commit();
    res.json({ success: true, removed: { bookings: bookingIds.length, jobs: jobIds.length, pending: requestIds.length } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    sendError(res, err, "Failed to undo the import");
  } finally {
    conn.release();
  }
}

module.exports = { acceptFile, checkImport, startImport, listImports, undoImport, buildPlan };
