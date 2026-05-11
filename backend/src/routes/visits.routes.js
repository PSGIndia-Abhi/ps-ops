const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
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

router.post("/jobs/:jobId/visits", auth, requirePermission(PERMISSIONS.CREATE_VISIT), createVisitController);
router.get("/jobs/:jobId/visits", auth, requirePermission(PERMISSIONS.VIEW_VISIT), getJobVisits);

//visit status flow routes
router.patch("/:visitId/start", auth, requirePermission(PERMISSIONS.START_VISIT), startVisit);
router.patch("/:visitId/submit", auth, requirePermission(PERMISSIONS.SUBMIT_VISIT), submitVisit);
router.patch("/:visitId/approve", auth, requirePermission(PERMISSIONS.APPROVE_VISIT), approveVisit);

router.patch("/:visitId/technicians", auth, requirePermission(PERMISSIONS.UPDATE_VISIT), updateVisitTechnicians);
router.patch("/:visitId/reschedule", auth, requirePermission(PERMISSIONS.UPDATE_VISIT), rescheduleVisit);
router.patch("/:visitId/cancel", auth, requirePermission(PERMISSIONS.UPDATE_VISIT), cancelVisit);

router.get("/client/upcoming", auth, requirePermission(PERMISSIONS.VIEW_VISIT), getClientUpcomingVisit);

router.post("/:visitId/start-anyway", auth, requirePermission(PERMISSIONS.START_VISIT), startVisitAnyway);



router.get("/my", auth, requirePermission(PERMISSIONS.VIEW_VISIT), getMyVisits);

module.exports = router;
