const crypto = require("crypto");
const express = require("express");
const { v4: uuid } = require("uuid");
const multer = require("multer");

const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const { pool } = require("../../db");
const minioClient = require("../lib/minio");
const { createCompanyForPaidLead } = require("../utils/crmCustomerCompany");

// Never let the company-hand-off break the lead flow it rides along with - log and move on.
async function handleNewCustomer(customerName) {
  try {
    await createCompanyForPaidLead(pool, customerName);
  } catch (err) {
    console.error("CRM lead -> companies hand-off error:", err);
  }
}

// CRM (Sales & Marketing) - Phase 1: service price list, create a lead, list leads.
// Every route needs a logged-in user holding the matching CRM_* permission
// (admin bypasses permission checks, same as the rest of the API). The
// permissions are granted to the `sales` and `marketing` roles by
// crm_roles_permissions.sql.

const LEAD_SOURCES = ["website", "apartment", "referral", "social_media", "other"];
const PAYMENT_METHODS = ["cash", "online", "other"];
const PAYMENT_STATUSES = ["paid", "pending"];
const LEAD_STATUSES = ["new", "contacted", "converted", "lost"];
const LIST_LIMIT = 500;

// A commercial lead is a business enquiry: company + address + approximate quote + photos,
// with no house type / service / plan and no payment. Everything else is a consumer lead.
const COMMERCIAL_LEAD_SOURCES = ["google", "website", "referral", "social_media", "other"];
const INDUSTRY_TYPES = ["restaurant", "apartment", "hospital", "it", "qsr", "builder", "other"];
const COMMERCIAL_SERVICES = [
  "gpc",
  "rodent_control",
  "cockroach_control",
  "ant_treatment",
  "honeybee_control",
  "snake_control",
  "fly_control",
];
const MAX_LEAD_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };

// Same coupons as the bestserve.in website (Bestserve Website/backend/server.js). Keep the two lists
// in step until they move into a shared table. `expiresAt` is optional.
const COUPONS = {
  SHOBHA26: { percentage: 20 },
  NANDI20: { percentage: 20, expiresAt: "2026-10-12T23:59:59+05:30" },
};

// -> { code, percentage } for a usable coupon, null when unknown or expired.
function findCoupon(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  const coupon = COUPONS[code];
  if (!coupon) return null;
  if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) return null;
  return { code, percentage: coupon.percentage };
}

function toLead(row) {
  return {
    id: row.id,
    lead_type: row.lead_type || "consumer",
    customer_name: row.customer_name,
    company_name: row.company_name || "",
    industry_type: row.industry_type || null,
    contact_designation: row.contact_designation || "",
    services_requested: row.services_requested ? String(row.services_requested).split(",") : [],
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    phone: row.phone,
    alternate_phone: row.alternate_phone || "",
    email: row.customer_email || "",
    house_type: row.house_type,
    service_name: row.service_name,
    plan_type: row.plan_type,
    standard_amount: row.standard_amount === null ? null : Number(row.standard_amount),
    amount: Number(row.amount),
    coupon_code: row.coupon_code || "",
    location: row.location || "",
    lead_source: row.lead_source || null,
    reference_by: row.reference_by || "",
    notes: row.notes || "",
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    lead_status: row.lead_status,
    created_by_user_id: row.created_by_user_id === null ? null : String(row.created_by_user_id),
    created_by_name: row.created_by_name || "",
    created_at: row.created_at,
    paid_at: row.paid_at || null,
  };
}

// Who may see which leads: a sales / marketing user sees only the leads they created. Roles
// holding CRM_VIEW_ALL_LEADS (Managing Director, Personal Assistant) and admin see everyone's,
// including website leads, which have no creator.
function canViewAllLeads(req) {
  return req.user.role === "admin" || !!req.user.permissions?.includes("CRM_VIEW_ALL_LEADS");
}

const LEAD_WITH_CREATOR_SQL = `SELECT l.*, u.name AS created_by_name
                                 FROM crm_leads l LEFT JOIN users u ON u.id = l.created_by_user_id`;

// The lead with this id if the caller is allowed to see it, otherwise undefined.
async function loadVisibleLead(req, id) {
  const own = canViewAllLeads(req) ? "" : "AND l.created_by_user_id = ?";
  const [[row]] = await pool.query(
    `${LEAD_WITH_CREATOR_SQL} WHERE l.id = ? ${own} LIMIT 1`,
    canViewAllLeads(req) ? [id] : [id, req.user.id]
  );
  return row;
}

// --------------------
// SERVICE PRICE LIST
// --------------------
// GET /api/crm/services -> [{ id, name, category, prices: [{ house_type, plan_type, price }] }]
router.get("/services", auth, requirePermission("CRM_VIEW_SERVICE_PRICE"), async (req, res) => {
  try {
    const [services] = await pool.query(
      `SELECT id, name, category
       FROM crm_services
       WHERE is_active = 1
       ORDER BY sort_order, name`
    );

    const [prices] = await pool.query(
      `SELECT service_id, house_type, plan_type, price
       FROM crm_service_prices
       WHERE is_active = 1
       ORDER BY sort_order`
    );

    const byService = new Map(services.map((s) => [s.id, []]));
    for (const p of prices) {
      byService.get(p.service_id)?.push({
        house_type: p.house_type,
        plan_type: p.plan_type,
        price: Number(p.price),
      });
    }

    res.json(services.map((s) => ({ ...s, prices: byService.get(s.id) || [] })));
  } catch (err) {
    console.error("CRM services error:", err);
    res.status(500).json({ error: "Failed to load services" });
  }
});

// --------------------
// LEADS
// --------------------
// GET /api/crm/leads -> newest first (capped)
// Consumer leads only unless ?lead_type=commercial or ?lead_type=all is sent, so app versions
// from before commercial leads existed keep getting exactly the list they always got.
router.get("/leads", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const wanted = req.query.lead_type;
    const leadType = wanted === "commercial" || wanted === "all" ? wanted : "consumer";
    const where = [];
    const params = [];
    if (leadType !== "all") {
      where.push("l.lead_type = ?");
      params.push(leadType);
    }
    if (!canViewAllLeads(req)) {
      where.push("l.created_by_user_id = ?");
      params.push(req.user.id);
    }
    const [rows] = await pool.query(
      `${LEAD_WITH_CREATOR_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY l.created_at DESC LIMIT ${LIST_LIMIT}`,
      params
    );
    res.json(rows.map(toLead));
  } catch (err) {
    console.error("CRM leads list error:", err);
    res.status(500).json({ error: "Failed to load leads" });
  }
});

// GET /api/crm/leads/:id
router.get("/leads/:id", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const row = await loadVisibleLead(req, req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });
    res.json(toLead(row));
  } catch (err) {
    console.error("CRM lead fetch error:", err);
    res.status(500).json({ error: "Failed to load lead" });
  }
});

// GET /api/crm/coupons/:code -> { code, percentage } | 400 (unknown or expired)
router.get("/coupons/:code", auth, requirePermission("CRM_CREATE_LEAD"), (req, res) => {
  const coupon = findCoupon(req.params.code);
  if (!coupon) return res.status(400).json({ error: "This coupon is not valid or has expired" });
  res.json(coupon);
});

// POST /api/crm/leads
router.post("/leads", auth, requirePermission("CRM_CREATE_LEAD"), async (req, res) => {
  const body = req.body || {};

  const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const houseType = typeof body.house_type === "string" ? body.house_type.trim() : "";
  const serviceName = typeof body.service_name === "string" ? body.service_name.trim() : "";
  const planType = typeof body.plan_type === "string" ? body.plan_type.trim() : "";
  const amount = Number(body.amount);
  const couponCode = typeof body.coupon_code === "string" ? body.coupon_code.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const referenceBy = typeof body.reference_by === "string" ? body.reference_by.trim() : "";
  // Sent by the mobile app with every save. If a save is retried (poor network: the first attempt
  // reached us but the reply was lost), the same reference returns the lead we already made.
  const clientRef =
    typeof body.client_ref === "string" && /^APP-[A-Za-z0-9-]{8,36}$/.test(body.client_ref) ? body.client_ref : null;
  const leadSource = body.lead_source || null;
  const paymentMethod = body.payment_method;
  const leadStatus = body.lead_status || "new";

  if (customerName.length < 2) return res.status(400).json({ error: "Customer name is required" });
  if (phone.length !== 10) return res.status(400).json({ error: "A valid 10-digit phone number is required" });
  if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (body.lead_type === "commercial") {
    return createCommercialLead(req, res, {
      customerName,
      phone,
      email,
      amount,
      location,
      notes,
      referenceBy,
      clientRef,
      leadStatus,
    });
  }
  if (referenceBy.length > 100) return res.status(400).json({ error: "Reference name is too long (max 100)" });
  if (!houseType) return res.status(400).json({ error: "House type is required" });
  if (!serviceName) return res.status(400).json({ error: "Service is required" });
  if (!planType) return res.status(400).json({ error: "Plan is required" });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "A valid amount is required" });
  let coupon = null;
  if (couponCode) {
    coupon = findCoupon(couponCode);
    if (!coupon) return res.status(400).json({ error: "This coupon is not valid or has expired" });
  }
  if (leadSource !== null && !LEAD_SOURCES.includes(leadSource)) {
    return res.status(400).json({ error: "Invalid lead source" });
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ error: "Invalid payment method" });
  if (!LEAD_STATUSES.includes(leadStatus)) return res.status(400).json({ error: "Invalid lead status" });

  // Online payments are only "paid" once the gateway confirms them (a later
  // step), so a new online lead is always pending regardless of what was sent.
  let paymentStatus = body.payment_status || "pending";
  if (!PAYMENT_STATUSES.includes(paymentStatus)) return res.status(400).json({ error: "Invalid payment status" });
  if (paymentMethod === "online") paymentStatus = "pending";

  try {
    // The list price comes from the price master, never from the client - the
    // client only supplies the (possibly negotiated) amount actually charged.
    const [[priceRow]] = await pool.query(
      `SELECT p.price
       FROM crm_service_prices p
       JOIN crm_services s ON s.id = p.service_id
       WHERE s.name = ? AND p.house_type = ? AND p.plan_type = ?
         AND s.is_active = 1 AND p.is_active = 1
       LIMIT 1`,
      [serviceName, houseType, planType]
    );
    if (!priceRow) {
      return res.status(400).json({ error: "That service, house type and plan combination is not in the price list" });
    }

    if (clientRef) {
      const [[already]] = await pool.query(
        `SELECT * FROM crm_leads WHERE external_ref = ? AND created_by_user_id = ? LIMIT 1`,
        [clientRef, req.user.id]
      );
      if (already) return res.status(200).json(toLead(already));
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO crm_leads
        (id, customer_name, phone, customer_email, house_type, service_name, plan_type,
         standard_amount, amount, coupon_code, location, lead_source, reference_by, notes,
         payment_method, payment_status, lead_status, created_by_user_id, external_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customerName,
        phone,
        email || null,
        houseType,
        serviceName,
        planType,
        priceRow.price,
        amount,
        coupon ? coupon.code : null,
        location || null,
        leadSource,
        referenceBy || null,
        notes || null,
        paymentMethod,
        paymentStatus,
        leadStatus,
        req.user.id,
        clientRef,
      ]
    );

    const [[created]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ?`, [id]);
    if (paymentStatus === "paid") await handleNewCustomer(customerName);
    res.status(201).json(toLead(created));
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY" && clientRef) {
      // Two copies of the same save arrived at once: the other one won, so return its lead.
      try {
        const [[winner]] = await pool.query(
          `SELECT * FROM crm_leads WHERE external_ref = ? AND created_by_user_id = ? LIMIT 1`,
          [clientRef, req.user.id]
        );
        if (winner) return res.status(200).json(toLead(winner));
      } catch (lookupErr) {
        console.error("CRM lead duplicate lookup error:", lookupErr);
      }
    }
    console.error("CRM lead create error:", err);
    res.status(500).json({ error: "Failed to save lead" });
  }
});

// The commercial half of POST /api/crm/leads. Name, phone and email were already checked by the
// caller. No price list and no payment: `amount` is the approximate quote. Where the business is
// comes from the phone's GPS (latitude / longitude); `location` is an address typed by hand, used
// when the GPS could not be read. Industry type and services are checked only when sent, so the
// app version from before they existed can still save.
// Reads and checks the commercial-only fields of a lead - shared by create and edit.
// `lead` carries what the caller already read (location, referenceBy, amount, leadStatus).
// -> { error } when something is wrong, otherwise { values }.
function readCommercialFields(body, lead) {
  const companyName = typeof body.company_name === "string" ? body.company_name.trim() : "";
  const alternatePhone = typeof body.alternate_phone === "string" ? body.alternate_phone.replace(/\D/g, "") : "";
  const leadSource = body.lead_source || null;
  const industryType = body.industry_type || null;
  const designation = typeof body.contact_designation === "string" ? body.contact_designation.trim() : "";
  const services = Array.isArray(body.services_requested) ? [...new Set(body.services_requested)] : [];
  const hasPoint = body.latitude !== null && body.latitude !== undefined && body.latitude !== "" &&
    body.longitude !== null && body.longitude !== undefined && body.longitude !== "";
  const latitude = hasPoint ? Number(body.latitude) : null;
  const longitude = hasPoint ? Number(body.longitude) : null;

  if (companyName.length < 2) return { error: "Company / business name is required" };
  if (companyName.length > 150) return { error: "Company / business name is too long (max 150)" };
  if (industryType !== null && !INDUSTRY_TYPES.includes(industryType)) return { error: "Invalid industry type" };
  if (designation.length > 100) return { error: "Designation is too long (max 100)" };
  if (services.some((service) => !COMMERCIAL_SERVICES.includes(service))) return { error: "Invalid service requested" };
  if (lead.referenceBy.length > 100) return { error: "Reference name is too long (max 100)" };
  if (hasPoint && (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180)) {
    return { error: "Invalid location" };
  }
  if (!hasPoint && !lead.location) return { error: "The current location or an address is required" };
  if (lead.location.length > 255) return { error: "Address is too long (max 255)" };
  if (alternatePhone && alternatePhone.length !== 10) {
    return { error: "Alternate number must be a valid 10-digit phone number" };
  }
  if (!COMMERCIAL_LEAD_SOURCES.includes(leadSource)) return { error: "Source of lead is required" };
  if (!Number.isFinite(lead.amount) || lead.amount <= 0 || lead.amount > 99999999) {
    return { error: "A valid approximate quote is required" };
  }
  if (!LEAD_STATUSES.includes(lead.leadStatus)) return { error: "Invalid lead status" };

  return {
    values: { companyName, alternatePhone, leadSource, industryType, designation, services, latitude, longitude },
  };
}

async function createCommercialLead(req, res, lead) {
  const read = readCommercialFields(req.body || {}, lead);
  if (read.error) return res.status(400).json({ error: read.error });
  const { companyName, alternatePhone, leadSource, industryType, designation, services, latitude, longitude } =
    read.values;

  const findByRef = async () => {
    const [[row]] = await pool.query(
      `SELECT * FROM crm_leads WHERE external_ref = ? AND created_by_user_id = ? LIMIT 1`,
      [lead.clientRef, req.user.id]
    );
    return row;
  };

  try {
    if (lead.clientRef) {
      const already = await findByRef();
      if (already) return res.status(200).json(toLead(already));
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO crm_leads
        (id, lead_type, customer_name, company_name, industry_type, contact_designation,
         phone, alternate_phone, customer_email,
         house_type, service_name, plan_type, standard_amount, amount, services_requested,
         location, latitude, longitude, lead_source, reference_by, notes,
         payment_method, payment_status, lead_status, created_by_user_id, external_ref)
       VALUES (?, 'commercial', ?, ?, ?, ?, ?, ?, ?, '', '', '', NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'none', 'na', ?, ?, ?)`,
      [
        id,
        lead.customerName,
        companyName,
        industryType,
        designation || null,
        lead.phone,
        alternatePhone || null,
        lead.email || null,
        lead.amount,
        services.length ? services.join(",") : null,
        lead.location || null,
        latitude,
        longitude,
        leadSource,
        lead.referenceBy || null,
        lead.notes || null,
        lead.leadStatus,
        req.user.id,
        lead.clientRef,
      ]
    );

    const [[created]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ?`, [id]);
    res.status(201).json(toLead(created));
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY" && lead.clientRef) {
      // Two copies of the same save arrived at once: the other one won, so return its lead.
      try {
        const winner = await findByRef();
        if (winner) return res.status(200).json(toLead(winner));
      } catch (lookupErr) {
        console.error("CRM lead duplicate lookup error:", lookupErr);
      }
    }
    console.error("CRM commercial lead create error:", err);
    res.status(500).json({ error: "Failed to save lead" });
  }
}

// --------------------
// EDIT A LEAD
// --------------------
// PUT /api/crm/leads/:id -> the updated lead
// Anyone who can see a lead can edit it (a sales user their own; the roles that see every lead,
// any of them). The body is the same shape POST /leads takes.
//
// Residential leads: the customer's details and the lead status can always be changed. The
// service, the amount and the payment can be changed only while the payment is pending - once a
// lead is paid they are locked and whatever is sent for them is ignored. A cash / other payment
// can be marked paid here; an online payment still becomes paid only through Razorpay.
router.put("/leads/:id", auth, requirePermission("CRM_CREATE_LEAD"), async (req, res) => {
  const body = req.body || {};

  const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const referenceBy = typeof body.reference_by === "string" ? body.reference_by.trim() : "";
  const amount = Number(body.amount);
  const leadStatus = body.lead_status || "new";

  if (customerName.length < 2) return res.status(400).json({ error: "Customer name is required" });
  if (phone.length !== 10) return res.status(400).json({ error: "A valid 10-digit phone number is required" });
  if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (referenceBy.length > 100) return res.status(400).json({ error: "Reference name is too long (max 100)" });
  if (!LEAD_STATUSES.includes(leadStatus)) return res.status(400).json({ error: "Invalid lead status" });

  try {
    const existing = await loadVisibleLead(req, req.params.id);
    if (!existing) return res.status(404).json({ error: "Lead not found" });

    if (existing.lead_type === "commercial") {
      const read = readCommercialFields(body, { location, referenceBy, amount, leadStatus });
      if (read.error) return res.status(400).json({ error: read.error });
      const v = read.values;

      await pool.query(
        `UPDATE crm_leads
            SET customer_name = ?, company_name = ?, industry_type = ?, contact_designation = ?,
                phone = ?, alternate_phone = ?, customer_email = ?, amount = ?, services_requested = ?,
                location = ?, latitude = ?, longitude = ?, lead_source = ?, reference_by = ?, notes = ?,
                lead_status = ?
          WHERE id = ?`,
        [
          customerName,
          v.companyName,
          v.industryType,
          v.designation || null,
          phone,
          v.alternatePhone || null,
          email || null,
          amount,
          v.services.length ? v.services.join(",") : null,
          location || null,
          v.latitude,
          v.longitude,
          v.leadSource,
          referenceBy || null,
          notes || null,
          leadStatus,
          existing.id,
        ]
      );
    } else {
      const leadSource = body.lead_source || null;
      if (leadSource !== null && !LEAD_SOURCES.includes(leadSource)) {
        return res.status(400).json({ error: "Invalid lead source" });
      }

      const wasPaid = existing.payment_status === "paid";
      // What the service / money columns end up as: unchanged for a paid lead.
      let houseType = existing.house_type;
      let serviceName = existing.service_name;
      let planType = existing.plan_type;
      let standardAmount = existing.standard_amount;
      let newAmount = Number(existing.amount);
      let paymentMethod = existing.payment_method;
      let paymentStatus = existing.payment_status;
      let razorpayOrderId = existing.razorpay_order_id;

      if (!wasPaid) {
        houseType = typeof body.house_type === "string" ? body.house_type.trim() : "";
        serviceName = typeof body.service_name === "string" ? body.service_name.trim() : "";
        planType = typeof body.plan_type === "string" ? body.plan_type.trim() : "";
        newAmount = amount;
        paymentMethod = body.payment_method;
        paymentStatus = body.payment_status || "pending";

        if (!houseType) return res.status(400).json({ error: "House type is required" });
        if (!serviceName) return res.status(400).json({ error: "Service is required" });
        if (!planType) return res.status(400).json({ error: "Plan is required" });
        if (!Number.isFinite(newAmount) || newAmount <= 0) return res.status(400).json({ error: "A valid amount is required" });
        if (!PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ error: "Invalid payment method" });
        if (!PAYMENT_STATUSES.includes(paymentStatus)) return res.status(400).json({ error: "Invalid payment status" });
        // Online payments are only "paid" once Razorpay confirms them.
        if (paymentMethod === "online") paymentStatus = "pending";

        // The list price is looked up again only when the service itself changed, so an old lead
        // whose service has since left the price list can still have its other details edited.
        const serviceChanged =
          houseType !== existing.house_type || serviceName !== existing.service_name || planType !== existing.plan_type;
        if (serviceChanged) {
          const [[priceRow]] = await pool.query(
            `SELECT p.price
               FROM crm_service_prices p
               JOIN crm_services s ON s.id = p.service_id
              WHERE s.name = ? AND p.house_type = ? AND p.plan_type = ?
                AND s.is_active = 1 AND p.is_active = 1
              LIMIT 1`,
            [serviceName, houseType, planType]
          );
          if (!priceRow) {
            return res.status(400).json({ error: "That service, house type and plan combination is not in the price list" });
          }
          standardAmount = priceRow.price;
        }

        // An open Razorpay order is for the old amount: drop it so the next payment starts a new one.
        if (paymentMethod !== "online" || newAmount !== Number(existing.amount)) razorpayOrderId = null;
      }

      const nowPaid = !wasPaid && paymentStatus === "paid";
      await pool.query(
        `UPDATE crm_leads
            SET customer_name = ?, phone = ?, customer_email = ?, house_type = ?, service_name = ?, plan_type = ?,
                standard_amount = ?, amount = ?, location = ?, lead_source = ?, reference_by = ?, notes = ?,
                payment_method = ?, payment_status = ?, lead_status = ?, razorpay_order_id = ?
                ${nowPaid ? ", paid_at = NOW()" : ""}
          WHERE id = ?`,
        [
          customerName,
          phone,
          email || null,
          houseType,
          serviceName,
          planType,
          standardAmount,
          newAmount,
          location || null,
          leadSource,
          referenceBy || null,
          notes || null,
          paymentMethod,
          paymentStatus,
          leadStatus,
          razorpayOrderId,
          existing.id,
        ]
      );
      if (nowPaid) await handleNewCustomer(customerName);
    }

    const updated = await loadVisibleLead(req, existing.id);
    res.json(toLead(updated));
  } catch (err) {
    console.error("CRM lead update error:", err);
    res.status(500).json({ error: "Failed to save the changes" });
  }
});

// --------------------
// LEAD PHOTOS (commercial leads)
// --------------------
// Files live in MinIO (same bucket as job / task attachments); the DB row is metadata only.
// Anyone who can see leads can see the photos; adding one needs the create-lead permission.

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

const PHOTO_SQL = `SELECT id, file_name, file_type, file_size, created_at FROM crm_lead_photos`;

// Checks the lead BEFORE the upload body is read.
async function precheckPhotoUpload(req, res, next) {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (lead.lead_type !== "commercial") return res.status(400).json({ error: "Photos can only be added to commercial leads" });
    next();
  } catch (err) {
    console.error("CRM lead photo precheck error:", err);
    res.status(500).json({ error: "Failed to check lead" });
  }
}

function acceptPhoto(req, res, next) {
  photoUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Photo is too large (max 10 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send one photo in the 'file' field." });
  });
}

// GET /api/crm/leads/:id/photos -> [{ id, file_name, file_type, file_size, created_at }]
router.get("/leads/:id/photos", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    if (!(await loadVisibleLead(req, req.params.id))) return res.status(404).json({ error: "Lead not found" });
    const [rows] = await pool.query(`${PHOTO_SQL} WHERE lead_id = ? ORDER BY created_at ASC`, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error("CRM lead photos list error:", err);
    res.status(500).json({ error: "Failed to load photos" });
  }
});

// POST /api/crm/leads/:id/photos -- multipart/form-data: one image in "file", optional "client_ref"
router.post(
  "/leads/:id/photos",
  auth,
  requirePermission("CRM_CREATE_LEAD"),
  precheckPhotoUpload,
  acceptPhoto,
  async (req, res) => {
    const leadId = req.params.id;
    let objectKey = null;
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const ext = PHOTO_TYPES[req.file.mimetype];
      if (!ext) return res.status(400).json({ error: "Only JPG, PNG or WEBP photos can be added" });

      // Sent by the app with every photo, so a retried upload returns the photo we already stored.
      const rawRef = req.body ? req.body.client_ref : null;
      const clientRef = typeof rawRef === "string" && /^[A-Za-z0-9-]{8,40}$/.test(rawRef) ? rawRef : null;
      if (clientRef) {
        const [[already]] = await pool.query(`${PHOTO_SQL} WHERE lead_id = ? AND client_ref = ? LIMIT 1`, [leadId, clientRef]);
        if (already) return res.status(200).json(already);
      }

      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM crm_lead_photos WHERE lead_id = ?`, [leadId]);
      if (total >= MAX_LEAD_PHOTOS) {
        return res.status(400).json({ error: `A lead can have at most ${MAX_LEAD_PHOTOS} photos` });
      }

      // multer decodes filenames as latin1; restore the real UTF-8 name.
      const fileName = Buffer.from(req.file.originalname || `photo.${ext}`, "latin1").toString("utf8").slice(0, 255);
      const id = uuid();
      objectKey = `crm-leads/${leadId}/${uuid()}.${ext}`;

      // Same lazy bucket creation the task attachments already do.
      if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
        await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
      }
      await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.buffer.length, {
        "Content-Type": req.file.mimetype,
      });
      await pool.query(
        `INSERT INTO crm_lead_photos (id, lead_id, object_key, file_name, file_type, file_size, client_ref, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, leadId, objectKey, fileName, req.file.mimetype, req.file.buffer.length, clientRef, req.user.id]
      );
      const [[row]] = await pool.query(`${PHOTO_SQL} WHERE id = ?`, [id]);
      res.status(201).json(row);
    } catch (err) {
      // DB failed after the file was stored: don't leave an orphan file behind.
      if (objectKey) minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
      if (err && err.code === "ER_DUP_ENTRY") {
        // Two copies of the same upload arrived at once: the other one won, so return its photo.
        try {
          const [[winner]] = await pool.query(`${PHOTO_SQL} WHERE lead_id = ? AND client_ref = ? LIMIT 1`, [
            leadId,
            req.body && req.body.client_ref,
          ]);
          if (winner) return res.status(200).json(winner);
        } catch (lookupErr) {
          console.error("CRM lead photo duplicate lookup error:", lookupErr);
        }
      }
      console.error("CRM lead photo upload error:", err);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  }
);

// GET /api/crm/leads/:id/photos/:photoId/view -- streams the image
router.get("/leads/:id/photos/:photoId/view", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    if (!(await loadVisibleLead(req, req.params.id))) return res.status(404).json({ error: "Lead not found" });
    const [[photo]] = await pool.query(
      `SELECT object_key, file_type FROM crm_lead_photos WHERE id = ? AND lead_id = ? LIMIT 1`,
      [req.params.photoId, req.params.id]
    );
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, photo.object_key);
    res.setHeader("Content-Type", photo.file_type);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.on("error", (err) => {
      console.error("CRM lead photo stream failed:", err.message);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error("CRM lead photo view error:", err);
    res.status(500).json({ error: "Failed to load photo" });
  }
});

// DELETE /api/crm/leads/:id/photos/:photoId
router.delete("/leads/:id/photos/:photoId", auth, requirePermission("CRM_CREATE_LEAD"), async (req, res) => {
  try {
    if (!(await loadVisibleLead(req, req.params.id))) return res.status(404).json({ error: "Lead not found" });
    const [[photo]] = await pool.query(
      `SELECT object_key FROM crm_lead_photos WHERE id = ? AND lead_id = ? LIMIT 1`,
      [req.params.photoId, req.params.id]
    );
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    await pool.query(`DELETE FROM crm_lead_photos WHERE id = ? AND lead_id = ?`, [req.params.photoId, req.params.id]);
    try {
      await minioClient.removeObject(process.env.MINIO_BUCKET, photo.object_key);
    } catch (err) {
      console.error(`Failed to remove lead photo file ${photo.object_key}:`, err.message);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("CRM lead photo delete error:", err);
    res.status(500).json({ error: "Failed to remove photo" });
  }
});

// --------------------
// RAZORPAY (online payments)
// --------------------
// The secret key lives only in backend/.env (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) -
// it is never sent to the app. The app only receives the public key id, the
// order id and the amount to show in Razorpay's checkout. The amount is always
// read from the lead in the database, never from the request, and a lead only
// becomes "paid" after the payment signature is verified with the secret.

const RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders";

function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

async function createRazorpayOrder({ keyId, keySecret }, { amountPaise, receipt, leadId }) {
  const res = await fetch(RAZORPAY_ORDERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes: { crm_lead_id: leadId } }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const detail = data?.error?.description || `HTTP ${res.status}`;
    throw new Error(`Razorpay order failed: ${detail}`);
  }
  return data;
}

function signatureMatches(secret, orderId, paymentId, signature) {
  if (typeof signature !== "string") return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /api/crm/leads/:id/payment-order
// -> { order_id, amount (paise), currency, key_id, name, phone }
router.post("/leads/:id/payment-order", auth, requirePermission("CRM_COLLECT_PAYMENT"), async (req, res) => {
  const keys = razorpayKeys();
  if (!keys) return res.status(503).json({ error: "Online payments are not configured on the server yet" });

  try {
    const [[lead]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ? LIMIT 1`, [req.params.id]);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (lead.payment_method !== "online") return res.status(400).json({ error: "This lead is not an online payment" });
    if (lead.payment_status === "paid") return res.status(409).json({ error: "This lead is already paid" });

    const amountPaise = Math.round(Number(lead.amount) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      return res.status(400).json({ error: "The lead amount is too small for an online payment" });
    }

    // Reuse the lead's existing open order so retries don't pile up orders.
    let orderId = lead.razorpay_order_id;
    if (!orderId) {
      const order = await createRazorpayOrder(keys, { amountPaise, receipt: lead.id, leadId: lead.id });
      orderId = order.id;
      await pool.query(`UPDATE crm_leads SET razorpay_order_id = ? WHERE id = ?`, [orderId, lead.id]);
    }

    res.json({
      order_id: orderId,
      amount: amountPaise,
      currency: "INR",
      key_id: keys.keyId,
      name: lead.customer_name,
      phone: lead.phone,
    });
  } catch (err) {
    console.error("CRM payment order error:", err.message);
    res.status(502).json({ error: "Could not start the online payment. Please try again." });
  }
});

// POST /api/crm/leads/:id/payment-verify
// body: { razorpay_order_id, razorpay_payment_id, razorpay_signature } -> the updated lead
router.post("/leads/:id/payment-verify", auth, requirePermission("CRM_COLLECT_PAYMENT"), async (req, res) => {
  const keys = razorpayKeys();
  if (!keys) return res.status(503).json({ error: "Online payments are not configured on the server yet" });

  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: "Payment details are missing" });
  }

  try {
    const [[lead]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ? LIMIT 1`, [req.params.id]);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // A valid signature for some OTHER order must not mark this lead paid.
    if (!lead.razorpay_order_id || lead.razorpay_order_id !== orderId) {
      return res.status(400).json({ error: "That payment does not belong to this lead" });
    }
    if (!signatureMatches(keys.keySecret, orderId, paymentId, signature)) {
      return res.status(400).json({ error: "Payment could not be verified" });
    }

    // Idempotent: verifying the same payment twice just returns the lead.
    if (lead.payment_status !== "paid") {
      await pool.query(
        `UPDATE crm_leads
         SET payment_status = 'paid', razorpay_payment_id = ?, paid_at = NOW()
         WHERE id = ? AND payment_status <> 'paid'`,
        [paymentId, lead.id]
      );
      await handleNewCustomer(lead.customer_name);
    }

    const [[updated]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ? LIMIT 1`, [lead.id]);
    res.json(toLead(updated));
  } catch (err) {
    console.error("CRM payment verify error:", err.message);
    res.status(500).json({ error: "Failed to confirm the payment" });
  }
});

module.exports = router;
