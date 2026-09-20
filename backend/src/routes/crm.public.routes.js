const crypto = require("crypto");
const express = require("express");
const { v4: uuid } = require("uuid");

const router = express.Router();

const { pool } = require("../../db");

// Website -> CRM hand-off. The bestserve.in server calls this (server to server) once a booking
// is confirmed, and again from its Razorpay webhook. There is no user login here: every request
// must carry the shared secret in the X-Website-Key header (env WEBSITE_LEAD_KEY).
//
// Idempotent: the website's booking reference (BS-YYYYMMDD-NNNNN) is stored in crm_leads.external_ref
// (unique), so the confirm call and the webhook can both arrive - or be retried - without creating
// a second lead, and a "paid" report upgrades a pending lead but never downgrades a paid one.

const SERVICE_NAMES = { cockroach: "Cockroach Services", bedbug: "Bedbugs Services" };
const PLAN_NAMES = {
  oneTime: "One Time",
  amc: "Annual AMC",
  twoServices: "2 Service",
  twoServicesSteam: "2 Service with Steam",
};

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
}

function keyMatches(provided) {
  const expected = process.env.WEBSITE_LEAD_KEY;
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// "4 BHK / Villa" (website) -> "4 BHK/Villa" (CRM price list).
function normalizeHouseType(value) {
  return text(value, 30).replace(/\s*\/\s*/g, "/");
}

router.post("/leads", async (req, res) => {
  if (!process.env.WEBSITE_LEAD_KEY) {
    return res.status(503).json({ error: "Website lead intake is not configured" });
  }
  if (!keyMatches(req.headers["x-website-key"])) {
    return res.status(401).json({ error: "Invalid key" });
  }
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const body = req.body || {};
  const ref = text(body.orderId, 40);
  const name = text(body.name, 150);
  const phone = typeof body.mobileNumber === "string" ? body.mobileNumber.replace(/\D/g, "").slice(-10) : "";
  const email = text(body.email, 150);
  const flat = text(body.flatNumber, 40);
  const place = text(body.location, 200);
  const houseType = normalizeHouseType(body.houseType);
  const serviceName = SERVICE_NAMES[body.service] || text(body.service, 100);
  const planType = PLAN_NAMES[body.serviceType] || text(body.serviceType, 50);
  const coupon = text(body.appliedCoupon, 50).toUpperCase();
  const paid = body.paymentStatus === "paid";
  const razorpayOrderId = text(body.razorpayOrderId, 40);
  const razorpayPaymentId = text(body.razorpayPaymentId, 40);
  const charged = Number(body.finalAmount);

  if (!ref) return res.status(400).json({ error: "orderId is required" });
  if (name.length < 2) return res.status(400).json({ error: "name is required" });
  if (phone.length !== 10) return res.status(400).json({ error: "A valid 10-digit mobileNumber is required" });
  if (!houseType || !serviceName || !planType) {
    return res.status(400).json({ error: "houseType, service and serviceType are required" });
  }

  const emailOk = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  const location = [flat ? `Flat ${flat}` : "", place].filter(Boolean).join(", ");

  try {
    const [[existing]] = await pool.query(`SELECT * FROM crm_leads WHERE external_ref = ?`, [ref]);

    if (existing) {
      await updateExisting(existing, { emailOk, location, coupon, paid, razorpayOrderId, razorpayPaymentId });
      return res.json({ ok: true, lead_id: existing.id, created: false });
    }

    // The list price comes from the CRM price master; what the customer was actually charged
    // (after any website coupon) comes from the website.
    const [[priceRow]] = await pool.query(
      `SELECT p.price
       FROM crm_service_prices p
       JOIN crm_services s ON s.id = p.service_id
       WHERE s.name = ? AND p.house_type = ? AND p.plan_type = ?
         AND s.is_active = 1 AND p.is_active = 1
       LIMIT 1`,
      [serviceName, houseType, planType]
    );
    const standard = priceRow ? Number(priceRow.price) : null;
    const amount = Number.isFinite(charged) && charged > 0 ? charged : standard;
    if (!amount) return res.status(400).json({ error: "finalAmount is required for services outside the price list" });

    const notes = [`Website booking ${ref}`];
    if (standard !== null && amount < standard) notes.push(`Discount applied (list price ${standard})`);
    if (standard === null) notes.push("Service/plan not in the CRM price list - please review");

    const id = uuid();
    try {
      await pool.query(
        `INSERT INTO crm_leads
          (id, customer_name, phone, customer_email, house_type, service_name, plan_type,
           standard_amount, amount, coupon_code, location, lead_source, notes,
           payment_method, payment_status, lead_status, razorpay_order_id, razorpay_payment_id,
           paid_at, created_by_user_id, external_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'website', ?, 'online', ?, 'new', ?, ?,
                 ${paid ? "NOW()" : "NULL"}, NULL, ?)`,
        [
          id,
          name,
          phone,
          emailOk || null,
          houseType,
          serviceName,
          planType,
          standard,
          amount,
          coupon || null,
          location || null,
          notes.join(". "),
          paid ? "paid" : "pending",
          razorpayOrderId || null,
          paid ? razorpayPaymentId || null : null,
          ref,
        ]
      );
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        // The confirm call and the webhook raced: the other one won, so update its lead instead.
        const [[winner]] = await pool.query(`SELECT * FROM crm_leads WHERE external_ref = ?`, [ref]);
        if (winner) {
          await updateExisting(winner, { emailOk, location, coupon, paid, razorpayOrderId, razorpayPaymentId });
          return res.json({ ok: true, lead_id: winner.id, created: false });
        }
      }
      throw err;
    }

    res.status(201).json({ ok: true, lead_id: id, created: true });
  } catch (err) {
    console.error("CRM website lead error:", err);
    res.status(500).json({ error: "Failed to save lead" });
  }
});

async function updateExisting(lead, { emailOk, location, coupon, paid, razorpayOrderId, razorpayPaymentId }) {
  // Only fill gaps: the webhook carries less detail than the confirm call, in either order.
  await pool.query(
    `UPDATE crm_leads
     SET customer_email = COALESCE(NULLIF(customer_email, ''), ?),
         location = COALESCE(NULLIF(location, ''), ?),
         coupon_code = COALESCE(NULLIF(coupon_code, ''), ?)
     WHERE id = ?`,
    [emailOk || null, location || null, coupon || null, lead.id]
  );

  if (paid && lead.payment_status !== "paid") {
    await pool.query(
      `UPDATE crm_leads
       SET payment_status = 'paid', payment_method = 'online',
           razorpay_order_id = COALESCE(?, razorpay_order_id),
           razorpay_payment_id = ?, paid_at = NOW()
       WHERE id = ? AND payment_status <> 'paid'`,
      [razorpayOrderId || null, razorpayPaymentId || null, lead.id]
    );
  }
}

module.exports = router;
