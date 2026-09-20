const ExcelJS = require("exceljs");
const { Readable } = require("stream");
const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { notifyInvoiceImport } = require("./notifications.service");
const { insertInvoiceTds } = require("./Tds.service");

const MAX_ROWS = 5000;
const MAX_AMOUNT = 9999999999999.99;

function withStatus(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ---------------------------------------------------------------------------
// Columns the Excel/CSV file may contain. Headers are matched loosely
// (case, spaces and punctuation are ignored) so "Invoice No." works too.
// ---------------------------------------------------------------------------
const COLUMNS = {
  invoice_number: { label: "Invoice No", required: true, aliases: ["invoiceno", "invoicenumber", "invoice", "invno"] },
  customer: { label: "Customer", required: true, aliases: ["customer", "customername", "customercode", "company"] },
  site: { label: "Site", required: true, aliases: ["site", "sitename"] },
  invoice_date: { label: "Invoice Date", required: true, aliases: ["invoicedate", "date"] },
  due_date: { label: "Due Date", required: false, aliases: ["duedate"] },
  amount: { label: "Amount", required: true, aliases: ["amount", "invoiceamount", "total"] },
  remarks: { label: "Remarks", required: false, aliases: ["remarks", "notes"] },
};

const normalizeHeader = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Turns whatever ExcelJS gives for a cell (text, number, date, rich text, formula) into plain text.
function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("").trim();
    if ("result" in value) return cellText(value.result);
    if ("text" in value) return cellText(value.text);
    return "";
  }
  return String(value).trim();
}

async function loadWorksheet(file) {
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(file.originalname || "");
  try {
    if (isCsv) await workbook.csv.read(Readable.from(file.buffer));
    else await workbook.xlsx.load(file.buffer);
  } catch {
    throw withStatus("The file could not be read. Please upload a valid .xlsx or .csv file.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw withStatus("The file has no data.");
  return sheet;
}

// Reads the sheet into plain row objects. Row numbers match the row numbers in Excel.
async function parseFile(file) {
  const sheet = await loadWorksheet(file);

  const headerRow = sheet.getRow(1);
  const columnIndex = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = Object.keys(COLUMNS).find((k) => COLUMNS[k].aliases.includes(normalizeHeader(cellText(cell.value))));
    if (key && columnIndex[key] == null) columnIndex[key] = colNumber;
  });

  const missing = Object.keys(COLUMNS).filter((k) => COLUMNS[k].required && columnIndex[k] == null);
  if (missing.length) {
    throw withStatus(
      `The file is missing these columns: ${missing.map((k) => COLUMNS[k].label).join(", ")}. Please use the template.`
    );
  }

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const data = {};
    for (const key of Object.keys(COLUMNS)) {
      data[key] = columnIndex[key] == null ? "" : cellText(row.getCell(columnIndex[key]).value);
    }
    if (Object.values(data).every((v) => v === "")) continue; // skip blank rows
    rows.push({ rowNumber: r, ...data });
    if (rows.length > MAX_ROWS) {
      throw withStatus(`The file has more than ${MAX_ROWS} rows. Please split it into smaller files.`);
    }
  }

  if (!rows.length) throw withStatus("The file has no invoice rows.");
  return rows;
}

// Accepts YYYY-MM-DD and DD/MM/YYYY (or DD-MM-YYYY). Returns YYYY-MM-DD or null.
function parseDate(text) {
  let y;
  let m;
  let d;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) [, y, m, d] = match;
  else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text))) [, d, m, y] = match;
  else return null;

  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const valid = date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
  return valid ? date.toISOString().slice(0, 10) : null;
}

function parseAmount(text) {
  const cleaned = text.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

const DATE_HINT = "use DD/MM/YYYY or YYYY-MM-DD";

// ---------------------------------------------------------------------------
// Validation. Every problem found on a row is returned in plain language.
// ---------------------------------------------------------------------------
async function validateRows(rows, user) {
  const lower = (v) => String(v).trim().toLowerCase();

  // customers
  const names = [...new Set(rows.map((r) => lower(r.customer)).filter(Boolean))];
  const customersByKey = new Map(); // lower(name or code) -> [customer]
  if (names.length) {
    const [customers] = await pool.query(
      `SELECT id, name, code, is_active FROM companies WHERE LOWER(name) IN (?) OR LOWER(code) IN (?)`,
      [names, names]
    );
    for (const c of customers) {
      for (const key of new Set([lower(c.name), lower(c.code || "")])) {
        if (!key) continue;
        if (!customersByKey.has(key)) customersByKey.set(key, []);
        customersByKey.get(key).push(c);
      }
    }
  }

  // sites of those customers
  const customerIds = [...new Set([...customersByKey.values()].flat().map((c) => c.id))];
  const sitesByCustomer = new Map();
  if (customerIds.length) {
    const [sites] = await pool.query(`SELECT id, company_id, name, branch_id, is_active FROM sites WHERE company_id IN (?)`, [customerIds]);
    for (const s of sites) {
      if (!sitesByCustomer.has(s.company_id)) sitesByCustomer.set(s.company_id, []);
      sitesByCustomer.get(s.company_id).push(s);
    }
  }

  // invoice numbers that already exist
  const existing = new Set();
  const numbers = [...new Set(rows.map((r) => r.invoice_number).filter(Boolean))];
  if (customerIds.length && numbers.length) {
    const [found] = await pool.query(
      `SELECT customer_id, invoice_number FROM invoices WHERE customer_id IN (?) AND invoice_number IN (?)`,
      [customerIds, numbers]
    );
    for (const f of found) existing.add(`${f.customer_id}|${lower(f.invoice_number)}`);
  }

  let userBranchId = null;
  if (user.role !== "admin") {
    const [[row]] = await pool.query("SELECT branch_id FROM users WHERE id = ?", [user.id]);
    userBranchId = row?.branch_id || null;
  }

  const seenInFile = new Map(); // customerId|invoice -> first row number

  return rows.map((row) => {
    const errors = [];
    const result = { ...row, matched_customer_id: null, matched_site_id: null, parsed_invoice_date: null, parsed_due_date: null, parsed_amount: null };

    // required fields and formats
    if (!row.invoice_number) errors.push("Invoice number is required");
    else if (row.invoice_number.length > 100) errors.push("Invoice number is too long (maximum 100 characters)");

    if (!row.customer) errors.push("Customer is required");
    if (!row.site) errors.push("Site is required");

    if (!row.amount) errors.push("Invoice amount is required");
    else {
      const amount = parseAmount(row.amount);
      if (Number.isNaN(amount)) errors.push("Invoice amount is not a valid number");
      else if (amount <= 0) errors.push("Invoice amount must be greater than 0");
      else if (amount > MAX_AMOUNT) errors.push("Invoice amount is too large");
      else result.parsed_amount = amount;
    }

    if (!row.invoice_date) errors.push("Invoice date is required");
    else {
      result.parsed_invoice_date = parseDate(row.invoice_date);
      if (!result.parsed_invoice_date) errors.push(`Invoice date is not valid (${DATE_HINT})`);
    }

    if (row.due_date) {
      result.parsed_due_date = parseDate(row.due_date);
      if (!result.parsed_due_date) errors.push(`Due date is not valid (${DATE_HINT})`);
      else if (result.parsed_invoice_date && result.parsed_due_date < result.parsed_invoice_date) {
        errors.push("Due date cannot be before the invoice date");
      }
    }

    // customer
    let customer = null;
    if (row.customer) {
      const matches = customersByKey.get(lower(row.customer)) || [];
      const unique = [...new Map(matches.map((c) => [c.id, c])).values()];
      if (unique.length === 0) errors.push("Customer not found in the system");
      else if (unique.length > 1) errors.push("More than one customer has this name. Please use the customer code");
      else if (!unique[0].is_active) errors.push("Customer is inactive");
      else customer = unique[0];
    }

    // site
    if (customer && row.site) {
      const sites = (sitesByCustomer.get(customer.id) || []).filter((s) => lower(s.name) === lower(row.site));
      if (sites.length === 0) errors.push("Site not found for this customer");
      else if (sites.length > 1) errors.push("More than one site of this customer has this name");
      else if (!sites[0].is_active) errors.push("Site is inactive");
      else if (user.role !== "admin" && (!userBranchId || sites[0].branch_id !== userBranchId)) {
        errors.push("This site belongs to another branch, so you cannot create invoices for it");
      } else {
        result.matched_site_id = sites[0].id;
      }
    }

    // duplicates
    if (customer && row.invoice_number) {
      result.matched_customer_id = customer.id;
      const key = `${customer.id}|${lower(row.invoice_number)}`;
      if (existing.has(key)) errors.push("Duplicate invoice number: this customer already has this invoice");
      if (seenInFile.has(key)) errors.push(`Duplicate invoice number: also used on row ${seenInFile.get(key)} of this file`);
      else seenInFile.set(key, row.rowNumber);
    }

    return { ...result, errors };
  });
}

// ---------------------------------------------------------------------------
// Persisting the preview so it can be re-opened, downloaded and confirmed.
// ---------------------------------------------------------------------------
const joinErrors = (errors) => (errors.length ? errors.join("\n").slice(0, 500) : null);
const splitErrors = (text) => (text ? text.split("\n").filter(Boolean) : []);

async function createPreview(file, user) {
  const parsed = await parseFile(file);
  const validated = await validateRows(parsed, user);

  const importId = uuid();
  const valid = validated.filter((r) => r.errors.length === 0).length;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO invoice_imports (id, file_name, status, total_rows, valid_rows, error_rows, created_by)
       VALUES (?, ?, 'PREVIEWED', ?, ?, ?, ?)`,
      [importId, String(file.originalname).slice(0, 255), validated.length, valid, validated.length - valid, user.id]
    );

    const values = validated.map((r) => [
      uuid(), importId, r.rowNumber,
      JSON.stringify({ invoice_number: r.invoice_number, customer: r.customer, site: r.site, invoice_date: r.invoice_date, due_date: r.due_date, amount: r.amount, remarks: r.remarks }),
      r.customer || null, r.matched_customer_id, r.site || null, r.matched_site_id,
      r.invoice_number || null, r.parsed_invoice_date, r.parsed_due_date, r.parsed_amount,
      r.errors.length === 0 ? 1 : 0, joinErrors(r.errors),
    ]);
    for (let i = 0; i < values.length; i += 500) {
      await connection.query(
        `INSERT INTO invoice_import_rows
         (id, import_id, \`row_number\`, raw_data, customer_name, matched_customer_id, site_name, matched_site_id,
          invoice_number, invoice_date, due_date, invoice_amount, is_valid, error_message)
         VALUES ?`,
        [values.slice(i, i + 500)]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  // Nothing can be imported from this file, so tell the user now. (Otherwise they are told after the import.)
  if (valid === 0) {
    notifyInvoiceImport({
      userId: user.id, importId, fileName: String(file.originalname).slice(0, 255),
      total: validated.length, imported: 0, errors: validated.length,
    }).catch((err) => console.error("Invoice import notification failed:", err));
  }

  return getImport(importId, user);
}

async function loadImport(importId, user) {
  const [[imp]] = await pool.query("SELECT * FROM invoice_imports WHERE id = ?", [importId]);
  // Someone else's import looks the same as a missing one.
  if (!imp || (user.role !== "admin" && String(imp.created_by) !== String(user.id))) {
    throw withStatus("Import not found", 404);
  }
  return imp;
}

async function getImport(importId, user) {
  const imp = await loadImport(importId, user);
  const [rows] = await pool.query(
    "SELECT * FROM invoice_import_rows WHERE import_id = ? ORDER BY `row_number`",
    [importId]
  );

  const mapped = rows.map((r) => {
    const raw = typeof r.raw_data === "string" ? JSON.parse(r.raw_data) : r.raw_data || {};
    const errors = splitErrors(r.error_message);
    return {
      rowNumber: r.row_number,
      invoiceNo: raw.invoice_number || "",
      customer: raw.customer || "",
      site: raw.site || "",
      invoiceDate: raw.invoice_date || "",
      dueDate: raw.due_date || "",
      amount: r.invoice_amount == null ? raw.amount || "" : Number(r.invoice_amount),
      remarks: raw.remarks || "",
      status: r.is_valid ? "valid" : "error",
      imported: Boolean(r.created_invoice_id),
      errors,
    };
  });

  return {
    import_id: imp.id,
    file_name: imp.file_name,
    status: imp.status,
    total: mapped.length,
    valid: mapped.filter((r) => r.status === "valid").length,
    errors: mapped.filter((r) => r.status === "error").length,
    rows: mapped,
  };
}

// The user's recent uploads, newest first.
async function listImports(user) {
  const [rows] = await pool.query(
    `SELECT id, file_name, status, total_rows, valid_rows, error_rows, created_at, confirmed_at
     FROM invoice_imports WHERE created_by = ? ORDER BY created_at DESC LIMIT 20`,
    [user.id]
  );
  return rows.map((r) => ({
    import_id: r.id,
    file_name: r.file_name,
    status: r.status,
    total: r.total_rows,
    valid: r.valid_rows,
    errors: r.error_rows,
    uploaded_at: r.created_at,
    imported_at: r.confirmed_at,
  }));
}

// Removes an upload from the history. Invoices that were already imported from it are NOT touched.
async function deleteImport(importId, user) {
  await loadImport(importId, user);
  await pool.query("DELETE FROM invoice_imports WHERE id = ?", [importId]);
  return { success: true };
}

async function confirmImport(importId, user) {
  const imp = await loadImport(importId, user);
  if (imp.status === "CONFIRMED") throw withStatus("This import has already been imported.", 409);

  const [rows] = await pool.query(
    "SELECT * FROM invoice_import_rows WHERE import_id = ? AND is_valid = 1 AND created_invoice_id IS NULL ORDER BY `row_number`",
    [importId]
  );
  if (!rows.length) throw withStatus("There are no valid records to import.");

  const connection = await pool.getConnection();
  let imported = 0;
  const skipped = [];
  try {
    await connection.beginTransaction();

    // The customers' TDS settings, copied onto each new invoice.
    const customerIds = [...new Set(rows.map((r) => r.matched_customer_id).filter(Boolean))];
    const [companies] = customerIds.length
      ? await connection.query("SELECT id, tds_applicable, tds_rate FROM companies WHERE id IN (?)", [customerIds])
      : [[]];
    const companyById = new Map(companies.map((c) => [c.id, c]));

    for (const r of rows) {
      const invoiceId = uuid();
      try {
        await connection.query(
          `INSERT INTO invoices
           (id, invoice_number, customer_id, site_id, invoice_date, due_date, invoice_amount, pending_amount, status, remarks, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          [
            invoiceId, r.invoice_number, r.matched_customer_id, r.matched_site_id, r.invoice_date, r.due_date,
            r.invoice_amount, r.invoice_amount,
            (typeof r.raw_data === "string" ? JSON.parse(r.raw_data) : r.raw_data)?.remarks || null,
            user.id,
          ]
        );
      } catch (err) {
        if (err.code !== "ER_DUP_ENTRY") throw err;
        // Someone created the same invoice after the preview: keep the row, but show why it was skipped.
        const reason = "Duplicate invoice number: this customer already has this invoice";
        await connection.query("UPDATE invoice_import_rows SET is_valid = 0, error_message = ? WHERE id = ?", [reason, r.id]);
        skipped.push({ rowNumber: r.row_number, invoiceNo: r.invoice_number, errors: [reason] });
        continue;
      }
      await insertInvoiceTds(connection, invoiceId, companyById.get(r.matched_customer_id), r.invoice_amount);
      await connection.query("UPDATE invoice_import_rows SET created_invoice_id = ? WHERE id = ?", [invoiceId, r.id]);
      imported += 1;
    }

    const [[counts]] = await connection.query(
      "SELECT SUM(is_valid = 1) AS valid_rows, SUM(is_valid = 0) AS error_rows FROM invoice_import_rows WHERE import_id = ?",
      [importId]
    );
    await connection.query(
      "UPDATE invoice_imports SET status = 'CONFIRMED', confirmed_at = NOW(), valid_rows = ?, error_rows = ? WHERE id = ?",
      [Number(counts.valid_rows) || 0, Number(counts.error_rows) || 0, importId]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  notifyInvoiceImport({
    userId: user.id, importId, fileName: imp.file_name,
    total: imp.total_rows, imported, errors: imp.total_rows - imported,
  }).catch((err) => console.error("Invoice import notification failed:", err));

  return { success: true, imported, skipped };
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
// A cell starting with = + - @ could run as a formula when the CSV is opened in Excel.
const csvCell = (v) => {
  let text = String(v ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function buildErrorRowsCsv(importId, user) {
  const data = await getImport(importId, user);
  const header = ["Row", "Invoice No", "Customer", "Site", "Invoice Date", "Due Date", "Amount", "Error Reason"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of data.rows.filter((row) => row.status === "error")) {
    lines.push(
      [r.rowNumber, r.invoiceNo, r.customer, r.site, r.invoiceDate, r.dueDate, r.amount, r.errors.join("; ")]
        .map(csvCell)
        .join(",")
    );
  }
  return { fileName: `${data.file_name.replace(/\.[^.]+$/, "")}-errors.csv`, content: `﻿${lines.join("\r\n")}\r\n` };
}

async function buildTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoices");
  sheet.columns = Object.values(COLUMNS).map((c) => ({ header: c.label, width: 20 }));
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

module.exports = { createPreview, getImport, listImports, deleteImport, confirmImport, buildErrorRowsCsv, buildTemplate };
