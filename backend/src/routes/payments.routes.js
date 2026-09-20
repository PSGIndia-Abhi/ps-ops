const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { listPayments, getPayment, createPayment } = require("../controllers/payments.controller");

router.get("/", auth, requirePermission(PERMISSIONS.VIEW_PAYMENT), listPayments);
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_PAYMENT), getPayment);
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_PAYMENT), createPayment);

module.exports = router;
