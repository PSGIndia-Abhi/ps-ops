const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const brigade = require("../controllers/brigade.controller");

/*
Brigade Executive module (admin passes every permission check by role).
  BRIGADE_ACCESS          → booking form, bookings list, billing
  BRIGADE_MANAGE_MASTERS  → flats + prices masters
  VIEW_VISIT / SUBMIT_VISIT → technician before/after photo steps
*/

router.get("/meta", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getMeta);
router.get("/properties", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listProperties);

// BHK types master
router.get("/bhk-types", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listBhkTypes);
router.post("/bhk-types", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.createBhkType);
router.put("/bhk-types/:id", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.updateBhkType);
router.delete("/bhk-types/:id", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.deleteBhkType);

// Flats master
router.get("/flats", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listFlats);
router.post("/flats", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.createFlat);
router.put("/flats/:id", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.updateFlat);
router.delete("/flats/:id", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.deleteFlat);

// Prices master
router.get("/prices", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.listPrices);
router.post("/prices", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.savePrice);
router.put("/prices/:id", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.updatePrice);
router.delete("/prices/:id", auth, requirePermission(PERMISSIONS.BRIGADE_MANAGE_MASTERS), brigade.deletePrice);

// Booking form
router.get("/quote", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getQuote);
router.post("/bookings", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.createBrigadeBooking);
router.get("/bookings", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listBrigadeBookings);

// Billing: client PO -> services + billed amounts (admin + Brigade Executive)
router.get("/billing/pos", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listBillingPos);
router.get("/billing/po", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getBillingPo);
router.put("/billing/po", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.saveBillingPo);
router.get("/billing/unassigned-services", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listUnassignedServices);

// Job details + technician before/after photos (Android app)
router.get("/jobs/:jobId", auth, requirePermission(PERMISSIONS.VIEW_JOB), brigade.getJobDetails);
router.get("/visits/:visitId/photos", auth, requirePermission(PERMISSIONS.VIEW_VISIT), brigade.getVisitPhotos);
router.post("/visits/:visitId/photos/:phase", auth, requirePermission(PERMISSIONS.SUBMIT_VISIT), brigade.startPhotoUpload);

module.exports = router;
