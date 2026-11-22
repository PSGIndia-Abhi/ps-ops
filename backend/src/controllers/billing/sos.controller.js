// Monthly SOS (Statement of Service) - Service Coordinator -> Accounts.
//   GET  /sos?month=2026-11&q=&group_id=     every customer with services to report, and its SOS status
//   GET  /sos/:companyId?month=2026-11       one customer's SOS: agreed services per outlet + entered numbers
//   PUT  /sos/:companyId                     save as draft  { month, notes, lines, extras }
//   POST /sos/:companyId/submit              save and submit to Accounts (locks it, notifies Accounts)
//   POST /sos/:companyId/reopen              { month, reason } - coordinator corrects / Accounts sends back
//   POST /sos/submit-many                    { month, company_ids } - submit several saved SOS at once
// Logic: services/billing/sos.service.js.

const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const S = require("../../services/billing/sos.service");

const monthOf = (v) => C.month(String(v || C.todayIst()).slice(0, 7), "month");

const overview = C.handle("Failed to load the SOS list", async (req, res) => {
  res.json(await S.monthOverview(pool, monthOf(req.query.month), {
    q: C.str(req.query.q, "q", { max: 100 }),
    groupId: C.str(req.query.group_id, "group_id", { max: 36 }),
  }));
});

const get = C.handle("Failed to load the SOS", async (req, res) => {
  res.json(await S.sosView(pool, C.str(req.params.companyId, "companyId", { required: true, max: 20 }), monthOf(req.query.month)));
});

const save = C.handle("Failed to save the SOS", async (req, res) => {
  const companyId = C.str(req.params.companyId, "companyId", { required: true, max: 20 });
  const month = monthOf(req.body?.month);
  await C.inTransaction(pool, (conn) => S.saveSos(conn, req, companyId, month, req.body || {}));
  res.json(await S.sosView(pool, companyId, month));
});

const submit = C.handle("Failed to submit the SOS", async (req, res) => {
  const companyId = C.str(req.params.companyId, "companyId", { required: true, max: 20 });
  const month = monthOf(req.body?.month);
  const result = await C.inTransaction(pool, (conn) => S.saveSos(conn, req, companyId, month, req.body || {}, { submit: true }));
  await S.notifyAccounts(pool, result);
  res.json(await S.sosView(pool, companyId, month));
});

const reopen = C.handle("Failed to reopen the SOS", async (req, res) => {
  const companyId = C.str(req.params.companyId, "companyId", { required: true, max: 20 });
  const month = monthOf(req.body?.month);
  const reason = C.str(req.body?.reason, "reason", { required: true, max: 500 });
  const result = await C.inTransaction(pool, (conn) => S.reopenSos(conn, req, companyId, month, reason));
  const [[company]] = await pool.query("SELECT name FROM companies WHERE id = ?", [companyId]);
  await S.notifySentBack(company?.name || companyId, S.monthStart(month), result.submitted_by, req.user.id, reason, companyId);
  // The Service Coordinator reopening it themselves: Accounts are told (their draft may have gone).
  // Accounts sending it back already know, so they are not notified.
  const sentBackByAccounts = req.user.role === "admin" || req.user.permissions?.includes("GENERATE_INVOICE");
  if (!sentBackByAccounts) {
    const [[me]] = await pool.query("SELECT name FROM users WHERE id = ?", [req.user.id]);
    await S.notifyReopened(pool, {
      companyId, companyName: company?.name || companyId, month: S.monthStart(month), byUserId: req.user.id,
      byName: me?.name, reason, draftsRemoved: result.drafts_removed,
    });
  }
  res.json({ ...(await S.sosView(pool, companyId, month)), drafts_removed: result.drafts_removed });
});

// POST /sos/submit-many { month, company_ids } - submits several saved (In progress) SOS at once,
// each exactly as saved and in its own transaction: one that cannot be submitted (a number not
// entered, already submitted, ...) is listed with the reason and does not stop the others.
const submitMany = C.handle("Failed to submit the SOS", async (req, res) => {
  const month = monthOf(req.body?.month);
  const ids = [...new Set((Array.isArray(req.body?.company_ids) ? req.body.company_ids : []).map((v) => String(v || "").trim()).filter(Boolean))];
  if (!ids.length) throw C.bad("Choose at least one customer");
  if (ids.length > 200) throw C.bad("Too many customers at once (200 at most)");
  const submitted = [];
  const failed = [];
  for (const companyId of ids) {
    let customer = companyId;
    try {
      const view = await S.sosView(pool, companyId, month);
      customer = view.billing_group ? view.billing_group.group : view.customer;
      if (view.status === "SUBMITTED") throw C.bad("Already submitted");
      if (view.status === "NOT_STARTED") throw C.bad("Nothing entered yet - open it, check the numbers and save");
      if (view.invoiced?.length) throw C.bad("Already invoiced");
      // Submit what is saved: services, extras and termite areas as entered.
      const body = {
        notes: view.notes || null,
        lines: view.lines.filter((l) => !l.is_extra).map((l) => ({ contract_line_id: l.contract_line_id, completed: l.completed, remarks: l.remarks || null })),
        extras: view.lines.filter((l) => l.is_extra).map((l) => ({ site_id: l.site_id || null, service: l.service, completed: l.completed, remarks: l.remarks || null })),
        areas: (view.area_lines || []).map((a) => ({ contract_line_id: a.contract_line_id, period_start: a.period_start, area: a.area, remarks: a.remarks || null })),
      };
      const result = await C.inTransaction(pool, (conn) => S.saveSos(conn, req, companyId, month, body, { submit: true }));
      await S.notifyAccounts(pool, result);
      submitted.push({ company_id: companyId, customer });
    } catch (err) {
      if (!(err instanceof C.HttpError)) throw err;
      failed.push({ company_id: companyId, customer, reason: err.message });
    }
  }
  res.json({ month: S.monthStart(month), submitted, failed });
});

module.exports = { overview, get, save, submit, submitMany, reopen };
