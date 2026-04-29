const { v4: uuid } = require("uuid");

async function resolveHeadOfficeBranchId(executor) {
  const [[existing]] = await executor.query(
    "SELECT id FROM branches WHERE name LIKE '%Head Office%' ORDER BY created_at ASC LIMIT 1"
  );
  if (existing?.id) return existing.id;

  const id = uuid();
  await executor.query(
    "INSERT INTO branches (id, name) VALUES (?, 'Head Office')",
    [id]
  );
  return id;
}

module.exports = {
  resolveHeadOfficeBranchId,
};
