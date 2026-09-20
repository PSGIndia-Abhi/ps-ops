const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  cancelInvoice,
} = require("../controllers/invoices.controller");

const { listTdsSettings, updateTdsSettings } = require("../controllers/tds.controller");

const {
  uploadFile,
  previewImport,
  getImportPreview,
  listImportHistory,
  removeImport,
  downloadErrorRows,
  confirmInvoiceImport,
  downloadTemplate,
} = require("../controllers/invoiceImport.controller");

// Bulk invoice import (Excel/CSV). Declared before "/:id" so "import" is never read as an invoice id.
// Customer TDS settings. Declared before "/:id" so "tds-settings" is never read as an invoice id.
router.get("/tds-settings", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), listTdsSettings);
router.put("/tds-settings/:customerId", auth, requirePermission(PERMISSIONS.UPDATE_INVOICE), updateTdsSettings);

router.get("/import", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), listImportHistory);
router.get("/import/template", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), downloadTemplate);
router.post("/import/preview", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), uploadFile, previewImport);
router.get("/import/:id", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), getImportPreview);
router.get("/import/:id/error-rows", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), downloadErrorRows);
router.delete("/import/:id", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), removeImport);
router.post("/import/:id/confirm", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), confirmInvoiceImport);

router.get("/", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), listInvoices);
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), getInvoice);
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), createInvoice);
router.put("/:id", auth, requirePermission(PERMISSIONS.UPDATE_INVOICE), updateInvoice);
router.post("/:id/cancel", auth, requirePermission(PERMISSIONS.CANCEL_INVOICE), cancelInvoice);

module.exports = router;
