const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  HttpError, sendError, inTransaction, hasPerm, hasAnyPerm,
  listQuestions, saveQuestions, listTemplates, saveTemplates, getSettings, saveSettings,
  callList, openCall, getCall, recordCallAttempt, saveCallFeedback, raiseTicketFromCall, finishCall,
  listTickets, getTicket, sendWhatsapp, sendFormLink, updateTicket, closeTicket, reopenTicket, reassignCall,
  myFeedbackAccess, feedbackPeople, feedbackCustomers, siteDetails, revisitOptions,
  listEmailTemplates, saveEmailTemplates, feedbackBadges,
} = require("../services/feedback.service");
const { buildCustomerReport, exportCustomerReport, exportTickets } = require("../services/feedbackReport.service");

function sendFile(res, file) {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.send(file.buffer);
}

const ANY_FEEDBACK = ["FEEDBACK_COLLECT", "FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN"];
const DESK = ["FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN"];

function requireAny(req, permissions) {
  if (!hasAnyPerm(req, permissions)) throw new HttpError(403, "Forbidden: insufficient permissions");
}

// ---------------------------------------------------------------------------
// Customer Feedback Tickets - staff API, mounted at /api/feedback.
// The logic lives in src/services/feedback.service.js; this file checks access and
// turns requests into service calls.
// ---------------------------------------------------------------------------

router.use(auth);

/* ------------------------------------------------------------ lookups for the website */

// My feedback permissions - which screens and buttons to show (the routes still check).
router.get("/me", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(myFeedbackAccess(req));
  } catch (err) {
    sendError(res, err, "Failed to load your feedback access");
  }
});

// The counts on the Feedback Desk sidebar: { open_tickets, forms_received, callbacks_due }.
router.get("/badges", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(await feedbackBadges(req));
  } catch (err) {
    sendError(res, err, "Failed to load the counts");
  }
});

// { owners, collectors } for the ticket-owner and give-to-collector dropdowns.
router.get("/people", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(await feedbackPeople());
  } catch (err) {
    sendError(res, err, "Failed to load the people list");
  }
});

// Customers with completed services and their sites, for the customer report.
router.get("/customers", async (req, res) => {
  try {
    requireAny(req, DESK);
    res.json({ customers: await feedbackCustomers() });
  } catch (err) {
    sendError(res, err, "Failed to load the customers");
  }
});

// One site for the call list's details panel: customer, site, contacts, the month's completed
// visits, this month's call and the customer's other sites served that month. Query: month=2026-09
router.get("/sites/:siteId/details", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(await siteDetails(req.params.siteId, req.query.month));
  } catch (err) {
    sendError(res, err, "Failed to load the site details");
  }
});

/* ------------------------------------------------------------ questions master */

// The questions and their answers, in order.
//   default               active only - the Android app (COLLECT) and the Feedback Desk (VIEW)
//   ?include_inactive=1   also switched-off ones - Masters -> Feedback questions (ADMIN)
router.get("/questions", async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === "1" || req.query.include_inactive === "true";
    if (includeInactive) {
      if (!hasPerm(req, "FEEDBACK_ADMIN")) throw new HttpError(403, "You cannot see the feedback questions master");
    } else {
      requireAny(req, ANY_FEEDBACK);
    }
    res.json({ questions: await listQuestions(undefined, { includeInactive }) });
  } catch (err) {
    sendError(res, err, "Failed to load the feedback questions");
  }
});

// Saves the whole list from Masters -> Feedback questions. Body:
//   { "questions": [ { "id": 1 | null, "question_text": "...", "is_active": true,
//                      "is_required": true, "show_on_form": true,
//                      "options": [ { "id": 1 | null, "label": "No", "is_bad": true,
//                                     "suggested_priority": "HIGH", "is_active": true } ] } ] }
// Array order = display order. id null adds a row. Anything left out is switched off.
router.put("/questions", requirePermission("FEEDBACK_ADMIN"), async (req, res) => {
  try {
    res.json({ questions: await saveQuestions(req.body, req.user.id) });
  } catch (err) {
    sendError(res, err, "Failed to save the feedback questions");
  }
});

/* ------------------------------------------------------------ WhatsApp templates */

// Masters -> WhatsApp templates. The app never needs these: the backend fills them in.
router.get("/templates", async (req, res) => {
  try {
    requireAny(req, DESK);
    res.json({ templates: await listTemplates() });
  } catch (err) {
    sendError(res, err, "Failed to load the WhatsApp templates");
  }
});

// Body: { "templates": [ { "code": "FORM_LINK", "body": "...", "audiences": ["CUSTOMER"], "is_active": true } ] }
// Only the templates and fields sent are changed. Codes are fixed.
router.put("/templates", requirePermission("FEEDBACK_ADMIN"), async (req, res) => {
  try {
    res.json({ templates: await saveTemplates(req.body, req.user.id) });
  } catch (err) {
    sendError(res, err, "Failed to save the WhatsApp templates");
  }
});

/* ------------------------------------------------------------ email templates */

// Masters -> Email templates; the website reads them to write the optional customer emails.
router.get("/email-templates", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json({ templates: await listEmailTemplates() });
  } catch (err) {
    sendError(res, err, "Failed to load the email templates");
  }
});

// Body: { "templates": [ { "code": "THANK_YOU", "subject": "...", "body": "...", "is_active": true } ] }
router.put("/email-templates", requirePermission("FEEDBACK_ADMIN"), async (req, res) => {
  try {
    res.json({ templates: await saveEmailTemplates(req.body, req.user.id) });
  } catch (err) {
    sendError(res, err, "Failed to save the email templates");
  }
});

/* ------------------------------------------------------------ settings */

// Read by the app too (e.g. whether to show the "Other feedback" box).
router.get("/settings", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json({ settings: await getSettings() });
  } catch (err) {
    sendError(res, err, "Failed to load the feedback settings");
  }
});

// Body: { "settings": { "link_expiry_days": 5 } } - only the keys sent are changed.
router.put("/settings", requirePermission("FEEDBACK_ADMIN"), async (req, res) => {
  try {
    res.json({ settings: await saveSettings(req.body, req.user.id) });
  } catch (err) {
    sendError(res, err, "Failed to save the feedback settings");
  }
});

/* ------------------------------------------------------------ monthly calls */

// The collector's call list for a month: every customer site with a completed visit in it,
// one row each. Query: month=2026-10 (default this month), status=OPEN|TO_CALL,...,
// q, company_id, mine=1, page, page_size. A collector sees sites nobody has taken yet plus
// their own; the desk sees all.
router.get("/calls", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(await callList(req));
  } catch (err) {
    sendError(res, err, "Failed to load the call list");
  }
});

// Start (or continue) the call for a site and month. Body: { site_id, month }.
// The collector takes the call if nobody has it; returns the call with everything on it.
router.post("/calls", async (req, res) => {
  try {
    requireAny(req, ["FEEDBACK_COLLECT"]);
    const id = await inTransaction((conn) => openCall(conn, req, req.body));
    res.json(await getCall(req, id));
  } catch (err) {
    sendError(res, err, "Failed to start the call");
  }
});

// One monthly call: contacts, the month's visits, calls made, answers, form links,
// WhatsApp messages, tickets raised and history.
router.get("/calls/:id", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(await getCall(req, req.params.id));
  } catch (err) {
    sendError(res, err, "Failed to load the feedback call");
  }
});

// B4 - record a call. Body: { contact_id? | phone + contact_name?, outcome: ANSWERED|NO_ANSWER|BUSY|WRONG_NUMBER,
// call_back_at? "2026-10-30 15:30" }. Returns status, missed_calls, next_call_at, offer_form_link.
router.post("/calls/:id/attempts", async (req, res) => {
  try {
    requireAny(req, ["FEEDBACK_COLLECT", "FEEDBACK_MANAGE"]);
    res.status(201).json(await recordCallAttempt(req, req.params.id, req.body));
  } catch (err) {
    sendError(res, err, "Failed to record the call");
  }
});

// B5 - save the feedback from a call (always saved, good or not) and raise the ticket when there
// is an issue. Body: { contact_id? | spoke_with_name, responses: [{ question_id, option_id }],
// other_feedback?, started_at?, ticket?: { priority?, action, issue_summary?, visit_id?,
// action_owner_user_id?, action_due_at?, action_note? }, no_ticket?: true }
router.post("/calls/:id/feedback", async (req, res) => {
  try {
    requireAny(req, ["FEEDBACK_COLLECT", "FEEDBACK_MANAGE"]);
    res.status(201).json(await saveCallFeedback(req, req.params.id, req.body));
  } catch (err) {
    sendError(res, err, "Failed to save the feedback");
  }
});

// Raise a ticket from a call's feedback later (e.g. after checking a form the customer sent).
// Body: { submission_id?, priority?, action, issue_summary?, visit_id?, action_owner_user_id?, action_due_at?, action_note? }
router.post("/calls/:id/tickets", async (req, res) => {
  try {
    requireAny(req, ["FEEDBACK_COLLECT", "FEEDBACK_MANAGE"]);
    res.status(201).json(await raiseTicketFromCall(req, req.params.id, req.body));
  } catch (err) {
    sendError(res, err, "Failed to raise the ticket");
  }
});

// Finish a call without a ticket. Body: { note? } (required when no feedback was received).
router.post("/calls/:id/done", async (req, res) => {
  try {
    requireAny(req, ["FEEDBACK_COLLECT", "FEEDBACK_MANAGE"]);
    res.json(await finishCall(req, req.params.id, req.body));
  } catch (err) {
    sendError(res, err, "Failed to finish the call");
  }
});

/* ------------------------------------------------------------ tickets */

// Feedback Desk list - tickets exist only for feedback with an issue (raised by the collector).
// A collector without a desk permission gets the tickets they raised.
// Query: status=OPEN|ACTION_PENDING,CLOSED priority=HIGH,... owner_user_id raised_by
//        company_id site_id month from to q page page_size
router.get("/tickets", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(await listTickets(req));
  } catch (err) {
    sendError(res, err, "Failed to load the feedback tickets");
  }
});

// The desk list as Excel - same filters as GET /tickets plus format=xlsx. (Before /tickets/:id.)
router.get("/tickets/export", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    sendFile(res, await exportTickets(req));
  } catch (err) {
    sendError(res, err, "Failed to create the tickets file");
  }
});

// One ticket with the feedback that raised it, the site contacts, WhatsApp messages and
// history. :id is the ticket id or its number (FB-0142).
router.get("/tickets/:id", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json(await getTicket(req, req.params.id));
  } catch (err) {
    sendError(res, err, "Failed to load the feedback ticket");
  }
});

// The ticket site's visits from the day the ticket was raised - to link the re-visit.
router.get("/tickets/:id/revisit-options", async (req, res) => {
  try {
    requireAny(req, ANY_FEEDBACK);
    res.json({ visits: await revisitOptions(req, req.params.id) });
  } catch (err) {
    sendError(res, err, "Failed to load the visits");
  }
});

// B8 - Feedback Desk changes an open ticket. Body: { row_version, priority?, action?, action_owner_user_id?,
// action_due_at?, action_note?, issue_summary?, revisit_visit_id? }. Returns the ticket.
router.patch("/tickets/:id", requirePermission("FEEDBACK_MANAGE"), async (req, res) => {
  try {
    const id = await updateTicket(req, req.params.id, req.body);
    res.json(await getTicket(req, id));
  } catch (err) {
    sendError(res, err, "Failed to update the ticket");
  }
});

// Body: { row_version, close_note? }
router.post("/tickets/:id/close", requirePermission("FEEDBACK_MANAGE"), async (req, res) => {
  try {
    const id = await closeTicket(req, req.params.id, req.body);
    res.json(await getTicket(req, id));
  } catch (err) {
    sendError(res, err, "Failed to close the ticket");
  }
});

// Body: { row_version, note }
router.post("/tickets/:id/reopen", requirePermission("FEEDBACK_MANAGE"), async (req, res) => {
  try {
    const id = await reopenTicket(req, req.params.id, req.body);
    res.json(await getTicket(req, id));
  } catch (err) {
    sendError(res, err, "Failed to reopen the ticket");
  }
});

/* ------------------------------------------------------------ WhatsApp, form link, re-assign */

// B6 - fill a template and get the wa.me link the app opens. Body: { template_code: FEEDBACK_SUMMARY |
// REVISIT_BOOKED, recipient_type: CUSTOMER | OPERATIONS | TECHNICIAN | OTHER, ticket_id,
// contact_id? | user_id? | phone? }. Returns { message_id, phone, body, wa_me_url }.
router.post("/calls/:id/whatsapp", async (req, res) => {
  try {
    requireAny(req, ["FEEDBACK_COLLECT", "FEEDBACK_MANAGE"]);
    res.status(201).json(await sendWhatsapp(req, req.params.id, req.body));
  } catch (err) {
    sendError(res, err, "Failed to prepare the WhatsApp message");
  }
});

// B7 - a new customer form link (when the call isn't answered). Body: { contact_id? | phone,
// send_whatsapp? (default true) }. Returns { form_link_id, url, expires_at, status, whatsapp }.
router.post("/calls/:id/form-link", async (req, res) => {
  try {
    requireAny(req, ["FEEDBACK_COLLECT", "FEEDBACK_MANAGE"]);
    res.status(201).json(await sendFormLink(req, req.params.id, req.body));
  } catch (err) {
    sendError(res, err, "Failed to create the form link");
  }
});

// B8 - the desk gives a call to another collector. Body: { collector_user_id }
router.patch("/calls/:id/collector", requirePermission("FEEDBACK_MANAGE"), async (req, res) => {
  try {
    const id = await reassignCall(req, req.params.id, req.body);
    res.json(await getCall(req, id));
  } catch (err) {
    sendError(res, err, "Failed to give the call to the collector");
  }
});

/* ------------------------------------------------------------ customer report (B11) */

// One customer, all its sites. Query: from=2026-09 to=2026-10 (months, default this month), site_id?, only=complaints?
router.get("/customers/:companyId/report", async (req, res) => {
  try {
    requireAny(req, DESK);
    res.json(await buildCustomerReport(req.params.companyId, req.query));
  } catch (err) {
    sendError(res, err, "Failed to build the customer report");
  }
});

// Same filters plus format=pdf|xlsx.
router.get("/customers/:companyId/report/export", async (req, res) => {
  try {
    requireAny(req, DESK);
    sendFile(res, await exportCustomerReport(req.params.companyId, req.query));
  } catch (err) {
    sendError(res, err, "Failed to create the customer report file");
  }
});

module.exports = router;
