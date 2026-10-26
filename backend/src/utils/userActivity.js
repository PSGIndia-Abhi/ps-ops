const { pool } = require("../../db");

// ---------------------------------------------------------------------------
// Recording for the admin User Activity report (table in
// data/migrations/20261026_create_user_activity_tables.sql).
//
// Nothing here may break a login or a request: every write is fire-and-forget
// and a failure is only logged.
// ---------------------------------------------------------------------------

const PLATFORMS = ["web", "android_app", "old_android_app"];
const PLATFORM_LABELS = {
  web: "Website",
  android_app: "BestServe App",
  old_android_app: "Old Android App",
};

// Which app a request came from:
//  - the BestServe app (mobile/, React Native) sends client: "mobile" on login, and its
//    requests go out through OkHttp, whose User-Agent is "okhttp/x.y.z";
//  - the old Capacitor app (frontend/android) loads the website in an Android WebView,
//    whose User-Agent carries "; wv)";
//  - anything else is the website in a browser (desktop or phone).
function detectPlatform(req, client) {
  if (client === "mobile") return "android_app";
  const ua = String(req.headers["user-agent"] || "");
  if (/okhttp/i.test(ua)) return "android_app";
  if (/;\s*wv\)/.test(ua)) return "old_android_app";
  return "web";
}

// The server's own date (the container runs in IST), not toISOString()'s UTC date.
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One message, so a missing table doesn't flood the log on every request.
let warned = false;
function warnOnce(err) {
  if (warned) return;
  warned = true;
  console.error("User activity: could not record (further errors not logged):", err.message);
}

// Writes at most once per THROTTLE_MS per user and app, and always on the first request of a
// new day, so the first time of the day is exact.
const THROTTLE_MS = 5 * 60 * 1000;
const lastWrite = new Map(); // `${userId}|${platform}` -> { date, at }

function markActive(userId, platform, { force = false } = {}) {
  const now = new Date();
  const key = `${userId}|${platform}`;
  const date = localDate(now);
  const prev = lastWrite.get(key);
  if (!force && prev && prev.date === date && now - prev.at < THROTTLE_MS) return;
  lastWrite.set(key, { date, at: now.getTime() });
  pool
    .query(
      `INSERT INTO user_daily_activity (user_id, activity_date, platform, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at))`,
      [userId, date, platform, now, now]
    )
    .catch((err) => {
      lastWrite.delete(key); // try again on the next request
      warnOnce(err);
    });
}

// Auth middleware: every signed-in request.
function touchDailyActivity(req, userId) {
  if (userId) markActive(userId, detectPlatform(req));
}

// POST /api/auth/login: a successful login.
function recordLogin(req, client, userId) {
  if (userId) markActive(userId, detectPlatform(req, client), { force: true });
}

module.exports = {
  PLATFORMS,
  PLATFORM_LABELS,
  localDate,
  touchDailyActivity,
  recordLogin,
};
