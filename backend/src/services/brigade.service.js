// Brigade Executive module — shared rules.
//
// A Brigade Executive only ever works inside one company group, "Brigade
// Group" (created by database/brigade/01_brigade_masters.sql). Every property is a company in that
// group, its address is the company's site, and a booking is a "Brigade
// booking" when brigade_booking_details has a row for it.
//
// Existing routes call these helpers only when isBrigadeExecutive(req.user),
// so every other role keeps its current behaviour untouched.

const BRIGADE_ROLE = "brigade_executive";
const BRIGADE_GROUP_NAME = "Brigade Group";

// One capital letter, a hyphen, then exactly 4 digits: L-0123
const FLAT_NUMBER_PATTERN = /^[A-Z]-\d{4}$/;

// Same Deep Cleaning list as the web booking form (CreateBookingModal).
const BRIGADE_SUB_SERVICES = [
  "Floor Protection",
  "Electrical Shifting",
  "Electrical New Point Installation",
  "Plumbing Work",
  "Painting Work",
  "Regular Cleaning",
  "Deep Cleaning",
  "Deep Cleaning with Scrubbing",
  "Deep Cleaning with Sticker Removal",
  "Debris Removal",
];

const BRIGADE_SERVICE_TYPE = "DEEP";

// Before/after photo rule for Brigade visits (Android app).
const MIN_VISIT_PHOTOS = 1;
const PHOTO_PHASES = { BEFORE: "BEFORE_PHOTOS", AFTER: "AFTER_PHOTOS" };

function isBrigadeExecutive(user) {
  return user?.role === BRIGADE_ROLE;
}

function isValidFlatNumber(value) {
  return typeof value === "string" && FLAT_NUMBER_PATTERN.test(value);
}

function withStatus(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getBrigadeGroupId(db) {
  const [[row]] = await db.query(
    "SELECT id FROM group_name WHERE name = ? LIMIT 1",
    [BRIGADE_GROUP_NAME]
  );
  return row?.id || null;
}

async function isBrigadeCompany(db, companyId) {
  if (!companyId) return false;
  const [[row]] = await db.query(
    `SELECT 1 AS ok
     FROM companies c
     JOIN group_name g ON g.id = c.group_id
     WHERE c.id = ? AND g.name = ?`,
    [companyId, BRIGADE_GROUP_NAME]
  );
  return !!row;
}

async function isBrigadeSite(db, siteId) {
  if (!siteId) return false;
  const [[row]] = await db.query(
    `SELECT 1 AS ok
     FROM sites s
     JOIN companies c ON c.id = s.company_id
     JOIN group_name g ON g.id = c.group_id
     WHERE s.id = ? AND g.name = ?`,
    [siteId, BRIGADE_GROUP_NAME]
  );
  return !!row;
}

async function isBrigadeContact(db, contactId) {
  if (!contactId) return false;
  const [[row]] = await db.query(
    "SELECT company_id FROM contacts WHERE id = ?",
    [contactId]
  );
  return isBrigadeSite(db, row?.company_id);
}

// True when the job belongs to a Brigade booking (drives the photo rule).
async function isBrigadeJob(db, jobId) {
  if (!jobId) return false;
  const [[row]] = await db.query(
    `SELECT 1 AS ok
     FROM jobs j
     JOIN brigade_booking_details bd ON bd.booking_id = j.booking_id
     WHERE j.id = ?`,
    [jobId]
  );
  return !!row;
}

// True when the job's site belongs to a Brigade Group company (any Brigade
// job, booked through the Brigade form or not).
async function isBrigadeGroupJob(db, jobId) {
  if (!jobId) return false;
  const [[row]] = await db.query(
    `SELECT 1 AS ok
     FROM jobs j
     JOIN sites s ON s.id = j.company_id
     JOIN companies co ON co.id = s.company_id
     JOIN group_name g ON g.id = co.group_id
     WHERE j.id = ? AND g.name = ?`,
    [jobId, BRIGADE_GROUP_NAME]
  );
  return !!row;
}

async function isBrigadeGroupVisit(db, visitId) {
  if (!visitId) return false;
  const [[visit]] = await db.query("SELECT job_id FROM job_visits WHERE id = ?", [visitId]);
  return isBrigadeGroupJob(db, visit?.job_id);
}

// Route guards: a Brigade Executive may only act on Brigade Group jobs /
// visits. Every other role passes straight through, unchanged.
function brigadeJobOnly(getJobIds) {
  return async (req, res, next) => {
    if (!isBrigadeExecutive(req.user)) return next();
    try {
      const { pool } = require("../../db");
      const ids = [].concat(getJobIds(req) || []).filter(Boolean);
      for (const id of ids) {
        if (!(await isBrigadeGroupJob(pool, id))) {
          return res.status(404).json({ error: "Job not found" });
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function brigadeVisitOnly(param = "visitId") {
  return async (req, res, next) => {
    if (!isBrigadeExecutive(req.user)) return next();
    try {
      const { pool } = require("../../db");
      if (!(await isBrigadeGroupVisit(pool, req.params[param]))) {
        return res.status(404).json({ error: "Visit not found" });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// Price for one sub-service of one flat: a flat-specific price wins over the
// property + BHK price. Returns null when neither is set.
async function resolvePrice(db, { companyId, flatId, bhk, subService }) {
  const [rows] = await db.query(
    `SELECT price, flat_id
     FROM brigade_prices
     WHERE company_id = ? AND bhk = ? AND sub_service = ?
       AND (flat_id IS NULL OR flat_id = ?)
     ORDER BY flat_id IS NULL ASC
     LIMIT 1`,
    [companyId, bhk, subService, flatId || ""]
  );
  if (!rows.length) return null;
  return {
    price: Number(rows[0].price),
    source: rows[0].flat_id ? "FLAT" : "BHK",
  };
}

// Before/after photo counts for a visit's job. Photos are job_attachments
// hung off a job_history row whose action is BEFORE_PHOTOS / AFTER_PHOTOS and
// whose metadata carries the visit id.
async function getVisitPhotoCounts(db, visitId) {
  const [rows] = await db.query(
    `SELECT h.action, COUNT(a.id) AS photos
     FROM job_visits v
     JOIN job_history h ON h.job_id = v.job_id
      AND h.action IN (?, ?)
      AND JSON_UNQUOTE(JSON_EXTRACT(h.metadata, '$.visit_id')) = v.id
     JOIN job_attachments a ON a.history_id = h.id AND a.type = 'IMAGE'
     WHERE v.id = ?
     GROUP BY h.action`,
    [PHOTO_PHASES.BEFORE, PHOTO_PHASES.AFTER, visitId]
  );
  const counts = { before: 0, after: 0 };
  for (const row of rows) {
    if (row.action === PHOTO_PHASES.BEFORE) counts.before = Number(row.photos);
    if (row.action === PHOTO_PHASES.AFTER) counts.after = Number(row.photos);
  }
  return counts;
}

module.exports = {
  BRIGADE_ROLE,
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
  isBrigadeSite,
  isBrigadeContact,
  isBrigadeJob,
  isBrigadeGroupJob,
  brigadeJobOnly,
  brigadeVisitOnly,
  resolvePrice,
  getVisitPhotoCounts,
};
