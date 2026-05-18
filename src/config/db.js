const mysql = require('mysql2/promise');

let db;

const connectDB = async () => {
  db = await mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    authPlugins: {
      caching_sha2_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0'),
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