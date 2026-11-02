const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { ReportInputError, loadRoles, buildToday, exportToday } = require("../services/userActivityReport.service");
const { ModuleReportInputError, buildModuleReport, exportModuleReport } = require("../services/moduleUsageReport.service");

// ---------------------------------------------------------------------------
// Admin User Activity report - admin only. Today's data, or yesterday's (?day=yesterday).
//
// GET /api/user-activity/today?day=today|yesterday&platform=&role=
// GET /api/user-activity/export?format=pdf|xlsx&day=&platform=&role=
// GET /api/user-activity/roles
// GET /api/user-activity/modules?period=7|30|90|all  or  ?from=&to=  - the Module report: each module's users and work
// GET /api/user-activity/modules/export?format=pdf|xlsx&(same days)  - its download (module figures, no user list)
//
// platform: web | android_app | old_android_app (empty = all apps).
// ---------------------------------------------------------------------------

router.use(auth, allowRoles("admin"));

function handle(fn, fallback) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ReportInputError || err instanceof ModuleReportInputError) return res.status(400).json({ error: err.message });
      if (err?.code === "ER_NO_SUCH_TABLE") {
        return res.status(500).json({ error: "User activity table is missing - run migration 20261026_create_user_activity_tables.sql" });
      }
      console.error(fallback, err);
      return res.status(500).json({ error: fallback });
    }
  };
}

router.get("/roles", handle(async (req, res) => res.json(await loadRoles()), "Failed to load roles"));
router.get("/today", handle(async (req, res) => res.json(await buildToday(req.query)), "Failed to load user activity"));
router.get("/modules", handle(async (req, res) => res.json(await buildModuleReport(req.query)), "Failed to build the module report"));
router.get(
  "/modules/export",
  handle(async (req, res) => {
    const file = await exportModuleReport(req.query.format, req.query);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(file.buffer);
  }, "Failed to create the module report file")
);

router.get(
  "/export",
  handle(async (req, res) => {
    const file = await exportToday(req.query.format, req.query);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(file.buffer);
  }, "Failed to create the report file")
);

module.exports = router;
