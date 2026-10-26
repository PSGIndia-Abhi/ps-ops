const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const {
  ReportInputError,
  loadRoles,
  buildToday,
  buildDaywise,
  buildLogins,
  exportReport,
} = require("../services/userActivityReport.service");

// ---------------------------------------------------------------------------
// Admin User Activity report - admin only.
//
// GET /api/user-activity/today?date=YYYY-MM-DD&platform=&role=
// GET /api/user-activity/daywise?from=&to=&platform=&role=          (max 31 days)
// GET /api/user-activity/logins?from=&to=&platform=&role=&status=success|failed&search=
// GET /api/user-activity/export?view=today|daywise|logins&format=pdf|xlsx&<same filters>
// GET /api/user-activity/roles
//
// platform: web | android_app | old_android_app (empty = all apps).
// ---------------------------------------------------------------------------

router.use(auth, allowRoles("admin"));

function handle(fn, fallback) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ReportInputError) return res.status(400).json({ error: err.message });
      if (err?.code === "ER_NO_SUCH_TABLE") {
        return res.status(500).json({ error: "User activity tables are missing - run migration 20261026_create_user_activity_tables.sql" });
      }
      console.error(fallback, err);
      return res.status(500).json({ error: fallback });
    }
  };
}

router.get("/roles", handle(async (req, res) => res.json(await loadRoles()), "Failed to load roles"));
router.get("/today", handle(async (req, res) => res.json(await buildToday(req.query)), "Failed to load user activity"));
router.get("/daywise", handle(async (req, res) => res.json(await buildDaywise(req.query)), "Failed to load day-wise activity"));
router.get("/logins", handle(async (req, res) => res.json(await buildLogins(req.query)), "Failed to load login history"));

router.get(
  "/export",
  handle(async (req, res) => {
    const file = await exportReport(req.query.view, req.query.format, req.query);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(file.buffer);
  }, "Failed to create the report file")
);

module.exports = router;
