// Brigade Executive module: masters (flats, prices), price quote, Brigade
// booking creation, Brigade bookings list, and the before/after
// visit photo steps used by the Android technician app.
//
// Bookings are still created by the existing createBooking controller (same
// jobs, visits, recurrence and notifications as every other booking); this
// module validates the Brigade fields first and then stores them in
// brigade_booking_details.

const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { createBooking } = require("./bookings.controller");
const {
  BRIGADE_GROUP_NAME,
  BRIGADE_SUB_SERVICES,
  BRIGADE_SERVICE_TYPE,
  FLAT_NUMBER_PATTERN,
  MIN_VISIT_PHOTOS,
  PHOTO_PHASES,
  isBrigadeExecutive,
  isValidFlatNumber,
  withStatus,
  getBrigadeGroupId,
  isBrigadeCompany,
  isBrigadeContact,
  isBrigadeJob,
  resolvePrice,
  getVisitPhotoCounts,
} = require("../services/brigade.service");

const FLAT_FORMAT_MESSAGE =
  "Flat number must be one capital letter, a hyphen and 4 digits (e.g. L-0123)";

function sendError(res, err, fallback) {
  if (err?.status) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBhk(value) {
  return trimString(value).replace(/\s+/g, " ");
}

function parsePrice(value) {
  const num = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(num) || num < 0) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

async function assertBrigadeCompany(db, companyId) {
  if (!companyId || !(await isBrigadeCompany(db, companyId))) {
    throw withStatus("Please choose a Brigade Group property", 400);
  }
}

/* ------------------------------------------------------------------ */
/* Meta + properties                                                   */
/* ------------------------------------------------------------------ */

// GET /api/brigade/meta
async function getMeta(req, res) {
  try {
    const groupId = await getBrigadeGroupId(pool);
    res.json({
      group_id: groupId,
      group_name: BRIGADE_GROUP_NAME,
      service_type: BRIGADE_SERVICE_TYPE,
      sub_services: BRIGADE_SUB_SERVICES,
      flat_number_pattern: FLAT_NUMBER_PATTERN.source,
      min_visit_photos: MIN_VISIT_PHOTOS,
      bhk_types: (await listActiveBhkTypes(pool)).map((t) => t.name),
    });
  } catch (err) {
    sendError(res, err, "Failed to load Brigade settings");
  }
}

// GET /api/brigade/properties — Brigade Group companies with their active sites.
async function listProperties(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT
         co.id AS company_id,
         co.name AS company_name,
         co.display_name,
         s.id AS site_id,
         s.name AS site_name,
         s.address,
         s.city,
         s.state,
         s.branch_id,
         (SELECT COUNT(*) FROM brigade_flats f WHERE f.company_id = co.id AND f.is_active = 1) AS flat_count
       FROM companies co
       JOIN group_name g ON g.id = co.group_id
       LEFT JOIN sites s ON s.company_id = co.id AND s.is_active = 1
       WHERE g.name = ? AND co.is_active = 1
       ORDER BY co.name ASC, s.name ASC`,
      [BRIGADE_GROUP_NAME]
    );

    const byCompany = new Map();
    for (const row of rows) {
      if (!byCompany.has(row.company_id)) {
        byCompany.set(row.company_id, {
          id: row.company_id,
          name: row.company_name,
          display_name: row.display_name || row.company_name,
          flat_count: Number(row.flat_count) || 0,
          sites: [],
        });
      }
      if (row.site_id) {
        byCompany.get(row.company_id).sites.push({
          id: row.site_id,
          name: row.site_name,
          address: row.address,
          city: row.city,
          state: row.state,
          branch_id: row.branch_id,
        });
      }
    }

    res.json(Array.from(byCompany.values()));
  } catch (err) {
    sendError(res, err, "Failed to load properties");
  }
}

/* ------------------------------------------------------------------ */
/* BHK types master                                                    */
/* ------------------------------------------------------------------ */

const BHK_NAME_MAX = 20; // brigade_bhk_types.name / brigade_flats.bhk are VARCHAR(20)

async function listActiveBhkTypes(db) {
  try {
    const [rows] = await db.query(
      "SELECT id, name, sort_order FROM brigade_bhk_types WHERE is_active = 1 ORDER BY sort_order ASC, name ASC"
    );
    return rows;
  } catch (err) {
    // brigade_masters.sql not run yet: the rest of the module keeps working.
    if (err?.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  }
}

// A flat or price may only use a BHK type that exists in the master.
async function assertBhkType(db, bhk) {
  const [[row]] = await db.query(
    "SELECT id FROM brigade_bhk_types WHERE name = ? AND is_active = 1",
    [bhk]
  );
  if (!row) throw withStatus(`"${bhk}" is not in the BHK types master`, 400);
}

function readBhkName(body) {
  const name = normalizeBhk(body?.name);
  if (!name) throw withStatus("BHK type name is required", 400);
  if (name.length > BHK_NAME_MAX) throw withStatus(`BHK type name can be at most ${BHK_NAME_MAX} characters`, 400);
  return name;
}

// GET /api/brigade/bhk-types — active types, with how many flats/prices use each.
async function listBhkTypes(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.name, t.sort_order,
              (SELECT COUNT(*) FROM brigade_flats f WHERE f.bhk = t.name AND f.is_active = 1) AS flat_count,
              (SELECT COUNT(*) FROM brigade_prices p WHERE p.bhk = t.name) AS price_count
       FROM brigade_bhk_types t
       WHERE t.is_active = 1
       ORDER BY t.sort_order ASC, t.name ASC`
    );
    res.json(rows.map((r) => ({ ...r, flat_count: Number(r.flat_count), price_count: Number(r.price_count) })));
  } catch (err) {
    sendError(res, err, "Failed to load BHK types");
  }
}

// POST /api/brigade/bhk-types — add at the end (a removed type with the same name comes back).
async function createBhkType(req, res) {
  try {
    const name = readBhkName(req.body);
    const [[existing]] = await pool.query("SELECT id, is_active FROM brigade_bhk_types WHERE name = ?", [name]);
    if (existing?.is_active) throw withStatus(`"${name}" already exists`, 409);

    const [[{ next }]] = await pool.query(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM brigade_bhk_types WHERE is_active = 1"
    );
    let id = existing?.id;
    if (id) {
      await pool.query("UPDATE brigade_bhk_types SET is_active = 1, sort_order = ? WHERE id = ?", [next, id]);
    } else {
      id = uuid();
      await pool.query(
        "INSERT INTO brigade_bhk_types (id, name, sort_order, created_by_user_id) VALUES (?, ?, ?, ?)",
        [id, name, next, req.user.id]
      );
    }
    res.status(201).json({ id, name, sort_order: next });
  } catch (err) {
    sendError(res, err, "Failed to add BHK type");
  }
}

// PUT /api/brigade/bhk-types/:id — rename and/or move. A rename also renames
// the BHK on existing flats and prices (bookings keep their own snapshot).
async function updateBhkType(req, res) {
  const connection = await pool.getConnection();
  try {
    const [[type]] = await connection.query(
      "SELECT id, name, sort_order FROM brigade_bhk_types WHERE id = ? AND is_active = 1",
      [req.params.id]
    );
    if (!type) throw withStatus("BHK type not found", 404);

    const hasName = req.body?.name !== undefined;
    const name = hasName ? readBhkName(req.body) : type.name;
    const hasOrder = req.body?.sort_order !== undefined;
    const sortOrder = hasOrder ? Number(req.body.sort_order) : type.sort_order;
    if (hasOrder && !Number.isInteger(sortOrder)) throw withStatus("Invalid order", 400);

    if (name !== type.name) {
      const [[dup]] = await connection.query("SELECT id FROM brigade_bhk_types WHERE name = ? AND id != ?", [name, type.id]);
      if (dup) throw withStatus(`"${name}" already exists`, 409);
    }

    await connection.beginTransaction();
    await connection.query("UPDATE brigade_bhk_types SET name = ?, sort_order = ? WHERE id = ?", [name, sortOrder, type.id]);
    if (name !== type.name) {
      await connection.query("UPDATE brigade_flats SET bhk = ? WHERE bhk = ?", [name, type.name]);
      await connection.query("UPDATE brigade_prices SET bhk = ? WHERE bhk = ?", [name, type.name]);
    }
    await connection.commit();
    res.json({ id: type.id, name, sort_order: sortOrder });
  } catch (err) {
    await connection.rollback().catch(() => {});
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A price for that BHK already exists on a property; remove one of them first" });
    }
    sendError(res, err, "Failed to update BHK type");
  } finally {
    connection.release();
  }
}

// DELETE /api/brigade/bhk-types/:id — only when no flat or price uses it.
async function deleteBhkType(req, res) {
  try {
    const [[type]] = await pool.query(
      "SELECT id, name FROM brigade_bhk_types WHERE id = ? AND is_active = 1",
      [req.params.id]
    );
    if (!type) throw withStatus("BHK type not found", 404);
    const [[{ flats }]] = await pool.query(
      "SELECT COUNT(*) AS flats FROM brigade_flats WHERE bhk = ? AND is_active = 1",
      [type.name]
    );
    const [[{ prices }]] = await pool.query("SELECT COUNT(*) AS prices FROM brigade_prices WHERE bhk = ?", [type.name]);
    if (Number(flats) || Number(prices)) {
      throw withStatus(
        `"${type.name}" is used by ${Number(flats)} flat${Number(flats) === 1 ? "" : "s"} and ${Number(prices)} price${Number(prices) === 1 ? "" : "s"}. Change or delete those first.`,
        400
      );
    }
    await pool.query("UPDATE brigade_bhk_types SET is_active = 0 WHERE id = ?", [type.id]);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to remove BHK type");
  }
}

/* ------------------------------------------------------------------ */
/* Flats master                                                        */
/* ------------------------------------------------------------------ */

// GET /api/brigade/flats?company_id=
async function listFlats(req, res) {
  const companyId = trimString(req.query.company_id);
  try {
    await assertBrigadeCompany(pool, companyId);
    const [rows] = await pool.query(
      `SELECT id, company_id, flat_number, bhk, created_at, updated_at
       FROM brigade_flats
       WHERE company_id = ? AND is_active = 1
       ORDER BY flat_number ASC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load flats");
  }
}

function readFlatInput(body) {
  const flatNumber = trimString(body?.flat_number);
  const bhk = normalizeBhk(body?.bhk);
  if (!isValidFlatNumber(flatNumber)) throw withStatus(FLAT_FORMAT_MESSAGE, 400);
  if (!bhk) throw withStatus("BHK is required", 400);
  return { flatNumber, bhk };
}

// POST /api/brigade/flats
async function createFlat(req, res) {
  const companyId = trimString(req.body?.company_id);
  try {
    await assertBrigadeCompany(pool, companyId);
    const { flatNumber, bhk } = readFlatInput(req.body);
    await assertBhkType(pool, bhk);

    // A previously deleted flat with the same number is brought back.
    const [[existing]] = await pool.query(
      "SELECT id, is_active FROM brigade_flats WHERE company_id = ? AND flat_number = ?",
      [companyId, flatNumber]
    );
    if (existing?.is_active) {
      throw withStatus(`Flat ${flatNumber} already exists for this property`, 409);
    }

    let id = existing?.id;
    if (id) {
      await pool.query(
        "UPDATE brigade_flats SET bhk = ?, is_active = 1 WHERE id = ?",
        [bhk, id]
      );
    } else {
      id = uuid();
      await pool.query(
        `INSERT INTO brigade_flats (id, company_id, flat_number, bhk, created_by_user_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, companyId, flatNumber, bhk, req.user.id]
      );
    }

    res.status(201).json({ id, company_id: companyId, flat_number: flatNumber, bhk });
  } catch (err) {
    sendError(res, err, "Failed to add flat");
  }
}

async function loadFlat(db, flatId) {
  const [[flat]] = await db.query(
    "SELECT id, company_id, flat_number, bhk, is_active FROM brigade_flats WHERE id = ?",
    [flatId]
  );
  if (!flat || !flat.is_active) throw withStatus("Flat not found", 404);
  return flat;
}

// PUT /api/brigade/flats/:id
async function updateFlat(req, res) {
  try {
    const flat = await loadFlat(pool, req.params.id);
    const { flatNumber, bhk } = readFlatInput(req.body);
    await assertBhkType(pool, bhk);

    const [[duplicate]] = await pool.query(
      "SELECT id FROM brigade_flats WHERE company_id = ? AND flat_number = ? AND id != ?",
      [flat.company_id, flatNumber, flat.id]
    );
    if (duplicate) {
      throw withStatus(`Flat ${flatNumber} already exists for this property`, 409);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "UPDATE brigade_flats SET flat_number = ?, bhk = ? WHERE id = ?",
        [flatNumber, bhk, flat.id]
      );
      // Flat-specific prices follow the flat's BHK.
      if (bhk !== flat.bhk) {
        await connection.query(
          "UPDATE IGNORE brigade_prices SET bhk = ? WHERE flat_id = ?",
          [bhk, flat.id]
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.json({ id: flat.id, company_id: flat.company_id, flat_number: flatNumber, bhk });
  } catch (err) {
    sendError(res, err, "Failed to update flat");
  }
}

// DELETE /api/brigade/flats/:id — soft delete; its flat-specific prices are removed.
async function deleteFlat(req, res) {
  try {
    const flat = await loadFlat(pool, req.params.id);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM brigade_prices WHERE flat_id = ?", [flat.id]);
      await connection.query("UPDATE brigade_flats SET is_active = 0 WHERE id = ?", [flat.id]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to delete flat");
  }
}

/* ------------------------------------------------------------------ */
/* Prices master                                                       */
/* ------------------------------------------------------------------ */

// GET /api/brigade/prices?company_id=
async function listPrices(req, res) {
  const companyId = trimString(req.query.company_id);
  try {
    await assertBrigadeCompany(pool, companyId);
    const [rows] = await pool.query(
      `SELECT p.id, p.company_id, p.bhk, p.sub_service, p.flat_id, f.flat_number,
              p.price, p.updated_at
       FROM brigade_prices p
       LEFT JOIN brigade_flats f ON f.id = p.flat_id
       WHERE p.company_id = ?
       ORDER BY p.bhk ASC, p.sub_service ASC, (p.flat_id IS NULL) DESC, f.flat_number ASC`,
      [companyId]
    );
    res.json(rows.map((row) => ({ ...row, price: Number(row.price) })));
  } catch (err) {
    sendError(res, err, "Failed to load prices");
  }
}

async function readPriceInput(db, body) {
  const companyId = trimString(body?.company_id);
  await assertBrigadeCompany(db, companyId);

  const subService = trimString(body?.sub_service);
  if (!BRIGADE_SUB_SERVICES.includes(subService)) {
    throw withStatus("Please choose a Deep Cleaning service", 400);
  }

  const price = parsePrice(body?.price);
  if (price === null) throw withStatus("Price must be a number of 0 or more", 400);

  let flatId = trimString(body?.flat_id) || null;
  let bhk = normalizeBhk(body?.bhk);
  if (flatId) {
    const flat = await loadFlat(db, flatId);
    if (flat.company_id !== companyId) throw withStatus("Flat does not belong to this property", 400);
    bhk = flat.bhk; // a flat-specific price always uses the flat's own BHK
  }
  if (!bhk) throw withStatus("BHK is required", 400);
  if (!flatId) await assertBhkType(db, bhk);

  return { companyId, subService, price, flatId, bhk };
}

// POST /api/brigade/prices — create, or update the existing price for the same
// property + BHK + service (+ flat).
async function savePrice(req, res) {
  try {
    const input = await readPriceInput(pool, req.body);
    const [[existing]] = await pool.query(
      `SELECT id FROM brigade_prices
       WHERE company_id = ? AND bhk = ? AND sub_service = ? AND flat_key = ?`,
      [input.companyId, input.bhk, input.subService, input.flatId || ""]
    );

    let id = existing?.id;
    if (id) {
      await pool.query("UPDATE brigade_prices SET price = ? WHERE id = ?", [input.price, id]);
    } else {
      id = uuid();
      await pool.query(
        `INSERT INTO brigade_prices (id, company_id, bhk, sub_service, flat_id, price, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, input.companyId, input.bhk, input.subService, input.flatId, input.price, req.user.id]
      );
    }

    res.status(existing ? 200 : 201).json({
      id,
      company_id: input.companyId,
      bhk: input.bhk,
      sub_service: input.subService,
      flat_id: input.flatId,
      price: input.price,
      updated: Boolean(existing),
    });
  } catch (err) {
    sendError(res, err, "Failed to save price");
  }
}

// PUT /api/brigade/prices/:id — change the amount only.
async function updatePrice(req, res) {
  try {
    const price = parsePrice(req.body?.price);
    if (price === null) throw withStatus("Price must be a number of 0 or more", 400);
    const [[row]] = await pool.query("SELECT id, company_id FROM brigade_prices WHERE id = ?", [req.params.id]);
    if (!row) throw withStatus("Price not found", 404);
    await assertBrigadeCompany(pool, row.company_id);
    await pool.query("UPDATE brigade_prices SET price = ? WHERE id = ?", [price, row.id]);
    res.json({ id: row.id, price });
  } catch (err) {
    sendError(res, err, "Failed to update price");
  }
}

// DELETE /api/brigade/prices/:id
async function deletePrice(req, res) {
  try {
    const [[row]] = await pool.query("SELECT id, company_id FROM brigade_prices WHERE id = ?", [req.params.id]);
    if (!row) throw withStatus("Price not found", 404);
    await assertBrigadeCompany(pool, row.company_id);
    await pool.query("DELETE FROM brigade_prices WHERE id = ?", [row.id]);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to delete price");
  }
}

/* ------------------------------------------------------------------ */
/* Price quote (booking form)                                          */
/* ------------------------------------------------------------------ */

async function findFlatByNumber(db, companyId, flatNumber) {
  if (!isValidFlatNumber(flatNumber)) throw withStatus(FLAT_FORMAT_MESSAGE, 400);
  const [[flat]] = await db.query(
    `SELECT id, company_id, flat_number, bhk
     FROM brigade_flats
     WHERE company_id = ? AND flat_number = ? AND is_active = 1`,
    [companyId, flatNumber]
  );
  if (!flat) {
    throw withStatus(`Flat ${flatNumber} is not in the master for this property`, 404);
  }
  return flat;
}

async function quoteServices(db, flat, subServices) {
  const lines = [];
  for (const subService of subServices) {
    const resolved = await resolvePrice(db, {
      companyId: flat.company_id,
      flatId: flat.id,
      bhk: flat.bhk,
      subService,
    });
    lines.push({
      sub_service: subService,
      price: resolved ? resolved.price : null,
      source: resolved ? resolved.source : null,
    });
  }
  const missing = lines.filter((l) => l.price === null).map((l) => l.sub_service);
  const total = lines.reduce((sum, l) => sum + (l.price || 0), 0);
  return { lines, missing, total: Math.round(total * 100) / 100 };
}

function readSubServices(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? value.split(",")
      : [];
  const unique = [...new Set(list.map(trimString).filter(Boolean))];
  const invalid = unique.filter((s) => !BRIGADE_SUB_SERVICES.includes(s));
  if (invalid.length) throw withStatus(`Not a Brigade service: ${invalid.join(", ")}`, 400);
  return unique;
}

// GET /api/brigade/quote?company_id=&flat_number=&sub_services=a,b
// Returns the flat (with BHK) and, when services are given, their prices.
async function getQuote(req, res) {
  try {
    const companyId = trimString(req.query.company_id);
    await assertBrigadeCompany(pool, companyId);
    const flat = await findFlatByNumber(pool, companyId, trimString(req.query.flat_number));
    const subServices = readSubServices(req.query.sub_services);
    const quote = await quoteServices(pool, flat, subServices);
    res.json({ flat, ...quote });
  } catch (err) {
    sendError(res, err, "Failed to load price");
  }
}

/* ------------------------------------------------------------------ */
/* Brigade booking                                                     */
/* ------------------------------------------------------------------ */

// Runs the existing createBooking controller and hands back what it sent.
function runCreateBooking(req, body) {
  return new Promise((resolve, reject) => {
    const captureRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, payload });
        return this;
      },
    };
    createBooking({ body, user: req.user }, captureRes).catch(reject);
  });
}

function readPo(body) {
  const po = body?.client_po || {};
  const number = trimString(po.number);
  const source = trimString(po.source);
  const date = trimString(po.date);
  const amountRaw = po.amount;

  if (number.length > 100) throw withStatus("Client PO number is too long", 400);
  if (source.length > 255) throw withStatus("PO source is too long", 400);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw withStatus("PO date is invalid", 400);

  let amount = null;
  if (amountRaw !== undefined && amountRaw !== null && amountRaw !== "") {
    amount = parsePrice(amountRaw);
    if (amount === null) throw withStatus("PO amount must be a number of 0 or more", 400);
  }

  return { number: number || null, source: source || null, date: date || null, amount };
}

// POST /api/brigade/bookings
async function createBrigadeBooking(req, res) {
  try {
    const body = req.body || {};
    const companyId = trimString(body.company_id);
    const siteId = trimString(body.site_id);
    const contactId = trimString(body.contact_id);

    await assertBrigadeCompany(pool, companyId);

    const [[site]] = await pool.query(
      `SELECT id, address, city, state
       FROM sites WHERE id = ? AND company_id = ? AND is_active = 1`,
      [siteId, companyId]
    );
    if (!site) throw withStatus("Please choose the property site", 400);

    const flat = await findFlatByNumber(pool, companyId, trimString(body.flat_number));

    const subServices = readSubServices(body.subServices);
    if (!subServices.length) throw withStatus("Please select at least one service", 400);

    const quote = await quoteServices(pool, flat, subServices);
    if (quote.missing.length) {
      throw withStatus(
        `No price set for ${flat.flat_number} (${flat.bhk}): ${quote.missing.join(", ")}`,
        400
      );
    }

    // The job's site (and so the technician's location check) comes from the
    // requested-by contact, so it must belong to the chosen property site.
    if (!contactId || !(await isBrigadeContact(pool, contactId))) {
      throw withStatus("Please select who is requesting this booking", 400);
    }
    const [[contact]] = await pool.query("SELECT company_id FROM contacts WHERE id = ?", [contactId]);
    if (String(contact?.company_id) !== String(site.id)) {
      throw withStatus("The requested-by contact must belong to the selected property site", 400);
    }

    const po = readPo(body);

    const siteAddress = [site.address, site.city, site.state]
      .map(trimString)
      .filter(Boolean)
      .join(", ");
    const address = trimString(body.address) || siteAddress || null;

    const { status, payload } = await runCreateBooking(req, {
      client: {
        contact_id: contactId,
        serviceType: BRIGADE_SERVICE_TYPE,
        notes: body.notes || null,
      },
      subServices,
      address,
      start_date: body.start_date,
      end_date: body.end_date,
      notes: body.notes,
      recurrence: body.recurrence || null,
      serviceSchedules: body.serviceSchedules,
      supervisor_id: body.supervisor_id ?? null,
      technician_ids: body.technician_ids ?? [],
    });

    if (status >= 400 || !payload?.success) {
      return res.status(status >= 400 ? status : 500).json(payload || { error: "Failed to create booking" });
    }

    const bookingId = payload.jobs?.[0]?.booking_id;
    const prices = Object.fromEntries(quote.lines.map((l) => [l.sub_service, l.price]));

    await pool.query(
      `INSERT INTO brigade_booking_details
       (booking_id, company_id, site_id, flat_id, flat_number, bhk, prices, total_price,
        client_po_number, po_source, po_date, po_amount, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        companyId,
        site.id,
        flat.id,
        flat.flat_number,
        flat.bhk,
        JSON.stringify(prices),
        quote.total,
        po.number,
        po.source,
        po.date,
        po.amount,
        req.user.id,
      ]
    );

    res.json({
      ...payload,
      booking_id: bookingId,
      brigade: {
        flat_number: flat.flat_number,
        bhk: flat.bhk,
        prices,
        total_price: quote.total,
      },
    });
  } catch (err) {
    sendError(res, err, "Failed to create Brigade booking");
  }
}

/* ------------------------------------------------------------------ */
/* Bookings list                                                       */
/* ------------------------------------------------------------------ */

// Shared filter: bookings whose site belongs to Brigade Group.
const BRIGADE_BOOKING_FROM = `
  FROM bookings b
  JOIN sites s ON s.id = b.company_id
  JOIN companies co ON co.id = s.company_id
  JOIN group_name g ON g.id = co.group_id AND g.name = ?
  LEFT JOIN contacts c ON c.id = b.contact_id
  LEFT JOIN brigade_booking_details bd ON bd.booking_id = b.id
`;

// GET /api/brigade/bookings — same shape as GET /api/bookings, plus Brigade details.
async function listBrigadeBookings(req, res) {
  try {
    const [bookings] = await pool.query(
      `SELECT
         b.id, b.code, b.contact_id, b.created_at, b.service_type,
         c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email,
         s.id AS company_id, co.name AS company_name, co.code AS company_code,
         co.type AS company_type, s.name AS company_site,
         bd.flat_number, bd.bhk, bd.prices, bd.total_price,
         bd.client_po_number, bd.po_source, bd.po_date, bd.po_amount
       ${BRIGADE_BOOKING_FROM}
       ORDER BY b.created_at DESC`,
      [BRIGADE_GROUP_NAME]
    );

    if (bookings.length) {
      const [jobs] = await pool.query(
        `SELECT j.id, j.booking_id, j.code, j.sub_service, j.status,
                COALESCE(j.is_archived, 0) AS is_archived, j.start_date
         FROM jobs j
         WHERE j.booking_id IN (?)
         ORDER BY j.created_at DESC`,
        [bookings.map((b) => b.id)]
      );
      const jobsByBooking = new Map();
      for (const job of jobs) {
        if (!jobsByBooking.has(job.booking_id)) jobsByBooking.set(job.booking_id, []);
        jobsByBooking.get(job.booking_id).push({ ...job, is_archived: Boolean(job.is_archived) });
      }
      for (const booking of bookings) {
        booking.jobs = jobsByBooking.get(booking.id) || [];
        booking.total_price = booking.total_price === null ? null : Number(booking.total_price);
        booking.po_amount = booking.po_amount === null ? null : Number(booking.po_amount);
      }
    }

    res.json(bookings);
  } catch (err) {
    sendError(res, err, "Failed to load bookings");
  }
}

/* ------------------------------------------------------------------ */
/* Job details + visit photos                                          */
/* ------------------------------------------------------------------ */

// Who may see a job's Brigade details / a visit's photo steps:
// admin, Brigade Executive, the job's supervisor, or a technician on the job.
async function canSeeJob(user, jobId) {
  if (user.role === "admin") return true;
  if (isBrigadeExecutive(user)) return isBrigadeJob(pool, jobId);
  const [[row]] = await pool.query(
    `SELECT 1 AS ok
     FROM jobs j
     WHERE j.id = ?
       AND (
         j.supervisor_id = ?
         OR JSON_CONTAINS(COALESCE(j.team, JSON_ARRAY()), CAST(? AS JSON))
         OR JSON_CONTAINS(COALESCE(j.team, JSON_ARRAY()), JSON_QUOTE(?))
         OR EXISTS (
           SELECT 1 FROM job_visits v
           JOIN visit_technicians vt ON vt.visit_id = v.id
           WHERE v.job_id = j.id AND vt.technician_id = ?
         )
         OR (? = 'branch_admin' AND j.branch_id = (SELECT branch_id FROM users WHERE id = ?))
       )`,
    [jobId, user.id, String(user.id), String(user.id), user.id, user.role, user.id]
  );
  return !!row;
}

// GET /api/brigade/jobs/:jobId — Brigade details of a job ({ is_brigade: false } otherwise).
async function getJobDetails(req, res) {
  try {
    const { jobId } = req.params;
    if (!(await canSeeJob(req.user, jobId))) throw withStatus("Job not found", 404);

    const [[row]] = await pool.query(
      `SELECT j.sub_service, bd.flat_number, bd.bhk, bd.prices, bd.total_price,
              bd.client_po_number, bd.po_source, bd.po_date, bd.po_amount,
              co.name AS property, s.name AS site_name
       FROM jobs j
       JOIN brigade_booking_details bd ON bd.booking_id = j.booking_id
       LEFT JOIN companies co ON co.id = bd.company_id
       LEFT JOIN sites s ON s.id = bd.site_id
       WHERE j.id = ?`,
      [jobId]
    );
    if (!row) return res.json({ is_brigade: false });

    let prices = row.prices;
    if (typeof prices === "string") {
      try { prices = JSON.parse(prices); } catch { prices = {}; }
    }
    const servicePrice = prices?.[row.sub_service];

    res.json({
      is_brigade: true,
      property: row.property,
      site_name: row.site_name,
      flat_number: row.flat_number,
      bhk: row.bhk,
      price: servicePrice === undefined ? null : Number(servicePrice),
      booking_total_price: Number(row.total_price),
      client_po_number: row.client_po_number,
      po_source: row.po_source,
      po_date: row.po_date,
      po_amount: row.po_amount === null ? null : Number(row.po_amount),
      min_visit_photos: MIN_VISIT_PHOTOS,
    });
  } catch (err) {
    sendError(res, err, "Failed to load job details");
  }
}

async function loadVisitForPhotos(user, visitId) {
  const [[visit]] = await pool.query(
    "SELECT id, job_id, status FROM job_visits WHERE id = ?",
    [visitId]
  );
  if (!visit || !(await canSeeJob(user, visit.job_id))) throw withStatus("Visit not found", 404);
  return visit;
}

function photoStatus(visit, isBrigade, counts) {
  return {
    visit_id: visit.id,
    job_id: visit.job_id,
    visit_status: visit.status,
    is_brigade: isBrigade,
    required: isBrigade ? MIN_VISIT_PHOTOS : 0,
    before: counts.before,
    after: counts.after,
    before_done: !isBrigade || counts.before >= MIN_VISIT_PHOTOS,
    after_done: !isBrigade || counts.after >= MIN_VISIT_PHOTOS,
  };
}

// GET /api/brigade/visits/:visitId/photos
async function getVisitPhotos(req, res) {
  try {
    const visit = await loadVisitForPhotos(req.user, req.params.visitId);
    const isBrigade = await isBrigadeJob(pool, visit.job_id);
    const counts = isBrigade ? await getVisitPhotoCounts(pool, visit.id) : { before: 0, after: 0 };
    res.json(photoStatus(visit, isBrigade, counts));
  } catch (err) {
    sendError(res, err, "Failed to load visit photos");
  }
}

// POST /api/brigade/visits/:visitId/photos/:phase  (phase = before | after)
// Opens a job update for the photos and returns its history_id; the app then
// uploads each photo with the existing POST /api/jobs/:jobId/attachments/upload.
async function startPhotoUpload(req, res) {
  try {
    const phase = trimString(req.params.phase).toLowerCase();
    if (phase !== "before" && phase !== "after") throw withStatus("Phase must be before or after", 400);

    const visit = await loadVisitForPhotos(req.user, req.params.visitId);
    if (!(await isBrigadeJob(pool, visit.job_id))) {
      throw withStatus("Before/after photos are only for Brigade jobs", 400);
    }
    if (visit.status !== "IN_PROGRESS") {
      throw withStatus("Start the visit before uploading photos", 400);
    }
    if (phase === "after") {
      const counts = await getVisitPhotoCounts(pool, visit.id);
      if (counts.before < MIN_VISIT_PHOTOS) {
        throw withStatus(`Upload at least ${MIN_VISIT_PHOTOS} before-work photos first`, 400);
      }
    }

    const historyId = uuid();
    const action = phase === "before" ? PHOTO_PHASES.BEFORE : PHOTO_PHASES.AFTER;
    const message = phase === "before" ? "Before work photos" : "After work photos";
    await pool.query(
      `INSERT INTO job_history
       (id, job_id, action, message, metadata, visible_to_client, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, NOW())`,
      [historyId, visit.job_id, action, message, JSON.stringify({ visit_id: visit.id }), req.user.id]
    );

    res.json({ history_id: historyId, job_id: visit.job_id, action });
  } catch (err) {
    sendError(res, err, "Failed to start photo upload");
  }
}

module.exports = {
  getMeta,
  listBhkTypes,
  createBhkType,
  updateBhkType,
  deleteBhkType,
  listProperties,
  listFlats,
  createFlat,
  updateFlat,
  deleteFlat,
  listPrices,
  savePrice,
  updatePrice,
  deletePrice,
  getQuote,
  createBrigadeBooking,
  listBrigadeBookings,
  getJobDetails,
  getVisitPhotos,
  startPhotoUpload,
};
