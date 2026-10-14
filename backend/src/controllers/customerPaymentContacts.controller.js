const { pool } = require("../../db");
const { v4: uuid } = require("uuid");

// The accountant's own phone list for a customer (table customer_payment_contacts):
// who to call about payments. Separate from `contacts`, the admin's site contacts --
// nothing here is read from or written to that table.

function withStatus(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Admin sees every customer. Anyone else only customers of their own branch: one with a
// site in the branch, or with an invoice at a site in the branch (the same customers
// whose invoices they can see).
async function assertCustomerAccess(connection, req, customerId) {
  const { role, id: userId } = req.user;
  if (role === "client") throw withStatus("Forbidden", 403);

  const [[customer]] = await connection.query("SELECT id FROM companies WHERE id = ?", [customerId]);
  if (!customer) throw withStatus("Customer not found", 404);
  if (role === "admin") return;

  const [[me]] = await connection.query("SELECT branch_id FROM users WHERE id = ?", [userId]);
  if (!me?.branch_id) throw withStatus("Branch not assigned", 403);
  const [[ok]] = await connection.query(
    `SELECT (EXISTS (SELECT 1 FROM sites s WHERE s.company_id = ? AND s.branch_id = ?)
          OR EXISTS (SELECT 1 FROM invoices i JOIN sites s ON s.id = i.site_id
                      WHERE i.customer_id = ? AND s.branch_id = ?)) AS ok`,
    [customerId, me.branch_id, customerId, me.branch_id]
  );
  if (!ok?.ok) throw withStatus("Forbidden", 403);
}

// Primary first, then in the order they were added.
async function loadContacts(connection, customerId) {
  const [rows] = await connection.query(
    `SELECT id, name, phone, email, is_primary
       FROM customer_payment_contacts
      WHERE customer_id = ? AND is_active = 1
      ORDER BY is_primary DESC, created_at ASC, id ASC`,
    [customerId]
  );
  return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email || null, is_primary: Boolean(c.is_primary) }));
}

// { name, phone } is the number the "Call Customer" button dials (null when none is saved).
function contactView(contacts) {
  const first = contacts[0];
  return { name: first?.name || null, phone: first?.phone || null, email: first?.email || null, contacts };
}

function readBody(body) {
  const name = String(body?.name || "").trim();
  const phone = String(body?.phone || "").trim();
  const digits = phone.replace(/\D/g, "");
  if (!name) throw withStatus("Contact name is required");
  if (name.length > 150) throw withStatus("Contact name is too long");
  if (!/^[\d+\s-]+$/.test(phone) || digits.length < 10 || digits.length > 15 || phone.length > 20) {
    throw withStatus("Enter a valid phone number (at least 10 digits)");
  }
  // Email is optional. `undefined` means the form has no email box (the quick add/edit on the
  // reminder screens): an edit then leaves the saved email as it is.
  let email;
  if (body?.email !== undefined) {
    email = String(body.email || "").trim() || null;
    if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw withStatus("Enter a valid email address");
  }
  return { name, phone, digits, email, primary: Boolean(body?.is_primary) };
}

// The same number may not be saved twice for one customer (spaces and dashes ignored).
async function assertNotDuplicate(connection, customerId, digits, exceptId = null) {
  const [rows] = await connection.query(
    "SELECT id, phone FROM customer_payment_contacts WHERE customer_id = ? AND is_active = 1 FOR UPDATE",
    [customerId]
  );
  if (rows.some((r) => r.id !== exceptId && String(r.phone).replace(/\D/g, "") === digits)) {
    throw withStatus("This phone number is already saved for this customer", 409);
  }
  return rows;
}

function fail(res, err, fallback) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(`${fallback}:`, err);
  return res.status(500).json({ error: fallback });
}

// GET /api/invoices/customers/:customerId/contact
async function getCustomerContact(req, res) {
  const connection = await pool.getConnection();
  try {
    await assertCustomerAccess(connection, req, req.params.customerId);
    res.json(contactView(await loadContacts(connection, req.params.customerId)));
  } catch (err) {
    fail(res, err, "Failed to load the customer's contact");
  } finally {
    connection.release();
  }
}

// POST /api/invoices/customers/:customerId/contacts   { name, phone, is_primary }
async function createCustomerContact(req, res) {
  const { customerId } = req.params;
  const connection = await pool.getConnection();
  try {
    const input = readBody(req.body);
    await assertCustomerAccess(connection, req, customerId);

    await connection.beginTransaction();
    const existing = await assertNotDuplicate(connection, customerId, input.digits);
    const primary = input.primary || existing.length === 0; // a customer's first number is its primary
    if (primary) {
      await connection.query(
        "UPDATE customer_payment_contacts SET is_primary = 0 WHERE customer_id = ? AND is_primary = 1",
        [customerId]
      );
    }
    await connection.query(
      `INSERT INTO customer_payment_contacts (id, customer_id, name, phone, email, is_primary, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), customerId, input.name, input.phone, input.email || null, primary ? 1 : 0, req.user.id, req.user.id]
    );
    await connection.commit();

    res.status(201).json(contactView(await loadContacts(connection, customerId)));
  } catch (err) {
    await connection.rollback().catch(() => {});
    fail(res, err, "Failed to save the contact");
  } finally {
    connection.release();
  }
}

// PUT /api/invoices/customers/:customerId/contacts/:contactId   { name, phone, is_primary }
async function updateCustomerContact(req, res) {
  const { customerId, contactId } = req.params;
  const connection = await pool.getConnection();
  try {
    const input = readBody(req.body);
    await assertCustomerAccess(connection, req, customerId);

    await connection.beginTransaction();
    const existing = await assertNotDuplicate(connection, customerId, input.digits, contactId);
    if (!existing.some((r) => r.id === contactId)) throw withStatus("Contact not found", 404);
    if (input.primary) {
      await connection.query(
        "UPDATE customer_payment_contacts SET is_primary = 0 WHERE customer_id = ? AND is_primary = 1 AND id <> ?",
        [customerId, contactId]
      );
    }
    await connection.query(
      `UPDATE customer_payment_contacts SET name = ?, phone = ?, is_primary = ?, updated_by = ?${input.email !== undefined ? ", email = ?" : ""}
        WHERE id = ? AND customer_id = ?`,
      [input.name, input.phone, input.primary ? 1 : 0, req.user.id, ...(input.email !== undefined ? [input.email] : []), contactId, customerId]
    );
    await connection.commit();

    res.json(contactView(await loadContacts(connection, customerId)));
  } catch (err) {
    await connection.rollback().catch(() => {});
    fail(res, err, "Failed to save the contact");
  } finally {
    connection.release();
  }
}

// GET /api/invoices/customer-contacts?archived=true
// Every saved number across the customers the user may see, for the accountant's Contacts
// page. Active ones by default; archived=true lists the archived ones instead.
async function listCustomerContacts(req, res) {
  const { role, id: userId } = req.user;
  if (role === "client") return res.status(403).json({ error: "Forbidden" });
  const archived = req.query.archived === "true";

  const connection = await pool.getConnection();
  try {
    let branchFilter = "";
    const params = [archived ? 0 : 1];
    if (role !== "admin") {
      const [[me]] = await connection.query("SELECT branch_id FROM users WHERE id = ?", [userId]);
      if (!me?.branch_id) return res.status(403).json({ error: "Branch not assigned" });
      branchFilter = `AND (EXISTS (SELECT 1 FROM sites s WHERE s.company_id = c.customer_id AND s.branch_id = ?)
                        OR EXISTS (SELECT 1 FROM invoices i JOIN sites s ON s.id = i.site_id
                                    WHERE i.customer_id = c.customer_id AND s.branch_id = ?))`;
      params.push(me.branch_id, me.branch_id);
    }

    const [rows] = await connection.query(
      `SELECT c.id, c.customer_id, COALESCE(co.display_name, co.name) AS customer_name, co.code AS customer_code,
              c.name, c.phone, c.email, c.is_primary, c.is_active, c.updated_at
         FROM customer_payment_contacts c
         JOIN companies co ON co.id = c.customer_id
        WHERE c.is_active = ? ${branchFilter}
        ORDER BY COALESCE(co.display_name, co.name) ASC, c.is_primary DESC, c.created_at ASC, c.id ASC`,
      params
    );
    res.json(rows.map((r) => ({ ...r, is_primary: Boolean(r.is_primary), is_active: Boolean(r.is_active) })));
  } catch (err) {
    fail(res, err, "Failed to load the contacts");
  } finally {
    connection.release();
  }
}

// POST /api/invoices/customers/:customerId/contacts/:contactId/archive
// Hides a number (it is kept, and can be restored). If it was the primary one, the
// customer's oldest remaining number becomes primary.
async function archiveCustomerContact(req, res) {
  const { customerId, contactId } = req.params;
  const connection = await pool.getConnection();
  try {
    await assertCustomerAccess(connection, req, customerId);

    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT id, is_primary FROM customer_payment_contacts WHERE customer_id = ? AND is_active = 1 ORDER BY created_at ASC, id ASC FOR UPDATE",
      [customerId]
    );
    const target = rows.find((r) => r.id === contactId);
    if (!target) throw withStatus("Contact not found", 404);
    await connection.query(
      "UPDATE customer_payment_contacts SET is_active = 0, is_primary = 0, updated_by = ? WHERE id = ? AND customer_id = ?",
      [req.user.id, contactId, customerId]
    );
    const next = rows.find((r) => r.id !== contactId);
    if (target.is_primary && next) {
      await connection.query("UPDATE customer_payment_contacts SET is_primary = 1 WHERE id = ?", [next.id]);
    }
    await connection.commit();

    res.json(contactView(await loadContacts(connection, customerId)));
  } catch (err) {
    await connection.rollback().catch(() => {});
    fail(res, err, "Failed to archive the contact");
  } finally {
    connection.release();
  }
}

// POST /api/invoices/customers/:customerId/contacts/:contactId/restore
// Brings an archived number back. It returns as an ordinary number, or as the primary
// one when the customer has no other number.
async function restoreCustomerContact(req, res) {
  const { customerId, contactId } = req.params;
  const connection = await pool.getConnection();
  try {
    await assertCustomerAccess(connection, req, customerId);

    await connection.beginTransaction();
    const [[target]] = await connection.query(
      "SELECT id, phone FROM customer_payment_contacts WHERE id = ? AND customer_id = ? AND is_active = 0 FOR UPDATE",
      [contactId, customerId]
    );
    if (!target) throw withStatus("Contact not found", 404);
    const active = await assertNotDuplicate(connection, customerId, String(target.phone).replace(/\D/g, ""));
    await connection.query(
      "UPDATE customer_payment_contacts SET is_active = 1, is_primary = ?, updated_by = ? WHERE id = ?",
      [active.length ? 0 : 1, req.user.id, contactId]
    );
    await connection.commit();

    res.json(contactView(await loadContacts(connection, customerId)));
  } catch (err) {
    await connection.rollback().catch(() => {});
    fail(res, err, "Failed to restore the contact");
  } finally {
    connection.release();
  }
}

module.exports = {
  getCustomerContact,
  createCustomerContact,
  updateCustomerContact,
  listCustomerContacts,
  archiveCustomerContact,
  restoreCustomerContact,
};
