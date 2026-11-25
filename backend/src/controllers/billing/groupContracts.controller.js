// Group based contracts (New contract > Group based): the groups with their companies, and the
// group's Bill To (one billing name / address / GSTIN for the whole group).
// Tables: group_name, companies.group_id; data/migrations/20261125_billing_group_contracts.sql.

const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const calc = require("../../services/billing/calc");
const { logAudit } = require("../../services/Audit.service");

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

// GET /contract-groups -> [{ id, name, companies: [{ company_id, name, category, outlets, sites: [{ site_id, name }] }] }]
// Active groups that have at least one company.
const listGroups = C.handle("Failed to load the groups", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT g.id AS group_id, g.name AS group_name, c.id AS company_id, c.name, c.type,
            (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ') FROM sites s WHERE s.company_id = c.id) AS outlets,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT('site_id', s.id, 'name', s.name)) FROM sites s WHERE s.company_id = c.id) AS site_list
       FROM group_name g
       JOIN companies c ON c.group_id = g.id
      WHERE COALESCE(g.is_active, 1) = 1
      ORDER BY g.name, c.name`
  );
  const groups = [];
  const at = new Map();
  for (const r of rows) {
    let g = at.get(r.group_id);
    if (!g) {
      g = { id: r.group_id, name: String(r.group_name || "").trim(), companies: [] };
      at.set(r.group_id, g);
      groups.push(g);
    }
    const list = typeof r.site_list === "string" ? JSON.parse(r.site_list) : r.site_list;
    g.companies.push({
      company_id: r.company_id, name: String(r.name || "").trim(), category: calc.categoryOf(r.type), outlets: r.outlets || "",
      sites: (list || []).map((s) => ({ site_id: s.site_id, name: String(s.name || "").trim() })).sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  res.json(groups);
});

function profileOut(p, groupName) {
  return {
    group_id: p.group_id,
    // the group's name (kept in step if the group is renamed later)
    billing_name: groupName ? String(groupName).trim() : p.billing_name,
    billing_address: p.billing_address,
    // the group's own "Service Offered To" address (null = not printed)
    service_offered_to: p.service_offered_to || null,
    state_code: p.state_code,
    state_name: p.state_name,
    gst_number: p.gst_number || "",
    payment_terms_days: Number(p.payment_terms_days),
    is_active: Boolean(p.is_active),
    updated_at: p.updated_at,
  };
}

// GET /group-profiles/:groupId -> the group's Bill To (404 when not set yet)
const getGroupProfile = C.handle("Failed to load the group's billing details", async (req, res) => {
  const [[p]] = await pool.query(
    "SELECT bgp.*, g.name AS group_name FROM billing_group_profiles bgp JOIN group_name g ON g.id = bgp.group_id WHERE bgp.group_id = ?",
    [req.params.groupId]
  );
  if (!p) throw C.notFound("No billing details for this group yet");
  res.json(profileOut(p, p.group_name));
});

// PUT /group-profiles/:groupId { billing_name, billing_address, state_code, gst_number, payment_terms_days }
const saveGroupProfile = C.handle("Failed to save the group's billing details", async (req, res) => {
  // loaded here: masters.controller also loads this file (no circular require at start-up)
  const { GST_STATES } = require("./masters.controller");
  const groupId = C.str(req.params.groupId, "group", { required: true, max: 36 });
  const [[group]] = await pool.query("SELECT id, name FROM group_name WHERE id = ?", [groupId]);
  if (!group) throw C.notFound("Group not found");
  const b = req.body || {};
  const stateCode = C.str(b.state_code, "state_code", { required: true, max: 2 }).padStart(2, "0");
  if (!GST_STATES[stateCode]) throw C.bad("state_code must be a valid GST state code");
  const gstin = String(b.gst_number || "").replace(/\s+/g, "").toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) throw C.bad("GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5");
  if (gstin && gstin.slice(0, 2) !== stateCode) throw C.bad(`GSTIN starts with ${gstin.slice(0, 2)} but the state is ${stateCode}; they must match`);
  const row = [
    groupId,
    // a group contract is billed in the group's name
    String(group.name || "").trim().slice(0, 255),
    C.str(b.billing_address, "billing_address", { required: true, max: 1000 }),
    stateCode,
    GST_STATES[stateCode],
    gstin || null,
    C.num(b.payment_terms_days, "payment_terms_days", { min: 0, max: 365, integer: true }) ?? 30,
    req.user.id,
    req.user.id,
  ];
  await pool.query(
    `INSERT INTO billing_group_profiles (group_id, billing_name, billing_address, state_code, state_name, gst_number, payment_terms_days, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE billing_name = VALUES(billing_name), billing_address = VALUES(billing_address), state_code = VALUES(state_code),
       state_name = VALUES(state_name), gst_number = VALUES(gst_number), payment_terms_days = VALUES(payment_terms_days),
       is_active = 1, updated_by = VALUES(updated_by)`,
    row
  );
  // Service Offered To: saved only when sent (null / "" clears it).
  if (b.service_offered_to !== undefined) {
    const serviceTo = C.str(b.service_offered_to, "Service Offered To", { max: 1000 }) || null;
    await pool.query("UPDATE billing_group_profiles SET service_offered_to = ? WHERE group_id = ?", [serviceTo, groupId]);
  }
  await logAudit(pool, req, {
    module: "BILLING",
    action: "GROUP_PROFILE_SAVED",
    entity_type: "BILLING_GROUP_PROFILE",
    entity_id: groupId,
    entity_label: String(group.name || "").trim(),
    summary: `Billing details saved for group ${String(group.name || "").trim()}`,
  });
  const [[p]] = await pool.query("SELECT * FROM billing_group_profiles WHERE group_id = ?", [groupId]);
  res.json(profileOut(p, group.name));
});

/**
 * Checks the companies of a group based contract: a group, 1+ companies all in that group, all with
 * the same customer type (it decides GST), and the group's Bill To saved. Returns the company ids.
 */
async function readGroupCompanies(db, groupId, rawIds) {
  if (!groupId) throw C.bad("Choose the group");
  if (!Array.isArray(rawIds)) throw C.bad("company_ids must be a list");
  const ids = [...new Set(rawIds.map((v) => String(v || "").trim()).filter(Boolean))];
  if (!ids.length) throw C.bad("Tick at least one company of the group");
  const [rows] = await db.query("SELECT id, name, type, group_id FROM companies WHERE id IN (?)", [ids]);
  if (rows.length !== ids.length) throw C.bad("A ticked company was not found");
  const outside = rows.find((r) => r.group_id !== groupId);
  if (outside) throw C.bad(`${String(outside.name).trim()} is not in this group`);
  const untyped = rows.find((r) => !calc.categoryOf(r.type));
  if (untyped) throw C.bad(`${String(untyped.name).trim()}: customer type is not set - set it on the customer first`);
  if (new Set(rows.map((r) => calc.categoryOf(r.type))).size > 1) throw C.bad("The ticked companies must all be Commercial or all Residential (it decides GST)");
  const [[profile]] = await db.query("SELECT is_active FROM billing_group_profiles WHERE group_id = ?", [groupId]);
  if (!profile || !profile.is_active) throw C.bad("Save the group's billing details (Bill To) first");
  return ids;
}

module.exports = { listGroups, getGroupProfile, saveGroupProfile, readGroupCompanies };
