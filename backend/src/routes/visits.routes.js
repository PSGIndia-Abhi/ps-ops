const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
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

router.post("/jobs/:jobId/visits", createVisitController);
router.get("/jobs/:jobId/visits", getJobVisits);

//visit status flow routes
router.patch("/:visitId/start", startVisit);
router.patch("/:visitId/submit", submitVisit);
router.patch("/:visitId/approve", approveVisit);

router.patch("/:visitId/technicians", updateVisitTechnicians);
router.patch("/:visitId/reschedule", rescheduleVisit);
router.patch("/:visitId/cancel", cancelVisit);

router.get("/client/upcoming", auth, getClientUpcomingVisit);

router.post("/:visitId/start-anyway", startVisitAnyway);



router.get("/my", auth, getMyVisits);

module.exports = router;