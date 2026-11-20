// Monthly SOS (Statement of Service) - Service Coordinator -> Accounts.
//   GET  /sos?month=2026-11&q=&group_id=     every customer with services to report, and its SOS status
//   GET  /sos/:companyId?month=2026-11       one customer's SOS: agreed services per outlet + entered numbers
//   PUT  /sos/:companyId                     save as draft  { month, notes, lines, extras }
//   POST /sos/:companyId/submit              save and submit to Accounts (locks it, notifies Accounts)
//   POST /sos/:companyId/reopen              { month, reason } - coordinator corrects / Accounts sends back
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

module.exports = { overview, get, save, submit, reopen };
