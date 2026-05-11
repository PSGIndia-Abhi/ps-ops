function checkScope(user, resource) {
  if (!user) return false;

  // 🔥 admin bypass
  if (user.role === "admin") return true;

  if (!user.scope || user.scope.length === 0) return false;

  return user.scope.some((s) => {

    if (s.scope_type === "global") return true;

    if (s.scope_type === "branch" && s.scope_id === resource.branch_id)
      return true;

    if (s.scope_type === "company" && s.scope_id === resource.company_id)
      return true;

    if (s.scope_type === "site" && s.scope_id === resource.site_id)
      return true;

    return false;
  });
}