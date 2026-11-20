// Invoice Generation (Billing): /api/billing
// Accounts Head / Accounts Executive (billing) and Service Coordinator (service plans); admin passes every check.
// Tables: data/migrations/20261116_billing_module.sql. Payloads: docs/Invoice Generation - API Payloads.docx.

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const P = require("../access/permissions");

const masters = require("../controllers/billing/masters.controller");
const plans = require("../controllers/billing/servicePlans.controller");
const pos = require("../controllers/billing/pos.controller");
const invoices = require("../controllers/billing/invoices.controller");
const share = require("../controllers/billing/share.controller");
const descriptions = require("../controllers/billing/descriptions.controller");
const frequencies = require("../controllers/billing/frequencies.controller");
const customers = require("../controllers/billing/customers.controller");
const groupContracts = require("../controllers/billing/groupContracts.controller");
const sos = require("../controllers/billing/sos.controller");
const dashboardCtl = require("../controllers/billing/dashboard.controller");

const can = (permission) => [auth, requirePermission(permission)];

// Any one of several permissions (admin passes, as in requirePermission).
const canAny = (...permissions) => [
  auth,
  (req, res, next) =>
    req.user.role === "admin" || permissions.some((p) => req.user.permissions?.includes(p))
      ? next()
      : res.status(403).json({ error: "Forbidden: insufficient permissions" }),
];

const BILLING_PERMISSIONS = [
  P.VIEW_BILLING, P.MANAGE_BILLING_MASTERS, P.GENERATE_INVOICE, P.ISSUE_INVOICE, P.CANCEL_INVOICE,
  P.SHARE_INVOICE, P.MANAGE_SERVICE_PLANS, P.VIEW_SERVICE_TRACKER,
];

// Who am I here: the billing permissions of the signed-in user (admin has them all). The web
// screens use it to show the Accounts or the Service Coordinator menu.
router.get("/me", auth, (req, res) => {
  const all = req.user.role === "admin";
  res.json({ user_id: req.user.id, role: req.user.role, permissions: BILLING_PERMISSIONS.filter((p) => all || req.user.permissions?.includes(p)) });
});

// Accounts dashboard (SOS received, ready / waiting / late, drafts, issued, collections, trend)
router.get("/dashboard", can(P.VIEW_BILLING), dashboardCtl.dashboard);

// Monthly SOS (Statement of Service): the Service Coordinator reports services completed per outlet;
// Accounts reads it and can send it back. Billing of counted services waits for it.
router.get("/sos", canAny(P.VIEW_SERVICE_TRACKER, P.VIEW_BILLING), sos.overview);
router.get("/sos/:companyId", canAny(P.VIEW_SERVICE_TRACKER, P.VIEW_BILLING), sos.get);
router.put("/sos/:companyId", can(P.MANAGE_SERVICE_PLANS), sos.save);
router.post("/sos/:companyId/submit", can(P.MANAGE_SERVICE_PLANS), sos.submit);
router.post("/sos/:companyId/reopen", canAny(P.MANAGE_SERVICE_PLANS, P.GENERATE_INVOICE), sos.reopen);

// Customer Billing Profile (one screen per customer: details, outlets, services, POs, invoice settings)
router.get("/customer-options", can(P.VIEW_BILLING), customers.listOptions);
// Group based contracts: the groups with their companies, and the group's Bill To.
router.get("/contract-groups", can(P.VIEW_BILLING), groupContracts.listGroups);
router.get("/group-profiles/:groupId", can(P.VIEW_BILLING), groupContracts.getGroupProfile);
router.put("/group-profiles/:groupId", can(P.MANAGE_BILLING_MASTERS), groupContracts.saveGroupProfile);
router.get("/customer-profiles", can(P.VIEW_BILLING), customers.listProfiles);
router.get("/customer-profiles/:companyId", can(P.VIEW_BILLING), customers.getCustomerProfile);
router.put("/customer-profiles/:companyId/settings", can(P.MANAGE_BILLING_MASTERS), customers.saveCustomerSettings);

// Customers and billing profiles
// The Service Coordinator picks the customer for a new service plan from this list too.
router.get("/customers", canAny(P.VIEW_BILLING, P.MANAGE_SERVICE_PLANS), masters.listCustomers);
router.get("/profiles/:companyId", can(P.VIEW_BILLING), masters.getProfile);
router.put("/profiles/:companyId", can(P.MANAGE_BILLING_MASTERS), masters.saveProfile);

// Service plans (Service Coordinator) and the Service Tracker
router.get("/service-options", can(P.VIEW_SERVICE_TRACKER), masters.serviceOptions);
router.get("/service-plans", can(P.VIEW_SERVICE_TRACKER), plans.listPlans);
router.get("/service-plans/:companyId", can(P.VIEW_SERVICE_TRACKER), plans.getPlan);
router.put("/service-plans/:companyId", can(P.MANAGE_SERVICE_PLANS), plans.savePlan);
router.get("/service-plans/:companyId/history", can(P.VIEW_SERVICE_TRACKER), plans.planHistory);
// Services assigned / completed per month, typed by the Service Coordinator.
router.get("/service-plans/:companyId/months", can(P.VIEW_SERVICE_TRACKER), plans.getMonth);
router.put("/service-plans/:companyId/months", can(P.MANAGE_SERVICE_PLANS), plans.saveMonth);
router.get("/service-tracker", can(P.VIEW_SERVICE_TRACKER), plans.tracker);
router.get("/service-tracker/jobs", can(P.VIEW_SERVICE_TRACKER), plans.trackerJobs);
router.post("/service-tracker/notify", can(P.VIEW_SERVICE_TRACKER), plans.notifyOperations);

// Contracts and price lists
// Invoice descriptions master (the contract's "Description on invoice" is picked from it).
router.get("/descriptions", can(P.VIEW_BILLING), descriptions.list);
router.post("/descriptions", can(P.MANAGE_BILLING_MASTERS), descriptions.create);
router.put("/descriptions/:id", can(P.MANAGE_BILLING_MASTERS), descriptions.update);

// Billing frequencies master (a contract's "every N months" is picked from it).
router.get("/frequencies", can(P.VIEW_BILLING), frequencies.list);
router.post("/frequencies", can(P.MANAGE_BILLING_MASTERS), frequencies.create);
router.put("/frequencies/:months", can(P.MANAGE_BILLING_MASTERS), frequencies.update);
// Chemicals typed on contracts before (picked again for another customer; no master screen).
router.get("/chemicals", can(P.VIEW_BILLING), masters.listChemicals);
router.get("/contracts", can(P.VIEW_BILLING), masters.listContracts);
router.post("/contracts", can(P.MANAGE_BILLING_MASTERS), masters.createContract);
router.get("/contracts/:id", can(P.VIEW_BILLING), masters.getContract);
router.put("/contracts/:id", can(P.MANAGE_BILLING_MASTERS), masters.updateContract);
router.post("/contracts/:id/status", can(P.MANAGE_BILLING_MASTERS), masters.setContractStatus);
router.post("/contracts/:id/lines", can(P.MANAGE_BILLING_MASTERS), masters.addContractLine);
router.put("/contracts/:id/lines/:lineId", can(P.MANAGE_BILLING_MASTERS), masters.updateContractLine);

// Purchase orders
router.get("/pos", can(P.VIEW_BILLING), pos.listPos);
router.post("/pos", can(P.MANAGE_BILLING_MASTERS), pos.createPo);
router.get("/pos/:id", can(P.VIEW_BILLING), pos.getPo);
router.put("/pos/:id", can(P.MANAGE_BILLING_MASTERS), pos.updatePo);
router.post("/pos/:id/file", can(P.MANAGE_BILLING_MASTERS), pos.acceptFile, pos.uploadPoFile);
router.get("/pos/:id/file", can(P.VIEW_BILLING), pos.downloadPoFile);
router.post("/pos/:id/advances", can(P.MANAGE_BILLING_MASTERS), pos.linkAdvance);
router.get("/payments", can(P.MANAGE_BILLING_MASTERS), pos.advanceCandidates);

// Bill Run and invoices (fixed paths before /invoices/:id)
router.get("/due", can(P.VIEW_BILLING), invoices.due);
router.post("/runs", can(P.GENERATE_INVOICE), invoices.run);
router.get("/invoices", can(P.VIEW_BILLING), invoices.list);
router.post("/invoices/issue", can(P.ISSUE_INVOICE), invoices.issue);
router.get("/invoices/download", can(P.VIEW_BILLING), invoices.download);
router.get("/invoices/:id", can(P.VIEW_BILLING), invoices.get);
router.put("/invoices/:id", can(P.GENERATE_INVOICE), invoices.save);
router.delete("/invoices/:id", can(P.GENERATE_INVOICE), invoices.remove);
router.post("/invoices/:id/check", can(P.GENERATE_INVOICE), invoices.check);
router.get("/invoices/:id/preview", can(P.GENERATE_INVOICE), invoices.preview);
router.get("/invoices/:id/pdf", can(P.VIEW_BILLING), invoices.pdf);
router.post("/invoices/:id/cancel", can(P.CANCEL_INVOICE), invoices.cancel);

// Print and share
router.get("/invoices/:id/print", can(P.SHARE_INVOICE), share.print);
router.get("/invoices/:id/share-options", can(P.SHARE_INVOICE), share.shareOptions);
router.post("/invoices/:id/share/email", can(P.SHARE_INVOICE), share.shareEmail);
router.post("/invoices/:id/share/whatsapp", can(P.SHARE_INVOICE), share.shareWhatsapp);
router.post("/invoices/:id/share/link", can(P.SHARE_INVOICE), share.shareLink);
router.post("/invoices/:id/share/log", can(P.SHARE_INVOICE), share.shareLog);
router.get("/invoices/:id/shares", can(P.VIEW_BILLING), share.shares);

module.exports = router;
