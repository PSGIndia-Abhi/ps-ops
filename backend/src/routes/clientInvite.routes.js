const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const crypto = require("crypto");

// POST /api/contacts/:id/invite
router.post(
  "/contacts/:id/invite",
  auth,
  allowRoles("admin"),
  async (req, res) => {
    const contactId = req.params.id;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1️⃣ check contact exists
      const [[contact]] = await connection.query(
        `SELECT id, email, phone, name, branch_id FROM contacts WHERE id = ?`,
        [contactId]
      );

      if (!contact) {
        await connection.rollback();
        return res.status(404).json({ error: "Contact not found" });
      }

      // 2️⃣ check if already user
      const [[existingUser]] = await connection.query(
        `SELECT id FROM users WHERE contact_id = ?`,
        [contactId]
      );

      if (existingUser) {
        await connection.rollback();
        return res.status(400).json({ error: "User already exists for this contact" });
      }

      // 3️⃣ generate secure token
      const inviteToken = crypto.randomBytes(32).toString("hex");

      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 24);

      if (!contact.email) {
  await connection.rollback();
  return res.status(400).json({ error: "Contact must have email to create user" });
}

      // 4️⃣ create user
      if (!contact.branch_id) {
        await connection.rollback();
        return res.status(400).json({ error: "Contact has no branch assigned" });
      }

      await connection.query(
        `
        INSERT INTO users (
          name,
          email,
          phone,
          role,
          contact_id,
          branch_id,
          invite_status,
          invite_token,
          invite_expiry,
          created_at
        )
        VALUES (
          ?,
          ?,
          ?,
          'client',
          ?,
          ?,
          'INVITED',
          ?,
          ?,
          NOW()
        )
        `,
        [
          contact.name,
          contact.email,
          contact.phone,
          contactId,
          contact.branch_id,
          inviteToken,
          expiry
        ]
      );

      await connection.commit();

      const inviteLink = `${process.env.FRONTEND_URL}/invite/${inviteToken}`;

      res.json({
        success: true,
        inviteLink
      });

    } catch (err) {

  await connection.rollback();
  res.status(500).json({ error: "Failed to send invite" });
} finally {
      connection.release();
    }
  }
);

module.exports = router;
