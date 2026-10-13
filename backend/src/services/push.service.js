// Push notifications to the mobile app through Firebase Cloud Messaging (FCM).
//
// Best effort, always: a push is an extra on top of the in-app notification that is already
// saved, so nothing here may throw into the caller. If Firebase is not configured (no key file),
// every function quietly does nothing and the rest of the system works exactly as before.
//
// The key: a Firebase service-account JSON. Looked for at FIREBASE_SERVICE_ACCOUNT (a path) if
// set, otherwise at src/secrets/firebase-admin.json. Never committed (see backend/.gitignore).
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");

let messaging = null;
let initTried = false;

function getMessaging() {
  if (initTried) return messaging;
  initTried = true;
  try {
    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, "..", "secrets", "firebase-admin.json");
    if (!fs.existsSync(keyPath)) {
      console.warn("[push] Firebase key not found - push notifications are off");
      return null;
    }
    const admin = require("firebase-admin");
    const credentials = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(credentials) });
    messaging = app.messaging();
    console.log(`[push] Firebase ready (project ${credentials.project_id})`);
  } catch (err) {
    console.error("[push] Firebase could not start - push notifications are off:", err.message);
    messaging = null;
  }
  return messaging;
}

async function registerToken(userId, token, platform = "android") {
  // A phone has one token; if another account signed in on it before, the token moves to this user.
  await pool.query(
    `INSERT INTO user_push_tokens (id, user_id, token, platform) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), last_seen_at = NOW()`,
    [uuid(), userId, token, platform]
  );
}

async function unregisterToken(token) {
  await pool.query("DELETE FROM user_push_tokens WHERE token = ?", [token]);
}

// FCM data values must be strings.
function stringData(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}

/**
 * Sends one push to every phone of these users. `data` travels with it so the app can open the
 * right screen (entityType / entityId). Never throws.
 */
async function sendPush(userIds, { title, body, data = {} }) {
  try {
    const fcm = getMessaging();
    const ids = [...new Set((userIds || []).filter((id) => id !== null && id !== undefined && id !== "").map(String))];
    if (!fcm || ids.length === 0) return 0;

    const [rows] = await pool.query("SELECT token FROM user_push_tokens WHERE user_id IN (?)", [ids]);
    const tokens = rows.map((r) => r.token);
    if (tokens.length === 0) return 0;

    const message = {
      tokens,
      notification: { title: title || "BestServe", body: body || "" },
      data: stringData(data),
      android: {
        priority: "high",
        notification: {
          // The app's own "New meetings & tasks" channel (heads-up, sound) - created on first launch.
          channelId: "bestserve_reminder_popup",
          // The app's white bell (res/drawable/ic_stat_reminder) - otherwise Android shows a blank square.
          icon: "ic_stat_reminder",
          color: "#2563EB",
          defaultSound: true,
        },
      },
    };
    let res;
    try {
      res = await fcm.sendEachForMulticast(message);
    } catch (err) {
      // A dropped connection to Google (seen after the backend has been idle): try once more.
      console.warn("[push] send failed, retrying once:", err.message);
      res = await fcm.sendEachForMulticast(message);
    }

    // Drop tokens Firebase says are gone (app uninstalled, data cleared).
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") dead.push(tokens[i]);
    });
    if (dead.length) await pool.query("DELETE FROM user_push_tokens WHERE token IN (?)", [dead]);
    return res.successCount;
  } catch (err) {
    console.error("[push] send failed:", err.message);
    return 0;
  }
}

module.exports = { getMessaging, registerToken, unregisterToken, sendPush };
