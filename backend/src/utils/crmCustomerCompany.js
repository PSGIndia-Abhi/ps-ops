const { v4: uuid } = require("uuid");

/**
 * A CRM lead becomes a real customer the moment its payment comes in - so it gets its own
 * row in `companies` right then, from any of the three places a lead can turn "paid":
 * crm.routes.js's own create (cash/other marked Paid up front) and payment-verify (in-app
 * Razorpay), and crm.public.routes.js (website leads, both at creation and via the webhook).
 *
 * Deliberately NOT linked to a `sites` row here. A usable, geofence-ready site needs a real
 * picked location (`locations.latitude`/`longitude` are NOT NULL, and nothing pins a lead's
 * free-text address to real coordinates), so that stays a manual step from the Sites page
 * (Google Places picker) once ops is ready to schedule a job for this customer. Every paid
 * lead gets its own new company - no dedupe by phone/name against earlier customers.
 */
async function createCompanyForPaidLead(pool, customerName) {
  const name = (typeof customerName === "string" ? customerName.trim() : "") || "Customer";
  const id = uuid();
  await pool.query(
    `INSERT INTO companies (id, name, type, is_active, created_at) VALUES (?, ?, 'INDIVIDUAL', 1, NOW())`,
    [id, name],
  );
  return id;
}

module.exports = { createCompanyForPaidLead };
