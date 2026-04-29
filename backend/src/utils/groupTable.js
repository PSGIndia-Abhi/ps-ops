const CACHE_TTL_MS = 60 * 1000;
let cachedTable = null;
let cachedAt = 0;

async function resolveGroupTable(pool) {
  const now = Date.now();
  if (cachedTable && now - cachedAt < CACHE_TTL_MS) {
    return cachedTable;
  }

  const [rows] = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('Group_name', 'groups')
    `
  );

  const names = rows.map((row) => row.table_name || row.TABLE_NAME);
  const table = names.includes('Group_name')
    ? 'Group_name'
    : names.includes('groups')
      ? 'groups'
      : 'groups';

  cachedTable = table;
  cachedAt = now;
  return table;
}

module.exports = { resolveGroupTable };
