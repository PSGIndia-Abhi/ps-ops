const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const brigade = require("../controllers/brigade.controller");
const poFiles = require("../controllers/brigadePoFiles.controller");
const invoices = require("../controllers/brigadeInvoices.controller");

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
// Step 1: flat only (Pending); step 2 books services with { request_id } on POST /bookings
router.post("/flat-requests", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.createFlatRequest);
router.get("/flat-requests", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listFlatRequests);
router.post("/flat-requests/:id/cancel", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.cancelFlatRequest);
router.get("/bookings", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listBrigadeBookings);

// Flat history (booking form), flats board + job flats (dashboard), flat card (job page)
router.get("/flat-history", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getFlatHistory);
router.get("/flats-status", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getFlatsStatus);
router.get("/flats-report", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getFlatsReport);
router.get("/job-flats", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getJobFlats);
router.get("/jobs/:jobId/flat", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getJobFlatCard);

// Billing: client PO -> services + billed amounts (admin + Brigade Executive)
router.get("/billing/pos", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listBillingPos);
router.get("/billing/po", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getBillingPo);
router.put("/billing/po", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.saveBillingPo);
router.get("/billing/unassigned-services", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listUnassignedServices);

// PO tab: every PO and, inside one, every service assigned to it (any status). Read only.
router.get("/pos", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.listAllPos);
router.get("/pos/detail", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), brigade.getPoDetail);

// Tax invoices from a PO: preview (PDF, not saved), save with the next BSPMPL number, list, download
router.post("/billing/invoices/check", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), invoices.checkInvoice);
router.post("/billing/invoices/preview", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), invoices.previewInvoice);
router.post("/billing/invoices", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), invoices.createInvoice);
router.get("/billing/invoices", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), invoices.listInvoices);
router.get("/billing/invoices/:id/pdf", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), invoices.invoicePdf);

// PO files: documents attached to a client PO, shared by the booking form and Billing (max 3 MB each)
router.get("/po-files", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), poFiles.listPoFiles);
router.post("/po-files", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), poFiles.acceptFile, poFiles.uploadPoFile);
router.get("/po-files/:id/view", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), poFiles.viewPoFile);
router.delete("/po-files/:id", auth, requirePermission(PERMISSIONS.BRIGADE_ACCESS), poFiles.deletePoFile);

// Job details + technician before/after photos (Android app)
router.get("/jobs/:jobId", auth, requirePermission(PERMISSIONS.VIEW_JOB), brigade.getJobDetails);
router.get("/visits/:visitId/photos", auth, requirePermission(PERMISSIONS.VIEW_VISIT), brigade.getVisitPhotos);
router.post("/visits/:visitId/photos/:phase", auth, requirePermission(PERMISSIONS.SUBMIT_VISIT), brigade.startPhotoUpload);

module.exports = router;
