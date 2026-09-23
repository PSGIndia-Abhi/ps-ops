const ExcelJS = require("exceljs");
const { Readable } = require("stream");
const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { notifyInvoiceImport } = require("./notifications.service");
const { insertInvoiceTds } = require("./Tds.service");
const { syncInvoiceStatusesSafely } = require("./InvoiceStatus.service");

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
  customer: { label: "Customer", required: true, aliases: ["customer", "customername", "customerid", "customercode", "companyid", "company"] },
  site: { label: "Site", required: true, aliases: ["site", "sitename", "siteid"] },
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
  const upper = (v) => String(v).trim().toUpperCase();

  // customers -- matched by name/code (as before) OR by id (COMP1, COMP2,
  // ...), whichever the row has. The id is unambiguous, so it's the safer
  // choice for anyone unsure of the exact customer name; the name still
  // works for people who already know it.
  const typedCustomers = [...new Set(rows.map((r) => String(r.customer || "").trim()).filter(Boolean))];
  const customersById = new Map(); // upper(id) -> customer
  const customersByNameKey = new Map(); // lower(name or code) -> [customer]
  if (typedCustomers.length) {
    const lowerVals = typedCustomers.map(lower);
    const upperVals = typedCustomers.map(upper);
    const [customers] = await pool.query(
      `SELECT id, name, display_name, code, is_active FROM companies WHERE UPPER(id) IN (?) OR LOWER(name) IN (?) OR LOWER(code) IN (?)`,
      [upperVals, lowerVals, lowerVals]
    );
    for (const c of customers) {
      customersById.set(upper(c.id), c);
      for (const key of new Set([lower(c.name), lower(c.code || "")])) {
        if (!key) continue;
        if (!customersByNameKey.has(key)) customersByNameKey.set(key, []);
        customersByNameKey.get(key).push(c);
      }
    }
  }

  function resolveCustomer(typed) {
    const byId = customersById.get(upper(typed));
    if (byId) return { customer: byId };
    const matches = customersByNameKey.get(lower(typed)) || [];
    const unique = [...new Map(matches.map((c) => [c.id, c])).values()];
    if (unique.length === 0) return { error: `Customer "${typed}" was not found` };
    if (unique.length > 1) return { error: "More than one customer has this name. Please use the Customer ID instead." };
    return { customer: unique[0] };
  }

  // sites -- same idea: matched by id (global, checked against the row's
  // customer afterwards) or by name (scoped to that customer, like before).
  const typedSites = [...new Set(rows.map((r) => String(r.site || "").trim()).filter(Boolean))];
  const sitesById = new Map(); // upper(id) -> site
  const sitesByNameKey = new Map(); // lower(name) -> [site]
  if (typedSites.length) {
    const lowerVals = typedSites.map(lower);
    const upperVals = typedSites.map(upper);
    const [sites] = await pool.query(
      `SELECT id, company_id, name, branch_id, is_active FROM sites WHERE UPPER(id) IN (?) OR LOWER(name) IN (?)`,
      [upperVals, lowerVals]
    );
    for (const s of sites) {
      sitesById.set(upper(s.id), s);
      const key = lower(s.name);
      if (!sitesByNameKey.has(key)) sitesByNameKey.set(key, []);
      sitesByNameKey.get(key).push(s);
    }
  }

  function resolveSite(typed, customerId) {
    const byId = sitesById.get(upper(typed));
    if (byId) return { site: byId, byId: true };
    if (!customerId) return { error: `Site "${typed}" was not found` };
    const matches = (sitesByNameKey.get(lower(typed)) || []).filter((s) => s.company_id === customerId);
    if (matches.length === 0) return { error: `Site "${typed}" was not found for this customer` };
    if (matches.length > 1) return { error: "More than one site of this customer has this name. Please use the Site ID instead." };
    return { site: matches[0] };
  }

  // invoice numbers that already exist
  const existing = new Set();
  const numbers = [...new Set(rows.map((r) => r.invoice_number).filter(Boolean))];
  const allCustomerIds = [...new Set([...customersById.values(), ...[...customersByNameKey.values()].flat()].map((c) => c.id))];
  if (allCustomerIds.length && numbers.length) {
    const [found] = await pool.query(
      `SELECT customer_id, invoice_number FROM invoices WHERE customer_id IN (?) AND invoice_number IN (?)`,
      [allCustomerIds, numbers]
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

    // customer -- resolved from either the name/code or the id typed on the row
    let customer = null;
    if (row.customer) {
      const resolved = resolveCustomer(row.customer);
      if (resolved.error) errors.push(resolved.error);
      else if (!resolved.customer.is_active) errors.push("Customer is inactive");
      else customer = resolved.customer;
    }
    result.customer_display = customer ? (customer.display_name || customer.name) : row.customer;

    // site -- resolved from either the name (scoped to this row's customer)
    // or the id (checked against this row's customer afterwards, so a valid
    // site id from a different customer is still an error).
    let site = null;
    if (row.site) {
      const resolved = resolveSite(row.site, customer?.id || null);
      if (resolved.error) {
        errors.push(resolved.error);
      } else if (resolved.byId && customer && resolved.site.company_id !== customer.id) {
        errors.push(`Site "${row.site}" does not belong to this customer`);
      } else if (!resolved.site.is_active) {
        errors.push("Site is inactive");
      } else if (user.role !== "admin" && (!userBranchId || resolved.site.branch_id !== userBranchId)) {
        errors.push("This site belongs to another branch, so you cannot create invoices for it");
      } else {
        site = resolved.site;
        result.matched_site_id = site.id;
      }
    }
    result.site_display = site ? site.name : row.site;

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

// Checks the file and hands back what it found -- nothing is written to the
// database at this point. The rows (raw, as typed) travel back to the browser
// and are sent again with confirmImport() if the accountant clicks Submit;
// only a submitted, re-validated import is ever persisted.
async function createPreview(file, user) {
  const parsed = await parseFile(file);
  const validated = await validateRows(parsed, user);
  const valid = validated.filter((r) => r.errors.length === 0).length;

  return {
    file_name: String(file.originalname).slice(0, 255),
    status: "DRAFT",
    total: validated.length,
    valid,
    errors: validated.length - valid,
    rows: validated.map((r) => ({
      rowNumber: r.rowNumber,
      invoiceNo: r.invoice_number || "",
      customer: r.customer_display || "",
      site: r.site_display || "",
      invoiceDate: r.invoice_date || "",
      dueDate: r.due_date || "",
      amount: r.parsed_amount ?? r.amount ?? "",
      remarks: r.remarks || "",
      status: r.errors.length === 0 ? "valid" : "error",
      imported: false,
      errors: r.errors,
      // The exact raw values typed in the file, sent back unchanged on Submit so the
      // row can be re-checked from scratch rather than trusting anything the browser sends.
      raw: {
        invoice_number: r.invoice_number, customer: r.customer, site: r.site,
        invoice_date: r.invoice_date, due_date: r.due_date, amount: r.amount, remarks: r.remarks,
      },
    })),
  };
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
     FROM invoice_imports WHERE created_by = ? AND status = 'CONFIRMED' ORDER BY created_at DESC LIMIT 20`,
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

// Re-checks the rows the browser sends back (never trusting its "valid"/"matched" claims)
// and, only now, writes anything to the database: the invoice_imports record, one
// invoice_import_rows row per line (for the audit trail), and the invoices themselves.
// This is the only place any of this data is ever persisted.
async function confirmImport(fileName, submittedRows, user) {
  if (!Array.isArray(submittedRows) || !submittedRows.length) throw withStatus("There is nothing to submit.");

  const rawRows = submittedRows.map((r, i) => ({ rowNumber: Number(r.rowNumber) || i + 2, ...(r.raw || {}) }));
  const validated = await validateRows(rawRows, user);
  if (!validated.some((r) => r.errors.length === 0)) throw withStatus("There are no valid records to import.");

  const importId = uuid();
  const safeFileName = String(fileName || "invoices.xlsx").slice(0, 255);
  const connection = await pool.getConnection();
  let imported = 0;
  const skipped = [];
  try {
    await connection.beginTransaction();

    // The customers' TDS settings, copied onto each new invoice.
    const customerIds = [...new Set(validated.map((r) => r.matched_customer_id).filter(Boolean))];
    const [companies] = customerIds.length
      ? await connection.query("SELECT id, tds_applicable, tds_rate FROM companies WHERE id IN (?)", [customerIds])
      : [[]];
    const companyById = new Map(companies.map((c) => [c.id, c]));

    const rowValues = [];
    for (const r of validated) {
      let createdInvoiceId = null;
      let isValid = r.errors.length === 0;
      let errorMessage = joinErrors(r.errors);

      if (isValid) {
        const invoiceId = uuid();
        try {
          await connection.query(
            `INSERT INTO invoices
             (id, invoice_number, customer_id, site_id, invoice_date, due_date, invoice_amount, pending_amount, status, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
            [
              invoiceId, r.invoice_number, r.matched_customer_id, r.matched_site_id, r.parsed_invoice_date, r.parsed_due_date,
              r.parsed_amount, r.parsed_amount, r.remarks || null, user.id,
            ]
          );
          await insertInvoiceTds(connection, invoiceId, companyById.get(r.matched_customer_id), r.parsed_amount);
          createdInvoiceId = invoiceId;
          imported += 1;
        } catch (err) {
          if (err.code !== "ER_DUP_ENTRY") throw err;
          // Someone created the same invoice after the file was checked: keep the row, but show why it was skipped.
          isValid = false;
          errorMessage = "Duplicate invoice number: this customer already has this invoice";
          skipped.push({ rowNumber: r.rowNumber, invoiceNo: r.invoice_number, errors: [errorMessage] });
        }
      }

      rowValues.push([
        uuid(), importId, r.rowNumber,
        JSON.stringify({
          invoice_number: r.invoice_number,
          customer: r.customer_display, customer_id: r.customer,
          site: r.site_display, site_id: r.site,
          invoice_date: r.invoice_date, due_date: r.due_date, amount: r.amount, remarks: r.remarks,
        }),
        r.customer_display || null, r.matched_customer_id, r.site_display || null, r.matched_site_id,
        r.invoice_number || null, r.parsed_invoice_date, r.parsed_due_date, r.parsed_amount,
        isValid ? 1 : 0, errorMessage, createdInvoiceId,
      ]);
    }

    await connection.query(
      `INSERT INTO invoice_imports (id, file_name, status, total_rows, valid_rows, error_rows, created_by, confirmed_at)
       VALUES (?, ?, 'CONFIRMED', ?, ?, ?, ?, NOW())`,
      [importId, safeFileName, validated.length, imported, validated.length - imported, user.id]
    );
    for (let i = 0; i < rowValues.length; i += 500) {
      await connection.query(
        `INSERT INTO invoice_import_rows
         (id, import_id, \`row_number\`, raw_data, customer_name, matched_customer_id, site_name, matched_site_id,
          invoice_number, invoice_date, due_date, invoice_amount, is_valid, error_message, created_invoice_id)
         VALUES ?`,
        [rowValues.slice(i, i + 500)]
      );
    }

    await connection.commit();
    await syncInvoiceStatusesSafely(); // invoices imported with a past due date are stored as OVERDUE right away
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  notifyInvoiceImport({
    userId: user.id, importId, fileName: safeFileName,
    total: validated.length, imported, errors: validated.length - imported,
  }).catch((err) => console.error("Invoice import notification failed:", err));

  return { success: true, imported, skipped, import_id: importId };
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
