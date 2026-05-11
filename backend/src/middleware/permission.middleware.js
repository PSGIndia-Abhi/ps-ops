const requirePermission = (permission) => {
  return (req, res, next) => {
    // 1. Safety check
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. Super Admin bypass (temporary via role name)
    if (req.user.role === "admin") {
      return next();
    }

    // 3. Permission check
    const hasPermission = req.user.permissions?.includes(permission);

    if (!hasPermission) {
      return res.status(403).json({ error: "Forbidden: insufficient permissions" });
    }

    // 4. Allowed
    next();
  };
};

module.exports = requirePermission;