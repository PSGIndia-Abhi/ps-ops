function buildScopeFilter(user, aliasMap = {}) {
  const {
    branch = "j.branch_id",
    company = "s.company_id",
    site = "j.company_id"
  } = aliasMap;

  const conditions = [];
  const params = [];

  if (!user || !user.scopes) {
    return { forbidden: true };
  }

  // 🔥 GLOBAL
  const hasGlobal = user.scopes.some(s => s.scope_type === "global");
  if (hasGlobal) {
    return { condition: null, params: [] };
  }

  for (const s of user.scopes) {
    if (s.scope_type === "branch") {
      conditions.push(`${branch} = ?`);
      params.push(s.scope_id);
    }

    if (s.scope_type === "company") {
      conditions.push(`${company} = ?`);
      params.push(s.scope_id);
    }

    if (s.scope_type === "site") {
      conditions.push(`${site} = ?`);
      params.push(s.scope_id);
    }
  }

  if (!conditions.length) {
    return { forbidden: true };
  }

  return {
    condition: `(${conditions.join(" OR ")})`,
    params
  };
}

module.exports = buildScopeFilter;