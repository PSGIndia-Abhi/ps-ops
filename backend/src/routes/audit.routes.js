const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { listAuditLogs, exportAuditLogs, getInvoiceHistory, recordExport } = require("../controllers/audit.controller");

/*
Accountant Panel audit trail.
  GET  /api/audit-logs                     full log, filters + paging     (admin only, checked in the controller)
  GET  /api/audit-logs/export              full log as CSV                 (admin only)
  GET  /api/audit-logs/invoice/:invoiceId  one invoice's Change History    (anyone who can view that invoice)
  POST /api/audit-logs/export-event        the browser reports an export   (anyone who can view invoices)
There is no update or delete: audit entries are read only.
*/

router.get("/", auth, listAuditLogs);
router.get("/export", auth, exportAuditLogs);
router.get("/invoice/:invoiceId", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), getInvoiceHistory);
router.post("/export-event", auth, requirePermission(PERMISSIONS.VIEW_INVOICE), recordExport);

module.exports = router;
