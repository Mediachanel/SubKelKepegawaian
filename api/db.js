const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "host.docker.internal",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "sisdmk2",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const tableExistsCache = new Map();
const columnsCache = new Map();

async function execute(sql, params = [], conn = null) {
  const db = conn || pool;
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function tableExists(tableName, conn = null) {
  if (tableExistsCache.has(tableName)) {
    return tableExistsCache.get(tableName);
  }

  const rows = await execute(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
      LIMIT 1`,
    [process.env.DB_NAME, tableName],
    conn
  );

  const exists = rows.length > 0;
  tableExistsCache.set(tableName, exists);
  return exists;
}

async function getTableColumns(tableName, conn = null) {
  if (columnsCache.has(tableName)) {
    return columnsCache.get(tableName);
  }

  const rows = await execute(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
      ORDER BY ordinal_position`,
    [process.env.DB_NAME, tableName],
    conn
  );

  const columns = rows.map((r) => r.column_name);
  columnsCache.set(tableName, columns);
  return columns;
}

module.exports = {
  pool,
  execute,
  tableExists,
  getTableColumns,
};
