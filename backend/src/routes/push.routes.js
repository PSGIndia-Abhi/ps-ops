const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const { registerToken, unregisterToken } = require("../services/push.service");

// The mobile app's push address (Firebase token). Any signed-in user may register their own phone;
// a token is just an address, so it carries no permission of its own.

function readToken(req) {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  return token.length >= 20 && token.length <= 512 ? token : null;
}

// POST /api/push/register { token, platform? } - after sign-in and whenever Firebase renews it.
router.post("/register", auth, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(403).json({ error: "Not available for this account" });
    const token = readToken(req);
    if (!token) return res.status(400).json({ error: "A valid token is required" });
    const platform = req.body?.platform === "ios" ? "ios" : "android";
    await registerToken(req.user.id, token, platform);
    res.json({ success: true });
  } catch (err) {
    console.error("Push register error:", err);
    res.status(500).json({ error: "Failed to register for notifications" });
  }
});

// POST /api/push/unregister { token } - on sign-out, so the next person on this phone does not get them.
router.post("/unregister", auth, async (req, res) => {
  try {
    const token = readToken(req);
    if (!token) return res.status(400).json({ error: "A valid token is required" });
    await unregisterToken(token);
    res.json({ success: true });
  } catch (err) {
    console.error("Push unregister error:", err);
    res.status(500).json({ error: "Failed to unregister" });
  }
});

module.exports = router;
