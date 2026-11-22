// Invoice Generation: public share link - the customer opens an issued invoice PDF without
// logging in. /api/public/billing/invoices/:token (the token is long, random, expires and is
// stored only as a hash; see controllers/billing/share.controller.js).

const express = require("express");
const router = express.Router();
const { publicInvoice } = require("../controllers/billing/share.controller");

router.get("/invoices/:token", publicInvoice);

module.exports = router;
