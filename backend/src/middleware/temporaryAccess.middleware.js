const { pool } = require("../../db");

const isTemporaryWorker = (req) => !!req.user?.is_temporary_worker;

const requireTemporaryJobScope = (jobIdGetter) => {
  return async (req, res, next) => {
    try {
      if (!isTemporaryWorker(req)) return next();
      const expectedJobId = String(req.user.temp_access_job_id || "");
      const currentJobId = String(jobIdGetter(req) || "");

      if (!expectedJobId || !currentJobId || expectedJobId !== currentJobId) {
        return res.status(403).json({ error: "Forbidden: temporary access is limited to one job" });
      }

      return next();
    } catch (err) {
      console.error("Temporary job scope check failed:", err);
      return res.status(500).json({ error: "Access validation failed" });
    }
  };
};

const requireTemporaryVisitScope = (visitIdParam = "visitId") => {
  return async (req, res, next) => {
    try {
      if (!isTemporaryWorker(req)) return next();
      const visitId = req.params?.[visitIdParam];
      if (!visitId) {
        return res.status(400).json({ error: "Visit ID is required" });
      }

      const [[visit]] = await pool.query(
        `SELECT job_id FROM job_visits WHERE id = ? LIMIT 1`,
        [visitId]
      );

      if (!visit) {
        return res.status(404).json({ error: "Visit not found" });
      }

      if (String(visit.job_id) !== String(req.user.temp_access_job_id)) {
        return res.status(403).json({ error: "Forbidden: temporary access is limited to one job" });
      }

      return next();
    } catch (err) {
      console.error("Temporary visit scope check failed:", err);
      return res.status(500).json({ error: "Access validation failed" });
    }
  };
};

module.exports = {
  requireTemporaryJobScope,
  requireTemporaryVisitScope,
};

