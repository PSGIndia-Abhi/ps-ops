const { pool } = require("../../db");

// ---------------------------------------------------------------------------
// Recording for the admin User Activity report (tables in
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

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || req.socket?.remoteAddress || "").slice(0, 64) || null;
}

// The server's own date (the container runs in IST), not toISOString()'s UTC date.
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One message per kind of failure, so a missing table doesn't flood the log on every request.
const warned = new Set();
function warnOnce(kind, err) {
  if (warned.has(kind)) return;
  warned.add(kind);
  console.error(`User activity: could not record ${kind} (further errors not logged):`, err.message);
}

function upsertDailyActivity(userId, platform, now) {
  return pool.query(
    `INSERT INTO user_daily_activity (user_id, activity_date, platform, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at))`,
    [userId, localDate(now), platform, now, now]
  );
}

// Called from the auth middleware on every signed-in request. Writes at most once per
// THROTTLE_MS per user and app (and always on the first request of a new day), so
// "last used" can lag by up to that much.
const THROTTLE_MS = 5 * 60 * 1000;
const lastWrite = new Map(); // `${userId}|${platform}` -> { date, at }

function touchDailyActivity(req, userId) {
  if (!userId) return;
  const now = new Date();
  const platform = detectPlatform(req);
  const key = `${userId}|${platform}`;
  const date = localDate(now);
  const prev = lastWrite.get(key);
  if (prev && prev.date === date && now - prev.at < THROTTLE_MS) return;
  lastWrite.set(key, { date, at: now.getTime() });
  upsertDailyActivity(userId, platform, now).catch((err) => {
    lastWrite.delete(key); // try again on the next request
    warnOnce("daily activity", err);
  });
}

// Called from POST /api/auth/login for every attempt. reason is null on success, else one of
// unknown_email | not_activated | inactive | wrong_password | error.
function recordLoginEvent(req, { client, userId = null, email, success, reason = null }) {
  const now = new Date();
  const platform = detectPlatform(req, client);
  pool
    .query(
      `INSERT INTO user_login_events
         (user_id, email, platform, success, failure_reason, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        String(email || "").slice(0, 150),
        platform,
        success ? 1 : 0,
        reason,
        clientIp(req),
        String(req.headers["user-agent"] || "").slice(0, 255) || null,
        now,
      ]
    )
    .catch((err) => warnOnce("login event", err));

  // A successful login is also use of the app that day.
  if (success && userId) {
    lastWrite.set(`${userId}|${platform}`, { date: localDate(now), at: now.getTime() });
    upsertDailyActivity(userId, platform, now).catch((err) => warnOnce("daily activity", err));
  }
}

module.exports = {
  PLATFORMS,
  PLATFORM_LABELS,
  detectPlatform,
  localDate,
  touchDailyActivity,
  recordLoginEvent,
};
