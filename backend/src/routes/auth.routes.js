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
        branch_id,
        password_hash,
        invite_status,
        is_active,
        contact_id
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
        role: user.role,
        branch_id: user.branch_id
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      role: user.role,
      user_id: user.id,
      branch_id: user.branch_id,
      contact_id: user.contact_id || null
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
  const { name, phone, email, password, otp, branch_id } = req.body;

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
    let resolvedBranchId = branch_id || null;
    if (!resolvedBranchId) {
      const [[headOffice]] = await pool.query(
        "SELECT id FROM branches WHERE name LIKE '%Head Office%' ORDER BY created_at ASC LIMIT 1"
      );
      if (headOffice?.id) {
        resolvedBranchId = headOffice.id;
      }
    }

    if (!resolvedBranchId) {
      return res.status(400).json({ error: "Branch is required for new users" });
    }

    await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, is_active, branch_id)
       VALUES (?, ?, ?, ?, 'technician', 1, ?)`,
      [name, email, phone, passwordHash, resolvedBranchId]
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
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.is_active,
        DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        u.contact_id,
        COALESCE(u.branch_id, c.branch_id) AS branch_id,
        c.name AS contact_name,
        c.company_id AS site_id,
        s.name AS company_site,
        co.id AS company_id,
        co.name AS company_name,
        co.code AS company_code,
        b.name AS branch_name,
        ba.id AS branch_admin_id,
        ba.name AS branch_admin_name,
        ba.email AS branch_admin_email,
        ba.phone AS branch_admin_phone
      FROM users u
      LEFT JOIN contacts c ON c.id = u.contact_id
      LEFT JOIN sites s ON s.id = c.company_id
      LEFT JOIN companies co ON co.id = s.company_id
      LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, c.branch_id)
      LEFT JOIN users ba ON ba.branch_id = b.id AND ba.role = 'branch_admin'
      WHERE u.id = ?
      `,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = rows[0];
    res.json({
      ...user,
      branch_id: user.branch_id || null,
      branch: user.branch_id
        ? { id: user.branch_id, name: user.branch_name }
        : null,
      branch_admin: user.branch_admin_id
        ? {
            id: user.branch_admin_id,
            name: user.branch_admin_name,
            email: user.branch_admin_email,
            phone: user.branch_admin_phone,
          }
        : null,
      company_logo_url: null,
    });

  } catch (err) {
    console.error("ME ERROR:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.patch("/me", auth, async (req, res) => {
  const { name, email, phone } = req.body || {};

  if (!name?.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  if (!email?.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const [[existingUser]] = await pool.query(
      `SELECT id, contact_id
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.user.id]
    );

    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const [emailRows] = await pool.query(
      `SELECT id
       FROM users
       WHERE email = ?
         AND id <> ?
       LIMIT 1`,
      [email.trim(), req.user.id]
    );

    if (emailRows.length > 0) {
      return res.status(400).json({ error: "Email is already in use" });
    }

    await pool.query(
      `UPDATE users
       SET name = ?, email = ?, phone = ?, updated_at = NOW()
       WHERE id = ?`,
      [name.trim(), email.trim(), phone?.trim() || null, req.user.id]
    );

    if (existingUser.contact_id) {
      await pool.query(
        `UPDATE contacts
         SET name = ?, email = ?, phone = ?
         WHERE id = ?`,
        [name.trim(), email.trim(), phone?.trim() || null, existingUser.contact_id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Profile update failed:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.post("/me/password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    const [[user]] = await pool.query(
      `SELECT id, password_hash
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = ?, updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Password update failed:", err);
    res.status(500).json({ error: "Failed to update password" });
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
