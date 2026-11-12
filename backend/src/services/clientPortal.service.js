// Client Portal access: which company and outlets (sites) a client user may see.
//
// Access comes ONLY from user_scopes:
//   - scope_type 'company' -> company admin: every outlet of that company
//   - scope_type 'site'    -> outlet user: only those outlets
// The user's branch is never used, so a client without scopes sees nothing
// (unlike the generic scope filter, which falls back to the whole branch).

const { pool } = require("../../db");

const CLIENT_ROLE = "client";

async function getClientRoleId(executor = pool) {
  const [[role]] = await executor.query(
    "SELECT id FROM roles WHERE name = ? LIMIT 1",
    [CLIENT_ROLE]
  );
  return role?.id || null;
}

// Returns { companyIds, siteIds, isCompanyAdmin, sites } or null when the user has no client access.
async function getClientAccess(userId, executor = pool) {
  if (!userId) return null;

  const [scopes] = await executor.query(
    `SELECT scope_type, scope_id FROM user_scopes
     WHERE user_id = ? AND scope_type IN ('company','site') AND scope_id IS NOT NULL`,
    [userId]
  );
  if (!scopes.length) return null;

  const companyScopeIds = scopes.filter((s) => s.scope_type === "company").map((s) => s.scope_id);
  const siteScopeIds = scopes.filter((s) => s.scope_type === "site").map((s) => s.scope_id);

  const conditions = [];
  const params = [];
  if (companyScopeIds.length) {
    conditions.push(`s.company_id IN (${companyScopeIds.map(() => "?").join(",")})`);
    params.push(...companyScopeIds);
  }
  if (siteScopeIds.length) {
    conditions.push(`s.id IN (${siteScopeIds.map(() => "?").join(",")})`);
    params.push(...siteScopeIds);
  }

  const [sites] = await executor.query(
    `SELECT s.id, s.name, s.address, s.city, s.state, s.company_id, s.branch_id
     FROM sites s
     WHERE (${conditions.join(" OR ")}) AND COALESCE(s.is_active, 1) = 1
     ORDER BY s.name`,
    params
  );

  const companyIds = Array.from(
    new Set([...companyScopeIds, ...sites.map((s) => s.company_id).filter(Boolean)])
  );

  return {
    companyIds,
    siteIds: sites.map((s) => s.id),
    isCompanyAdmin: companyScopeIds.length > 0,
    sites,
  };
}

// Express middleware for /api/client-portal: must run after auth.
// Puts the access object on req.clientAccess.
async function requireClientAccess(req, res, next) {
  try {
    if (!req.user || req.user.role !== CLIENT_ROLE) {
      return res.status(403).json({ error: "Client access only" });
    }
    const access = await getClientAccess(req.user.id);
    // No active outlet (e.g. all outlets were deactivated later) means nothing to show.
    if (!access || !access.companyIds.length || !access.siteIds.length) {
      return res.status(403).json({ error: "No active outlet is linked to this login. Please contact BestServe support." });
    }
    req.clientAccess = access;
    next();
  } catch (err) {
    console.error("Client access check failed:", err);
    res.status(500).json({ error: "Failed to check access" });
  }
}

module.exports = { CLIENT_ROLE, getClientRoleId, getClientAccess, requireClientAccess };
