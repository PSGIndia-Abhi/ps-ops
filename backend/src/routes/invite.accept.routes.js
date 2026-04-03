const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// POST /api/invite/accept
router.post("/accept", async (req, res) => {

  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Token and password required" });
  }

  const connection = await pool.getConnection();

  try {

    const [[user]] = await connection.query(`
      SELECT id, role, invite_expiry, invite_status
      FROM users
      WHERE invite_token = ?
    `, [token]);

    if (!user)
      return res.status(400).json({ error: "Invalid invite link" });

    if (user.invite_status === "ACTIVE")
      return res.status(400).json({ error: "Invite already used" });

    if (user.invite_expiry && new Date(user.invite_expiry) < new Date())
      return res.status(400).json({ error: "Invite expired" });

    const hash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(`
      UPDATE users
      SET
        password_hash = ?,
        invite_status = 'ACTIVE',
        invite_token = NULL,
        invite_expiry = NULL,
        is_active = 1,
        updated_at = NOW()
      WHERE id = ?
      
    `, [hash, user.id]);

    if (result.affectedRows === 0)
      return res.status(400).json({ error: "Invite already used" });

    const jwtToken = jwt.sign(
      { userId: user.id, role: user.role, branch_id: user.branch_id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token: jwtToken
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to accept invite" });
  } finally {
    connection.release();
  }
});

module.exports = router;