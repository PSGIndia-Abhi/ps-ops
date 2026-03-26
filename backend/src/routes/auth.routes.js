const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const { sendOTPEmail } = require("../utils/mailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const auth = require("../middleware/auth.middleware");

// --------------------
// LOGIN 
// --------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {

    const [rows] = await pool.query(
      `
      SELECT 
        id,
        role,
        password_hash,
        invite_status,
        is_active
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];

    // 🔴 block if invite not accepted
    if (user.invite_status === "INVITED") {
      return res.status(403).json({
        error: "Please activate your account using invite link"
      });
    }

    // 🔴 block if inactive
    if (user.is_active === 0) {
      return res.status(403).json({
        error: "Account is inactive"
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      role: user.role
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// --------------------
// SIGNUP – SEND OTP
// --------------------

router.post("/signup/send-otp", async (req, res) => {
  const { name, phone, email, password, designation } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1. Check if user already exists
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length) {
      return res.status(400).json({ error: "User already exists" });
    }
    // 2. Generate OTP
const otp = Math.floor(100000 + Math.random() * 900000).toString();
const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

console.log(`Generated OTP for ${email}: ${otp} (expires at ${expiresAt.toISOString()})`);

// 🔥 Delete previous OTPs
await pool.query(
  `DELETE FROM email_otps WHERE email = ?`,
  [email]
);

// Insert new OTP
await pool.query(
  `INSERT INTO email_otps (email, otp_code, expires_at)
   VALUES (?, ?, ?)`,
  [email, otp, expiresAt]
);


    // 4. Send OTP email (to admin inbox)
    await sendOTPEmail({
      toEmail: process.env.ADMIN_OTP_INBOX,
      userEmail: email,
      otp,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/signup/verify-otp", async (req, res) => {
  const { name, phone, email, password, otp } = req.body;

  try {
    // 1. check otp
    const [rows] = await pool.query(
      `SELECT * FROM email_otps 
       WHERE email = ? AND otp_code = ?`,
      [email, otp]
    );

    if (!rows.length) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // 2. hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. create user (default role technician)
    await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, 'technician', 1)`,
      [name, email, phone, passwordHash]
    );

    // 4. cleanup otp
    await pool.query(`DELETE FROM email_otps WHERE email = ?`, [email]);

    res.json({ success: true });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});


//---------------------- Reset  Password Verify otp ----------------------
router.post("/forgot-password/verify-otp", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM email_otps
       WHERE email = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(400).json({ error: "No OTP found" });
    }

    const record = rows[0];

    if (record.otp_code !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: "OTP expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash = ? WHERE email = ?",
      [passwordHash, email]
    );

    await pool.query(
      "DELETE FROM email_otps WHERE email = ?",
      [email]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Password reset failed" });
  }
});


//---------------------- Send OTP for password reset ----------------------

router.post("/forgot-password/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const [users] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (!users.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("DEV RESET OTP for", email, "=>", otp);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO email_otps (email, otp_code, expires_at)
       VALUES (?, ?, ?)`,
      [email, otp, expiresAt]
    );

    await sendOTPEmail({
      toEmail: "abhimanyu@psgindia.co.in",
      userEmail: email,
      otp,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Forgot password send OTP error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// Logged in user profile
router.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, is_active
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("ME ERROR:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

//-------------------------------Invite Route ----------------------------
// ACCEPT INVITE (magic link password setup)
router.post("/accept-invite", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      error: "Token and password are required",
    });
  }

  const connection = await pool.getConnection();

  try {

    // 1️⃣ Find invited user
    const [[user]] = await connection.query(
      `
      SELECT id, invite_expiry, invite_status
      FROM users
      WHERE invite_token = ?
      LIMIT 1
      `,
      [token]
    );

    if (!user) {
      return res.status(400).json({
        error: "Invalid invite token",
      });
    }

    // 2️⃣ Check expiry
    if (new Date(user.invite_expiry) < new Date()) {
      return res.status(400).json({
        error: "Invite link expired",
      });
    }

    if (user.invite_status !== "INVITED") {
      return res.status(400).json({
        error: "Invite already used",
      });
    }

    // 3️⃣ Hash password
    const hash = await bcrypt.hash(password, 10);

    // 4️⃣ Activate user
    await connection.query(
      `
      UPDATE users
      SET password_hash = ?,
          invite_status = 'ACTIVE',
          invite_token = NULL,
          invite_expiry = NULL,
          updated_at = NOW()
      WHERE id = ?
      `,
      [hash, user.id]
    );

    res.json({
      success: true,
      message: "Account activated. You can login now.",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to activate account",
    });
  } finally {
    connection.release();
  }
});



module.exports = router;
