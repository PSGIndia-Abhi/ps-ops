const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
// Brigade Executive: only Brigade Group jobs/visits (other roles unaffected).
const { brigadeJobOnly, brigadeVisitOnly } = require("../services/brigade.service");
const {
  requireTemporaryJobScope,
  requireTemporaryVisitScope,
} = require("../middleware/temporaryAccess.middleware");
const {
  createVisitController,
  getJobVisits,
  startVisitAnyway,
  startVisit,
  submitVisit,
  approveVisit,
  updateVisitTechnicians,
  rescheduleVisit,
  cancelVisit,
  getMyVisits,   
  getClientUpcomingVisit,
} = require("../controllers/visits.controller");

router.post("/jobs/:jobId/visits", auth, requireTemporaryJobScope((req) => req.params.jobId), requirePermission(PERMISSIONS.CREATE_VISIT), brigadeJobOnly((req) => req.params.jobId), createVisitController);
router.get("/jobs/:jobId/visits", auth, requireTemporaryJobScope((req) => req.params.jobId), requirePermission(PERMISSIONS.VIEW_VISIT), brigadeJobOnly((req) => req.params.jobId), getJobVisits);

//visit status flow routes
router.patch("/:visitId/start", auth, requireTemporaryVisitScope("visitId"), requirePermission(PERMISSIONS.START_VISIT), brigadeVisitOnly("visitId"), startVisit);
router.patch("/:visitId/submit", auth, requireTemporaryVisitScope("visitId"), requirePermission(PERMISSIONS.SUBMIT_VISIT), brigadeVisitOnly("visitId"), submitVisit);
router.patch("/:visitId/approve", auth, requireTemporaryVisitScope("visitId"), requirePermission(PERMISSIONS.APPROVE_VISIT), brigadeVisitOnly("visitId"), approveVisit);

router.patch("/:visitId/technicians", auth, requireTemporaryVisitScope("visitId"), requirePermission(PERMISSIONS.UPDATE_VISIT), brigadeVisitOnly("visitId"), updateVisitTechnicians);
router.patch("/:visitId/reschedule", auth, requireTemporaryVisitScope("visitId"), requirePermission(PERMISSIONS.UPDATE_VISIT), brigadeVisitOnly("visitId"), rescheduleVisit);
router.patch("/:visitId/cancel", auth, requireTemporaryVisitScope("visitId"), requirePermission(PERMISSIONS.UPDATE_VISIT), brigadeVisitOnly("visitId"), cancelVisit);

router.get("/client/upcoming", auth, requirePermission(PERMISSIONS.VIEW_VISIT), getClientUpcomingVisit);

router.post("/:visitId/start-anyway", auth, requireTemporaryVisitScope("visitId"), requirePermission(PERMISSIONS.START_VISIT), brigadeVisitOnly("visitId"), startVisitAnyway);



router.get("/my", auth, requirePermission(PERMISSIONS.VIEW_VISIT), getMyVisits);

module.exports = router;
