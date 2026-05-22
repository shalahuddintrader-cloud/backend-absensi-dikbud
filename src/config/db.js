const mysql = require('mysql2/promise');

let db;

function getDbConfig() {
  if (process.env.DATABASE_URL) {
    const parsed = new URL(process.env.DATABASE_URL);
    const cfg = {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 3306,
      database: parsed.pathname.replace('/', ''),
      user: parsed.username,
      password: parsed.password,
    };
    if (parsed.searchParams.has('sslmode')) cfg.ssl = {};
    return cfg;
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'db_absensi',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };
}

const connectDB = async () => {
  const cfg = getDbConfig();
  db = await mysql.createPool({
    ...cfg,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    authPlugins: {
      caching_sha2_password: () => () => Buffer.from(cfg.password + '\0'),
    },
  });

  const [rows] = await db.query('SELECT 1');
  console.log('✅ MySQL connected');
  db.queryType = 'mysql';
  return db;
};

const query = async (sql, params = []) => {
  if (!db) throw new Error('Database not connected');
  return await db.query(sql, params);
};

module.exports = { connectDB, query };