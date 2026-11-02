const express = require("express");
const router = express.Router();
const { sendError, getPublicForm, submitPublicForm } = require("../services/feedback.service");

// ---------------------------------------------------------------------------
// Customer Feedback - the customer's form, mounted at /api/public/feedback. No login: the
// random token in the WhatsApp link is the key (only its SHA-256 is stored). A link works once,
// until it expires (setting link_expiry_days) or a newer link replaces it.
// ---------------------------------------------------------------------------

// The questions to show (answers without the good / bad flag) and the customer / site names.
router.get("/:token", async (req, res) => {
  try {
    res.json(await getPublicForm(req.params.token));
  } catch (err) {
    sendError(res, err, "Failed to open the feedback form");
  }
});

// Body: { responses: [{ question_id, option_id }], other_feedback?, name? }
router.post("/:token", async (req, res) => {
  try {
    res.status(201).json(await submitPublicForm(req.params.token, req.body));
  } catch (err) {
    sendError(res, err, "Failed to send the feedback");
  }
});

module.exports = router;
