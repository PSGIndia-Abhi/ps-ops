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

const {
  getCustomerContact,
  createCustomerContact,
  updateCustomerContact,
  listCustomerContacts,
  archiveCustomerContact,
  restoreCustomerContact,
} = require("../controllers/customerPaymentContacts.controller");

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

// The accountant's own phone list for a customer (who to call about payments), kept in
// customer_payment_contacts -- not the admin's `contacts`. Declared before "/:id".
router.get("/customers/:customerId/contact", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), getCustomerContact);
router.post("/customers/:customerId/contacts", auth, requirePermission(PERMISSIONS.CREATE_PAYMENT), createCustomerContact);
router.put("/customers/:customerId/contacts/:contactId", auth, requirePermission(PERMISSIONS.CREATE_PAYMENT), updateCustomerContact);
router.post("/customers/:customerId/contacts/:contactId/archive", auth, requirePermission(PERMISSIONS.CREATE_PAYMENT), archiveCustomerContact);
router.post("/customers/:customerId/contacts/:contactId/restore", auth, requirePermission(PERMISSIONS.CREATE_PAYMENT), restoreCustomerContact);
// Every saved number, for the accountant's Contacts page.
router.get("/customer-contacts", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), listCustomerContacts);

router.get("/import", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), listImportHistory);
router.get("/import/template", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), downloadTemplate);
router.post("/import/preview", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), uploadFile, previewImport);
router.get("/import/:id", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), getImportPreview);
router.get("/import/:id/error-rows", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), downloadErrorRows);
router.delete("/import/:id", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), removeImport);
router.post("/import/confirm", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), confirmInvoiceImport);

router.get("/", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), listInvoices);
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), getInvoice);
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_INVOICE), createInvoice);
router.put("/:id", auth, requirePermission(PERMISSIONS.UPDATE_INVOICE), updateInvoice);
router.post("/:id/cancel", auth, requirePermission(PERMISSIONS.CANCEL_INVOICE), cancelInvoice);

module.exports = router;
