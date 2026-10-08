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

/**
 * The next short, readable company id (COMP1, COMP2, ...) - the convention companies.routes.js
 * uses. `companies.id` is VARCHAR(20), so a UUID does not fit and must never be used here.
 * Call inside a transaction: the rows are locked until the caller has inserted its company.
 */
async function nextCompanyId(conn) {
  const [[row]] = await conn.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 AS next FROM companies WHERE id LIKE 'COMP%' FOR UPDATE"
  );
  return `COMP${row.next}`;
}

// Another request can take the same number between reading it and inserting (the admin's own
// "add company" does not lock). The id is the primary key, so that shows up as a duplicate
// error - read the next number again and retry rather than lose the customer.
const MAX_ID_ATTEMPTS = 4;

async function createCompanyForPaidLead(pool, customerName) {
  const name = (typeof customerName === "string" ? customerName.trim() : "") || "Customer";

  for (let attempt = 1; ; attempt += 1) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const id = await nextCompanyId(conn);
      await conn.query(
        `INSERT INTO companies (id, name, type, is_active, created_at) VALUES (?, ?, 'INDIVIDUAL', 1, NOW())`,
        [id, name],
      );
      await conn.commit();
      return id;
    } catch (err) {
      await conn.rollback().catch(() => {});
      if (err && err.code === "ER_DUP_ENTRY" && attempt < MAX_ID_ATTEMPTS) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = { createCompanyForPaidLead, nextCompanyId };
