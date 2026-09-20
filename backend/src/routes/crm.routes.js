const crypto = require("crypto");
const express = require("express");
const { v4: uuid } = require("uuid");

const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const { pool } = require("../../db");

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
    customer_name: row.customer_name,
    phone: row.phone,
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
    created_at: row.created_at,
    paid_at: row.paid_at || null,
  };
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
router.get("/leads", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM crm_leads ORDER BY created_at DESC LIMIT ${LIST_LIMIT}`
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
    const [[row]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ? LIMIT 1`, [req.params.id]);
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
  const leadSource = body.lead_source || null;
  const paymentMethod = body.payment_method;
  const leadStatus = body.lead_status || "new";

  if (customerName.length < 2) return res.status(400).json({ error: "Customer name is required" });
  if (phone.length !== 10) return res.status(400).json({ error: "A valid 10-digit phone number is required" });
  if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: "Enter a valid email address" });
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

    const id = uuid();
    await pool.query(
      `INSERT INTO crm_leads
        (id, customer_name, phone, customer_email, house_type, service_name, plan_type,
         standard_amount, amount, coupon_code, location, lead_source, reference_by, notes,
         payment_method, payment_status, lead_status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );

    const [[created]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ?`, [id]);
    res.status(201).json(toLead(created));
  } catch (err) {
    console.error("CRM lead create error:", err);
    res.status(500).json({ error: "Failed to save lead" });
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
    }

    const [[updated]] = await pool.query(`SELECT * FROM crm_leads WHERE id = ? LIMIT 1`, [lead.id]);
    res.json(toLead(updated));
  } catch (err) {
    console.error("CRM payment verify error:", err.message);
    res.status(500).json({ error: "Failed to confirm the payment" });
  }
});

module.exports = router;
